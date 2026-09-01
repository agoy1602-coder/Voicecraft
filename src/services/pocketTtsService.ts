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

class PocketTTSService {
  private tts: PocketTTS | null = null;
  private loadPromise: Promise<PocketTTS> | null = null;
  private clonedVoices = new Map<string, string>();

  private async getEngine(): Promise<PocketTTS> {
    if (this.tts) return this.tts;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const engine = new PocketTTS({
        language: 'english_2026-04',
        quantized: true,
        voiceCloning: true,
        cache: true,
      });
      await engine.load();
      this.tts = engine;
      return engine;
    })();

    try {
      return await this.loadPromise;
    } catch (error) {
      this.loadPromise = null;
      throw error;
    }
  }

  async cloneVoice(sampleBlob: Blob, voiceKey: string): Promise<PocketTTSCloneResult> {
    const engine = await this.getEngine();
    const buffer = await sampleBlob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const decoded = await audioContext.decodeAudioData(buffer);
      const mono = decoded.getChannelData(0);
      const voiceId = await engine.cloneVoice(mono, {
        inputSampleRate: decoded.sampleRate,
        name: voiceKey,
      });
      this.clonedVoices.set(voiceKey, voiceId);
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
    this.clonedVoices.clear();
  }
}

export const pocketTtsService = new PocketTTSService();
