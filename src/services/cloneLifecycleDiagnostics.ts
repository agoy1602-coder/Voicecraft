export type CloneLifecycleDiagnostic = { label: string; ms: number };

const KEY = 'voicecraft_clone_lifecycle_diagnostics';

export const cloneLifecycleDiagnostics = {
  record(label: string, ms: number) {
    try {
      const current = JSON.parse(localStorage.getItem(KEY) || '[]') as CloneLifecycleDiagnostic[];
      current.push({ label, ms: Math.round(ms) });
      localStorage.setItem(KEY, JSON.stringify(current.slice(-30)));
    } catch {}
  },
  read(): CloneLifecycleDiagnostic[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]') as CloneLifecycleDiagnostic[];
    } catch {
      return [];
    }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch {}
  },
};
