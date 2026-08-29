import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  Key,
  Lock,
  Unlock,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Terminal,
  Cpu,
} from 'lucide-react';
import { cryptoService } from '../services/crypto';

interface E2EESecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRotateKeyNotification: () => void;
}

export const E2EESecurityModal: React.FC<E2EESecurityModalProps> = ({
  isOpen,
  onClose,
  onRotateKeyNotification,
}) => {
  const [fingerprint, setFingerprint] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [customPassphraseInput, setCustomPassphraseInput] = useState<string>('');
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [inspectCipher, setInspectCipher] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      cryptoService.getFingerprint().then(setFingerprint);
      setPassphrase(cryptoService.getPassphrase());

      // Generate a sample cipher inspection payload
      cryptoService
        .encrypt({
          sample: 'VoiceCraft Zero-Knowledge Vault Payload',
          timestamp: Date.now(),
          protection: 'AES-256-GCM + PBKDF2 (100k rounds)',
        })
        .then(setInspectCipher);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyPassphrase = () => {
    navigator.clipboard.writeText(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateNewPassphrase = async () => {
    const newPass = cryptoService.generateSecurePassphrase();
    await cryptoService.updatePassphrase(newPass);
    setPassphrase(newPass);
    const fp = await cryptoService.getFingerprint();
    setFingerprint(fp);
    onRotateKeyNotification();
  };

  const handleApplyCustomPassphrase = async () => {
    if (!customPassphraseInput.trim()) return;
    await cryptoService.updatePassphrase(customPassphraseInput.trim());
    setPassphrase(customPassphraseInput.trim());
    const fp = await cryptoService.getFingerprint();
    setFingerprint(fp);
    setCustomPassphraseInput('');
    onRotateKeyNotification();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative flex flex-col gap-5 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                End-to-End Encryption (E2EE) Vault
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Active
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                AES-256-GCM hardware encryption with client-side PBKDF2 key derivation
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

        {/* Security Specs Grid */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Cipher Standard
            </span>
            <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-violet-400" /> AES-256-GCM
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Key Fingerprint
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {fingerprint || 'CALCULATING...'}
            </span>
          </div>
        </div>

        {/* Passphrase Manager */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Master Encryption Passphrase</span>
            <span className="text-[10px] font-normal text-slate-400">Zero-Knowledge Key</span>
          </label>

          <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <input
              type={showPassphrase ? 'text' : 'password'}
              readOnly
              value={passphrase}
              className="w-full bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
            />
            <button
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="p-1.5 text-slate-400 hover:text-slate-200"
            >
              {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopyPassphrase}
              title="Copy passphrase"
              className="p-1.5 text-slate-400 hover:text-slate-200"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 mt-1">
            <button
              onClick={handleGenerateNewPassphrase}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Rotate New Key Phrase</span>
            </button>
          </div>
        </div>

        {/* Custom Passphrase Input */}
        <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3">
          <label className="text-[11px] font-semibold text-slate-400">
            Import / Set Custom Passphrase
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customPassphraseInput}
              onChange={(e) => setCustomPassphraseInput(e.target.value)}
              placeholder="Enter custom passphrase..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <button
              onClick={handleApplyCustomPassphrase}
              disabled={!customPassphraseInput.trim()}
              className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              Apply Key
            </button>
          </div>
        </div>

        {/* Real Live Cipher Inspector */}
        <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" /> Live Cipher Inspector
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400 overflow-x-auto space-y-1">
            <div>
              <span className="text-violet-400 font-bold">IV (12-byte):</span>{' '}
              {inspectCipher?.iv || '---'}
            </div>
            <div>
              <span className="text-indigo-400 font-bold">Ciphertext:</span>{' '}
              <span className="text-slate-300 break-all">{inspectCipher?.ciphertext || '---'}</span>
            </div>
            <div>
              <span className="text-emerald-400 font-bold">SHA-256 Checksum:</span>{' '}
              {inspectCipher?.checksum?.substring(0, 24) || '---'}...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
