import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Sliders,
  Volume2,
  Globe,
  Zap,
  Waves,
  Hourglass,
  Eye,
  Smile,
  Briefcase,
  Flame,
  Wind,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkle,
  BookOpen,
  Cpu,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  AudioClip,
  ClonedVoiceProfile,
  ProjectPlaylist,
  SupportedLanguage,
  ToneType,
  VoiceProfile,
} from '../types';
import {
  PREBUILT_VOICE_PROFILES,
  SUPPORTED_LANGUAGES_MAP,
  TONE_PRESETS,
  TTSGenerateOptions,
  ttsService,
  QuotaState,
} from '../services/ttsService';
import { ProjectPlaylistQueue } from './ProjectPlaylistQueue';

interface TTSStudioProps {
  clonedVoices: ClonedVoiceProfile[];
  onGenerate: (options: TTSGenerateOptions) => Promise<void>;
  onBulkComplete?: (playlist: ProjectPlaylist, masterClip: AudioClip, clips: AudioClip[]) => void;
  isGenerating: boolean;
  lastLatencyMs: number | null;
  isOnline: boolean;
}

const SAMPLE_SCRIPTS = [
  {
    category: 'Meditation & Calm',
    tone: 'calm' as ToneType,
    text: 'Take a slow, deep breath in through your nose... hold it for a tranquil moment... and gently exhale all tension. Feel the quiet stillness expand within your mind.',
  },
  {
    category: 'Philosophical & Deep',
    tone: 'introspective' as ToneType,
    text: 'We are wayfarers among constellations, seeking timeless resonance in ephemeral moments. True wisdom is not finding new landscapes, but seeing with open eyes.',
  },
  {
    category: 'Executive Briefing',
    tone: 'professional' as ToneType,
    text: 'Welcome to our quarterly architecture review. Today we will examine how end-to-end encrypted neural synthesis enables seamless, low-latency intelligence across distributed edge networks.',
  },
  {
    category: 'Comedy & Humor',
    tone: 'funny' as ToneType,
    text: 'I told my computer I needed a break, and now it refuses to stop sending me vacation ads for Tahiti. Modern technology is very supportive, if slightly aggressive!',
  },
  {
    category: 'Audiobook Fiction',
    tone: 'dramatic' as ToneType,
    text: 'The heavy iron gates creaked open under the moonlit mist, revealing shadows dancing across the ancient courtyard. She knew the secret lay locked beneath the tower.',
  },
];

export const TTSStudio: React.FC<TTSStudioProps> = ({
  clonedVoices,
  onGenerate,
  onBulkComplete,
  isGenerating,
  lastLatencyMs,
  isOnline,
}) => {
  const allVoices: VoiceProfile[] = [...PREBUILT_VOICE_PROFILES, ...clonedVoices];

  const [studioMode, setStudioMode] = useState<'single' | 'queue'>('single');
  const [text, setText] = useState<string>(
    'Welcome to VoiceCraft AI. Convert any written text into natural, expressive speech with custom tones, multilingual mastery, and personal voice cloning.'
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(PREBUILT_VOICE_PROFILES[0].id);
  const [selectedTone, setSelectedTone] = useState<ToneType>('calm');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('en-US');
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(1.0);
  const [warmth, setWarmth] = useState<number>(0.8);
  const [breathiness, setBreathiness] = useState<number>(0.1);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [enginePreference, setEnginePreference] = useState<'auto' | 'offline_zero_quota'>('auto');

  // Real-time quota countdown state
  const [quotaState, setQuotaState] = useState<QuotaState>(ttsService.getQuotaState());
  const [countdownSec, setCountdownSec] = useState<number>(0);

  useEffect(() => {
    const unsub = ttsService.subscribeQuota((state) => {
      setQuotaState(state);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (quotaState.isQuotaActive) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((quotaState.expiresAt - Date.now()) / 1000));
        setCountdownSec(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 1000);
      setCountdownSec(Math.max(0, Math.ceil((quotaState.expiresAt - Date.now()) / 1000)));
      return () => clearInterval(interval);
    } else {
      setCountdownSec(0);
    }
  }, [quotaState]);

  const selectedVoice =
    allVoices.find((v) => v.id === selectedVoiceId) || PREBUILT_VOICE_PROFILES[0];

  const handleApplySample = (sample: { text: string; tone: ToneType }) => {
    setText(sample.text);
    setSelectedTone(sample.tone);
  };

  const handleResetSliders = () => {
    setSpeed(1.0);
    setPitch(1.0);
    setWarmth(0.8);
    setBreathiness(0.1);
  };

  const handleSynthesize = async () => {
    if (!text.trim() || isGenerating) return;
    await onGenerate({
      text,
      voice: selectedVoice,
      tone: selectedTone,
      language: selectedLanguage,
      speed,
      pitch,
      warmth,
      breathiness,
      forceOffline: enginePreference === 'offline_zero_quota' || !isOnline,
    });
  };

  const renderToneIcon = (tone: ToneType) => {
    switch (tone) {
      case 'calm':
        return <Waves className="w-4 h-4 text-teal-400" />;
      case 'deep':
        return <Volume2 className="w-4 h-4 text-amber-500" />;
      case 'slow':
        return <Hourglass className="w-4 h-4 text-blue-400" />;
      case 'introspective':
        return <Eye className="w-4 h-4 text-purple-400" />;
      case 'funny':
        return <Smile className="w-4 h-4 text-rose-400" />;
      case 'professional':
        return <Briefcase className="w-4 h-4 text-indigo-400" />;
      case 'dramatic':
        return <Flame className="w-4 h-4 text-orange-500" />;
      case 'whispering':
        return <Wind className="w-4 h-4 text-cyan-300" />;
      case 'energetic':
        return <Zap className="w-4 h-4 text-yellow-400" />;
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((wordCount * 0.45) / speed);

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 lg:p-7 shadow-xl shadow-black/20 flex flex-col gap-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Neural Text to Speech Studio
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure rich emotional tones, acoustic profiles, and multilingual synthesis
          </p>
        </div>

        {/* Engine Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-950/80 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
            <button
              onClick={() => setEnginePreference('auto')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                enginePreference === 'auto'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Uses Gemini 3.1 Flash Neural TTS when available, with automatic zero-quota fallback"
            >
              <Zap className="w-3 h-3 text-amber-300" />
              <span>Neural Flash</span>
            </button>
            <button
              onClick={() => setEnginePreference('offline_zero_quota')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                enginePreference === 'offline_zero_quota'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Instant local acoustic synthesis, 0 API quota usage, works completely offline"
            >
              <Cpu className="w-3 h-3 text-emerald-300" />
              <span>Zero-Quota Local</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mode Switcher: Single Prompt vs Project Playlist Queue */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            id="studio-mode-single-btn"
            onClick={() => setStudioMode('single')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              studioMode === 'single'
                ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Single Speech Prompt</span>
          </button>

          <button
            id="studio-mode-queue-btn"
            onClick={() => setStudioMode('queue')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              studioMode === 'queue'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-300" />
            <span>Project Playlist Queue (Bulk)</span>
            <span className="bg-indigo-400/20 text-indigo-200 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
              Multi-Block
            </span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 hidden sm:inline-block">
          {studioMode === 'single'
            ? 'Instant single prompt rendering'
            : 'Queue multiple blocks for sequential bulk synthesis'}
        </span>
      </div>

      {/* Conditional Content: Project Playlist Queue vs Single Prompt */}
      {studioMode === 'queue' ? (
        <ProjectPlaylistQueue
          clonedVoices={clonedVoices}
          isOnline={isOnline}
          onBulkComplete={(playlist, masterClip, clips) => {
            if (onBulkComplete) {
              onBulkComplete(playlist, masterClip, clips);
            }
          }}
        />
      ) : (
        <>
          {/* Quota Cooldown Notification Banner */}
      {quotaState.isQuotaActive && countdownSec > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 flex items-start gap-3 text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs">
            <div className="font-bold text-amber-300 flex items-center gap-2">
              <span>Gemini Flash Rate Limit Active</span>
              <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono font-normal text-[11px] border border-amber-500/30">
                Resets in {countdownSec}s
              </span>
            </div>
            <p className="mt-0.5 text-amber-200/90 leading-relaxed">
              Synthesis requests are automatically routed through the high-performance local Zero-Quota engine with no interruption or data loss.
            </p>
          </div>
        </div>
      )}

      {/* Quick Sample Presets */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mr-1 whitespace-nowrap">
          <BookOpen className="w-3.5 h-3.5 text-violet-400" /> Presets:
        </span>
        {SAMPLE_SCRIPTS.map((s, idx) => (
          <button
            key={idx}
            onClick={() => handleApplySample(s)}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-[11px] font-medium transition-all whitespace-nowrap border border-slate-700/50"
          >
            {s.category}
          </button>
        ))}
      </div>

      {/* Main Text Input Area */}
      <div className="relative">
        <textarea
          id="tts-text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter or paste text to convert into realistic speech..."
          rows={5}
          className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all resize-y leading-relaxed font-sans"
        />

        {/* Text Metrics Bar */}
        <div className="flex items-center justify-between mt-2 px-1 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>{text.length} characters</span>
            <span>•</span>
            <span>{wordCount} words</span>
            <span>•</span>
            <span>~{estimatedSeconds}s audio duration</span>
          </div>

          <button
            onClick={() => setText('')}
            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear Text
          </button>
        </div>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Voice Profile Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-violet-400" /> Voice Profile
            </span>
            <span className="text-[10px] font-normal text-slate-400">
              {allVoices.length} Profiles Available
            </span>
          </label>

          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
            {allVoices.map((voice) => {
              const isSelected = voice.id === selectedVoiceId;
              return (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoiceId(voice.id)}
                  className={`cursor-pointer p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'bg-violet-950/40 border-violet-500 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${voice.avatarColor} flex items-center justify-center font-bold text-white text-xs shadow-md shrink-0`}
                  >
                    {voice.name.substring(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100 truncate">
                        {voice.name}
                      </span>
                      {voice.type === 'cloned' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                          Cloned
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 capitalize">
                        {voice.gender}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {voice.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Language & Tone Controls */}
        <div className="flex flex-col gap-4">
          {/* Language Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" /> Language & Dialect
            </label>
            <div className="relative">
              <select
                id="tts-language-select"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as SupportedLanguage)}
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all font-medium"
              >
                {SUPPORTED_LANGUAGES_MAP.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label} ({lang.code})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Tone Grid */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkle className="w-3.5 h-3.5 text-pink-400" /> Tone & Mood
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {TONE_PRESETS.map((preset) => {
                const isSelected = selectedTone === preset.tone;
                return (
                  <button
                    key={preset.tone}
                    onClick={() => setSelectedTone(preset.tone)}
                    title={preset.desc}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all truncate ${
                      isSelected
                        ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-600/20'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    {renderToneIcon(preset.tone)}
                    <span className="truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Fine-Tuning Accordion */}
      <div className="border-t border-slate-800/80 pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-300 uppercase tracking-wider hover:text-slate-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-violet-400" />
            Acoustic Fine-Tuning (Speed, Pitch, Resonance, Breath)
          </span>
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <span>{showAdvanced ? 'Hide Controls' : 'Show Controls'}</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            {/* Speed */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Speed Cadence</span>
                <span className="text-slate-200 font-mono font-bold">{speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Pitch */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Pitch Modulation</span>
                <span className="text-slate-200 font-mono font-bold">{pitch.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Warmth / Resonance */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Warmth / Harmonic</span>
                <span className="text-slate-200 font-mono font-bold">{(warmth * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={warmth}
                onChange={(e) => setWarmth(parseFloat(e.target.value))}
                className="w-full accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Breathiness */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Breathiness / Air</span>
                <span className="text-slate-200 font-mono font-bold">{(breathiness * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0.0}
                max={0.5}
                step={0.02}
                value={breathiness}
                onChange={(e) => setBreathiness(parseFloat(e.target.value))}
                className="w-full accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <button
                onClick={handleResetSliders}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Reset Acoustic Sliders
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer & Generate Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {lastLatencyMs !== null && (
            <div className="flex items-center gap-1 text-emerald-400 font-mono">
              <Zap className="w-3.5 h-3.5" />
              <span>Latency: {lastLatencyMs}ms</span>
            </div>
          )}
          <span>
            Mode: {isOnline ? 'Neural Flash 24kHz' : 'Offline Client Engine'}
          </span>
        </div>

        <button
          id="synthesize-speech-btn"
          disabled={isGenerating || !text.trim()}
          onClick={handleSynthesize}
          className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all ${
            isGenerating || !text.trim()
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-violet-600/30 active:scale-98'
          }`}
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Synthesizing Speech...</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4" />
              <span>Synthesize Speech</span>
            </>
          )}
        </button>
      </div>
        </>
      )}
    </div>
  );
};
