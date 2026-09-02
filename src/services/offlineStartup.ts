import { storageService } from './storage';
import { syncService } from './syncService';
import type { LinkedDevice } from '../types';

export async function loadLinkedDevicesForStartup(): Promise<LinkedDevice[]> {
  if (!navigator.onLine) {
    return [
      {
        deviceId: storageService.getDeviceId(),
        userId: 'user_default',
        deviceName: 'Web Studio Browser',
        deviceType: 'desktop',
        lastSeen: Date.now(),
        ipMasked: '127.0.0.1',
        appVersion: 'v2.4.0',
      },
    ];
  }

  return syncService.getLinkedDevices();
}
