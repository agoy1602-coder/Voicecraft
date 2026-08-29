import { AppNotification } from '../types';
import { storageService } from './storage';

class NotificationService {
  private listeners: ((notif: AppNotification) => void)[] = [];

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  notify(
    title: string,
    message: string,
    type: 'render_complete' | 'sync_success' | 'security_alert' | 'device_paired' | 'offline_status' = 'render_complete'
  ): AppNotification {
    const notif: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title,
      message,
      type,
      timestamp: Date.now(),
      read: false,
    };

    // Save to storage
    const current = storageService.loadNotifications();
    storageService.saveNotifications([notif, ...current]);

    // Play subtle audio chime
    this.playChime(type);

    // Show native desktop notification if allowed
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: '/favicon.ico',
        });
      } catch {
        // Ignore native notification error in iframe
      }
    }

    // Trigger in-app subscribers
    this.listeners.forEach((listener) => listener(notif));

    return notif;
  }

  subscribe(callback: (notif: AppNotification) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private playChime(type: string) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'render_complete') {
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      } else if (type === 'sync_success') {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5
      } else if (type === 'security_alert') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.2);
      } else {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      }

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Audio context might be restricted before interaction
    }
  }
}

export const notificationService = new NotificationService();
