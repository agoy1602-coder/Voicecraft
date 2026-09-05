export const POCKET_TTS_DIAGNOSTIC_EXPERIMENT = {
  name: 'single-thread-session-init',
  maxThreads: 1,
  reason: 'Test whether multi-threaded WASM session initialization is causing the flow_lm_main stall/tab reload on low-memory mobile devices.',
};
