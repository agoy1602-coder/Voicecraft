type DiagnosticState = {
  phase: string;
  startedAt: number;
  completedAt?: number;
  online: boolean;
  crossOriginIsolated: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  cacheEntries?: number;
  loadProgress?: unknown[];
  error?: Record<string, unknown>;
};

const KEY = 'voicecraft-pocket-tts-diagnostic-v1';

export function persistPocketTtsDiagnostic(state: DiagnosticState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, persistedAt: Date.now() }));
  } catch {
    // Diagnostics must never affect cloning.
  }
}

export function readPocketTtsDiagnostic(): (DiagnosticState & { persistedAt?: number }) | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPocketTtsDiagnostic(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Diagnostics must never affect cloning.
  }
}
