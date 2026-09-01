import { PocketTTS, chunksToWavBlob } from 'pocket-tts-js';

export interface PocketTTSCloneResult {
  voiceId: string;
  sampleRate: number;
}

export interface PocketTTSSynthesisResult {
  wavBlob: Blob;
  sampleRate: number;
  metrics: { rtfx: number; genTime: number; audioDuration: number };
}

export interface PocketTTSLoadProgress {
  label?: string;
  loaded?: number;
  total?: number;
  fromCache?: boolean;
}

class PocketTTSService {
  private tts: PocketTTS | null = null;
  private loadPromise: Promise<PocketTTS> | null = null;
  private loadProgressListeners = new Set<(progress: PocketTTSLoadProgress) => void>();
  private clonedVoices = new Map<string, string>();

  private async getEngine(onProgress?: (progress: PocketTTSLoadProgress) => void): Promise<PocketTTS> {
    if (this.tts) return this.tts;

    if (onProgress) this.loadProgressListeners.add(onProgress);
    if (this.loadPromise) {
      try {
        return await this.loadPromise;
      } finally {
        if (onProgress) this.loadProgressListeners.delete(onProgress);
      }
    }

    this.loadPromise = (async () => {
      const engine = new PocketTTS({
        language: 'english_2026-04',
        quantized: true,
        voiceCloning: true,
        cache: true,
      });

      for (const listener of this.loadProgressListeners) {
        listener({ label: 'Loading Pocket TTS voice model…' });
      }

      await engine.load((progress: PocketTTSLoadProgress) => {
        for (const listener of this.loadProgressListeners) listener(progress);
      });
      this.tts = engine;
      return engine;
    })();

    try {
      return await this.loadPromise;
    } catch (error) {
      this.loadPromise = null;
      throw error;
    } finally {
      if (onProgress) this.loadProgressListeners.delete(onProgress);
    }
  }

  async cloneVoice(
    sampleBlob: Blob,
    voiceKey: string,
    onProgress?: (progress: PocketTTSLoadProgress) => void,
  ): Promise<PocketTTSCloneResult> {
    const engine = await this.getEngine(onProgress);
    const buffer = await sampleBlob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      onProgress?.({ label: 'Decoding vocal sample…' });
      const decoded = await audioContext.decodeAudioData(buffer);
      const source = decoded.getChannelData(0);

      // Keep mobile voice cloning bounded and predictable. Long recordings
      // create much larger ONNX tensors and can stall or exhaust memory on
      // lower-memory Android devices. Pocket TTS works best with a short,
      // clean reference clip, so use at most 10 seconds.
      const maxSeconds = 10;
      const sourceFrames = Math.min(source.length, Math.floor(decoded.sampleRate * maxSeconds));
      const targetSampleRate = 24000;
      const targetFrames = Math.max(1, Math.round(sourceFrames * targetSampleRate / decoded.sampleRate));
      const mono = new Float32Array(targetFrames);

      if (decoded.sampleRate === targetSampleRate) {
        mono.set(source.subarray(0, targetFrames));
      } else {
        const ratio = (sourceFrames - 1) / Math.max(1, targetFrames - 1);
        for (let i = 0; i < targetFrames; i += 1) {
          const position = i * ratio;
          const left = Math.floor(position);
          const right = Math.min(left + 1, sourceFrames - 1);
          const weight = position - left;
          mono[i] = source[left] * (1 - weight) + source[right] * weight;
        }
      }

      onProgress?.({ label: `Extracting voice characteristics… (${(targetFrames / targetSampleRate).toFixed(1)}s reference)` });

      const clonePromise = engine.cloneVoice(mono, {
        inputSampleRate: targetSampleRate,
        name: voiceKey,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error('Voice cloning timed out after 5 minutes. Try a shorter 3–10 second recording and retry.')),
          5 * 60 * 1000,
        );
      });
      const voiceId = await Promise.race([clonePromise, timeoutPromise]);

      this.clonedVoices.set(voiceKey, voiceId);
      onProgress?.({ label: 'Voice clone created successfully.' });
      return { voiceId, sampleRate: engine.sampleRate };
    } finally {
      await audioContext.close();
    }
  }

  async restoreClonedVoice(
    voiceKey: string,
    sampleBase64: string,
    mimeType = 'audio/webm',
    onProgress?: (progress: PocketTTSLoadProgress) => void,
  ): Promise<PocketTTSCloneResult> {
    const existingVoiceId = this.clonedVoices.get(voiceKey);
    if (existingVoiceId && this.tts) {
      return { voiceId: existingVoiceId, sampleRate: this.tts.sampleRate };
    }

    if (!sampleBase64) {
      throw new Error('Saved voice reference audio is missing. Re-record the voice to restore this clone.');
    }

    onProgress?.({ label: 'Restoring saved voice profile…' });
    const binary = atob(sampleBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType || 'audio/webm' });
    return this.cloneVoice(blob, voiceKey, onProgress);
  }

  async generate(text: string, voiceKey: string, persistedVoiceId?: string): Promise<PocketTTSSynthesisResult> {
    const engine = await this.getEngine();
    const voice = persistedVoiceId || this.clonedVoices.get(voiceKey);
    if (!voice) throw new Error('Pocket TTS voice is not initialized. Clone the voice before generating speech.');

    const chunks: Float32Array[] = [];
    const metrics = await engine.generate(text, {
      voice,
      onChunk: (audio) => chunks.push(audio.slice()),
    });

    if (!chunks.length) throw new Error('Pocket TTS generated no audio.');
    const wavBlob = chunksToWavBlob(chunks, engine.sampleRate);
    return { wavBlob, sampleRate: engine.sampleRate, metrics };
  }

  destroy() {
    this.tts?.destroy();
    this.tts = null;
    this.loadPromise = null;
    this.loadProgressListeners.clear();
    this.clonedVoices.clear();
  }
}

export const pocketTtsService = new PocketTTSService();
