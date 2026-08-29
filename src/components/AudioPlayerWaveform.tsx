import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Repeat,
  Volume2,
  VolumeX,
  Download,
  Heart,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  Cloud,
  FileText,
  SkipBack,
  SkipForward,
  Layers,
} from 'lucide-react';
import { AudioClip, AudioSentence, ProjectPlaylist } from '../types';

interface AudioPlayerWaveformProps {
  clip: AudioClip | null;
  playlist?: ProjectPlaylist | null;
  onToggleFavorite: (id: string) => void;
  onOpenExportModal: (clip: AudioClip) => void;
  onSelectClip?: (clip: AudioClip) => void;
}

export const AudioPlayerWaveform: React.FC<AudioPlayerWaveformProps> = ({
  clip,
  playlist,
  onToggleFavorite,
  onOpenExportModal,
  onSelectClip,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize or change audio source
  useEffect(() => {
    if (!clip || !clip.audioBlobUrl) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(clip.audioBlobUrl);
    audio.playbackRate = playbackRate;
    audio.volume = isMuted ? 0 : volume;
    audio.loop = isLooping;
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      setDuration(audio.duration || clip.durationSeconds || 1);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      if (!isLooping) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    // Auto play on new clip
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, [clip?.id, clip?.audioBlobUrl]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const seekRelative = (delta: number) => {
    if (!audioRef.current) return;
    const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    setIsMuted(v === 0);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      setIsMuted(false);
      audioRef.current.volume = volume || 1.0;
    } else {
      setIsMuted(true);
      audioRef.current.volume = 0;
    }
  };

  const toggleLoop = () => {
    const next = !isLooping;
    setIsLooping(next);
    if (audioRef.current) audioRef.current.loop = next;
  };

  const handleCopyText = () => {
    if (!clip) return;
    navigator.clipboard.writeText(clip.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Waveform canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;

    const renderWaveform = () => {
      frame++;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const numBars = 72;
      const barWidth = width / numBars - 2;
      const progress = duration > 0 ? currentTime / duration : 0;
      const activeBarIdx = Math.floor(progress * numBars);

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + 2);
        // Harmonic waveform envelope
        const normalizedI = i / numBars;
        const baseHeight = Math.sin(normalizedI * Math.PI) * (height * 0.7);
        const dynamicFactor = isPlaying
          ? 0.3 * Math.sin(frame * 0.15 + i * 0.4) + 0.7
          : 0.8;

        const barHeight = Math.max(6, baseHeight * dynamicFactor);
        const y = (height - barHeight) / 2;

        const isPast = i <= activeBarIdx;

        if (isPast) {
          // Violet gradient for played audio
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          grad.addColorStop(0, '#a855f7');
          grad.addColorStop(1, '#6366f1');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = 'rgba(71, 85, 105, 0.4)';
        }

        // Draw rounded bar
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(renderWaveform);
    };

    renderWaveform();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, currentTime, duration]);

  // Handle click on canvas waveform to seek
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !audioRef.current || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!clip) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[340px]">
        <div className="w-16 h-16 rounded-2xl bg-violet-950/40 border border-violet-500/20 flex items-center justify-center mb-4 text-violet-400">
          <Sparkles className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-200 mb-1">Acoustic Playback Ready</h3>
        <p className="text-xs text-slate-400 max-w-sm">
          Type or select a script above, choose your desired tone and voice profile, and generate your high-fidelity synthesized speech.
        </p>
      </div>
    );
  }

  // Identify active sentence for karaoke highlighting
  const activeSentenceIndex = clip.sentences?.findIndex(
    (s) => currentTime >= s.startSec && currentTime <= s.endSec
  );

  // Playlist track awareness
  const playlistBlocks = playlist?.blocks.filter((b) => b.clip) || [];
  const currentBlockIndex = playlistBlocks.findIndex((b) => b.clip?.id === clip?.id);
  const isMasterTrack = clip?.isMergedProject || (playlist?.mergedClip && clip?.id === playlist.mergedClip.id);

  const handlePrevTrack = () => {
    if (!playlist || !onSelectClip) return;
    if (isMasterTrack) {
      if (playlistBlocks.length > 0 && playlistBlocks[0].clip) {
        onSelectClip(playlistBlocks[0].clip);
      }
    } else if (currentBlockIndex > 0) {
      onSelectClip(playlistBlocks[currentBlockIndex - 1].clip!);
    } else if (playlist.mergedClip) {
      onSelectClip(playlist.mergedClip);
    }
  };

  const handleNextTrack = () => {
    if (!playlist || !onSelectClip) return;
    if (isMasterTrack) {
      if (playlistBlocks.length > 0 && playlistBlocks[0].clip) {
        onSelectClip(playlistBlocks[0].clip);
      }
    } else if (currentBlockIndex >= 0 && currentBlockIndex < playlistBlocks.length - 1) {
      onSelectClip(playlistBlocks[currentBlockIndex + 1].clip!);
    } else if (playlist.mergedClip) {
      onSelectClip(playlist.mergedClip);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 lg:p-6 shadow-xl shadow-black/20 flex flex-col gap-5">
      {/* Project Playlist Context Header if applicable */}
      {(playlist || clip.playlistTitle) && (
        <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <div className="font-bold text-indigo-200">
                {clip.playlistTitle || playlist?.title || 'Project Playlist'}
              </div>
              <div className="text-[11px] text-indigo-300/80">
                {isMasterTrack
                  ? `Full Concatenated Master Project (${playlist?.blocks.length || 'Multi'} blocks)`
                  : `Segment #${(clip.playlistIndex ?? currentBlockIndex) + 1} of ${
                      playlist?.blocks.length || 'playlist'
                    }`}
              </div>
            </div>
          </div>

          {playlist && onSelectClip && (
            <select
              value={clip.id}
              onChange={(e) => {
                const targetId = e.target.value;
                if (playlist.mergedClip && targetId === playlist.mergedClip.id) {
                  onSelectClip(playlist.mergedClip);
                } else {
                  const blk = playlistBlocks.find((b) => b.clip?.id === targetId);
                  if (blk?.clip) onSelectClip(blk.clip);
                }
              }}
              className="bg-slate-900 border border-indigo-500/50 rounded px-2 py-1 text-[11px] text-indigo-200 focus:outline-none"
            >
              {playlist.mergedClip && (
                <option value={playlist.mergedClip.id}>Full Master Track</option>
              )}
              {playlistBlocks.map((b, i) => (
                <option key={b.id} value={b.clip?.id}>
                  Part #{i + 1}: {b.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-bold text-slate-100">{clip.title}</h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
              {clip.voiceName}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 capitalize">
              Tone: {clip.tone}
            </span>
            {clip.isOfflineGenerated && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Offline Mode
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{clip.language}</span>
            <span>•</span>
            <span>{clip.sampleRate / 1000} kHz {clip.format.toUpperCase()}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> E2EE Vault Encrypted
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onToggleFavorite(clip.id)}
            title={clip.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`p-2 rounded-xl border transition-all ${
              clip.isFavorite
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-400'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-rose-400'
            }`}
          >
            <Heart className={`w-4 h-4 ${clip.isFavorite ? 'fill-rose-400' : ''}`} />
          </button>
          <button
            onClick={handleCopyText}
            title="Copy spoken transcript"
            className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-slate-200 transition-all"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            id="export-audio-btn"
            onClick={() => onOpenExportModal(clip)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-violet-500/20 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audio</span>
          </button>
        </div>
      </div>

      {/* Interactive Waveform Canvas */}
      <div className="relative bg-slate-950/80 rounded-xl p-3 border border-slate-800">
        <canvas
          ref={canvasRef}
          width={640}
          height={80}
          onClick={handleCanvasClick}
          className="w-full h-20 cursor-pointer rounded-lg hover:opacity-95 transition-opacity"
        />
        <div className="flex items-center justify-between mt-2 text-xs font-mono text-slate-400 px-1">
          <span>{formatTime(currentTime)}</span>
          <span className="text-[11px] text-slate-500">Click waveform to seek</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Playback Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        {/* Main Transport Controls */}
        <div className="flex items-center gap-2">
          {playlist && onSelectClip && (
            <button
              onClick={handlePrevTrack}
              title="Previous Track in Project"
              className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
            >
              <SkipBack className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => seekRelative(-5)}
            title="Rewind 5 seconds"
            className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            id="audio-play-pause-btn"
            onClick={togglePlay}
            className="w-12 h-12 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white flex items-center justify-center shadow-lg shadow-violet-600/30 transition-all scale-100 active:scale-95"
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </button>

          <button
            onClick={() => seekRelative(5)}
            title="Forward 5 seconds"
            className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {playlist && onSelectClip && (
            <button
              onClick={handleNextTrack}
              title="Next Track in Project"
              className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={toggleLoop}
            title={isLooping ? 'Looping enabled' : 'Looping disabled'}
            className={`p-2 rounded-xl border transition-all ${
              isLooping
                ? 'bg-violet-950/60 border-violet-500/50 text-violet-300'
                : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
            <button
              key={rate}
              onClick={() => handleSpeedChange(rate)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                playbackRate === rate
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Volume Controls */}
        <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
          <button onClick={toggleMute} className="text-slate-400 hover:text-slate-200">
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-20 accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* Karaoke Highlight Transcript Box */}
      <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 max-h-36 overflow-y-auto">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <FileText className="w-3.5 h-3.5 text-violet-400" /> Spoken Transcript
        </div>
        <p className="text-sm leading-relaxed text-slate-300">
          {clip.sentences && clip.sentences.length > 0 ? (
            clip.sentences.map((s, idx) => {
              const isActive = idx === activeSentenceIndex;
              return (
                <span
                  key={idx}
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = s.startSec;
                      setCurrentTime(s.startSec);
                    }
                  }}
                  className={`cursor-pointer transition-all duration-150 rounded px-1 py-0.5 ${
                    isActive
                      ? 'bg-violet-500/30 text-white font-medium shadow-sm ring-1 ring-violet-400/40'
                      : 'hover:text-slate-100 hover:bg-slate-800/40'
                  }`}
                >
                  {s.text}{' '}
                </span>
              );
            })
          ) : (
            <span>{clip.text}</span>
          )}
        </p>
      </div>
    </div>
  );
};
