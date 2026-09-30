import React, { useEffect, useState } from 'react';
import { getAccountState, onAuthStateChange, signInWithEmail, signOutAccount, signUpWithEmail } from '../services/accountService';
import { migrateLocalVaultToAccount } from '../services/vaultMigrationService';
import { recoverAccountVault } from '../services/vaultRecoveryService';
import { syncAccountVault } from '../services/accountVaultSyncService';
import { clearActiveVaultKey, hasActiveVaultKey } from '../services/vaultSession';
import { AudioClip, ClonedVoiceProfile } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  voices: ClonedVoiceProfile[];
  clips: AudioClip[];
  onRestored: (voices: ClonedVoiceProfile[], clips: AudioClip[]) => void;
}

export function AccountVaultModal({ isOpen, onClose, voices, clips, onRestored }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoverySecret, setRecoverySecret] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [hasVault, setHasVault] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    getAccountState().then((state) => setSignedIn(Boolean(state.user))).catch((err) => setMessage(err?.message || 'Unable to read account state.'));
    const unsubscribe = onAuthStateChange((state) => setSignedIn(Boolean(state.user)));
    return unsubscribe;
  }, [isOpen]);

  if (!isOpen) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try { await action(); } catch (err: any) { setMessage(err?.message || 'Account vault operation failed.'); }
    finally { setBusy(false); }
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
    onRestored(result.pulledVoices ? (await import('../services/accountVaultSyncService')).pullAccountVault().then(r => r.voices) : [], result.pulledClips ? (await import('../services/accountVaultSyncService')).pullAccountVault().then(r => r.clips) : []);
    setHasVault(true);
    setMessage(`Vault recovered: ${result.pulledVoices} clone(s), ${result.pulledClips} audio clip(s).`);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Account Vault Recovery</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" disabled={busy}>✕</button>
        </div>
        <p className="text-xs text-slate-400 mb-4">Your Vault Key stays in this browser. The account stores only the recovery-wrapped key and encrypted records.</p>
        {!signedIn ? (
          <div className="space-y-3">
            <input className="w-full rounded-lg bg-slate-800 border border-slate-700 p-2" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input className="w-full rounded-lg bg-slate-800 border border-slate-700 p-2" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <button disabled={busy} className="flex-1 rounded-lg bg-violet-600 px-3 py-2 font-semibold" onClick={() => run(async () => { await signUpWithEmail(email, password); setSignedIn(true); setMessage('Account created. If email confirmation is enabled, confirm the email before signing in.'); })}>Create account</button>
              <button disabled={busy} className="flex-1 rounded-lg bg-slate-700 px-3 py-2 font-semibold" onClick={() => run(async () => { await signInWithEmail(email, password); setSignedIn(true); setMessage('Signed in.'); })}>Sign in</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-950/40 border border-emerald-700/50 p-3 text-sm">Signed in.</div>
            <input className="w-full rounded-lg bg-slate-800 border border-slate-700 p-2" type="password" placeholder="Recovery secret (12+ characters)" value={recoverySecret} onChange={e => setRecoverySecret(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button disabled={busy || recoverySecret.length < 12 || (voices.length === 0 && clips.length === 0)} className="rounded-lg bg-violet-600 px-3 py-2 font-semibold disabled:opacity-40" onClick={migrateAndSync}>Protect this device</button>
              <button disabled={busy || recoverySecret.length < 12} className="rounded-lg bg-slate-700 px-3 py-2 font-semibold disabled:opacity-40" onClick={recoverAndSync}>Recover vault</button>
            </div>
            <button disabled={busy} className="w-full rounded-lg border border-slate-700 px-3 py-2" onClick={() => run(async () => { clearActiveVaultKey(); await signOutAccount(); setSignedIn(false); setHasVault(false); setMessage('Signed out.'); })}>Sign out / lock vault</button>
          </div>
        )}
        {message && <div className="mt-4 rounded-lg bg-slate-800 p-3 text-xs">{message}</div>}
        {hasActiveVaultKey() && <div className="mt-3 text-xs text-emerald-400">Vault key active in memory.</div>}
      </div>
    </div>
  );
}
