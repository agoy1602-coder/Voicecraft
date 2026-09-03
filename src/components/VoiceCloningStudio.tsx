import React, { useRef, useState } from 'react';
import { Mic, MicOff, AlertTriangle, Square, Upload, Sparkles, Play, Trash2, CheckCircle2, Activity, Volume2 as WaveIcon, ShieldCheck, User, Info } from 'lucide-react';
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

export const VoiceCloningStudio: React.FC<VoiceCloningStudioProps> = (props) => {
  const {
    clonedVoices,
    onAddClonedVoice,
    onDeleteClonedVoice,
    onSelectForTTS,
    sampleDuration = 5,
    onOpenSettings,
  } = props;
  const [activeMode, setActiveMode] = useState<'record' | 'upload'>('record');
  const [voiceName, setVoiceName] = useState('');
  const [notes, setNotes] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedBase64, setRecordedBase64] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [micBlocked, setMicBlocked] = useState(false);
  const [blockedErrorDetail, setBlockedErrorDetail] = useState('');
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingTimerRef = useRef<any>(null);

  const handleStartRecording = async () => {
    try {
      setErrorMessage(''); setMicBlocked(false); setBlockedErrorDetail(''); setRecordedBlob(null); setRecordedBase64(''); setRecordingTime(0);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone audio capture is not supported in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await voiceCloneService.startRecording((fftData) => {
        const canvas = fftCanvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = canvas.width / fftData.length;
        for (let i = 0; i < fftData.length; i++) {
          const barHeight = (fftData[i] / 255) * canvas.height;
          const x = i * barWidth; const y = canvas.height - barHeight;
          const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
          grad.addColorStop(0, '#f43f5e'); grad.addColorStop(1, '#8b5cf6');
          ctx.fillStyle = grad; ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
      }, stream);
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => {
        if (t >= sampleDuration) { void handleStopRecording(); return sampleDuration; }
        return t + 1;
      }), 1000);
    } catch (err: any) {
      const denied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name);
      setMicBlocked(true); setBlockedErrorDetail(denied ? 'Microphone permission was blocked or denied by browser security policy.' : (err?.message || 'Microphone hardware unavailable.'));
      setErrorMessage('Microphone access blocked. Please allow mic permissions to record.');
    }
  };

  const handleStopRecording = async () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setIsRecording(false);
    try {
      const { blob, base64 } = await voiceCloneService.stopRecording(sampleDuration);
      setRecordedBlob(blob); setRecordedBase64(base64);
    } catch { setErrorMessage('Recording could not be finalized. Please record again.'); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setRecordedBlob(file); setErrorMessage('');
    if (!voiceName) setVoiceName(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
    const reader = new FileReader();
    reader.onloadend = () => setRecordedBase64((reader.result as string).split(',')[1] || '');
    reader.onerror = () => setErrorMessage('The audio sample could not be read. Please choose the file again.');
    reader.readAsDataURL(file);
  };

  const handleCreateClone = async () => {
    if (isAnalyzing) return;
    if (!voiceName.trim()) { setErrorMessage('Please provide a name for this custom voice clone.'); return; }
    if (!recordedBlob || !recordedBase64) { setErrorMessage('Please wait until the audio sample is fully ready before creating the clone.'); return; }

    setIsAnalyzing(true); setAnalysisStatus('Creating local Pocket TTS voice profile...'); setErrorMessage('');
    try {
      // analyzeAndClone is intentionally local and deterministic. A timeout makes
      // the UI fail-safe if a future implementation accidentally introduces a
      // never-settling async dependency into this lifecycle.
      const cloneProfile = await Promise.race([
        voiceCloneService.analyzeAndClone(voiceName.trim(), recordedBlob, recordedBase64, notes.trim()),
        new Promise<ClonedVoiceProfile>((_, reject) => setTimeout(() => reject(new Error('Voice clone creation timed out. No cloud service is required for local clone creation.')), 15000))
      ]);

      // UI completion is deliberately independent from persistence/model loading.
      // Never keep this button waiting for IndexedDB or Pocket TTS initialization.
      onAddClonedVoice(cloneProfile);
      setVoiceName(''); setNotes(''); setRecordedBlob(null); setRecordedBase64(''); setRecordingTime(0); setAnalysisStatus('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to clone voice.');
      setAnalysisStatus('');
    } finally {
      // Single authoritative exit for every path: success, error, or timeout.
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 lg:p-7 shadow-xl shadow-black/20 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div><h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-400" />Instant Voice Cloning Studio</h2><p className="text-xs text-slate-400 mt-0.5">Record a 5-second vocal sample to clone and personalize any voice for real-time speech synthesis</p></div>
          <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800 self-start sm:self-auto"><button id="clone-tab-record" onClick={() => setActiveMode('record')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeMode === 'record' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><Mic className="w-3.5 h-3.5" /> Record Sample</button><button id="clone-tab-upload" onClick={() => setActiveMode('upload')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeMode === 'upload' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><Upload className="w-3.5 h-3.5" /> Upload File</button></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-rose-400" /> 1. Provide Vocal Sample</span>{activeMode === 'record' ? <div className="flex flex-col items-center justify-center gap-4 py-4"><div className="w-full h-24 bg-slate-900/90 rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-center"><canvas ref={fftCanvasRef} width={360} height={96} className="w-full h-full" />{!isRecording && !recordedBlob && <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs"><WaveIcon className="w-6 h-6 mb-1 opacity-50" /><span>Press record and speak for {sampleDuration} seconds</span></div>}{recordedBlob && !isRecording && <div className="absolute inset-0 flex items-center justify-center gap-2 bg-emerald-950/40 text-emerald-300 text-xs font-semibold"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Vocal sample recorded ({recordingTime}s)</span></div>}</div>{micBlocked && <div id="mic-blocked-inline-prompt" className="w-full bg-rose-950/70 border border-rose-500/60 rounded-xl p-4 text-xs text-rose-200"><div className="flex items-start gap-2.5"><MicOff className="w-4 h-4 text-rose-400 shrink-0" /><div><span className="font-bold text-rose-100 block">Microphone Access Blocked or Denied</span><p className="text-[11px] text-rose-300/90 mt-0.5">{blockedErrorDetail}</p></div></div><div className="flex items-center gap-2 pt-3"><button type="button" id="retry-mic-record-btn" onClick={handleStartRecording} className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" />Retry Permission Request</button>{onOpenSettings && <button type="button" id="open-settings-from-blocked-btn" onClick={onOpenSettings} className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-semibold">Studio Settings</button>}</div></div>}<div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-center w-full"><p className="text-[11px] text-slate-400 mb-1">Recommended reading prompt:</p><p className="text-xs text-slate-200 font-medium italic">"The quick brown fox jumps over the lazy dog and explores the northern aurora sky."</p></div><div className="flex items-center gap-3">{!isRecording ? <button id="start-mic-record-btn" onClick={handleStartRecording} className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-2"><Mic className="w-4 h-4" />{recordedBlob ? 'Re-record Sample' : `Start ${sampleDuration}s Recording`}</button> : <button id="stop-mic-record-btn" onClick={handleStopRecording} className="px-5 py-2.5 rounded-xl bg-slate-800 border border-rose-500 text-rose-400 text-xs font-bold flex items-center gap-2"><Square className="w-4 h-4 fill-rose-400" />Stop Recording ({recordingTime}s / {sampleDuration}s)</button>}</div></div> : <div className="flex flex-col items-center justify-center gap-3 py-6 border-2 border-dashed border-slate-800 rounded-xl p-4"><Upload className="w-8 h-8 text-violet-400" /><p className="text-xs font-semibold text-slate-200">Upload an audio sample (.wav, .mp3, .m4a, .ogg)</p><label htmlFor="voice-sample-upload" className="cursor-pointer px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold">Choose Audio File<input id="voice-sample-upload" type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" /></label>{recordedBlob && <div className="text-[11px] text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Sample ready: {(recordedBlob.size / 1024).toFixed(1)} KB</div>}</div>}</div>
          <div className="flex flex-col gap-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-violet-400" /> 2. Clone Identity</span><div><label htmlFor="clone-voice-name" className="block text-xs font-semibold text-slate-300 mb-1.5">Voice Name</label><input id="clone-voice-name" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="e.g. My Natural Voice" disabled={isAnalyzing} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs" /></div><div><label htmlFor="clone-voice-notes" className="block text-xs font-semibold text-slate-300 mb-1.5">Notes <span className="text-slate-600 font-normal">(optional)</span></label><textarea id="clone-voice-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe this voice..." disabled={isAnalyzing} rows={3} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs resize-none" /></div>{errorMessage && <div className="bg-rose-950/50 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{errorMessage}</span></div>}<button id="create-clone-btn" type="button" onClick={handleCreateClone} disabled={isAnalyzing || !voiceName.trim() || !recordedBlob || !recordedBase64} className="w-full mt-auto px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2"><Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />{isAnalyzing ? 'Creating Clone...' : 'Create Clone'}</button>{analysisStatus && <p id="clone-analysis-status" className="text-[11px] text-slate-400 text-center">{analysisStatus}</p>}</div>
        </div>
      </div>
      {clonedVoices.length > 0 && <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 lg:p-7"><div className="flex items-center justify-between mb-4"><div><h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" />Your Cloned Voices</h3><p className="text-[11px] text-slate-500 mt-0.5">Local Pocket TTS voices • Your audio never leaves this device</p></div><span className="text-[10px] font-semibold text-slate-500 bg-slate-950 px-2 py-1 rounded">{clonedVoices.length} {clonedVoices.length === 1 ? 'voice' : 'voices'}</span></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{clonedVoices.map((voice) => <div key={voice.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-200 truncate">{voice.name}</p><p className="text-[10px] text-slate-500 truncate">{voice.id}</p></div><div className="flex items-center gap-1.5 shrink-0"><button onClick={() => onSelectForTTS(voice)} className="p-2 rounded-lg bg-violet-600/20 text-violet-300 hover:bg-violet-600/30" title="Use for TTS"><Play className="w-3.5 h-3.5" /></button><button onClick={() => onDeleteClonedVoice(voice.id)} className="p-2 rounded-lg bg-rose-600/10 text-rose-300 hover:bg-rose-600/20" title="Delete clone"><Trash2 className="w-3.5 h-3.5" /></button></div></div>)}</div></div>}
      <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 flex items-start gap-3"><Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" /><div className="text-[11px] text-slate-400 leading-relaxed"><p className="text-amber-200 font-semibold mb-1">Privacy & Local Processing</p><p>Your voice sample is processed for the local Pocket TTS cloning pipeline. Voicecraft does not require a paid voice-cloning service for this feature.</p></div></div>
    </div>
  );
};