import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  Clock,
  CheckCircle2,
  AlertCircle,
  Scissors,
  Layers,
  FolderSync,
  Sliders,
  Volume2,
  Globe,
  RotateCcw,
  Sparkle,
  BookOpen,
  Mic,
  Zap,
} from 'lucide-react';
import {
  AudioClip,
  ClonedVoiceProfile,
  ProjectPlaylist,
  ProjectTextBlock,
  SupportedLanguage,
  ToneType,
  VoiceProfile,
} from '../types';
import {
  PREBUILT_VOICE_PROFILES,
  SUPPORTED_LANGUAGES_MAP,
  TONE_PRESETS,
  ttsService,
} from '../services/ttsService';
import { mergeAudioClips } from '../services/audioExport';

interface ProjectPlaylistQueueProps {
  clonedVoices: ClonedVoiceProfile[];
  isOnline: boolean;
  onBulkComplete: (playlist: ProjectPlaylist, masterClip: AudioClip, clips: AudioClip[]) => void;
  onPreviewClip?: (clip: AudioClip) => void;
}

const SAMPLE_PROJECT_TEMPLATES = [
  {
    title: 'The Whispering Library (Audiobook)',
    description: 'Cinematic 3-scene narrative with multi-character voice casting',
    defaultTone: 'dramatic' as ToneType,
    gapSeconds: 0.8,
    blocks: [
      {
        title: 'Scene 1: Midnight Archives',
        text: 'The heavy oak doors of the ancient archive groaned shut behind Elena. Dust motes drifted through the shafts of pale moonlight, illuminating towering shelves that stretched into the vaulted cathedral ceiling.',
        voiceId: 'voice_fenrir',
        tone: 'introspective' as ToneType,
      },
      {
        title: 'Scene 2: The Clockwork Tome',
        text: 'She ran her fingers along the vellum spines until her palm met cold, polished brass. A tiny mechanism clicked beneath her fingertips, and the clockwork book began to unfurl its golden leaves.',
        voiceId: 'voice_kore',
        tone: 'calm' as ToneType,
      },
      {
        title: 'Scene 3: Revelation',
        text: 'A gentle voice whispered from the parchment: Knowledge is not a stone to be hoarded, but a torch to be carried forward through the dark. Elena smiled, knowing her quest had only just begun.',
        voiceId: 'voice_zephyr',
        tone: 'professional' as ToneType,
      },
    ],
  },
  {
    title: 'Edge Intelligence Podcast',
    description: 'Modern episodic format with energetic host dialogue and sign-off',
    defaultTone: 'professional' as ToneType,
    gapSeconds: 0.6,
    blocks: [
      {
        title: 'Episode Hook & Intro',
        text: 'Welcome back to Edge Intelligence. Today we explore how offline neural voice synthesis and end-to-end encrypted acoustics are reshaping human-computer interaction in remote environments.',
        voiceId: 'voice_zephyr',
        tone: 'professional' as ToneType,
      },
      {
        title: 'Deep Dive Analysis',
        text: 'Imagine generating studio-quality speech with zero latency, zero cloud leaks, and complete local privacy. The cryptographic pipelines running directly on your device are nothing short of revolutionary.',
        voiceId: 'voice_puck',
        tone: 'energetic' as ToneType,
      },
      {
        title: 'Closing Thoughts & Outro',
        text: 'Thanks for tuning in to this week transmission. Remember to stay curious, keep your data sovereign, and we will catch you on the next episode.',
        voiceId: 'voice_charon',
        tone: 'introspective' as ToneType,
      },
    ],
  },
  {
    title: 'Product Keynote Presentation',
    description: 'Structured 3-slide executive briefing for stakeholders',
    defaultTone: 'professional' as ToneType,
    gapSeconds: 1.0,
    blocks: [
      {
        title: 'Slide 1: Architectural Vision',
        text: 'Our architectural objective is clear: deliver instantaneous, photorealistic text-to-speech without dependence on centralized server infrastructure.',
        voiceId: 'voice_zephyr',
        tone: 'professional' as ToneType,
      },
      {
        title: 'Slide 2: Enterprise Security',
        text: 'Every voice model and synthesized waveform is guarded by client-side AES-256-GCM encryption with hardware-accelerated key derivation.',
        voiceId: 'voice_fenrir',
        tone: 'deep' as ToneType,
      },
      {
        title: 'Slide 3: Next Horizons',
        text: 'With multi-language support across fourteen global dialects and rapid voice cloning, VoiceCraft establishes a new paradigm for vocal computing.',
        voiceId: 'voice_kore',
        tone: 'calm' as ToneType,
      },
    ],
  },
];

export const ProjectPlaylistQueue: React.FC<ProjectPlaylistQueueProps> = ({
  clonedVoices,
  isOnline,
  onBulkComplete,
  onPreviewClip,
}) => {
  const allVoices: VoiceProfile[] = [...PREBUILT_VOICE_PROFILES, ...clonedVoices];

  // Project Configuration
  const [projectTitle, setProjectTitle] = useState<string>('Audiobook Chapter 1: The Whispering Library');
  const [defaultVoiceId, setDefaultVoiceId] = useState<string>(PREBUILT_VOICE_PROFILES[0].id);
  const [defaultTone, setDefaultTone] = useState<ToneType>('calm');
  const [defaultLanguage, setDefaultLanguage] = useState<SupportedLanguage>('en-US');
  const [gapSeconds, setGapSeconds] = useState<number>(0.8);
  const [autoMergeMaster, setAutoMergeMaster] = useState<boolean>(true);

  // Queued Text Blocks
  const [blocks, setBlocks] = useState<ProjectTextBlock[]>([
    {
      id: 'block_1',
      title: 'Scene 1: Midnight Archives',
      text: 'The heavy oak doors of the ancient archive groaned shut behind Elena. Dust motes drifted through the shafts of pale moonlight, illuminating towering shelves that stretched into the vaulted cathedral ceiling.',
      voiceId: 'voice_fenrir',
      tone: 'introspective',
      status: 'pending',
    },
    {
      id: 'block_2',
      title: 'Scene 2: The Clockwork Tome',
      text: 'She ran her fingers along the vellum spines until her palm met cold, polished brass. A tiny mechanism clicked beneath her fingertips, and the clockwork book began to unfurl its golden leaves.',
      voiceId: 'voice_kore',
      tone: 'calm',
      status: 'pending',
    },
    {
      id: 'block_3',
      title: 'Scene 3: Revelation',
      text: 'A gentle voice whispered from the parchment: Knowledge is not a stone to be hoarded, but a torch to be carried forward through the dark. Elena smiled, knowing her quest had only just begun.',
      voiceId: 'voice_zephyr',
      tone: 'professional',
      status: 'pending',
    },
  ]);

  // Synthesis Execution State
  const [isBulkSynthesizing, setIsBulkSynthesizing] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);

  // Text Splitter Tool Modal/Drawer
  const [showSplitter, setShowSplitter] = useState<boolean>(false);
  const [rawTextToSplit, setRawTextToSplit] = useState<string>('');
  const [splitDelimiter, setSplitDelimiter] = useState<'paragraph' | 'double_newline' | 'sentences'>('paragraph');

  // Preview Audio State
  const [playingBlockId, setPlayingBlockId] = useState<string | null>(null);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);

  const defaultVoice = allVoices.find((v) => v.id === defaultVoiceId) || PREBUILT_VOICE_PROFILES[0];

  // Block Manipulation Handlers
  const handleAddBlock = () => {
    const newIdx = blocks.length + 1;
    const newBlock: ProjectTextBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `Block ${newIdx}: Narrative Section`,
      text: '',
      voiceId: defaultVoiceId,
      tone: defaultTone,
      status: 'pending',
    };
    setBlocks([...blocks, newBlock]);
  };

  const handleUpdateBlock = (id: string, updates: Partial<ProjectTextBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates, status: b.status === 'completed' ? 'pending' : b.status } : b))
    );
  };

  const handleDeleteBlock = (id: string) => {
    if (blocks.length <= 1) {
      alert('A playlist must contain at least one text block.');
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleDuplicateBlock = (idx: number) => {
    const target = blocks[idx];
    const cloned: ProjectTextBlock = {
      ...target,
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `${target.title} (Copy)`,
      status: 'pending',
      clipId: undefined,
      clip: undefined,
    };
    const updated = [...blocks];
    updated.splice(idx + 1, 0, cloned);
    setBlocks(updated);
  };

  const handleMoveBlock = (idx: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === blocks.length - 1)) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...blocks];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setBlocks(updated);
  };

  const handleApplyTemplate = (tpl: (typeof SAMPLE_PROJECT_TEMPLATES)[0]) => {
    setProjectTitle(tpl.title);
    setDefaultTone(tpl.defaultTone);
    setGapSeconds(tpl.gapSeconds);
    const newBlocks: ProjectTextBlock[] = tpl.blocks.map((b, i) => ({
      id: `block_${Date.now()}_${i}`,
      title: b.title,
      text: b.text,
      voiceId: b.voiceId,
      tone: b.tone,
      status: 'pending',
    }));
    setBlocks(newBlocks);
  };

  // Text Splitter Execution
  const handleExecuteSplit = () => {
    if (!rawTextToSplit.trim()) return;

    let parts: string[] = [];
    if (splitDelimiter === 'paragraph' || splitDelimiter === 'double_newline') {
      parts = rawTextToSplit
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    } else {
      // Split by sentence clusters (~2-3 sentences each)
      const sentences = rawTextToSplit.match(/[^.!?]+[.!?]+(\s|$)/g) || [rawTextToSplit];
      const chunks: string[] = [];
      let cur = '';
      for (const s of sentences) {
        cur += s;
        if (cur.length > 200) {
          chunks.push(cur.trim());
          cur = '';
        }
      }
      if (cur.trim()) chunks.push(cur.trim());
      parts = chunks;
    }

    if (parts.length === 0) return;

    const generatedBlocks: ProjectTextBlock[] = parts.map((part, i) => ({
      id: `block_${Date.now()}_${i}`,
      title: `Block ${blocks.length + i + 1}: Section`,
      text: part,
      voiceId: defaultVoiceId,
      tone: defaultTone,
      status: 'pending',
    }));

    setBlocks((prev) => [...prev, ...generatedBlocks]);
    setRawTextToSplit('');
    setShowSplitter(false);
  };

  // Individual Block Playback
  const handleTogglePreviewAudio = (block: ProjectTextBlock) => {
    if (!block.clip?.audioBlobUrl) return;

    if (playingBlockId === block.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPlayingBlockId(null);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const audio = new Audio(block.clip.audioBlobUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setPlayingBlockId(null);
      audio.play().then(() => setPlayingBlockId(block.id)).catch(() => setPlayingBlockId(null));
    }
  };

  // Synthesize a Single Block directly
  const handleSynthesizeSingleBlock = async (idx: number) => {
    const block = blocks[idx];
    if (!block.text.trim() || isBulkSynthesizing) return;

    const voice = allVoices.find((v) => v.id === (block.voiceId || defaultVoiceId)) || defaultVoice;
    const tone = block.tone || defaultTone;

    handleUpdateBlock(block.id, { status: 'synthesizing' });

    try {
      const result = await ttsService.generateSpeech({
        text: block.text,
        voice,
        tone,
        language: defaultLanguage,
        speed: block.speed || 1.0,
        pitch: block.pitch || 1.0,
        warmth: block.warmth ?? 0.8,
        breathiness: block.breathiness ?? 0.1,
        forceOffline: !isOnline,
      });

      const updatedClip: AudioClip = {
        ...result.clip,
        playlistTitle: projectTitle,
        playlistIndex: idx,
      };

      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? { ...b, status: 'completed', clip: updatedClip, clipId: updatedClip.id } : b))
      );
    } catch (err: any) {
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? { ...b, status: 'error', error: err?.message || 'Synthesis failed' } : b))
      );
    }
  };

  // Bulk Synthesis of the Entire Project Playlist
  const handleBulkSynthesizeAll = async () => {
    if (isBulkSynthesizing) return;
    if (blocks.some((b) => !b.text.trim())) {
      alert('Please ensure all text blocks have text content before synthesizing.');
      return;
    }

    setIsBulkSynthesizing(true);
    setIsCancelled(false);
    setCompletedCount(0);

    const playlistId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const synthesizedClips: AudioClip[] = [];
    const updatedBlocks = [...blocks];

    for (let i = 0; i < updatedBlocks.length; i++) {
      if (isCancelled) break;

      setCurrentIndex(i);
      const curBlock = updatedBlocks[i];

      // Update block to synthesizing
      updatedBlocks[i] = { ...curBlock, status: 'synthesizing' };
      setBlocks([...updatedBlocks]);

      try {
        const voice = allVoices.find((v) => v.id === (curBlock.voiceId || defaultVoiceId)) || defaultVoice;
        const tone = curBlock.tone || defaultTone;

        const result = await ttsService.generateSpeech({
          text: curBlock.text,
          voice,
          tone,
          language: defaultLanguage,
          speed: curBlock.speed || 1.0,
          pitch: curBlock.pitch || 1.0,
          warmth: curBlock.warmth ?? 0.8,
          breathiness: curBlock.breathiness ?? 0.1,
          forceOffline: !isOnline,
        });

        const clip: AudioClip = {
          ...result.clip,
          title: `${curBlock.title}`,
          playlistId,
          playlistTitle: projectTitle,
          playlistIndex: i,
        };

        synthesizedClips.push(clip);

        updatedBlocks[i] = {
          ...curBlock,
          status: 'completed',
          clip,
          clipId: clip.id,
        };
        setBlocks([...updatedBlocks]);
        setCompletedCount((prev) => prev + 1);
      } catch (err: any) {
        updatedBlocks[i] = {
          ...curBlock,
          status: 'error',
          error: err?.message || 'Synthesis failed',
        };
        setBlocks([...updatedBlocks]);
      }
    }

    setIsBulkSynthesizing(false);
    setCurrentIndex(-1);

    if (synthesizedClips.length === 0) {
      alert('No blocks were successfully synthesized.');
      return;
    }

    // Merge into single master audio track
    let masterClip: AudioClip | null = null;
    let totalSecs = synthesizedClips.reduce((acc, c) => acc + c.durationSeconds, 0);

    if (autoMergeMaster && synthesizedClips.length > 1) {
      try {
        const merged = await mergeAudioClips(synthesizedClips, gapSeconds, 24000);
        totalSecs = merged.durationSeconds;

        masterClip = {
          id: `merged_${playlistId}`,
          title: `${projectTitle} (Full Master Track)`,
          text: updatedBlocks.map((b) => `## ${b.title}\n${b.text}`).join('\n\n'),
          voiceId: defaultVoiceId,
          voiceName: `${defaultVoice.name} & Ensemble`,
          voiceType: defaultVoice.type,
          tone: defaultTone,
          language: defaultLanguage,
          durationSeconds: merged.durationSeconds,
          audioBlobUrl: merged.mergedBlobUrl,
          audioBase64: merged.mergedBase64,
          format: 'wav',
          sampleRate: 24000,
          sentences: merged.sentences,
          isOfflineGenerated: synthesizedClips.some((c) => c.isOfflineGenerated),
          createdAt: Date.now(),
          isFavorite: false,
          synced: false,
          tags: ['project_playlist', 'master_track'],
          playlistId,
          playlistTitle: projectTitle,
          isMergedProject: true,
        };
      } catch {
        // Fallback: master clip is first clip
        masterClip = synthesizedClips[0];
      }
    } else {
      masterClip = synthesizedClips[0];
    }

    const playlist: ProjectPlaylist = {
      id: playlistId,
      title: projectTitle,
      description: `${updatedBlocks.length} text blocks synthesized as a project playlist`,
      defaultVoiceId,
      defaultVoiceName: defaultVoice.name,
      defaultTone,
      defaultLanguage,
      gapSeconds,
      blocks: updatedBlocks,
      totalDurationSeconds: totalSecs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mergedClipId: masterClip.id,
      mergedClip: masterClip,
    };

    onBulkComplete(playlist, masterClip, synthesizedClips);
  };

  // Metrics
  const totalWords = blocks.reduce((acc, b) => acc + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0);
  const estimatedSeconds = Math.round(totalWords * 0.45 + Math.max(0, blocks.length - 1) * gapSeconds);
  const completedBlocksCount = blocks.filter((b) => b.status === 'completed').length;
  const progressPercent = Math.round((completedCount / (blocks.length || 1)) * 100);

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 lg:p-7 shadow-xl shadow-black/20 flex flex-col gap-6">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Project Playlist Queue</h2>
            <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full text-xs font-semibold border border-indigo-500/30">
              {blocks.length} Blocks Queued
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Queue multiple narrative segments, customize speakers per block, and bulk-synthesize into a seamless master project
          </p>
        </div>

        {/* Action Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSplitter(!showSplitter)}
            className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700/60 transition-all"
            title="Auto-split pasted text into blocks by paragraphs"
          >
            <Scissors className="w-3.5 h-3.5 text-violet-400" />
            <span>Auto-Split Text</span>
          </button>

          <button
            onClick={handleAddBlock}
            className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Block</span>
          </button>
        </div>
      </div>

      {/* Project Templates Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full text-xs">
        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 shrink-0">
          <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Templates:
        </span>
        {SAMPLE_PROJECT_TEMPLATES.map((tpl, i) => (
          <button
            key={i}
            onClick={() => handleApplyTemplate(tpl)}
            className="px-2.5 py-1 rounded-lg bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] font-medium transition-all whitespace-nowrap border border-slate-800 shrink-0"
          >
            {tpl.title}
          </button>
        ))}
      </div>

      {/* Auto-Split Tool Drawer */}
      {showSplitter && (
        <div className="bg-slate-950/90 border border-violet-500/40 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-violet-300">
              <Scissors className="w-4 h-4" />
              <span>Smart Script / Text Splitter</span>
            </div>
            <button
              onClick={() => setShowSplitter(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Paste an article, script, or chapter below. VoiceCraft will partition it into clean, distinct queued blocks.
          </p>
          <textarea
            value={rawTextToSplit}
            onChange={(e) => setRawTextToSplit(e.target.value)}
            rows={4}
            placeholder="Paste your long script or story here..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Split by:</span>
              <select
                value={splitDelimiter}
                onChange={(e: any) => setSplitDelimiter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
              >
                <option value="paragraph">Paragraphs (Double Linebreak)</option>
                <option value="sentences">Sentence Groups (2-3 sentences)</option>
              </select>
            </div>
            <button
              onClick={handleExecuteSplit}
              disabled={!rawTextToSplit.trim()}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all ${
                rawTextToSplit.trim() ? 'bg-violet-600 hover:bg-violet-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Partition into Blocks
            </button>
          </div>
        </div>
      )}

      {/* Global Project Settings Panel */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Project Title */}
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Project Title</label>
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="e.g. Audiobook Chapter 1"
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>

        {/* Default Voice */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Default Speaker</label>
          <select
            value={defaultVoiceId}
            onChange={(e) => setDefaultVoiceId(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
          >
            {allVoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.gender}, {v.type})
              </option>
            ))}
          </select>
        </div>

        {/* Default Tone */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Default Tone</label>
          <select
            value={defaultTone}
            onChange={(e) => setDefaultTone(e.target.value as ToneType)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
          >
            {TONE_PRESETS.map((t) => (
              <option key={t.tone} value={t.tone}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Pause Gap Slider */}
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Inter-Block Breathing Gap</span>
            <span className="text-indigo-300 font-mono font-bold">{gapSeconds.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0.2}
            max={2.5}
            step={0.1}
            value={gapSeconds}
            onChange={(e) => setGapSeconds(parseFloat(e.target.value))}
            className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Language */}
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Language</label>
          <select
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value as SupportedLanguage)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
          >
            {SUPPORTED_LANGUAGES_MAP.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Queued Blocks List */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>Queued Blocks ({blocks.length})</span>
          <span>
            {totalWords} words • ~{estimatedSeconds}s audio duration
          </span>
        </div>

        <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
          {blocks.map((block, idx) => {
            const isSynthesizingThis = isBulkSynthesizing && currentIndex === idx;
            const blockVoice = allVoices.find((v) => v.id === (block.voiceId || defaultVoiceId)) || defaultVoice;

            return (
              <div
                key={block.id}
                className={`bg-slate-950/80 border rounded-xl p-4 transition-all flex flex-col gap-3 ${
                  isSynthesizingThis
                    ? 'border-indigo-500 shadow-md shadow-indigo-500/20 bg-indigo-950/20'
                    : block.status === 'completed'
                    ? 'border-emerald-500/40 bg-emerald-950/10'
                    : 'border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Block Header */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={block.title}
                      onChange={(e) => handleUpdateBlock(block.id, { title: e.target.value })}
                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 text-xs font-bold text-slate-200 focus:outline-none px-1 py-0.5 flex-1"
                    />
                  </div>

                  {/* Speaker & Tone Customization */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Voice Override */}
                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-[11px]">
                      <Mic className="w-3 h-3 text-violet-400" />
                      <select
                        value={block.voiceId || defaultVoiceId}
                        onChange={(e) => handleUpdateBlock(block.id, { voiceId: e.target.value })}
                        className="bg-transparent text-slate-200 focus:outline-none"
                      >
                        {allVoices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tone Override */}
                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-[11px]">
                      <Sparkle className="w-3 h-3 text-pink-400" />
                      <select
                        value={block.tone || defaultTone}
                        onChange={(e) => handleUpdateBlock(block.id, { tone: e.target.value as ToneType })}
                        className="bg-transparent text-slate-200 focus:outline-none capitalize"
                      >
                        {TONE_PRESETS.map((t) => (
                          <option key={t.tone} value={t.tone}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status Pill */}
                    {isSynthesizingThis ? (
                      <div className="flex items-center gap-1.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full text-[11px] font-semibold animate-pulse">
                        <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        <span>Synthesizing...</span>
                      </div>
                    ) : block.status === 'completed' ? (
                      <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Ready ({block.clip?.durationSeconds.toFixed(1)}s)</span>
                      </div>
                    ) : block.status === 'error' ? (
                      <div className="flex items-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                        <AlertCircle className="w-3 h-3" />
                        <span>Error</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-slate-800/80 text-slate-400 px-2 py-0.5 rounded-full text-[11px]">
                        <Clock className="w-3 h-3" />
                        <span>Pending</span>
                      </div>
                    )}

                    {/* Reorder / Action Buttons */}
                    <div className="flex items-center gap-1 ml-1 text-slate-400">
                      <button
                        onClick={() => handleMoveBlock(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 hover:text-slate-200 disabled:opacity-30"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveBlock(idx, 'down')}
                        disabled={idx === blocks.length - 1}
                        className="p-1 hover:text-slate-200 disabled:opacity-30"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicateBlock(idx)}
                        className="p-1 hover:text-slate-200"
                        title="Duplicate Block"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteBlock(block.id)}
                        className="p-1 hover:text-rose-400"
                        title="Delete Block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Block Text Area */}
                <textarea
                  value={block.text}
                  onChange={(e) => handleUpdateBlock(block.id, { text: e.target.value })}
                  placeholder="Enter text narrative for this block segment..."
                  rows={3}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all resize-y leading-relaxed font-sans"
                />

                {/* Block Footer with Individual Audition / Synthesize */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <div className="flex items-center gap-2">
                    <span>{block.text.length} chars</span>
                    <span>•</span>
                    <span>{block.text.trim() ? block.text.trim().split(/\s+/).length : 0} words</span>
                    <span>•</span>
                    <span>Speaker: {blockVoice.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {block.clip?.audioBlobUrl && (
                      <button
                        onClick={() => handleTogglePreviewAudio(block)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-all"
                      >
                        {playingBlockId === block.id ? (
                          <>
                            <Pause className="w-3 h-3 text-emerald-400" /> Stop Preview
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 text-emerald-400" /> Preview Clip
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => handleSynthesizeSingleBlock(idx)}
                      disabled={isBulkSynthesizing || !block.text.trim()}
                      className="px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-all"
                    >
                      {block.status === 'completed' ? 'Re-synthesize' : 'Synthesize Block'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bulk Synthesis Progress Bar */}
      {isBulkSynthesizing && (
        <div className="bg-indigo-950/40 border border-indigo-500/50 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>
                Synthesizing Block {currentIndex + 1} of {blocks.length}: "{blocks[currentIndex]?.title}"
              </span>
            </div>
            <span>{progressPercent}% Complete</span>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>{completedCount} blocks rendered</span>
            <button
              onClick={() => setIsCancelled(true)}
              className="text-rose-400 hover:text-rose-300 font-bold"
            >
              Cancel Remaining
            </button>
          </div>
        </div>
      )}

      {/* Execution Footer Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80 pt-4">
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoMergeMaster}
              onChange={(e) => setAutoMergeMaster(e.target.checked)}
              className="accent-indigo-500 rounded cursor-pointer"
            />
            <span className="text-slate-300 font-medium">
              Concatenate all blocks into single seamless Master Track
            </span>
          </label>
        </div>

        <button
          id="bulk-synthesize-btn"
          disabled={isBulkSynthesizing || blocks.length === 0}
          onClick={handleBulkSynthesizeAll}
          className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all ${
            isBulkSynthesizing || blocks.length === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/30 active:scale-98'
          }`}
        >
          {isBulkSynthesizing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Bulk Synthesizing ({completedCount}/{blocks.length})...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Synthesize Project Playlist ({blocks.length} Blocks)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
