import {
  AudioClip,
  AudioSentence,
  SupportedLanguage,
  ToneType,
  VoiceProfile,
} from '../types';
import { base64PcmToAudioBuffer, pcmToWavBlob } from './audioExport';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://voicecraft-api.vercel.app').replace(/\/$/, '');
const CLOUD_TIMEOUT_MS = 45000;

export interface TTSGenerateOptions {
  text: string;
  voice: VoiceProfile;
  tone: ToneType;
  language: SupportedLanguage;
  speed: number;
  pitch: number;
  warmth?: number;
  breathiness?: number;
  forceOffline?: boolean;
}

export const PREBUILT_VOICE_PROFILES: VoiceProfile[] = [
  { id: 'voice_kore', name: 'Kore', type: 'prebuilt', gender: 'feminine', tone: 'calm', baseVoice: 'Kore', description: 'Silky, soothing, warm and grounded feminine voice. Perfect for meditation and audiobooks.', avatarColor: 'from-emerald-500 to-teal-700', pitchShift: 0, speedFactor: 1.0, warmth: 0.9, breathiness: 0.2, createdAt: Date.now() },
  { id: 'voice_fenrir', name: 'Fenrir', type: 'prebuilt', gender: 'masculine', tone: 'deep', baseVoice: 'Fenrir', description: 'Deep, resonant, authoritative baritone. Ideal for documentaries, film narration and introspective storytelling.', avatarColor: 'from-amber-600 to-orange-900', pitchShift: -2, speedFactor: 0.95, warmth: 0.85, breathiness: 0.1, createdAt: Date.now() },
  { id: 'voice_zephyr', name: 'Zephyr', type: 'prebuilt', gender: 'neutral', tone: 'professional', baseVoice: 'Zephyr', description: 'Crisp, articulate, balanced and professional. Excels at corporate presentations, tech news and tutorials.', avatarColor: 'from-blue-500 to-indigo-700', pitchShift: 0, speedFactor: 1.05, warmth: 0.6, breathiness: 0.05, createdAt: Date.now() },
  { id: 'voice_puck', name: 'Puck', type: 'prebuilt', gender: 'neutral', tone: 'funny', baseVoice: 'Puck', description: 'Playful, vibrant, energetic and witty. Great for podcasts, comedy sketches and gaming commentary.', avatarColor: 'from-pink-500 to-rose-700', pitchShift: 1, speedFactor: 1.15, warmth: 0.7, breathiness: 0.15, createdAt: Date.now() },
  { id: 'voice_charon', name: 'Charon', type: 'prebuilt', gender: 'masculine', tone: 'introspective', baseVoice: 'Charon', description: 'Calm, measured, philosopher resonance. Suited for poetry, introspective thoughts and slow audio.', avatarColor: 'from-purple-600 to-violet-900', pitchShift: -1, speedFactor: 0.9, warmth: 0.8, breathiness: 0.25, createdAt: Date.now() },
];

export const SUPPORTED_LANGUAGES_MAP: { code: SupportedLanguage; label: string; flag: string }[] = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' }, { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' }, { code: 'es-ES', label: 'Spanish (Español)', flag: '🇪🇸' }, { code: 'fr-FR', label: 'French (Français)', flag: '🇫🇷' }, { code: 'de-DE', label: 'German (Deutsch)', flag: '🇩🇪' }, { code: 'it-IT', label: 'Italian (Italiano)', flag: '🇮🇹' }, { code: 'ja-JP', label: 'Japanese (日本語)', flag: '🇯🇵' }, { code: 'zh-CN', label: 'Chinese (Mandarin)', flag: '🇨🇳' }, { code: 'pt-BR', label: 'Portuguese (Brasil)', flag: '🇧🇷' }, { code: 'ar-SA', label: 'Arabic (العربية)', flag: '🇸🇦' }, { code: 'hi-IN', label: 'Hindi (हिन्दी)', flag: '🇮🇳' }, { code: 'ko-KR', label: 'Korean (한국어)', flag: '🇰🇷' }, { code: 'ru-RU', label: 'Russian (Русский)', flag: '🇷🇺' }, { code: 'nl-NL', label: 'Dutch (Nederlands)', flag: '🇳🇱' },
];

export const TONE_PRESETS: { tone: ToneType; label: string; iconName: string; desc: string }[] = [
  { tone: 'calm', label: 'Calm', iconName: 'Waves', desc: 'Serene, relaxed, steady breathing cadence' }, { tone: 'deep', label: 'Deep', iconName: 'Volume2', desc: 'Rich bass resonance with authoritative weight' }, { tone: 'slow', label: 'Slow', iconName: 'Hourglass', desc: 'Deliberate pacing with soft reflective pauses' }, { tone: 'introspective', label: 'Introspective', iconName: 'Eye', desc: 'Thoughtful philosopher cadence' }, { tone: 'funny', label: 'Funny', iconName: 'Smile', desc: 'Witty, dynamic, playful and cheerful inflection' }, { tone: 'professional', label: 'Professional', iconName: 'Briefcase', desc: 'Crisp, articulate executive delivery' }, { tone: 'dramatic', label: 'Dramatic', iconName: 'Flame', desc: 'Cinematic storytelling with vivid emotion' }, { tone: 'whispering', label: 'Whispering', iconName: 'Wind', desc: 'Gentle, intimate, soft ASMR whisper' }, { tone: 'energetic', label: 'Energetic', iconName: 'Zap', desc: 'High momentum, vibrant and motivating' },
];

export type TTSFailureCode = 'OFFLINE' | 'GEMINI_QUOTA' | 'GEMINI_NOT_CONFIGURED' | 'GEMINI_PROVIDER_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'AUDIO_DECODE_ERROR' | 'REQUEST_IN_PROGRESS';

export class TTSServiceError extends Error {
  code: TTSFailureCode;
  retryAfterSeconds?: number;
  requestId?: string;
  constructor(code: TTSFailureCode, message: string, retryAfterSeconds?: number, requestId?: string) {
    super(message);
    this.name = 'TTSServiceError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }
}

export interface TTSResult {
  clip: AudioClip;
  audioBuffer: AudioBuffer;
  isOffline: boolean;
  isQuotaFallback?: boolean;
  retryAfterSeconds?: number;
  latencyMs: number;
  engine?: 'gemini-cloud' | 'offline' | 'quota-fallback';
  requestId?: string;
}
export interface QuotaState { isQuotaActive: boolean; retryAfterSeconds: number; expiresAt: number; message: string; }

class TTSService {
  private audioCtx: AudioContext | null = null;
  private quotaState: QuotaState = { isQuotaActive: false, retryAfterSeconds: 0, expiresAt: 0, message: '' };
  private quotaListeners: ((state: QuotaState) => void)[] = [];
  private requestInProgress = false;

  getAudioContext(): AudioContext { const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext; if (!this.audioCtx || this.audioCtx.state === 'closed') this.audioCtx = new AudioContextClass({ sampleRate: 24000 }); if (this.audioCtx.state === 'suspended') void this.audioCtx.resume(); return this.audioCtx; }
  getQuotaState(): QuotaState { if (this.quotaState.isQuotaActive && Date.now() > this.quotaState.expiresAt) { this.quotaState = { isQuotaActive: false, retryAfterSeconds: 0, expiresAt: 0, message: '' }; this.notifyQuotaListeners(); } return this.quotaState; }
  subscribeQuota(listener: (state: QuotaState) => void): () => void { this.quotaListeners.push(listener); listener(this.getQuotaState()); return () => { this.quotaListeners = this.quotaListeners.filter((l) => l !== listener); }; }
  private setQuotaCooldown(seconds: number, message: string) { const safeSeconds = Math.max(1, Math.min(300, Math.ceil(seconds))); const expiresAt = Date.now() + safeSeconds * 1000; this.quotaState = { isQuotaActive: true, retryAfterSeconds: safeSeconds, expiresAt, message }; this.notifyQuotaListeners(); setTimeout(() => { if (Date.now() >= this.quotaState.expiresAt) { this.quotaState = { isQuotaActive: false, retryAfterSeconds: 0, expiresAt: 0, message: '' }; this.notifyQuotaListeners(); } }, safeSeconds * 1000 + 100); }
  private notifyQuotaListeners() { this.quotaListeners.forEach((fn) => fn(this.quotaState)); }

  async generateSpeech(options: TTSGenerateOptions): Promise<TTSResult> {
    if (this.requestInProgress) throw new TTSServiceError('REQUEST_IN_PROGRESS', 'Speech generation is already running. Please wait for the current render to finish.');
    const startTime = performance.now();
    const quota = this.getQuotaState();
    const shouldUseOffline = options.forceOffline === true || !navigator.onLine || quota.isQuotaActive;
    if (shouldUseOffline) {
      if (!navigator.onLine) return this.generateOfflineSpeech(options, startTime, false, 0);
      return this.generateOfflineSpeech(options, startTime, quota.isQuotaActive, Math.max(0, Math.ceil((quota.expiresAt - Date.now()) / 1000)));
    }

    this.requestInProgress = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}/api/tts/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: options.text, voice: options.voice.baseVoice || 'Kore', tone: options.tone, language: options.language, speed: options.speed, pitch: options.pitch, isClonedVoice: options.voice.type === 'cloned', clonedProfileData: options.voice }), signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw new TTSServiceError('TIMEOUT', 'Cloud TTS timed out after 45 seconds. The cloud service may be busy.');
        const message = error instanceof Error ? error.message : String(error);
        throw new TTSServiceError('NETWORK_ERROR', `Cloud TTS could not be reached: ${message}`);
      }

      let data: any;
      try { data = await response.json(); } catch { throw new TTSServiceError('INVALID_RESPONSE', `Cloud TTS returned an invalid response (HTTP ${response.status}).`); }

      if (response.ok && data?.success && data.audioBase64) {
        const ctx = this.getAudioContext();
        let decoded: { audioBuffer: AudioBuffer; wavBlob: Blob };
        try { decoded = await base64PcmToAudioBuffer(data.audioBase64, ctx, data.sampleRate || 24000); } catch (error) { const message = error instanceof Error ? error.message : String(error); throw new TTSServiceError('AUDIO_DECODE_ERROR', `Cloud audio was received but could not be decoded: ${message}`); }
        const duration = decoded.audioBuffer.duration;
        const sentences = this.calculateSentenceTimings(options.text, duration);
        const blobUrl = URL.createObjectURL(decoded.wavBlob);
        const latencyMs = Math.round(performance.now() - startTime);
        const clip: AudioClip = { id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, title: this.generateTitle(options.text), text: options.text, voiceId: options.voice.id, voiceName: options.voice.name, voiceType: options.voice.type, tone: options.tone, language: options.language, durationSeconds: duration, audioBlobUrl: blobUrl, audioBase64: data.audioBase64, format: 'wav', sampleRate: data.sampleRate || 24000, sentences, isOfflineGenerated: false, createdAt: Date.now(), isFavorite: false, synced: false, tags: [options.tone, options.language, options.voice.name] };
        return { clip, audioBuffer: decoded.audioBuffer, isOffline: false, latencyMs, engine: 'gemini-cloud', requestId: data.requestId };
      }

      if (data?.quotaExceeded || response.status === 429 || data?.errorCode === 'GEMINI_QUOTA') {
        const headerRetry = Number(response.headers.get('Retry-After'));
        const retrySec = data?.retryAfterSeconds || (Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : 15);
        this.setQuotaCooldown(retrySec, `Gemini quota/rate limit reached. Local fallback is active for about ${Math.ceil(retrySec)}s.`);
        return await this.generateOfflineSpeech(options, startTime, true, retrySec);
      }

      if (data?.errorCode === 'GEMINI_NOT_CONFIGURED') throw new TTSServiceError('GEMINI_NOT_CONFIGURED', data.error, undefined, data.requestId);
      if (data?.errorCode === 'GEMINI_PROVIDER_ERROR') throw new TTSServiceError('GEMINI_PROVIDER_ERROR', data.error, undefined, data.requestId);
      throw new TTSServiceError('INVALID_RESPONSE', data?.error || `Cloud TTS returned HTTP ${response.status}.`, undefined, data?.requestId);
    } finally {
      window.clearTimeout(timeout);
      this.requestInProgress = false;
    }
  }

  async generateOfflineSpeech(options: TTSGenerateOptions, startTime: number, isQuotaFallback: boolean = false, retryAfterSeconds: number = 0): Promise<TTSResult> {
    const ctx = this.getAudioContext();
    const estimatedDuration = Math.max(1.2, (options.text.split(' ').length * 0.42) / options.speed);
    const sampleRate = 24000;
    const numSamples = Math.ceil(estimatedDuration * sampleRate);
    const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    let baseFreq = options.voice.gender === 'masculine' ? 120 : options.voice.gender === 'feminine' ? 220 : 165;
    if (options.tone === 'deep') baseFreq *= 0.75;
    if (options.tone === 'calm') baseFreq *= 0.9;
    if (options.tone === 'slow') baseFreq *= 0.85;
    if (options.tone === 'funny') baseFreq *= 1.2;
    if (options.pitch) baseFreq *= options.pitch;
    const words = options.text.split(' ');
    const samplesPerWord = Math.floor(numSamples / Math.max(1, words.length));
    for (let i = 0; i < numSamples; i++) { const t = i / sampleRate; const wordProgress = (i % samplesPerWord) / samplesPerWord; let envelope = 1; if (wordProgress < 0.15) envelope = wordProgress / 0.15; else if (wordProgress > 0.85) envelope = (1 - wordProgress) / 0.15; const f0 = baseFreq * (1 + 0.04 * Math.sin(2 * Math.PI * 1.5 * t)); const harmonic1 = 0.5 * Math.sin(2 * Math.PI * f0 * t); const harmonic2 = 0.25 * Math.sin(2 * Math.PI * f0 * 2 * t); const harmonic3 = 0.15 * Math.sin(2 * Math.PI * f0 * 3 * t); const breathNoise = (Math.random() * 2 - 1) * (options.breathiness || 0.1); channel[i] = (harmonic1 + harmonic2 + harmonic3 + breathNoise) * envelope * 0.35; }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) { try { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(options.text); utterance.rate = options.speed; utterance.pitch = options.pitch; utterance.lang = options.language; const voices = window.speechSynthesis.getVoices(); const langPrefix = options.language.split('-')[0]; const matched = voices.find((v) => v.lang === options.language) || voices.find((v) => v.lang.startsWith(langPrefix)) || voices[0]; if (matched) utterance.voice = matched; window.speechSynthesis.speak(utterance); } catch {} }
    const pcm16 = new Int16Array(numSamples); for (let i = 0; i < numSamples; i++) { const s = Math.max(-1, Math.min(1, channel[i])); pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    const wavBlob = pcmToWavBlob(pcm16, sampleRate, 1); const blobUrl = URL.createObjectURL(wavBlob); const latencyMs = Math.round(performance.now() - startTime); const sentences = this.calculateSentenceTimings(options.text, estimatedDuration);
    let audioBase64 = ''; try { const arrayBuffer = await wavBlob.arrayBuffer(); const bytes = new Uint8Array(arrayBuffer); let binary = ''; for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]); audioBase64 = btoa(binary); } catch {}
    const clip: AudioClip = { id: `clip_offline_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, title: this.generateTitle(options.text), text: options.text, voiceId: options.voice.id, voiceName: `${options.voice.name} (${isQuotaFallback ? 'Zero-Quota' : 'Offline'})`, voiceType: options.voice.type, tone: options.tone, language: options.language, durationSeconds: estimatedDuration, audioBlobUrl: blobUrl, audioBase64, format: 'wav', sampleRate, sentences, isOfflineGenerated: true, createdAt: Date.now(), isFavorite: false, synced: false, tags: [isQuotaFallback ? 'zero-quota' : 'offline', options.tone, options.language] };
    return { clip, audioBuffer, isOffline: true, isQuotaFallback, retryAfterSeconds, latencyMs, engine: isQuotaFallback ? 'quota-fallback' : 'offline' };
  }

  private calculateSentenceTimings(text: string, totalDuration: number): AudioSentence[] { const rawSentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]; const cleanSentences = rawSentences.map((s) => s.trim()).filter(Boolean); if (cleanSentences.length === 0) return [{ text, startSec: 0, endSec: totalDuration }]; const totalChars = cleanSentences.reduce((acc, s) => acc + s.length, 0); let currentStart = 0; return cleanSentences.map((s) => { const charRatio = s.length / totalChars; const sentenceDuration = Math.max(0.4, charRatio * totalDuration); const startSec = currentStart; const endSec = Math.min(totalDuration, currentStart + sentenceDuration); currentStart = endSec; return { text: s, startSec: Number(startSec.toFixed(2)), endSec: Number(endSec.toFixed(2)) }; }); }
  private generateTitle(text: string): string { const words = text.trim().split(/\s+/).slice(0, 5).join(' '); return words.length > 32 ? words.substring(0, 30) + '...' : words || 'Untitled Speech'; }
}

export const ttsService = new TTSService();
