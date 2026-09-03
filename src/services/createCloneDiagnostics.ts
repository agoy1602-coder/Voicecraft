const ENABLED = import.meta.env.DEV || import.meta.env.VITE_CREATE_CLONE_DIAGNOSTICS === 'true';

export function traceCreateClone(stage: string, details?: Record<string, unknown>): void {
  if (!ENABLED) return;
  console.info('[VoiceCraft CreateClone]', {
    stage,
    at: new Date().toISOString(),
    ...details,
  });
}
