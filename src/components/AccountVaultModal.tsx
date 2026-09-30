import React, { useEffect, useState } from 'react';
import { getAccountState, onAuthStateChange, signInWithEmail, signOutAccount, signUpWithEmail } from '../services/accountService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { migrateLocalVaultToAccount } from '../services/vaultMigrationService';
import { recoverAccountVault } from '../services/vaultRecoveryService';
import { pullAccountVault, syncAccountVault } from '../services/accountVaultSyncService';
import { clearActiveVaultKey, hasActiveVaultKey } from '../services/vaultSession';
import { AudioClip, ClonedVoiceProfile } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  voices: ClonedVoiceProfile[];
  clips: AudioClip[];
  onRestored: (voices: ClonedVoiceProfile[], clips: AudioClip[]) => void;
}

const REMEMBERED_EMAIL_KEY = 'clonevoice.accountVault.rememberedEmail';

function loadRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

function saveRememberedEmail(email: string): void {
  try {
    const normalized = email.trim();
    if (normalized) localStorage.setItem(REMEMBERED_EMAIL_KEY, normalized);
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Browser storage can be unavailable in privacy-restricted contexts.
  }
}

export function AccountVaultModal({ isOpen, onClose, voices, clips, onRestored }: Props) {
  const [email, setEmail] = useState(() => loadRememberedEmail());
  const [password, setPassword] = useState('');
  const [recoverySecret, setRecoverySecret] = useState('');
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(loadRememberedEmail()));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [hasVault, setHasVault] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (!isSupabaseConfigured()) {
      setSignedIn(false);
      setMessage('Account vault is not configured on this preview. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the preview environment.');
      return;
    }

    getAccountState()
      .then((state) => {
        setSignedIn(Boolean(state.user));
        if (state.user?.email && rememberEmail) setEmail(state.user.email);
      })
      .catch((err) => setMessage(err?.message || 'Unable to read account state.'));

    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChange((state) => {
        setSignedIn(Boolean(state.user));
        if (state.user?.email && rememberEmail) setEmail(state.user.email);
      });
    } catch (err: any) {
      setMessage(err?.message || 'Unable to initialize account authentication.');
    }

    return unsubscribe;
  }, [isOpen, rememberEmail]);

  if (!isOpen) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (err: any) {
      setMessage(err?.message || 'Account vault operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (rememberEmail) saveRememberedEmail(value);
  };

  const handleRememberEmailChange = (checked: boolean) => {
    setRememberEmail(checked);
    if (checked) saveRememberedEmail(email);
    else saveRememberedEmail('');
  };

  const migrateAndSync = () => run(async () => {
    if (!signedIn) throw new Error('Sign in first.');
    const result = await migrateLocalVaultToAccount(recoverySecret);
    await syncAccountVault(voices, clips);
    setHasVault(true);
    setMessage(`Account vault created: ${result.voiceCount} clone(s), ${result.audioCount} audio clip(s).`);
  });

  const recoverAndSync = () => run(async () => {
    if (!signedIn) throw new Error('Sign in first.');
    await recoverAccountVault(recoverySecret);
    const result = await syncAccountVault([], []);
    const restored = await pullAccountVault();
    onRestored(restored.voices, restored.clips);
    setHasVault(true);
    setMessage(`Vault recovered: ${result.pulledVoices} clone(s), ${result.pulledClips} audio clip(s).`);
  });

  const signIn = () => run(async () => {
    await signInWithEmail(email, password);
    if (rememberEmail) saveRememberedEmail(email);
    setPassword('');
    setSignedIn(true);
    setMessage('Signed in successfully.');
  });

  const createAccount = () => run(async () => {
    await signUpWithEmail(email, password);
    if (rememberEmail) saveRememberedEmail(email);
    setPassword('');
    setSignedIn(true);
    setMessage('Account created. If email confirmation is enabled, confirm the email before signing in.');
  });

  const signOut = () => run(async () => {
    clearActiveVaultKey();
    await signOutAccount();
    setPassword('');
    setRecoverySecret('');
    setSignedIn(false);
    setHasVault(false);
    setMessage('Signed out. Your email is remembered; your password is not stored.');
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-indigo-400/30 bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950/70 text-slate-100 shadow-2xl shadow-indigo-950/50">
        <div className="flex items-center justify-between border-b border-indigo-400/20 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">CloneVoice TTS</h2>
            <p className="text-xs font-medium text-indigo-300">Account Vault</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Account Vault"
            className="grid h-9 w-9 place-items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 text-slate-300 transition hover:border-cyan-300/70 hover:bg-cyan-400/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/30 text-xl ring-1 ring-cyan-300/30">
              🔐
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">{signedIn ? 'Welcome back' : 'Secure your voice'}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {signedIn
                  ? 'Your account is connected and your vault is ready.'
                  : 'Sign in to protect your voice profiles and encrypted vault data.'}
              </p>
            </div>
          </div>

          {!signedIn ? (
            <div className="space-y-3">
              <div className="relative">
                <input
                  className="w-full rounded-xl border border-indigo-400/35 bg-slate-900/80 px-4 py-3 pr-10 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                  placeholder="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => handleEmailChange(e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan-300">✉</span>
              </div>

              <div className="relative">
                <input
                  className="w-full rounded-xl border border-indigo-400/35 bg-slate-900/80 px-4 py-3 pr-10 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan-300">🔒</span>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={e => handleRememberEmailChange(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                <span>Remember my email</span>
              </label>

              <button
                type="button"
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:from-cyan-400 hover:to-violet-500 hover:shadow-cyan-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={signIn}
              >
                {busy ? 'Signing in…' : '↪ Sign In'}
              </button>

              <div className="flex items-center gap-3 py-1 text-[11px] text-slate-500">
                <span className="h-px flex-1 bg-indigo-400/20" />
                <span>or</span>
                <span className="h-px flex-1 bg-indigo-400/20" />
              </div>

              <button
                type="button"
                disabled={busy}
                className="w-full rounded-xl border border-cyan-400/60 bg-cyan-400/5 px-4 py-3 font-semibold text-cyan-200 transition hover:bg-cyan-400/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={createAccount}
              >
                ✉ Create New Account
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-200">✓ Signed in</p>
                  <p className="mt-1 text-xs text-slate-400">{email || 'Account connected'}</p>
                </div>
                <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                  Active
                </span>
              </div>

              <input
                className="w-full rounded-xl border border-indigo-400/35 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                type="password"
                placeholder="Recovery secret (12+ characters)"
                value={recoverySecret}
                onChange={e => setRecoverySecret(e.target.value)}
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy || recoverySecret.length < 12 || (voices.length === 0 && clips.length === 0)}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-3 py-3 text-sm font-semibold text-white transition hover:from-cyan-400 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={migrateAndSync}
                >
                  ☁ Protect this device
                </button>
                <button
                  type="button"
                  disabled={busy || recoverySecret.length < 12}
                  className="rounded-xl border border-indigo-300/35 bg-indigo-400/10 px-3 py-3 text-sm font-semibold text-indigo-100 transition hover:border-cyan-300/60 hover:bg-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={recoverAndSync}
                >
                  ↻ Recover vault
                </button>
              </div>

              <button
                type="button"
                disabled={busy}
                className="w-full rounded-xl border border-rose-400/60 bg-rose-500/5 px-3 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={signOut}
              >
                ⇥ Sign out / lock vault
              </button>
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-indigo-400/20 bg-indigo-950/50 p-3 text-xs leading-5 text-slate-300">
              {message}
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="text-cyan-300">🛡</span>
            <span>Your Vault Key stays in this browser. The account stores only the recovery-wrapped key and encrypted records.</span>
          </div>

          {hasActiveVaultKey() && (
            <div className="text-xs font-medium text-emerald-300">✓ Vault key active in memory.</div>
          )}
        </div>
      </div>
    </div>
  );
}
