export type CloneDiagnosticStage =
  | 'idle'
  | 'started'
  | 'validating'
  | 'service-returned'
  | 'persisting'
  | 'completed'
  | 'failed';

export const CLONE_DIAGNOSTIC_KEY = 'voicecraft_clone_diagnostic';

export function recordCloneDiagnostic(stage: CloneDiagnosticStage, detail?: string) {
  try {
    localStorage.setItem(
      CLONE_DIAGNOSTIC_KEY,
      JSON.stringify({ stage, detail: detail || '', at: Date.now() }),
    );
  } catch {
    // Diagnostics must never affect cloning.
  }
}
