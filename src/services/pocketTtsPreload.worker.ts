const CACHE_NAME = 'voicecraft-pocket-tts-v1';
const MODEL_BASE = 'https://huggingface.co/vlapky/pocket-tts-onnx/resolve/main/onnx/english_2026-04';
const ASSETS = [
  'bundle.json',
  'tokenizer.model',
  'mimi_encoder_int8.onnx',
  'text_conditioner_int8.onnx',
  'flow_lm_main_int8.onnx',
  'flow_lm_flow_int8.onnx',
  'mimi_decoder_int8.onnx',
  'bos_before_voice.npy',
] as const;

self.onmessage = async (event: MessageEvent) => {
  if (event.data?.type !== 'warmup') return;

  if (typeof caches === 'undefined' || !self.navigator?.onLine) {
    self.postMessage({ type: 'skipped', reason: 'offline-or-cache-unavailable' });
    return;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    let completed = 0;

    for (const asset of ASSETS) {
      const url = `${MODEL_BASE}/${asset}`;
      if (!(await cache.match(url))) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Pocket TTS asset ${asset}: HTTP ${response.status}`);
        await cache.put(url, response);
      }

      completed += 1;
      self.postMessage({ type: 'progress', loaded: completed, total: ASSETS.length });
    }

    self.postMessage({ type: 'ready', loaded: completed, total: ASSETS.length });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
