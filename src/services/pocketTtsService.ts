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

function traceClone(stage: string, detail?: string) {
  const message = detail ? `[VoiceCloneTrace] ${stage} — ${detail}` : `[VoiceCloneTrace] ${stage}`;
  console.info(message);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('voicecraft-clone-trace', JSON.stringify({ stage, detail: detail || '', at: Date.now() }));
    } catch { /* diagnostics must never break cloning */ }
    const button = document.getElementById('create-voice-clone-btn');
    const label = button?.querySelector('span');
    if (label) label.textContent = detail ? `${stage}: ${detail}` : stage;
  }
}

class PocketTTSService {
  private tts: PocketTTS | null = null;
  private loadPromise: Promise<PocketTTS> | null = null;
  private loadProgressListeners = new Set<(progress: PocketTTSLoadProgress) => void>();
  private clonedVoices = new Map<string, string>();

  constructor() {
    if (typeof window !== 'undefined') {
      void this.preload().catch((error) => traceClone('ENGINE_PRELOAD_ERROR', error instanceof Error ? error.message : String(error)));
    }
  }

  private emitProgress(progress: PocketTTSLoadProgress) {
    for (const listener of this.loadProgressListeners) listener(progress);
    if (progress.label) traceClone('POCKET_PROGRESS', progress.label);
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
      traceClone('ENGINE_INIT_ENTER');
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
      traceClone('ENGINE_INIT_RETURN');
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
    traceClone('CLONE_ENTER', `key=${voiceKey}`);
    const engine = await this.getEngine(onProgress);
    traceClone('DECODE_ENTER');
    const buffer = await sampleBlob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      onProgress?.({ label: 'Decoding vocal sample…' });
      const decoded = await audioContext.decodeAudioData(buffer);
      const mono = decoded.getChannelData(0);
      traceClone('DECODE_RETURN', `${decoded.duration.toFixed(2)}s ${decoded.sampleRate}Hz ${mono.length} samples`);
      onProgress?.({ label: 'Extracting voice characteristics with neural encoder…' });

      traceClone('ENGINE_CLONE_ENTER', `${mono.length} samples @ ${decoded.sampleRate}Hz`);
      const voiceId = await this.withTimeout(
        engine.cloneVoice(mono, { inputSampleRate: decoded.sampleRate, name: voiceKey }),
        CLONE_TIMEOUT_MS,
        'Voice cloning timed out after 5 minutes. The neural voice encoder did not finish on this device.',
      );
      traceClone('ENGINE_CLONE_RETURN', voiceId);

      this.clonedVoices.set(voiceKey, voiceId);
      onProgress?.({ label: 'Voice clone created successfully.' });
      traceClone('CLONE_RETURN', voiceId);
      return { voiceId, sampleRate: engine.sampleRate };
    } catch (error) {
      traceClone('CLONE_ERROR', error instanceof Error ? error.message : String(error));
      throw error;
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
