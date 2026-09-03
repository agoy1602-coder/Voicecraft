import React, { useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  AlertTriangle,
  Square,
  Upload,
  Sparkles,
  Play,
  Trash2,
  CheckCircle2,
  Activity,
  Volume2 as WaveIcon,
  ShieldCheck,
  User,
  Info,
  ExternalLink,
} from 'lucide-react';
import { ClonedVoiceProfile } from '../types';
import { voiceCloneService } from '../services/voiceCloneService';

interface VoiceCloningStudioProps {
  clonedVoices: ClonedVoiceProfile[];
  onAddClonedVoice: (voice: ClonedVoiceProfile) => void;
  onDeleteClonedVoice: (id: string) => void;
  onSelectForTTS: (voice: ClonedVoiceProfile) => void;
  sampleDuration?: number;
  onOpenSettings?: () => void;
}

export const VoiceCloningStudio: React.FC<VoiceCloningStudioProps> = ({
  clonedVoices,
  onAddClonedVoice,
  onDeleteClonedVoice,
  onSelectForTTS,
  sampleDuration = 5,
  onOpenSettings,
}) => {
  const [activeMode, setActiveMode] = useState<'record' | 'upload'>('record');
  const [voiceName, setVoiceName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [micBlocked, setMicBlocked] = useState<boolean>(false);
  const [blockedErrorDetail, setBlockedErrorDetail] = useState<string>('');

  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingTimerRef = useRef<any>(null);

  const handleStartRecording = async () => {
    try {
      setErrorMessage('');
      setMicBlocked(false);
      setBlockedErrorDetail('');
      setRecordedBlob(null);
      setRecordedBase64('');
      setRecordingTime(0);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone audio capture is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await voiceCloneService.startRecording((fftData) => {
        const canvas = fftCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = canvas.width / fftData.length;
        for (let i = 0; i < fftData.length; i++) {
          const barHeight = (fftData[i] / 255) * canvas.height;
          const x = i * barWidth;
          const y = canvas.height - barHeight;
          const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
          grad.addColorStop(0, '#f43f5e');
          grad.addColorStop(1, '#8b5cf6');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
      }, stream);
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= sampleDuration) {
            handleStopRecording();
            return sampleDuration;
          }
          return t + 1;
        });
      }, 1000);
    } catch (err: any) {
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError';
      setMicBlocked(true);
      setBlockedErrorDetail(isDenied ? 'Microphone permission was blocked or denied by browser security policy.' : (err.message || 'Microphone hardware unavailable.'));
      setErrorMessage('Microphone access blocked. Please allow mic permissions to record.');
    }
  };

  const handleStopRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    try {
      const { blob, base64 } = await voiceCloneService.stopRecording(sampleDuration);
      setRecordedBlob(blob);
      setRecordedBase64(base64);
    } catch {
      // Audio stream closed
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecordedBlob(file);
    if (!voiceName) setVoiceName(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
    const reader = new FileReader();
    reader.onloadend = () => setRecordedBase64((reader.result as string).split(',')[1] || '');
    reader.readAsDataURL(file);
  };

  const handleCreateClone = async () => {
    const lifecycleStart = performance.now();
    setAnalysisStatus('CREATE CLONE CLICK DETECTED');
    if (!voiceName.trim()) {
      setErrorMessage('Please provide a name for this custom voice clone.');
      return;
    }
    if (!recordedBlob && !recordedBase64) {
      setErrorMessage('Please record or upload a voice audio sample first.');
      return;
    }
    setIsAnalyzing(true);
    setAnalysisStatus(`CREATE CLONE CLICK → validation passed (${Math.round(performance.now() - lifecycleStart)}ms)`);
    setErrorMessage('');
    try {
      setAnalysisStatus(`analyzeAndClone START (${Math.round(performance.now() - lifecycleStart)}ms)`);
      const cloneProfile = await voiceCloneService.analyzeAndClone(
        voiceName.trim(),
        recordedBlob || undefined,
        recordedBase64 || undefined,
        notes.trim()
      );
      setAnalysisStatus(`analyzeAndClone END (${Math.round(performance.now() - lifecycleStart)}ms)`);
      // Measure the exact callback boundary. If this status remains visible,
      // the parent onAddClonedVoice callback is the blocking operation.
      setAnalysisStatus(`onAddClonedVoice START (${Math.round(performance.now() - lifecycleStart)}ms)`);
      onAddClonedVoice(cloneProfile);
      setAnalysisStatus(`onAddClonedVoice END (${Math.round(performance.now() - lifecycleStart)}ms)`);
      setIsAnalyzing(false);
      setVoiceName('');
      setNotes('');
      setRecordedBlob(null);
      setRecordedBase64('');
      setRecordingTime(0);
      setAnalysisStatus(`CREATE CLONE COMPLETE (${Math.round(performance.now() - lifecycleStart)}ms)`);
    } catch (err: any) {
      setIsAnalyzing(false);
      setErrorMessage(err.message || 'Failed to clone voice.');
      setAnalysisStatus(`CREATE CLONE ERROR (${Math.round(performance.now() - lifecycleStart)}ms)`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Creation Workstation Card */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 lg:p-7 shadow-xl shadow-black/20 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-400" />Instant Voice Cloning Studio</h2>
            <p className="text-xs text-slate-400 mt-0.5">Record a 5-second vocal sample to clone and personalize any voice for real-time speech synthesis</p>
          </div>
          <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800 self-start sm:self-auto">
            <button id="clone-tab-record" onClick={() => setActiveMode('record')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeMode === 'record' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><Mic className="w-3.5 h-3.5" /> Record Sample</button>
            <button id="clone-tab-upload" onClick={() => setActiveMode('upload')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeMode === 'upload' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><Upload className="w-3.5 h-3.5" /> Upload File</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-rose-400" /> 1. Provide Vocal Sample</span>
            {activeMode === 'record' ? (
              <div className="flex flex-col items-center justify-center gap-4 py-4">
                <div className="w-full h-24 bg-slate-900/90 rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-center">
                  <canvas ref={fftCanvasRef} width={360} height={96} className="w-full h-full" />
                  {!isRecording && !recordedBlob && <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs"><WaveIcon className="w-6 h-6 mb-1 opacity-50" /><span>Press record and speak for {sampleDuration} seconds</span></div>}
                  {recordedBlob && !isRecording && <div className="absolute inset-0 flex items-center justify-center gap-2 bg-emerald-950/40 text-emerald-300 text-xs font-semibold"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Vocal sample recorded ({recordingTime}s)</span></div>}
                </div>
                {micBlocked && <div id="mic-blocked-inline-prompt" className="w-full bg-rose-950/70 border border-rose-500/60 rounded-xl p-4 flex flex-col gap-3 text-xs text-rose-200 animate-in fade-in"><div className="flex items-start gap-2.5"><div className="p-1.5 rounded-lg bg-rose-900/60 border border-rose-600/50 text-rose-300 shrink-0 mt-0.5"><MicOff className="w-4 h-4 text-rose-400" /></div><div className="flex-1"><span className="font-bold text-rose-100 block text-xs">Microphone Access Blocked or Denied</span><p className="text-[11px] text-rose-300/90 mt-0.5 leading-relaxed">{blockedErrorDetail || 'Your browser or iframe security policy blocked audio input. Microphone access is required to capture vocal timbre.'}</p></div></div><div className="bg-slate-950/90 rounded-lg p-3 text-[11px] text-slate-300 border border-slate-800 flex flex-col gap-1.5"><span className="font-semibold text-rose-300 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Quick fix instructions:</span><ol className="list-decimal list-inside text-slate-400 space-y-1 pl-1"><li>Look for the <strong className="text-slate-200">microphone / lock</strong> icon in your browser URL address bar.</li><li>Click it and toggle <strong className="text-slate-200">Microphone</strong> to <strong className="text-emerald-400">"Allow"</strong>.</li><li>If previewing inside an iframe container, open the app in a new tab.</li></ol></div><div className="flex items-center gap-2 pt-0.5"><button type="button" id="retry-mic-record-btn" onClick={handleStartRecording} className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all active:scale-95"><Mic className="w-3.5 h-3.5" /><span>Retry Permission Request</span></button>{onOpenSettings && <button type="button" id="open-settings-from-blocked-btn" onClick={onOpenSettings} className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all">Studio Settings</button>}</div></div>}
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-center w-full"><p className="text-[11px] text-slate-400 mb-1">Recommended reading prompt:</p><p className="text-xs text-slate-200 font-medium italic">"The quick brown fox jumps over the lazy dog and explores the northern aurora sky."</p></div>
                <div className="flex items-center gap-3">{!isRecording ? <button id="start-mic-record-btn" onClick={handleStartRecording} className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all active:scale-95"><Mic className="w-4 h-4" /><span>{recordedBlob ? 'Re-record Sample' : `Start ${sampleDuration}s Recording`}</span></button> : <button id="stop-mic-record-btn" onClick={handleStopRecording} className="px-5 py-2.5 rounded-xl bg-slate-800 border border-rose-500 text-rose-400 text-xs font-bold flex items-center gap-2 shadow-lg transition-all animate-pulse"><Square className="w-4 h-4 fill-rose-400" /><span>Stop Recording ({recordingTime}s / {sampleDuration}s)</span></button>}</div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-6 border-2 border-dashed border-slate-800 rounded-xl hover:border-violet-500/50 transition-colors p-4"><Upload className="w-8 h-8 text-violet-400" /><div className="text-center"><p className="text-xs font-semibold text-slate-200">Upload an audio sample (.wav, .mp3, .m4a, .ogg)</p><p className="text-[11px] text-slate-500 mt-0.5">5 to 30 seconds recommended</p></div><label htmlFor="voice-sample-upload" className="cursor-pointer px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700">Choose Audio File<input id="voice-sample-upload" type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" /></label>{recordedBlob && <div className="text-[11px] text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Sample ready: {recordedBlob.size > 0 ? `${(recordedBlob.size / 1024).toFixed(1)} KB` : 'audio'}</div>}</div>
            )}
          </div>
          <div className="flex flex-col gap-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-violet-400" /> 2. Clone Identity</span>
            <div><label htmlFor="clone-voice-name" className="block text-xs font-semibold text-slate-300 mb-1.5">Voice Name</label><input id="clone-voice-name" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="e.g. My Natural Voice" disabled={isAnalyzing} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-violet-500" /></div>
            <div><label htmlFor="clone-voice-notes" className="block text-xs font-semibold text-slate-300 mb-1.5">Notes <span className="text-slate-600 font-normal">(optional)</span></label><textarea id="clone-voice-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe this voice..." disabled={isAnalyzing} rows={3} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-violet-500 resize-none" /></div>
            {errorMessage && <div className="bg-rose-950/50 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{errorMessage}</span></div>}
            <button id="create-clone-btn" onClick={handleCreateClone} disabled={isAnalyzing || !voiceName.trim() || (!recordedBlob && !recordedBase64)} className="w-full mt-auto px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]"><Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />{isAnalyzing ? 'Creating Clone...' : 'Create Clone'}</button>
            {analysisStatus && <p id="clone-analysis-status" className="text-[11px] text-slate-400 text-center">{analysisStatus}</p>}
          </div>
        </div>
      </div>
      {clonedVoices.length > 0 && <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 lg:p-7"><div className="flex items-center justify-between mb-4"><div><h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" />Your Cloned Voices</h3><p className="text-[11px] text-slate-500 mt-0.5">Local Pocket TTS voices • Your audio never leaves this device</p></div><span className="text-[10px] font-semibold text-slate-500 bg-slate-950 px-2 py-1 rounded">{clonedVoices.length} {clonedVoices.length === 1 ? 'voice' : 'voices'}</span></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{clonedVoices.map((voice) => <div key={voice.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-200 truncate">{voice.name}</p><p className="text-[10px] text-slate-500 truncate">{voice.id}</p></div><div className="flex items-center gap-1.5 shrink-0"><button onClick={() => onSelectForTTS(voice)} className="p-2 rounded-lg bg-violet-600/20 text-violet-300 hover:bg-violet-600/30" title="Use for TTS"><Play className="w-3.5 h-3.5" /></button><button onClick={() => onDeleteClonedVoice(voice.id)} className="p-2 rounded-lg bg-rose-600/10 text-rose-300 hover:bg-rose-600/20" title="Delete clone"><Trash2 className="w-3.5 h-3.5" /></button></div></div>)}</div></div>}
      <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 flex items-start gap-3"><Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" /><div className="text-[11px] text-slate-400 leading-relaxed"><p className="text-amber-200 font-semibold mb-1">Privacy & Local Processing</p><p>Your voice sample is processed for the local Pocket TTS cloning pipeline. Voicecraft does not require a paid voice-cloning service for this feature.</p></div></div>
    </div>
  );
};
