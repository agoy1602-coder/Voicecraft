import { PocketTTS, chunksToWavBlob } from 'pocket-tts-js';
import type { ClonedVoiceProfile, AudioClip, AudioSentence } from '../types';
import type { TTSGenerateOptions, TTSResult } from './ttsService';
import { voiceCloneService } from './voiceCloneService';
import { ttsService } from './ttsService';

let engine: PocketTTS | null = null;
let enginePromise: Promise<PocketTTS> | null = null;

async function getEngine(): Promise<PocketTTS> {
  if (engine?.ready) return engine;
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const instance = new PocketTTS({
      language: 'english_2026-04',
      quantized: true,
      voiceCloning: true,
      cache: true,
      cacheName: 'voicecraft-pocket-tts-v1',
      maxThreads: 4,
    });
    await instance.load();
    engine = instance;
    return instance;
  })();
  try {
    return await enginePromise;
  } catch (error) {
    enginePromise = null;
    engine = null;
    throw error;
  }
}

async function decodeReference(blob: Blob): Promise<{ audio: Float32Array; sampleRate: number; duration: number }> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return {
      audio: new Float32Array(decoded.getChannelData(0)),
      sampleRate: decoded.sampleRate,
      duration: decoded.duration,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function makeProfile(name: string, voiceRef: string, sampleDuration: number, notes: string): ClonedVoiceProfile {
  return {
    id: `clone_pocket_${Date.now()}`,
    name,
    type: 'cloned',
    gender: 'neutral',
    tone: 'professional',
    baseVoice: 'Zephyr',
    description: `Private browser-local neural voice clone for ${name}.`,
    avatarColor: 'from-cyan-500 to-blue-700',
    pitchShift: 0,
    speedFactor: 1,
    warmth: 0.8,
    breathiness: 0.1,
    basePitchHz: 160,
    timbreDescription: 'Pocket TTS zero-shot voice conditioning from the supplied reference recording.',
    promptModifier: `Speak naturally using the cloned voice identity for ${name}.`,
    sampleDuration,
    notes,
    createdAt: Date.now(),
    provider: 'pocket-tts',
    providerVoiceId: voiceRef,
  };
}

async function cloneLocally(name: string, blob: Blob, notes: string): Promise<ClonedVoiceProfile> {
  const tts = await getEngine();
  const decoded = await decodeReference(blob);
  const voiceRef = await tts.cloneVoice(decoded.audio, {
    inputSampleRate: decoded.sampleRate,
    name,
  });
  return makeProfile(name, voiceRef, Number(decoded.duration.toFixed(2)), notes);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not encode generated audio.'));
    reader.readAsDataURL(blob);
  });
}

function sentenceTimings(text: string, duration: number): AudioSentence[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [{ text, startSec: 0, endSec: Number(duration.toFixed(2)) }];
  const totalChars = parts.reduce((sum, part) => sum + part.length, 0) || 1;
  let cursor = 0;
  return parts.map((part) => {
    const portion = duration * (part.length / totalChars);
    const start = cursor;
    cursor += portion;
    return { text: part, startSec: Number(start.toFixed(2)), endSec: Number(cursor.toFixed(2)) };
  });
}

async function generateLocally(options: TTSGenerateOptions): Promise<TTSResult> {
  const start = performance.now();
  const voice = options.voice as ClonedVoiceProfile;
  if (voice.provider !== 'pocket-tts' || !voice.providerVoiceId) {
    throw new Error('This cloned profile does not contain a browser-local Pocket TTS voice reference.');
  }

  const tts = await getEngine();
  const chunks: Float32Array[] = [];
  const metrics = await tts.generate(options.text, {
    voice: voice.providerVoiceId,
    onChunk: (chunk) => chunks.push(new Float32Array(chunk)),
  });
  if (!chunks.length) throw new Error('Pocket TTS returned no audio for the cloned voice.');

  const wavBlob = chunksToWavBlob(chunks, tts.sampleRate);
  const ctx = new AudioContext({ sampleRate: tts.sampleRate });
  const audioBuffer = await ctx.decodeAudioData(await wavBlob.arrayBuffer());
  await ctx.close().catch(() => undefined);

  const duration = metrics.audioDuration || audioBuffer.duration;
  const clip: AudioClip = {
    id: `clip_pocket_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: `Pocket Clone — ${voice.name}`,
    text: options.text,
    voiceId: voice.id,
    voiceName: voice.name,
    voiceType: 'cloned',
    tone: options.tone,
    language: options.language,
    durationSeconds: duration,
    audioBlobUrl: URL.createObjectURL(wavBlob),
    audioBase64: await blobToBase64(wavBlob),
    format: 'wav',
    sampleRate: tts.sampleRate,
    sentences: sentenceTimings(options.text, duration),
    isOfflineGenerated: true,
    createdAt: Date.now(),
    isFavorite: false,
    synced: false,
    tags: ['voice-clone', 'pocket-tts', options.tone, options.language, voice.name],
  };

  return {
    clip,
    audioBuffer,
    isOffline: false,
    isQuotaFallback: false,
    latencyMs: Math.round(performance.now() - start),
    engine: 'offline',
  };
}

export function installPocketTtsBridge(): void {
  const cloneService = voiceCloneService as any;
  const originalClone = cloneService.analyzeAndClone.bind(cloneService);
  cloneService.analyzeAndClone = async function(name: string, sampleBlob?: Blob, sampleBase64?: string, notes = '') {
    if (!sampleBlob) throw new Error('A local audio sample is required for browser voice cloning.');
    try {
      return await cloneLocally(name, sampleBlob, notes);
    } catch (error) {
      console.error('[VoiceCraft] Pocket TTS voice cloning failed:', error);
      throw new Error('Browser voice cloning could not initialize on this device. No fake clone profile was created. Please try again with a shorter, clean recording or a more capable browser/device.');
    }
  };

  const tts = ttsService as any;
  const originalGenerate = tts.generateSpeech.bind(tts);
  tts.generateSpeech = async function(options: TTSGenerateOptions) {
    if (options.voice?.type === 'cloned' && (options.voice as ClonedVoiceProfile).provider === 'pocket-tts') {
      return generateLocally(options);
    }
    return originalGenerate(options);
  };
}
