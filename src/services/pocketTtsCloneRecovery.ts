import { AudioClip, ClonedVoiceProfile } from '../types';
import { pocketTtsService } from './pocketTtsService';
import { TTSGenerateOptions, TTSResult, ttsService } from './ttsService';

let installed = false;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to encode generated audio.'));
    reader.readAsDataURL(blob);
  });
}

function makeTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 5).join(' ');
  return words.length > 32 ? `${words.substring(0, 30)}...` : words || 'Untitled Speech';
}

function calculateSentenceTimings(text: string, totalDuration: number) {
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const sentences = raw.map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return [{ text, startSec: 0, endSec: totalDuration }];
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  let start = 0;
  return sentences.map((sentence) => {
    const duration = Math.max(0.4, (sentence.length / totalChars) * totalDuration);
    const end = Math.min(totalDuration, start + duration);
    const result = { text: sentence, startSec: Number(start.toFixed(2)), endSec: Number(end.toFixed(2)) };
    start = end;
    return result;
  });
}

/**
 * Restores the cold-reload connection between a persisted cloned profile and
 * Pocket TTS. The existing ttsService remains unchanged; this adapter only
 * intercepts offline generation for cloned profiles that have a persisted
 * Pocket TTS providerVoiceId. Prebuilt voices and all cloud paths retain their
 * existing behavior.
 */
export function installPocketTtsCloneRecovery(): void {
  if (installed) return;
  installed = true;

  const originalGenerateSpeech = ttsService.generateSpeech.bind(ttsService);

  ttsService.generateSpeech = async (options: TTSGenerateOptions): Promise<TTSResult> => {
    const voice = options.voice as ClonedVoiceProfile;
    const shouldUsePocketClone =
      voice.type === 'cloned' &&
      voice.provider === 'pocket-tts' &&
      Boolean(voice.providerVoiceId) &&
      (options.forceOffline === true || !navigator.onLine);

    if (!shouldUsePocketClone) {
      return originalGenerateSpeech(options);
    }

    const startTime = performance.now();
    try {
      const result = await pocketTtsService.generate(
        options.text,
        voice.id,
        voice.providerVoiceId,
      );
      const audioContext = new AudioContext({ sampleRate: result.sampleRate });
      try {
        const audioBuffer = await audioContext.decodeAudioData(await result.wavBlob.arrayBuffer());
        const audioBase64 = await blobToBase64(result.wavBlob);
        const duration = audioBuffer.duration;
        const clip: AudioClip = {
          id: `clip_pocket_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: makeTitle(options.text),
          text: options.text,
          voiceId: voice.id,
          voiceName: voice.name,
          voiceType: 'cloned',
          tone: options.tone,
          language: options.language,
          durationSeconds: duration,
          audioBlobUrl: URL.createObjectURL(result.wavBlob),
          audioBase64,
          format: 'wav',
          sampleRate: result.sampleRate,
          sentences: calculateSentenceTimings(options.text, duration),
          isOfflineGenerated: true,
          createdAt: Date.now(),
          isFavorite: false,
          synced: false,
          tags: ['pocket-tts', 'offline', options.tone, options.language, voice.name],
        };

        return {
          clip,
          audioBuffer,
          isOffline: true,
          latencyMs: Math.round(performance.now() - startTime),
          engine: 'offline',
        };
      } finally {
        await audioContext.close();
      }
    } catch (error) {
      console.error('[VoiceCraft] Persisted Pocket TTS clone generation failed:', error);
      throw error;
    }
  };
}
