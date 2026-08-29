import React, { useState } from 'react';
import {
  X,
  Cloud,
  RefreshCw,
  Smartphone,
  Tablet,
  Laptop,
  CheckCircle2,
  QrCode,
  Plus,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { LinkedDevice } from '../types';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: LinkedDevice[];
  isSyncing: boolean;
  lastSyncedAt: number;
  onTriggerSync: () => Promise<void>;
  onPairDevice: (name: string, type: 'ios' | 'android' | 'desktop' | 'tablet') => Promise<void>;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  devices,
  isSyncing,
  lastSyncedAt,
  onTriggerSync,
  onPairDevice,
}) => {
  const [newDeviceName, setNewDeviceName] = useState<string>('');
  const [newDeviceType, setNewDeviceType] = useState<'ios' | 'android' | 'desktop' | 'tablet'>('ios');
  const [showPairForm, setShowPairForm] = useState<boolean>(false);
  const [pairingPin] = useState<string>('849-210');

  if (!isOpen) return null;

  const handlePair = async () => {
    if (!newDeviceName.trim()) return;
    await onPairDevice(newDeviceName.trim(), newDeviceType);
    setNewDeviceName('');
    setShowPairForm(false);
  };

  const renderDeviceIcon = (type: string) => {
    switch (type) {
      case 'ios':
        return <Smartphone className="w-4 h-4 text-sky-400" />;
      case 'android':
        return <Smartphone className="w-4 h-4 text-emerald-400" />;
      case 'tablet':
        return <Tablet className="w-4 h-4 text-purple-400" />;
      default:
        return <Laptop className="w-4 h-4 text-indigo-400" />;
    }
  };

  const formatLastSeen = (timestamp: number) => {
    const diffMin = Math.round((Date.now() - timestamp) / 60000);
    if (diffMin <= 1) return 'Active right now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.round(diffMin / 60)}h ago`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative flex flex-col gap-5 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Real-Time Cloud Synchronization
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  E2EE Encrypted
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Cross-device sync across iOS, Android, macOS & Web
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sync Status Banner */}
        <div className="flex items-center justify-between bg-slate-950/80 p-4 rounded-xl border border-slate-800">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Auto-Sync Active
            </span>
            <span className="text-[11px] text-slate-400">
              Last synced:{' '}
              {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never'}
            </span>
          </div>

          <button
            id="manual-sync-now-btn"
            disabled={isSyncing}
            onClick={onTriggerSync}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              isSyncing
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 active:scale-95'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

        {/* Linked Devices List */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Linked Devices ({devices.length})
            </label>
            <button
              onClick={() => setShowPairForm(!showPairForm)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Pair Device
            </button>
          </div>

          {/* Pair form */}
          {showPairForm && (
            <div className="bg-slate-950 p-3.5 rounded-xl border border-indigo-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Pair New Mobile or Tablet</span>
                <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded">
                  PIN: {pairingPin}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. iPhone 16 / Pixel 9"
                  className="sm:col-span-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <select
                  value={newDeviceType}
                  onChange={(e) => setNewDeviceType(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="ios">iOS Device</option>
                  <option value="android">Android Device</option>
                  <option value="tablet">Tablet</option>
                  <option value="desktop">Desktop / Mac</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowPairForm(false)}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePair}
                  className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
                >
                  Confirm Pair
                </button>
              </div>
            </div>
          )}

          {/* Device Cards */}
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {devices.map((dev) => (
              <div
                key={dev.deviceId}
                className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                    {renderDeviceIcon(dev.deviceType)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{dev.deviceName}</h4>
                    <p className="text-[10px] text-slate-400">
                      {dev.appVersion} • {formatLastSeen(dev.lastSeen)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Synced</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
