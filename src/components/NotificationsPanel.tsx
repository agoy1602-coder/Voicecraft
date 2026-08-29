import React from 'react';
import {
  X,
  Bell,
  CheckCheck,
  ShieldCheck,
  Cloud,
  Zap,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onRequestPushPermission: () => Promise<void>;
  pushPermissionStatus: NotificationPermission | 'unsupported';
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onRequestPushPermission,
  pushPermissionStatus,
}) => {
  if (!isOpen) return null;

  const renderIcon = (type: string) => {
    switch (type) {
      case 'render_complete':
        return <Zap className="w-4 h-4 text-violet-400" />;
      case 'sync_success':
        return <Cloud className="w-4 h-4 text-indigo-400" />;
      case 'security_alert':
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      case 'device_paired':
        return <Smartphone className="w-4 h-4 text-sky-400" />;
      case 'offline_status':
        return <WifiOff className="w-4 h-4 text-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatTime = (ts: number) => {
    const diff = Math.round((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-xs p-4 sm:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl relative flex flex-col gap-4 text-slate-100 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-slate-100">Push Notifications & Alerts</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onMarkAllRead}
              title="Mark all as read"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Browser Push Permission Banner */}
        {pushPermissionStatus !== 'granted' && pushPermissionStatus !== 'unsupported' && (
          <div className="bg-violet-950/40 border border-violet-500/30 rounded-xl p-3 flex flex-col gap-2">
            <div className="text-[11px] text-violet-200 font-medium">
              Enable browser push notifications for real-time background render and sync alerts.
            </div>
            <button
              id="enable-browser-push-btn"
              onClick={onRequestPushPermission}
              className="py-1.5 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all self-start"
            >
              Enable Push Alerts
            </button>
          </div>
        )}

        {/* List of Notifications */}
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                  n.read
                    ? 'bg-slate-950/50 border-slate-800/60 opacity-75'
                    : 'bg-slate-950 border-slate-800 shadow-sm'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  {renderIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="text-xs font-bold text-slate-200 truncate">{n.title}</h4>
                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                      {formatTime(n.timestamp)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{n.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
