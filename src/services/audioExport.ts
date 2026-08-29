import { ExportFormat, AudioSentence } from '../types';

/**
 * Creates a standard RIFF/WAV Blob from raw 16-bit PCM buffer
 */
export function pcmToWavBlob(
  pcmData: Int16Array | ArrayBuffer,
  sampleRate: number = 24000,
  numChannels: number = 1
): Blob {
  const pcmBytes = pcmData instanceof Int16Array ? pcmData : new Int16Array(pcmData);
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const buffer = new ArrayBuffer(44 + pcmBytes.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcmBytes.length * 2, true);

  // Write PCM audio samples
  let offset = 44;
  for (let i = 0; i < pcmBytes.length; i++, offset += 2) {
    view.setInt16(offset, pcmBytes[i], true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts Base64 PCM 24kHz string to an AudioBuffer and a WAV Blob
 */
export async function base64PcmToAudioBuffer(
  base64Data: string,
  audioCtx: AudioContext,
  sampleRate: number = 24000
): Promise<{ audioBuffer: AudioBuffer; wavBlob: Blob }> {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const pcm16 = new Int16Array(bytes.buffer);
  const audioBuffer = audioCtx.createBuffer(1, pcm16.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  // Normalize 16-bit integer PCM to [-1.0, 1.0] float
  for (let i = 0; i < pcm16.length; i++) {
    channelData[i] = pcm16[i] / 32768.0;
  }

  const wavBlob = pcmToWavBlob(pcm16, sampleRate, 1);
  return { audioBuffer, wavBlob };
}

/**
 * Export Audio in various formats (WAV, MP3/WebM, AAC, OGG)
 */
export async function exportAudioBlob(
  audioBuffer: AudioBuffer,
  format: ExportFormat,
  targetSampleRate: number = 44100,
  bitrateKbps: number = 192
): Promise<Blob> {
  // Convert AudioBuffer to WAV first
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(audioBuffer.duration * targetSampleRate),
    targetSampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const channel = renderedBuffer.getChannelData(0);
  const pcm16 = new Int16Array(channel.length);

  for (let i = 0; i < channel.length; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const wavBlob = pcmToWavBlob(pcm16, targetSampleRate, 1);

  if (format === 'wav') {
    return wavBlob;
  }

  // Use MediaRecorder on an AudioContext stream for compressed WebM/OGG/AAC/MP3
  try {
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/webm;codecs=opus', // standard browser encoded audio
      aac: 'audio/webm;codecs=opus',
      ogg: 'audio/ogg;codecs=opus',
      webm: 'audio/webm',
    };

    const targetMime = mimeTypes[format] || 'audio/webm';
    if (MediaRecorder.isTypeSupported(targetMime)) {
      const audioCtx = new AudioContext();
      const bufferSource = audioCtx.createBufferSource();
      bufferSource.buffer = renderedBuffer;

      const dest = audioCtx.createMediaStreamDestination();
      bufferSource.connect(dest);

      const recorder = new MediaRecorder(dest.stream, {
        mimeType: targetMime,
        audioBitsPerSecond: bitrateKbps * 1000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const finalBlob = new Blob(chunks, { type: targetMime });
          audioCtx.close();
          resolve(finalBlob);
        };
      });

      recorder.start();
      bufferSource.start(0);

      // Stop recorder after duration
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, (audioBuffer.duration + 0.15) * 1000);

      return await recordPromise;
    }
  } catch {
    // Fallback to standard WAV format
  }

  return wavBlob;
}

/**
 * Generate Subtitles (SRT / VTT format)
 */
export function generateSubtitles(sentences: AudioSentence[], format: 'srt' | 'vtt'): string {
  if (format === 'vtt') {
    let vtt = 'WEBVTT\n\n';
    sentences.forEach((s, idx) => {
      vtt += `${idx + 1}\n`;
      vtt += `${formatTimeVTT(s.startSec)} --> ${formatTimeVTT(s.endSec)}\n`;
      vtt += `${s.text.trim()}\n\n`;
    });
    return vtt;
  } else {
    let srt = '';
    sentences.forEach((s, idx) => {
      srt += `${idx + 1}\n`;
      srt += `${formatTimeSRT(s.startSec)} --> ${formatTimeSRT(s.endSec)}\n`;
      srt += `${s.text.trim()}\n\n`;
    });
    return srt;
  }
}

function formatTimeSRT(seconds: number): string {
  const date = new Date(seconds * 1000);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
}

function formatTimeVTT(seconds: number): string {
  const date = new Date(seconds * 1000);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

/**
 * Trigger file download helper
 */
export function downloadFile(blob: Blob | string, filename: string, mimeType?: string) {
  const url = typeof blob === 'string' ? URL.createObjectURL(new Blob([blob], { type: mimeType || 'text/plain' })) : URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Merges multiple AudioClips sequentially into a single cohesive audio track with configurable gap.
 */
export async function mergeAudioClips(
  clips: {
    text?: string;
    audioBase64?: string;
    audioBlobUrl?: string;
    durationSeconds?: number;
    sampleRate?: number;
    sentences?: AudioSentence[];
  }[],
  gapSeconds: number = 0.8,
  sampleRate: number = 24000
): Promise<{
  mergedBlob: Blob;
  mergedBlobUrl: string;
  mergedBase64: string;
  durationSeconds: number;
  sentences: AudioSentence[];
}> {
  if (!clips.length) {
    throw new Error('No clips provided for merging');
  }

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const buffers: AudioBuffer[] = [];

  for (const clip of clips) {
    let buf: AudioBuffer | null = null;
    if (clip.audioBase64) {
      const decoded = await base64PcmToAudioBuffer(clip.audioBase64, audioCtx, clip.sampleRate || sampleRate);
      buf = decoded.audioBuffer;
    } else if (clip.audioBlobUrl) {
      const resp = await fetch(clip.audioBlobUrl);
      const arrayBuffer = await resp.arrayBuffer();
      buf = await audioCtx.decodeAudioData(arrayBuffer);
    }
    if (buf) {
      buffers.push(buf);
    }
  }

  if (!buffers.length) {
    throw new Error('Failed to decode audio clips for merging');
  }

  const gapSamples = Math.floor(gapSeconds * sampleRate);
  let totalSamples = 0;
  for (let i = 0; i < buffers.length; i++) {
    const count = Math.floor(buffers[i].duration * sampleRate);
    totalSamples += count;
    if (i < buffers.length - 1) {
      totalSamples += gapSamples;
    }
  }

  const mergedChannel = new Float32Array(totalSamples);
  const combinedSentences: AudioSentence[] = [];
  let sampleOffset = 0;

  for (let i = 0; i < buffers.length; i++) {
    const buf = buffers[i];
    const srcChannel = buf.getChannelData(0);
    const timeOffsetSec = sampleOffset / sampleRate;

    const bufSamples = Math.floor(buf.duration * sampleRate);
    for (let s = 0; s < bufSamples && sampleOffset + s < totalSamples; s++) {
      const srcIdx = Math.floor((s / bufSamples) * srcChannel.length);
      mergedChannel[sampleOffset + s] = srcChannel[srcIdx] || 0;
    }

    const clip = clips[i];
    if (clip.sentences && clip.sentences.length > 0) {
      for (const sent of clip.sentences) {
        combinedSentences.push({
          text: sent.text,
          startSec: Number((sent.startSec + timeOffsetSec).toFixed(2)),
          endSec: Number((sent.endSec + timeOffsetSec).toFixed(2)),
        });
      }
    } else if (clip.text) {
      combinedSentences.push({
        text: clip.text,
        startSec: Number(timeOffsetSec.toFixed(2)),
        endSec: Number((timeOffsetSec + buf.duration).toFixed(2)),
      });
    }

    sampleOffset += bufSamples;
    if (i < buffers.length - 1) {
      sampleOffset += gapSamples;
    }
  }

  // Convert Float32 to 16-bit PCM
  const pcm16 = new Int16Array(mergedChannel.length);
  for (let i = 0; i < mergedChannel.length; i++) {
    const s = Math.max(-1, Math.min(1, mergedChannel[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const mergedBlob = pcmToWavBlob(pcm16, sampleRate, 1);
  const mergedBlobUrl = URL.createObjectURL(mergedBlob);

  let binary = '';
  const bytes = new Uint8Array(pcm16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const mergedBase64 = btoa(binary);

  const durationSeconds = Number((totalSamples / sampleRate).toFixed(2));

  return {
    mergedBlob,
    mergedBlobUrl,
    mergedBase64,
    durationSeconds,
    sentences: combinedSentences,
  };
}
