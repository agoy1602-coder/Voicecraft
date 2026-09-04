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

const POCKET_TTS_CACHE = 'voicecraft-pocket-tts-v1';
const POCKET_TTS_MODEL_BASE =
  'https://huggingface.co/vlapky/pocket-tts-onnx/resolve/main/onnx/english_2026-04';
const POCKET_TTS_ASSETS = [
  'bundle.json',
  'tokenizer.model',
  'mimi_encoder_int8.onnx',
  'text_conditioner_int8.onnx',
  'flow_lm_main_int8.onnx',
  'flow_lm_flow_int8.onnx',
  'mimi_decoder_int8.onnx',
  'bos_before_voice.npy',
] as const;

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
        // Use VoiceCraft's bundled ORT runtime. This removes the hidden CDN
        // dependency from the browser clone path and preserves airplane-mode
        // operation once the model assets are cached.
        ortBaseUrl: '/ort/',
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

  /**
   * Pre-fetch the exact Pocket TTS model assets into Cache Storage without
   * constructing ONNX sessions. This keeps the application responsive while
   * online and leaves the expensive runtime initialization for Clone/Generate.
   */
  async warmup(onProgress?: (progress: PocketTTSLoadProgress) => void): Promise<void> {
    if (!('caches' in window) || !navigator.onLine) return;

    const cache = await caches.open(POCKET_TTS_CACHE);
    let completed = 0;

    for (const asset of POCKET_TTS_ASSETS) {
      const url = `${POCKET_TTS_MODEL_BASE}/${asset}`;
      const existing = await cache.match(url);

      if (existing) {
        completed += 1;
        onProgress?.({
          label: `Preparing offline voice model… ${completed}/${POCKET_TTS_ASSETS.length}`,
          fromCache: true,
          loaded: completed,
          total: POCKET_TTS_ASSETS.length,
        });
        continue;
      }

      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Pocket TTS asset ${asset} returned HTTP ${response.status}`);

      await cache.put(url, response.clone());
      completed += 1;
      onProgress?.({
        label: `Preparing offline voice model… ${completed}/${POCKET_TTS_ASSETS.length}`,
        fromCache: false,
        loaded: completed,
        total: POCKET_TTS_ASSETS.length,
      });
    }

    onProgress?.({
      label: 'Offline voice model ready.',
      loaded: completed,
      total: POCKET_TTS_ASSETS.length,
    });
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
