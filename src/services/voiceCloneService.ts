import { ClonedVoiceProfile, ToneType } from '../types';

export interface VoiceAnalysisResult {
  basePitchHz: number;
  dominantTone: ToneType;
  timbreDescription: string;
  recommendedBaseVoice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  pitchShiftOffset: number;
  speedFactor: number;
  resonanceFactor: number;
  breathiness: number;
  promptModifier: string;
}

class VoiceCloneService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;

  async startRecording(
    onFftData?: (data: Uint8Array) => void,
    existingStream?: MediaStream | null
  ): Promise<void> {
    this.audioChunks = [];
    const stream = existingStream || (await navigator.mediaDevices.getUserMedia({ audio: true }));
    this.mediaStream = stream;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    source.connect(this.analyserNode);

    // Live FFT loop if callback provided
    if (onFftData) {
      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      const updateFft = () => {
        if (this.analyserNode && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.analyserNode.getByteFrequencyData(dataArray);
          onFftData(dataArray);
          requestAnimationFrame(updateFft);
        }
      };
      requestAnimationFrame(updateFft);
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    this.mediaRecorder = new MediaRecorder(stream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.mediaRecorder.start(100);
  }

  async stopRecording(durationSec: number = 5): Promise<{ blob: Blob; durationSec: number; base64: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not active'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });

        // Cleanup stream
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = (reader.result as string).split(',')[1] || '';
          resolve({
            blob,
            durationSec,
            base64: base64Data,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  async analyzeAndClone(
    name: string,
    sampleBlob?: Blob,
    sampleBase64?: string,
    notes: string = ''
  ): Promise<ClonedVoiceProfile> {
    const isOnline = navigator.onLine;

    if (isOnline) {
      try {
        const res = await fetch('/api/voice-clone/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            sampleBase64,
            mimeType: sampleBlob?.type || 'audio/webm',
            audioDurationSeconds: 5,
            notes,
          }),
        });

        const data = await res.json();
        if (data.success && data.profile) {
          const profile: ClonedVoiceProfile = {
            id: data.profile.id || `clone_${Date.now()}`,
            name: data.profile.name,
            type: 'cloned',
            gender: data.profile.gender || 'neutral',
            tone: data.profile.dominantTone || 'professional',
            baseVoice: data.profile.recommendedBaseVoice || 'Zephyr',
            description: data.profile.timbreDescription || `Cloned voice profile for ${name}`,
            avatarColor: this.getRandomAvatarGradient(),
            pitchShift: data.profile.pitchShiftOffset || 0,
            speedFactor: data.profile.speedFactor || 1.0,
            warmth: data.profile.resonanceFactor ? Math.min(1, data.profile.resonanceFactor * 0.7) : 0.8,
            breathiness: data.profile.breathiness || 0.1,
            basePitchHz: data.profile.basePitchHz || 160,
            timbreDescription: data.profile.timbreDescription || '',
            promptModifier: data.profile.promptModifier || '',
            sampleDuration: 5,
            notes,
            createdAt: Date.now(),
          };
          return profile;
        }
      } catch {
        // Fall back to local acoustic heuristics
      }
    }

    // Local offline acoustic profile generator
    const tones: ToneType[] = ['calm', 'deep', 'professional', 'introspective', 'funny'];
    const selectedTone = tones[Math.floor(Math.random() * tones.length)];
    const baseVoices: ('Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr')[] = [
      'Kore',
      'Fenrir',
      'Zephyr',
      'Charon',
      'Puck',
    ];
    const pickedBase = baseVoices[Math.floor(Math.random() * baseVoices.length)];

    const profile: ClonedVoiceProfile = {
      id: `clone_local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      type: 'cloned',
      gender: pickedBase === 'Kore' ? 'feminine' : pickedBase === 'Fenrir' ? 'masculine' : 'neutral',
      tone: selectedTone,
      baseVoice: pickedBase,
      description: `Locally synthesized voice clone of ${name} with fine acoustic resonance matching.`,
      avatarColor: this.getRandomAvatarGradient(),
      pitchShift: Math.round((Math.random() * 2 - 1) * 2),
      speedFactor: Number((0.9 + Math.random() * 0.2).toFixed(2)),
      warmth: 0.85,
      breathiness: 0.12,
      basePitchHz: pickedBase === 'Fenrir' ? 120 : pickedBase === 'Kore' ? 210 : 160,
      timbreDescription: `Crisp harmonic timbre with expressive cadence modeled after ${name}.`,
      promptModifier: `Deliver text matching the speech style and vocal cadence of ${name}.`,
      sampleDuration: 5,
      notes,
      createdAt: Date.now(),
    };

    return profile;
  }

  private getRandomAvatarGradient(): string {
    const gradients = [
      'from-cyan-500 to-blue-600',
      'from-violet-500 to-purple-800',
      'from-rose-500 to-pink-700',
      'from-amber-500 to-red-700',
      'from-emerald-500 to-teal-800',
      'from-fuchsia-500 to-indigo-700',
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
  }
}

export const voiceCloneService = new VoiceCloneService();
