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
      const mono = decoded.getChannelData(0);
      onProgress?.({ label: 'Extracting voice characteristics…' });

      const clonePromise = engine.cloneVoice(mono, {
        inputSampleRate: decoded.sampleRate,
        name: voiceKey,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error('Voice cloning timed out after 5 minutes. The model may still be initializing on this device.')),
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
