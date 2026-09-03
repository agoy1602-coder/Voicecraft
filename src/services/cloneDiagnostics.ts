export type CloneDiagnosticEntry = { label: string; ms: number };

const KEY = 'voicecraft_clone_diagnostics';

export const cloneDiagnostics = {
  record(label: string, ms: number) {
    try {
      const current = JSON.parse(localStorage.getItem(KEY) || '[]') as CloneDiagnosticEntry[];
      current.push({ label, ms: Math.round(ms) });
      localStorage.setItem(KEY, JSON.stringify(current.slice(-30)));
    } catch {}
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch {}
  },
};
