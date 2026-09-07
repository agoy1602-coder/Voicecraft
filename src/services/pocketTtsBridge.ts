import { PocketTTS, chunksToWavBlob } from 'pocket-tts-js';
import type { ClonedVoiceProfile, AudioClip, AudioSentence } from '../types';
import type { TTSGenerateOptions, TTSResult } from './ttsService';
import { ttsService } from './ttsService';

const CACHE_NAME = 'voicecraft-pocket-tts-v1';
const READINESS_KEY = 'voicecraft-pocket-tts-readiness-v1';
const MODEL_VERSION = 'english_2026-04-int8-clone-v1';
const ENGINE_LOAD_TIMEOUT_MS = 12 * 60 * 1000;
const REQUIRED_MODEL_FILES = [
  'bundle.json',
  'tokenizer.model',
  'mimi_encoder_int8.onnx',
  'text_conditioner_int8.onnx',
  'flow_lm_main_int8.onnx',
  'flow_lm_flow_int8.onnx',
  'mimi_decoder_int8.onnx',
  'bos_before_voice.npy',
] as const;
const REQUIRED_ORT_FILES = [
  'ort.min.mjs',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
] as const;

let engine: PocketTTS | null = null;
let enginePromise: Promise<PocketTTS> | null = null;
const activeVoiceRefs = new Map<string, string>();

type PocketProgress = {
  label?: string;
  loaded?: number;
  total?: number;
  fromCache?: boolean;
};

export type PocketTtsOfflineStatus = {
  ready: boolean;
  version: string | null;
  cachedModels: string[];
  missingModels: string[];
  missingOrt: string[];
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function markReadiness(status: PocketTtsOfflineStatus): void {
  if (!status.ready) {
    localStorage.removeItem(READINESS_KEY);
    return;
  }
  localStorage.setItem(READINESS_KEY, JSON.stringify({ version: MODEL_VERSION, verifiedAt: Date.now() }));
}

async function verifyOfflineAssets(): Promise<PocketTtsOfflineStatus> {
  const cachedModels = new Set<string>();
  const missingModels: string[] = [];
  const missingOrt: string[] = [];

  if (typeof caches === 'undefined') {
    return {
      ready: false,
      version: null,
      cachedModels: [],
      missingModels: [...REQUIRED_MODEL_FILES],
      missingOrt: [...REQUIRED_ORT_FILES],
    };
  }

  try {
    const modelCache = await caches.open(CACHE_NAME);
    const keys = await modelCache.keys();
    for (const request of keys) {
      const path = new URL(request.url).pathname;
      for (const filename of REQUIRED_MODEL_FILES) {
        if (path.endsWith(`/${filename}`)) cachedModels.add(filename);
      }
    }
  } catch {
    missingModels.push(...REQUIRED_MODEL_FILES);
  }

  for (const filename of REQUIRED_MODEL_FILES) {
    if (!cachedModels.has(filename) && !missingModels.includes(filename)) missingModels.push(filename);
  }

  for (const filename of REQUIRED_ORT_FILES) {
    const url = new URL(`${import.meta.env.BASE_URL}ort/${filename}`, window.location.origin).toString();
    try {
      const response = await caches.match(url);
      if (!response) missingOrt.push(filename);
    } catch {
      missingOrt.push(filename);
    }
  }

  let version: string | null = null;
  try {
    const raw = localStorage.getItem(READINESS_KEY);
    if (raw) version = JSON.parse(raw)?.version || null;
  } catch {
    version = null;
  }

  // Cache contents are the authoritative readiness proof. The localStorage
  // marker is only metadata and must not make an already-complete cache fail
  // verification (for example after a fresh browser/session or marker loss).
  const ready = missingModels.length === 0 && missingOrt.length === 0;
  return { ready, version, cachedModels: [...cachedModels], missingModels, missingOrt };
}

async function cacheSameOriginOrtAssets(): Promise<void> {
  if (typeof caches === 'undefined') throw new Error('Browser Cache Storage is unavailable on this device.');
  const cache = await caches.open('voicecraft-pocket-tts-assets-v1');
  for (const filename of REQUIRED_ORT_FILES) {
    const url = new URL(`${import.meta.env.BASE_URL}ort/${filename}`, window.location.origin).toString();
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not prepare local ONNX Runtime asset: ${filename}`);
    await cache.put(url, response.clone());
  }
}

async function getEngine(onProgress?: (progress: PocketProgress) => void): Promise<PocketTTS> {
  if (engine) return engine;
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const instance = new PocketTTS({
      language: 'english_2026-04',
      quantized: true,
      voiceCloning: true,
      cache: true,
      cacheName: CACHE_NAME,
      maxThreads: 4,
      ortBaseUrl: `${import.meta.env.BASE_URL}ort/`,
    });
    await withTimeout(
      instance.load((progress: PocketProgress) => onProgress?.(progress)),
      ENGINE_LOAD_TIMEOUT_MS,
      'Pocket TTS model preparation timed out. Check your connection and available browser storage, then try again.',
    );
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

export async function getPocketTtsOfflineStatus(): Promise<PocketTtsOfflineStatus> {
  const status = await verifyOfflineAssets();
  markReadiness(status);
  return status;
}

export async function preparePocketTtsOffline(
  onProgress?: (progress: PocketProgress) => void,
): Promise<PocketTtsOfflineStatus> {
  if (!navigator.onLine) {
    throw new Error('Connect to the internet once to install and verify the offline Pocket TTS models.');
  }
  onProgress?.({ label: 'Preparing local ONNX Runtime…', loaded: 0, total: 1 });
  await cacheSameOriginOrtAssets();
  onProgress?.({ label: 'Downloading and verifying Pocket TTS English voice-cloning models…', loaded: 0, total: 1 });
  await getEngine(onProgress);
  const status = await verifyOfflineAssets();
  markReadiness(status);
  if (!status.ready) {
    throw new Error(
      `Offline model verification failed. Missing Pocket assets: ${status.missingModels.join(', ') || 'none'}; missing local runtime: ${status.missingOrt.join(', ') || 'none'}.`,
    );
  }
  return status;
}

async function decodeReference(blob: Blob): Promise<{ audio: Float32Array; sampleRate: number; duration: number }> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return { audio: new Float32Array(decoded.getChannelData(0)), sampleRate: decoded.sampleRate, duration: decoded.duration };
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

async function ensureVoiceRef(voice: ClonedVoiceProfile): Promise<string> {
  const cached = activeVoiceRefs.get(voice.id);
  if (cached) return cached;
  if (!voice.providerSampleBase64) {
    throw new Error('This saved Pocket TTS voice has no encrypted reference sample. Please create the clone again.');
  }
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
  if (options.language !== 'en-US') {
    throw new Error('Offline cloned speech currently supports English (en-US) only. Other language choices are not connected to the local Pocket TTS bundle yet.');
  }

  // Online synthesis must not depend on offline readiness. getEngine() uses
  // Pocket TTS Cache Storage when available and downloads the missing model
  // assets from the configured model source when online.
  if (!navigator.onLine) {
    const status = await verifyOfflineAssets();
    if (!status.ready) {
      throw new Error('Offline speech models are not installed or verified on this device. Connect once and choose “Prepare Offline Voice Engine” before going offline.');
    }
  }

  const tts = await getEngine();
  const voiceRef = await ensureVoiceRef(voice);
  const chunks: Float32Array[] = [];
  const metrics = await withTimeout(
    tts.generate(options.text, {
      voice: voiceRef,
      onChunk: (chunk) => chunks.push(new Float32Array(chunk)),
    }),
    ENGINE_LOAD_TIMEOUT_MS,
    'Pocket TTS synthesis timed out. No cloud TTS fallback was used.',
  );
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
    isOffline: true,
    isQuotaFallback: false,
    latencyMs: Math.round(performance.now() - start),
    engine: 'offline',
  };
}

export function installPocketTtsBridge(): void {
  // Create Clone remains reference-only and fast. Pocket TTS initialization is
  // deliberately deferred until offline models are prepared or synthesis starts.
  const tts = ttsService as any;
  const originalGenerate = tts.generateSpeech.bind(tts);
  tts.generateSpeech = async function(options: TTSGenerateOptions) {
    if (options.voice?.type === 'cloned' && (options.voice as ClonedVoiceProfile).provider === 'pocket-tts') {
      return generateLocally(options);
    }
    return originalGenerate(options);
  };
}
