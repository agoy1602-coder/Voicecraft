import { ClonedVoiceProfile, ToneType } from '../types';
import type { PocketTTSLoadProgress } from './pocketTtsService';

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

  async startRecording(onFftData?: (data: Uint8Array) => void, existingStream?: MediaStream | null) {
    this.audioChunks = [];
    const stream = existingStream || (await navigator.mediaDevices.getUserMedia({ audio: true }));
    this.mediaStream = stream;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AC();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    source.connect(this.analyserNode);
    if (onFftData) {
      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      const update = () => {
        if (this.analyserNode && this.mediaRecorder?.state === 'recording') {
          this.analyserNode.getByteFrequencyData(dataArray);
          onFftData(dataArray);
          requestAnimationFrame(update);
        }
      };
      requestAnimationFrame(update);
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
  }

  async stopRecording(durationSec = 5) {
    return new Promise<{ blob: Blob; durationSec: number; base64: string }>((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not active'));
        return;
      }
      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.mediaStream?.getTracks().forEach((t) => t.stop());
        if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close();
        const reader = new FileReader();
        reader.onloadend = () => resolve({ blob, durationSec, base64: (reader.result as string).split(',')[1] || '' });
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
    notes = '',
    onProgress?: (progress: PocketTTSLoadProgress) => void,
  ): Promise<ClonedVoiceProfile> {
    if (!sampleBlob) throw new Error('A voice recording is required to create a real clone.');
    if (!sampleBase64) throw new Error('The recorded voice sample could not be saved. Please record it again.');

    onProgress?.({ label: 'Saving voice sample for offline cloning…' });

    const cleanName = name.trim();
    const id = `clone_${Date.now()}`;
    const profile: ClonedVoiceProfile = {
      id,
      name: cleanName,
      type: 'cloned',
      gender: 'neutral',
      tone: 'professional',
      baseVoice: 'Zephyr',
      description: `Private browser-local neural voice clone for ${cleanName}.`,
      avatarColor: this.getRandomAvatarGradient(),
      pitchShift: 0,
      speedFactor: 1,
      warmth: 0.8,
      breathiness: 0.1,
      basePitchHz: 160,
      timbreDescription: 'Pocket TTS zero-shot voice conditioning from the supplied reference recording.',
      promptModifier: `Speak naturally using the cloned voice identity for ${cleanName}.`,
      sampleDuration: 5,
      notes,
      createdAt: Date.now(),
      provider: 'pocket-tts',
      providerSampleBase64: sampleBase64,
      providerSampleMimeType: sampleBlob.type || 'audio/webm',
    };

    onProgress?.({ label: 'Voice sample saved. Pocket TTS will initialize only when you synthesize.' });
    return profile;
  }

  private getRandomAvatarGradient() {
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
