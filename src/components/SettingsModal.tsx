import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Settings,
  Mic,
  MicOff,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Activity,
  Sliders,
  Moon,
  Sun,
  Palette,
  ShieldCheck,
  Cloud,
  Bell,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Cpu,
} from 'lucide-react';
import { UserSettings, ToneType, SupportedLanguage, PrebuiltVoice } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (settings: Partial<UserSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  // Mic diagnostic states
  const [micPermissionState, setMicPermissionState] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micTestFeedback, setMicTestFeedback] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    deviceLabel?: string;
    detectedVolume?: number;
  }>({ status: 'idle', message: '' });
  const [liveVolume, setLiveVolume] = useState<number>(0);

  // Active testing audio context / stream refs
  const testStreamRef = useRef<MediaStream | null>(null);
  const testAnimFrameRef = useRef<number | null>(null);

  // Query native browser microphone permission
  const checkMicPermission = async () => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setMicPermissionState(perm.state as any);
        perm.onchange = () => {
          setMicPermissionState(perm.state as any);
        };
      } catch {
        // Fallback for browsers not supporting microphone query
        setMicPermissionState('unknown');
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkMicPermission();
      setMicTestFeedback({ status: 'idle', message: '' });
      setLiveVolume(0);
    } else {
      // Cleanup any test stream if closed
      cleanupTestStream();
    }
    return () => {
      cleanupTestStream();
    };
  }, [isOpen]);

  const cleanupTestStream = () => {
    if (testAnimFrameRef.current) {
      cancelAnimationFrame(testAnimFrameRef.current);
      testAnimFrameRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    setIsTestingMic(false);
  };

  // Explicit test button triggering navigator.mediaDevices.getUserMedia({ audio: true })
  const handleRequestMicAccess = async () => {
    cleanupTestStream();
    setIsTestingMic(true);
    setMicTestFeedback({
      status: 'idle',
      message: 'Requesting hardware audio stream from browser...',
    });
    setLiveVolume(0);

    try {
      // Explicit WebRTC microphone permission request
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStreamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      const deviceLabel = track?.label || 'Default Audio Input Device';

      setMicPermissionState('granted');

      // Analyze audio for 2.5 seconds to measure live microphone response
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let peakVolume = 0;
      const startTime = Date.now();

      const sampleLoop = () => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 120) * 100));
        setLiveVolume(normalized);
        if (normalized > peakVolume) peakVolume = normalized;

        if (Date.now() - startTime < 2500) {
          testAnimFrameRef.current = requestAnimationFrame(sampleLoop);
        } else {
          // Finish diagnostic
          track.stop();
          stream.getTracks().forEach((t) => t.stop());
          if (audioCtx.state !== 'closed') audioCtx.close();
          testStreamRef.current = null;
          setIsTestingMic(false);
          setLiveVolume(0);

          setMicTestFeedback({
            status: 'success',
            deviceLabel,
            detectedVolume: peakVolume,
            message: `Microphone connected and verified (${deviceLabel}). Vocal input response detected.`,
          });
        }
      };

      testAnimFrameRef.current = requestAnimationFrame(sampleLoop);
    } catch (err: any) {
      cleanupTestStream();
      setMicPermissionState('denied');
      const isBlocked =
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.name === 'SecurityError';

      setMicTestFeedback({
        status: 'error',
        message: isBlocked
          ? 'Microphone access blocked. Please allow microphone permissions in your browser URL bar or app settings.'
          : err.message || 'Microphone hardware unavailable.',
      });
    }
  };

  if (!isOpen) return null;

  const sampleDurations = [5, 7, 10, 15];

  const languages: { code: SupportedLanguage; label: string }[] = [
    { code: 'en-US', label: 'English (United States)' },
    { code: 'en-GB', label: 'English (Great Britain)' },
    { code: 'es-ES', label: 'Spanish (Español)' },
    { code: 'fr-FR', label: 'French (Français)' },
    { code: 'de-DE', label: 'German (Deutsch)' },
    { code: 'it-IT', label: 'Italian (Italiano)' },
    { code: 'ja-JP', label: 'Japanese (日本語)' },
    { code: 'zh-CN', label: 'Chinese (Mandarin)' },
    { code: 'pt-BR', label: 'Portuguese (Brasil)' },
    { code: 'hi-IN', label: 'Hindi (हिन्दी)' },
  ];

  const prebuiltVoices: PrebuiltVoice[] = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];

  const tones: ToneType[] = [
    'professional',
    'calm',
    'deep',
    'energetic',
    'introspective',
    'dramatic',
    'whispering',
    'funny',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="settings-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/60 overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Studio Settings & Preferences
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure microphone permissions, voice cloning sample lengths, and application theme
              </p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex flex-col gap-6 text-slate-200 divide-y divide-slate-800/80">
          {/* SECTION 1: Microphone Hardware & Permissions */}
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Microphone Access & Diagnostics
                </h3>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-1.5">
                {micPermissionState === 'granted' ? (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Access Granted
                  </span>
                ) : micPermissionState === 'denied' ? (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center gap-1">
                    <MicOff className="w-3.5 h-3.5 text-rose-400" /> Access Denied / Blocked
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Needs Permission
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              VoiceCraft AI captures real vocal acoustics to personalize voice cloning models and pitch extraction. Ensure native microphone permission is enabled in your browser.
            </p>

            {/* Test Hardware Box */}
            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-rose-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      Hardware Input Test
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Prompts browser audio dialog and measures live signal level
                    </span>
                  </div>
                </div>

                <button
                  id="request-mic-access-btn"
                  onClick={handleRequestMicAccess}
                  disabled={isTestingMic}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shrink-0 ${
                    isTestingMic
                      ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-wait'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 active:scale-95'
                  }`}
                >
                  {isTestingMic ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testing Input...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>Request Mic Access</span>
                    </>
                  )}
                </button>
              </div>

              {/* Real-time Level Meter when testing */}
              {isTestingMic && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Volume2 className="w-3.5 h-3.5 text-rose-400" /> Live Signal: {liveVolume}%
                    </span>
                    <span className="text-emerald-400 font-semibold animate-pulse">
                      Speak into your microphone now
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500 transition-all duration-75 rounded-full"
                      style={{ width: `${Math.max(4, liveVolume)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Feedback Prompt if success or blocked */}
              {micTestFeedback.status === 'success' && (
                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2.5 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{micTestFeedback.message}</span>
                    {micTestFeedback.deviceLabel && (
                      <span className="block text-[11px] text-emerald-400/80 mt-0.5 font-mono">
                        Hardware: {micTestFeedback.deviceLabel}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {micTestFeedback.status === 'error' && (
                <div className="bg-rose-950/40 border border-rose-500/30 rounded-lg p-3 flex flex-col gap-2 text-xs text-rose-300">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Permission Denied or Blocked</span>
                      <span className="text-[11px] text-rose-300/90">{micTestFeedback.message}</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 rounded p-2.5 text-[11px] text-slate-300 flex flex-col gap-1 border border-slate-800">
                    <span className="font-semibold text-slate-200">How to unblock in your browser:</span>
                    <ol className="list-decimal list-inside text-slate-400 space-y-0.5">
                      <li>Look for the camera/microphone or lock icon in your browser URL bar.</li>
                      <li>Click it and change <strong className="text-slate-200">Microphone</strong> from "Blocked" to <strong className="text-emerald-300">"Allow"</strong>.</li>
                      <li>If testing inside an embedded preview iframe, open this app in a new tab for native hardware access.</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: App Preferences (Audio Sample Duration & Themes) */}
          <div className="pt-6 flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Voice Cloning & Recording Preferences
              </h3>
            </div>

            {/* Audio Sample Duration Setting */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200">
                  Audio Sample Duration
                </label>
                <span className="text-xs font-bold text-violet-400 font-mono">
                  {settings.sampleRecordingDuration || 5} Seconds
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Determines how long the studio records your voice sample when training new custom clones.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {sampleDurations.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => onUpdateSettings({ sampleRecordingDuration: sec })}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                      (settings.sampleRecordingDuration || 5) === sec
                        ? 'bg-violet-600/20 border-violet-500 text-violet-200 ring-1 ring-violet-500/40'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold text-sm">{sec}s</span>
                    <span className="text-[10px] opacity-75">
                      {sec === 5 ? 'Default / Fast' : sec === 7 ? 'Balanced' : sec === 10 ? 'Detailed' : 'Studio Fidelity'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme & Visual Appearance Toggles */}
            <div className="flex flex-col gap-2.5 pt-2">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                Theme & Interface Appearance
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Dark / Light Toggle */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {settings.darkMode ? (
                      <Moon className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Sun className="w-4 h-4 text-amber-400" />
                    )}
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Color Theme
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {settings.darkMode ? 'Dark Slate Atmosphere' : 'Clean Light Canvas'}
                      </span>
                    </div>
                  </div>

                  <button
                    id="theme-mode-toggle"
                    type="button"
                    onClick={() => onUpdateSettings({ darkMode: !settings.darkMode })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      settings.darkMode
                        ? 'bg-indigo-600 text-white'
                        : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {settings.darkMode ? 'Dark' : 'Light'}
                  </button>
                </div>

                {/* High Contrast Toggle */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        High Contrast UI
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Sharper borders & text contrast
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ highContrast: !settings.highContrast })}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      settings.highContrast ? 'bg-violet-600' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        settings.highContrast ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Audio Synthesis Defaults */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-200">Default Prebuilt Voice</label>
                <select
                  value={settings.defaultVoice}
                  onChange={(e) => onUpdateSettings({ defaultVoice: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 font-medium"
                >
                  {prebuiltVoices.map((v) => (
                    <option key={v} value={`voice_${v.toLowerCase()}`}>
                      {v} (Neural)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-200">Default Tone</label>
                <select
                  value={settings.defaultTone}
                  onChange={(e) => onUpdateSettings({ defaultTone: e.target.value as ToneType })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 font-medium capitalize"
                >
                  {tones.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-200">Default Language</label>
                <select
                  value={settings.defaultLanguage}
                  onChange={(e) => onUpdateSettings({ defaultLanguage: e.target.value as SupportedLanguage })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 font-medium"
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-200">Audio Render Quality</label>
                <select
                  value={settings.audioQuality}
                  onChange={(e) => onUpdateSettings({ audioQuality: e.target.value as any })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 font-medium"
                >
                  <option value="standard">Standard (24kHz Mono, Fast)</option>
                  <option value="high">High (44.1kHz Stereo, Balanced)</option>
                  <option value="ultra_lossless">Ultra Lossless (48kHz Studio WAV)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 3: System & Security Switches */}
          <div className="pt-6 flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              System, Encryption & Network
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-violet-400" />
                  <span>AES-256 E2EE Vault</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.e2eeEnabled}
                  onChange={(e) => onUpdateSettings({ e2eeEnabled: e.target.checked })}
                  className="rounded border-slate-700 text-violet-600 focus:ring-violet-500 h-4 w-4 bg-slate-900"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-indigo-400" />
                  <span>Auto Cloud Sync</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoCloudSync}
                  onChange={(e) => onUpdateSettings({ autoCloudSync: e.target.checked })}
                  className="rounded border-slate-700 text-violet-600 focus:ring-violet-500 h-4 w-4 bg-slate-900"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Offline Fallback Synthesis</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.offlineFallbackEnabled}
                  onChange={(e) => onUpdateSettings({ offlineFallbackEnabled: e.target.checked })}
                  className="rounded border-slate-700 text-violet-600 focus:ring-violet-500 h-4 w-4 bg-slate-900"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-pink-400" />
                  <span>Push Notifications</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.pushNotificationsEnabled}
                  onChange={(e) => onUpdateSettings({ pushNotificationsEnabled: e.target.checked })}
                  className="rounded border-slate-700 text-violet-600 focus:ring-violet-500 h-4 w-4 bg-slate-900"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
          >
            Done & Save
          </button>
        </div>
      </div>
    </div>
  );
};
