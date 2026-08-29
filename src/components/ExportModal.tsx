import React, { useState } from 'react';
import {
  X,
  Download,
  FileAudio,
  FileText,
  Sliders,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { AudioClip, ExportFormat } from '../types';
import {
  base64PcmToAudioBuffer,
  downloadFile,
  exportAudioBlob,
  generateSubtitles,
} from '../services/audioExport';
import { ttsService } from '../services/ttsService';

interface ExportModalProps {
  clip: AudioClip | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ clip, isOpen, onClose }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('wav');
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [bitrate, setBitrate] = useState<number>(192);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportComplete, setExportComplete] = useState<boolean>(false);

  if (!isOpen || !clip) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    setExportComplete(false);

    try {
      const filenameBase = clip.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 30);

      if (selectedFormat === 'srt' || selectedFormat === 'vtt') {
        const subtitleContent = generateSubtitles(clip.sentences || [], selectedFormat);
        downloadFile(subtitleContent, `${filenameBase}.${selectedFormat}`, 'text/plain');
      } else {
        // Audio export
        const ctx = ttsService.getAudioContext();
        let audioBuffer: AudioBuffer;

        if (clip.audioBase64) {
          const res = await base64PcmToAudioBuffer(clip.audioBase64, ctx, clip.sampleRate || 24000);
          audioBuffer = res.audioBuffer;
        } else {
          // Re-fetch or decode existing blob url
          const response = await fetch(clip.audioBlobUrl);
          const arrayBuffer = await response.arrayBuffer();
          audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        }

        const exportedBlob = await exportAudioBlob(
          audioBuffer,
          selectedFormat,
          sampleRate,
          bitrate
        );

        const ext = selectedFormat === 'aac' ? 'aac' : selectedFormat === 'ogg' ? 'ogg' : selectedFormat === 'mp3' ? 'mp3' : 'wav';
        downloadFile(exportedBlob, `${filenameBase}_${sampleRate}hz.${ext}`, exportedBlob.type);
      }

      setExportComplete(true);
      setTimeout(() => {
        setIsExporting(false);
      }, 800);
    } catch {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative flex flex-col gap-5 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Export Audio & Transcripts</h3>
              <p className="text-[11px] text-slate-400">Choose your preferred container & encoding</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clip Preview Box */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-xs">
          <div className="font-semibold text-slate-200 truncate mb-1">{clip.title}</div>
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span>Voice: {clip.voiceName}</span>
            <span>•</span>
            <span>{clip.durationSeconds.toFixed(1)}s</span>
            <span>•</span>
            <span>{clip.language}</span>
          </div>
        </div>

        {/* Format Selector Grid */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            1. Output Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'wav', label: 'WAV (PCM)', desc: 'Lossless Studio' },
              { id: 'mp3', label: 'MP3 / WebM', desc: 'Standard 192k' },
              { id: 'aac', label: 'AAC Audio', desc: 'High Efficiency' },
              { id: 'ogg', label: 'OGG Vorbis', desc: 'Open Source' },
              { id: 'srt', label: 'SRT Subtitles', desc: 'Timestamped' },
              { id: 'vtt', label: 'WebVTT', desc: 'Web Captions' },
            ].map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id as ExportFormat)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  selectedFormat === fmt.id
                    ? 'bg-violet-600/30 border-violet-500 text-white shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-slate-100">{fmt.label}</div>
                <div className="text-[10px] text-slate-400">{fmt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Audio Encoding Settings (if audio format selected) */}
        {!['srt', 'vtt'].includes(selectedFormat) && (
          <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            {/* Sample Rate */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Sample Rate</label>
              <select
                value={sampleRate}
                onChange={(e) => setSampleRate(parseInt(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value={24000}>24,000 Hz (Gemini Native)</option>
                <option value={44100}>44,100 Hz (CD Audio)</option>
                <option value={48000}>48,000 Hz (Studio Pro)</option>
              </select>
            </div>

            {/* Bitrate */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Bitrate</label>
              <select
                value={bitrate}
                onChange={(e) => setBitrate(parseInt(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value={128}>128 kbps (Standard)</option>
                <option value={192}>192 kbps (High Quality)</option>
                <option value={320}>320 kbps (Maximum Fidelity)</option>
              </select>
            </div>
          </div>
        )}

        {/* Download Button */}
        <button
          id="confirm-export-download-btn"
          disabled={isExporting}
          onClick={handleDownload}
          className={`w-full py-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 shadow-lg transition-all ${
            isExporting
              ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-600/30'
          }`}
        >
          {isExporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Encoding Audio...</span>
            </>
          ) : exportComplete ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Export Downloaded!</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download {selectedFormat.toUpperCase()}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
