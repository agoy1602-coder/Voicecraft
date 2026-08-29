import React, { useState } from 'react';
import {
  Search,
  Filter,
  Play,
  Download,
  Trash2,
  Heart,
  Calendar,
  Clock,
  ShieldCheck,
  Sparkles,
  Cloud,
  FileAudio,
  ChevronRight,
  Layers,
  ListMusic,
  FolderOpen,
} from 'lucide-react';
import { AudioClip, ProjectPlaylist } from '../types';

interface AudioLibraryProps {
  clips: AudioClip[];
  playlists?: ProjectPlaylist[];
  onSelectClip: (clip: AudioClip) => void;
  onSelectPlaylist?: (playlist: ProjectPlaylist) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteClip: (id: string) => void;
  onDeletePlaylist?: (id: string) => void;
  onOpenExportModal: (clip: AudioClip) => void;
  currentPlayingId?: string;
}

export const AudioLibrary: React.FC<AudioLibraryProps> = ({
  clips,
  playlists = [],
  onSelectClip,
  onSelectPlaylist,
  onToggleFavorite,
  onDeleteClip,
  onDeletePlaylist,
  onOpenExportModal,
  currentPlayingId,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'favorites' | 'cloned' | 'offline' | 'playlists'>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

  const filteredClips = clips.filter((clip) => {
    // Tab filter
    if (filterTab === 'favorites' && !clip.isFavorite) return false;
    if (filterTab === 'cloned' && clip.voiceType !== 'cloned') return false;
    if (filterTab === 'offline' && !clip.isOfflineGenerated) return false;

    // Language filter
    if (selectedLanguage !== 'all' && clip.language !== selectedLanguage) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = clip.text.toLowerCase().includes(q);
      const matchTitle = clip.title.toLowerCase().includes(q);
      const matchVoice = clip.voiceName.toLowerCase().includes(q);
      const matchTone = clip.tone.toLowerCase().includes(q);
      return matchText || matchTitle || matchVoice || matchTone;
    }

    return true;
  });

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 lg:p-7 shadow-xl shadow-black/20 flex flex-col gap-6">
      {/* Library Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <FileAudio className="w-5 h-5 text-violet-400" />
            Audio Library & Vault
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {clips.length} synthesized speech clips secured with AES-256-GCM encryption
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 self-start sm:self-auto overflow-x-auto">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterTab === 'all'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({clips.length})
          </button>
          <button
            onClick={() => setFilterTab('favorites')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              filterTab === 'favorites'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className="w-3 h-3 text-rose-400" /> Favorites
          </button>
          <button
            onClick={() => setFilterTab('cloned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              filterTab === 'cloned'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" /> Cloned Voices
          </button>
          <button
            onClick={() => setFilterTab('offline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterTab === 'offline'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Offline
          </button>
          <button
            id="filter-playlists-tab"
            onClick={() => setFilterTab('playlists')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              filterTab === 'playlists'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3 h-3 text-indigo-300" /> Playlists ({playlists.length})
          </button>
        </div>
      </div>

      {/* Search & Language Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audio titles, transcripts, voices, or tones..."
            className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all"
          />
        </div>

        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="w-full sm:w-auto bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all font-medium"
        >
          <option value="all">All Languages</option>
          <option value="en-US">English (US)</option>
          <option value="es-ES">Spanish (ES)</option>
          <option value="fr-FR">French (FR)</option>
          <option value="de-DE">German (DE)</option>
          <option value="ja-JP">Japanese (JP)</option>
          <option value="zh-CN">Chinese (CN)</option>
        </select>
      </div>

      {/* Audio List Grid or Playlists View */}
      {filterTab === 'playlists' ? (
        playlists.length === 0 ? (
          <div className="bg-slate-950/60 rounded-xl p-12 text-center border border-slate-800/80 flex flex-col items-center justify-center">
            <Layers className="w-10 h-10 text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No Project Playlists Found</p>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Open the TTS Studio and switch to "Project Playlist Queue (Bulk)" to queue and synthesize multi-block audio projects.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 transition-all hover:border-slate-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-100">{playlist.title}</h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {playlist.blocks.length} Blocks
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                        {playlist.defaultVoiceName}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 capitalize">
                        {playlist.defaultTone}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {formatDuration(playlist.totalDurationSeconds)} total duration • Gap: {playlist.gapSeconds}s • Created {formatDate(playlist.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {onDeletePlaylist && (
                      <button
                        onClick={() => onDeletePlaylist(playlist.id)}
                        title="Delete playlist"
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {playlist.mergedClip && (
                      <button
                        onClick={() => onOpenExportModal(playlist.mergedClip!)}
                        title="Export master track"
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {playlist.mergedClip ? (
                      <button
                        onClick={() => onSelectClip(playlist.mergedClip!)}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Play className="w-3.5 h-3.5" /> Play Master Track
                      </button>
                    ) : playlist.blocks[0]?.clip ? (
                      <button
                        onClick={() => onSelectClip(playlist.blocks[0].clip!)}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Play className="w-3.5 h-3.5" /> Play Track 1
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* List of Blocks in this Playlist */}
                <div className="bg-slate-900/60 rounded-lg p-2.5 flex flex-col gap-1.5 border border-slate-800/60">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                    Playlist Segments ({playlist.blocks.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {playlist.blocks.map((block, bIdx) => (
                      <div
                        key={block.id}
                        className="bg-slate-950/70 rounded p-2 border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-indigo-400">#{bIdx + 1}</span>
                            <span className="truncate">{block.title}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">{block.text}</p>
                        </div>
                        {block.clip && (
                          <button
                            onClick={() => onSelectClip(block.clip!)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white shrink-0"
                            title="Play this segment"
                          >
                            <Play className="w-3 h-3 text-emerald-400" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredClips.length === 0 ? (
        <div className="bg-slate-950/60 rounded-xl p-12 text-center border border-slate-800/80 flex flex-col items-center justify-center">
          <FileAudio className="w-10 h-10 text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-300">No Audio Clips Found</p>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            Generate speech in the TTS Studio to start building your encrypted personal audio collection.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClips.map((clip) => {
            const isPlayingThis = currentPlayingId === clip.id;
            return (
              <div
                key={clip.id}
                className={`bg-slate-950/80 border rounded-xl p-4 flex flex-col justify-between gap-3 transition-all hover:border-slate-700 ${
                  isPlayingThis ? 'border-violet-500/70 shadow-md shadow-violet-500/10' : 'border-slate-800'
                }`}
              >
                {/* Top Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-100 truncate">{clip.title}</h4>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                        {clip.voiceName}
                      </span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 capitalize">
                        {clip.tone}
                      </span>
                      {clip.playlistTitle && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                          <Layers className="w-2.5 h-2.5" />
                          {clip.isMergedProject ? 'Full Master' : `Part #${(clip.playlistIndex ?? 0) + 1}`}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {clip.text}
                    </p>
                  </div>

                  {/* Favorite Button */}
                  <button
                    onClick={() => onToggleFavorite(clip.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Heart className={`w-4 h-4 ${clip.isFavorite ? 'fill-rose-400 text-rose-400' : ''}`} />
                  </button>
                </div>

                {/* Metadata & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatDuration(clip.durationSeconds)}
                    </span>
                    <span>•</span>
                    <span>{formatDate(clip.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpenExportModal(clip)}
                      title="Export in WAV, MP3, AAC, or Subtitles"
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteClip(clip.id)}
                      title="Delete audio clip"
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onSelectClip(clip)}
                      className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-[11px] flex items-center gap-1 shadow-sm transition-all"
                    >
                      <Play className="w-3 h-3 ml-0.5" /> Play
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
