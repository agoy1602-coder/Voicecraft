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

const ENGINE_LOAD_TIMEOUT_MS = 6 * 60 * 1000;
const CLONE_TIMEOUT_MS = 5 * 60 * 1000;

class PocketTTSService {
  private tts: PocketTTS | null = null;
  private loadPromise: Promise<PocketTTS> | null = null;
  private loadProgressListeners = new Set<(progress: PocketTTSLoadProgress) => void>();
  private clonedVoices = new Map<string, string>();

  constructor() {
    // Start model initialization as soon as the browser imports this service.
    // Create Clone can then reuse the same promise instead of appearing frozen on first use.
    if (typeof window !== 'undefined') {
      void this.preload().catch(() => undefined);
    }
  }

  private emitProgress(progress: PocketTTSLoadProgress) {
    for (const listener of this.loadProgressListeners) listener(progress);
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer !== undefined) window.clearTimeout(timer);
    });
  }

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
      this.emitProgress({ label: 'Starting Pocket TTS engine…' });
      const engine = new PocketTTS({
        language: 'english_2026-04',
        quantized: true,
        voiceCloning: true,
        cache: true,
      });

      this.emitProgress({ label: 'Loading Pocket TTS voice-cloning model…' });
      await this.withTimeout(
        engine.load((progress: PocketTTSLoadProgress) => this.emitProgress(progress)),
        ENGINE_LOAD_TIMEOUT_MS,
        'Pocket TTS model loading timed out after 6 minutes. The voice-cloning model could not finish initializing on this device.',
      );
      this.emitProgress({ label: 'Pocket TTS engine ready.' });
      this.tts = engine;
      return engine;
    })();

    try {
      return await this.loadPromise;
    } catch (error) {
      this.loadPromise = null;
      this.tts = null;
      throw error;
    } finally {
      if (onProgress) this.loadProgressListeners.delete(onProgress);
    }
  }

  async preload(onProgress?: (progress: PocketTTSLoadProgress) => void): Promise<void> {
    await this.getEngine(onProgress);
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
      onProgress?.({ label: 'Extracting voice characteristics with neural encoder…' });

      const voiceId = await this.withTimeout(
        engine.cloneVoice(mono, { inputSampleRate: decoded.sampleRate, name: voiceKey }),
        CLONE_TIMEOUT_MS,
        'Voice cloning timed out after 5 minutes. The neural voice encoder did not finish on this device.',
      );

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
