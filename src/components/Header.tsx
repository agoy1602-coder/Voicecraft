import React from 'react';
import {
  Mic,
  ShieldCheck,
  Cloud,
  Smartphone,
  Bell,
  MessageSquareHeart,
  Moon,
  Sun,
  Wifi,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import { UserSettings, AppNotification } from '../types';

interface HeaderProps {
  settings: UserSettings;
  onUpdateSettings: (settings: Partial<UserSettings>) => void;
  isOnline: boolean;
  onToggleOnlineMode: () => void;
  onOpenE2EEModal: () => void;
  onOpenSyncModal: () => void;
  onOpenFeedbackModal: () => void;
  onOpenNotifications: () => void;
  unreadNotifsCount: number;
  activeTab: 'studio' | 'clone' | 'library';
  onChangeTab: (tab: 'studio' | 'clone' | 'library') => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  isOnline,
  onToggleOnlineMode,
  onOpenE2EEModal,
  onOpenSyncModal,
  onOpenFeedbackModal,
  onOpenNotifications,
  unreadNotifsCount,
  activeTab,
  onChangeTab,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand & Logo */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
              <Mic className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-100 tracking-tight">VoiceCraft</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-indigo-500/20 text-violet-300 border border-violet-500/30">
                  AI Studio
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium hidden sm:block">
                Multilingual TTS & Voice Cloning
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center p-1 bg-slate-900/90 rounded-xl border border-slate-800">
            <button
              id="nav-tab-studio"
              onClick={() => onChangeTab('studio')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'studio'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              TTS Studio
            </button>
            <button
              id="nav-tab-clone"
              onClick={() => onChangeTab('clone')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'clone'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Voice Cloning
            </button>
            <button
              id="nav-tab-library"
              onClick={() => onChangeTab('library')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'library'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Audio Library
            </button>
          </nav>
        </div>

        {/* Action Badges & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Online / Offline Mode Toggle */}
          <button
            id="toggle-offline-mode-btn"
            onClick={onToggleOnlineMode}
            title={isOnline ? 'Online Mode (Click to force Offline mode)' : 'Offline Mode (Click to enable Online)'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              isOnline
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40'
                : 'bg-amber-950/40 border-amber-500/30 text-amber-300 hover:bg-amber-900/40'
            }`}
          >
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Online (Low Latency)</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Offline Mode</span>
              </>
            )}
          </button>

          {/* E2EE Security Vault */}
          <button
            id="e2ee-vault-btn"
            onClick={onOpenE2EEModal}
            title="End-to-End Encryption: AES-256-GCM Active"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-slate-100 hover:border-violet-500/50 text-xs font-medium transition-all"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden xl:inline">E2EE Protected</span>
          </button>

          {/* Cloud Sync */}
          <button
            id="cloud-sync-btn"
            onClick={onOpenSyncModal}
            title="Cloud Sync & Linked Devices"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-slate-100 hover:border-indigo-500/50 text-xs font-medium transition-all"
          >
            <Cloud className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden xl:inline">Cloud Sync</span>
          </button>

          {/* Push Notifications Hub */}
          <button
            id="notifications-btn"
            onClick={onOpenNotifications}
            title="Notifications & Alerts"
            className="relative p-2 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-slate-100 transition-all"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}
              </span>
            )}
          </button>

          {/* User Feedback Loop */}
          <button
            id="feedback-loop-btn"
            onClick={onOpenFeedbackModal}
            title="Send Quality & Model Feedback"
            className="p-2 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-slate-100 hover:border-pink-500/40 transition-all"
          >
            <MessageSquareHeart className="w-4 h-4 text-pink-400" />
          </button>

          {/* Dark / Light Theme Toggle */}
          <button
            id="theme-toggle-btn"
            onClick={() => onUpdateSettings({ darkMode: !settings.darkMode })}
            title={settings.darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-2 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-slate-100 transition-all"
          >
            {settings.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="flex md:hidden mt-3 pt-2 border-t border-slate-800/80 justify-around">
        <button
          onClick={() => onChangeTab('studio')}
          className={`px-3 py-1 text-xs font-semibold rounded-md ${
            activeTab === 'studio' ? 'bg-violet-600 text-white' : 'text-slate-400'
          }`}
        >
          TTS Studio
        </button>
        <button
          onClick={() => onChangeTab('clone')}
          className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1 ${
            activeTab === 'clone' ? 'bg-violet-600 text-white' : 'text-slate-400'
          }`}
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          Voice Cloning
        </button>
        <button
          onClick={() => onChangeTab('library')}
          className={`px-3 py-1 text-xs font-semibold rounded-md ${
            activeTab === 'library' ? 'bg-violet-600 text-white' : 'text-slate-400'
          }`}
        >
          Library
        </button>
      </div>
    </header>
  );
};
