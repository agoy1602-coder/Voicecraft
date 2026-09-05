import { PocketTTS, chunksToWavBlob } from 'pocket-tts-js';
import type { ClonedVoiceProfile, AudioClip, AudioSentence } from '../types';
import type { TTSGenerateOptions, TTSResult } from './ttsService';
import { voiceCloneService } from './voiceCloneService';
import { ttsService } from './ttsService';
import { persistPocketTtsDiagnostic } from './pocketTtsPersistentDiagnostic';

let engine: PocketTTS | null = null;
let enginePromise: Promise<PocketTTS> | null = null;
const activeVoiceRefs = new Map<string, string>();

type DiagnosticState = {
  phase: string;
  startedAt: number;
  completedAt?: number;
  online: boolean;
  crossOriginIsolated: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  cacheEntries?: number;
  loadProgress?: unknown[];
  error?: Record<string, unknown>;
};

function diagnosticPatch(patch: Partial<DiagnosticState>) {
  const target = globalThis as any;
  const previous: DiagnosticState = target.__VC_POCKET_DIAGNOSTIC__ || {
    phase: 'idle',
    startedAt: Date.now(),
    online: navigator.onLine,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as any).deviceMemory,
    loadProgress: [],
  };
  const next = { ...previous, ...patch };
  target.__VC_POCKET_DIAGNOSTIC__ = next;
  persistPocketTtsDiagnostic(next);
  console.log('[VC-DIAG]', next);
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack } : error.cause,
    };
  }
  if (error && typeof error === 'object') {
    return Object.fromEntries(Object.getOwnPropertyNames(error).map((key) => [key, (error as any)[key]]));
  }
  return { value: String(error) };
}

async function getCacheEntryCount(): Promise<number | undefined> {
  try {
    if (typeof caches === 'undefined') return undefined;
    const cache = await caches.open('voicecraft-pocket-tts-v1');
    return (await cache.keys()).length;
  } catch {
    return undefined;
  }
}

async function getEngine(): Promise<PocketTTS> {
  if (engine) {
    diagnosticPatch({ phase: 'engine-reused' });
    return engine;
  }
  if (enginePromise) {
    diagnosticPatch({ phase: 'engine-load-already-running' });
    return enginePromise;
  }

  const startedAt = Date.now();
  diagnosticPatch({
    phase: 'engine-constructing',
    startedAt,
    completedAt: undefined,
    online: navigator.onLine,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as any).deviceMemory,
    cacheEntries: await getCacheEntryCount(),
    loadProgress: [],
    error: undefined,
  });

  enginePromise = (async () => {
    const instance = new PocketTTS({
      language: 'english_2026-04',
      quantized: true,
      voiceCloning: true,
      cache: true,
      cacheName: 'voicecraft-pocket-tts-v1',
      // Isolated experiment: single-threaded WASM. The trace shows the stall
      // after flow_lm_main bytes are cached, during ONNX session initialization.
      maxThreads: 1,
      ortBaseUrl: `${import.meta.env.BASE_URL}ort/`,
    });

    diagnosticPatch({ phase: 'engine-load-start' });

    await instance.load((progress: any) => {
      const target = globalThis as any;
      const list = Array.isArray(target.__VC_POCKET_DIAGNOSTIC__?.loadProgress)
        ? target.__VC_POCKET_DIAGNOSTIC__.loadProgress
        : [];
      const entry = {
        label: progress?.label,
        loaded: progress?.loaded,
        total: progress?.total,
        fromCache: progress?.fromCache,
      };
      diagnosticPatch({ phase: `engine-load:${progress?.label || 'progress'}`, loadProgress: [...list, entry] });
    });

    engine = instance;
    diagnosticPatch({ phase: 'engine-load-success', completedAt: Date.now(), cacheEntries: await getCacheEntryCount() });
    return instance;
  })();

  try {
    return await enginePromise;
  } catch (error) {
    const details = serializeError(error);
    enginePromise = null;
    engine = null;
    diagnosticPatch({ phase: 'engine-load-failure', completedAt: Date.now(), error: details, cacheEntries: await getCacheEntryCount() });
    console.error('[VC-DIAG] Pocket TTS engine load failure:', details);
    throw error;
  }
}

async function decodeReference(blob: Blob): Promise<{ audio: Float32Array; sampleRate: number; duration: number }> {
  diagnosticPatch({ phase: 'reference-decode-start' });
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    diagnosticPatch({ phase: 'reference-decode-success' });
    return { audio: new Float32Array(decoded.getChannelData(0)), sampleRate: decoded.sampleRate, duration: decoded.duration };
  } catch (error) {
    const details = serializeError(error);
    diagnosticPatch({ phase: 'reference-decode-failure', error: details });
    throw error;
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function base64ToBlob(base64: string, mimeType = 'audio/webm'): Promise<Blob> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function makeProfile(name: string, voiceRef: string, sampleDuration: number, notes: string, sampleBase64: string, mimeType: string): ClonedVoiceProfile {
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
    providerSampleBase64: sampleBase64,
    providerSampleMimeType: mimeType,
  };
}

async function cloneLocally(name: string, blob: Blob, notes: string): Promise<ClonedVoiceProfile> {
  diagnosticPatch({ phase: 'clone-start' });
  const tts = await getEngine();
  const decoded = await decodeReference(blob);
  diagnosticPatch({ phase: 'cloneVoice-start' });
  try {
    const voiceRef = await tts.cloneVoice(decoded.audio, { inputSampleRate: decoded.sampleRate, name });
    diagnosticPatch({ phase: 'cloneVoice-success', completedAt: Date.now() });
    const sampleBase64 = await blobToBase64(blob);
    const profile = makeProfile(name, voiceRef, Number(decoded.duration.toFixed(2)), notes, sampleBase64, blob.type || 'audio/webm');
    activeVoiceRefs.set(profile.id, voiceRef);
    return profile;
  } catch (error) {
    const details = serializeError(error);
    diagnosticPatch({ phase: 'cloneVoice-failure', completedAt: Date.now(), error: details });
    console.error('[VC-DIAG] cloneVoice failure:', details);
    throw error;
  }
}

async function ensureVoiceRef(voice: ClonedVoiceProfile): Promise<string> {
  const cached = activeVoiceRefs.get(voice.id);
  if (cached) return cached;
  if (!voice.providerSampleBase64) throw new Error('This saved Pocket TTS voice has no encrypted reference sample. Please create the clone again.');
  const tts = await getEngine();
  const blob = await base64ToBlob(voice.providerSampleBase64, voice.providerSampleMimeType || 'audio/webm');
  const decoded = await decodeReference(blob);
  const voiceRef = await tts.cloneVoice(decoded.audio, { inputSampleRate: decoded.sampleRate, name: voice.name });
  activeVoiceRefs.set(voice.id, voiceRef);
  return voiceRef;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not encode audio sample.'));
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
  if (voice.provider !== 'pocket-tts') throw new Error('This cloned profile is not a Pocket TTS voice.');

  const tts = await getEngine();
  const voiceRef = await ensureVoiceRef(voice);
  const chunks: Float32Array[] = [];
  const metrics = await tts.generate(options.text, {
    voice: voiceRef,
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

  return { clip, audioBuffer, isOffline: true, isQuotaFallback: false, latencyMs: Math.round(performance.now() - start), engine: 'offline' };
}

export function installPocketTtsBridge(): void {
  const cloneService = voiceCloneService as any;
  cloneService.analyzeAndClone = async function(name: string, sampleBlob?: Blob, _sampleBase64?: string, notes = '') {
    if (!sampleBlob) throw new Error('A local audio sample is required for browser voice cloning.');
    try {
      return await cloneLocally(name, sampleBlob, notes);
    } catch (error) {
      const details = serializeError(error);
      diagnosticPatch({ phase: 'clone-request-failure', completedAt: Date.now(), error: details });
      console.error('[VoiceCraft] Pocket TTS voice cloning failed:', details);
      throw new Error(`Pocket TTS diagnostic failure: ${details.name || 'Error'}: ${details.message || String(error)}`);
    }
  };

  const tts = ttsService as any;
  const originalGenerate = tts.generateSpeech.bind(tts);
  tts.generateSpeech = async function(options: TTSGenerateOptions) {
    if (options.voice?.type === 'cloned' && (options.voice as ClonedVoiceProfile).provider === 'pocket-tts') return generateLocally(options);
    return originalGenerate(options);
  };
}
