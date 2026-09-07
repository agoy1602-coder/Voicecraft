import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, ShieldCheck, WifiOff, XCircle } from 'lucide-react';
import {
  getPocketTtsOfflineStatus,
  preparePocketTtsOffline,
  type PocketTtsOfflineStatus,
} from '../services/pocketTtsBridge';

export const PocketTtsOfflinePanel: React.FC = () => {
  const [status, setStatus] = useState<PocketTtsOfflineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Checking offline voice engine…');
  const [percent, setPercent] = useState(0);

  const refresh = async () => {
    try {
      const next = await getPocketTtsOfflineStatus();
      setStatus(next);
      setMessage(next.ready ? 'Offline cloned speech is ready.' : 'Offline models are not installed or verified.');
    } catch (error: any) {
      setMessage(error?.message || 'Could not inspect offline model readiness.');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const prepare = async () => {
    if (busy) return;
    setBusy(true);
    setPercent(1);
    setMessage('Preparing offline voice engine…');
    try {
      const next = await preparePocketTtsOffline((progress) => {
        if (progress.total && progress.loaded !== undefined) {
          setPercent(Math.max(1, Math.min(99, Math.round((progress.loaded / progress.total) * 100))));
        }
        if (progress.label) setMessage(progress.label);
      });
      setStatus(next);
      setPercent(100);
      setMessage('Offline cloned speech is ready. You can disconnect the internet.');
    } catch (error: any) {
      setPercent(0);
      setMessage(error?.message || 'Offline model preparation failed.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const ready = status?.ready === true;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,420px)] rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-start gap-3">
        {ready ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        ) : busy ? (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-violet-400" />
        ) : (
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100">Offline Voice Engine</h3>
            {ready && <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{message}</p>

          {!ready && !busy && (
            <button
              type="button"
              onClick={prepare}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-500"
            >
              <Download className="h-3.5 w-3.5" />
              Prepare Offline Voice Engine
            </button>
          )}

          {busy && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Large model download may take several minutes and requires free browser storage.</p>
            </div>
          )}

          {status && !ready && !busy && (status.missingModels.length > 0 || status.missingOrt.length > 0) && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-200">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Verification failed. Missing {status.missingModels.length + status.missingOrt.length} required local assets.</span>
            </div>
          )}

          {ready && (
            <p className="mt-2 text-[10px] text-emerald-300/80">
              English cloned synthesis is verified locally. Other language bundles and tone controls are not yet wired to Pocket TTS.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
