const CACHE_NAME = 'voicecraft-pocket-tts-v1';
const MODEL_ROOT = 'https://huggingface.co/vlapky/pocket-tts-onnx/resolve/main/onnx/english_2026-04';

const ASSETS = [
  'bundle.json',
  'tokenizer.model',
  'mimi_encoder_int8.onnx',
  'text_conditioner_int8.onnx',
  'flow_lm_main_int8.onnx',
  'flow_lm_flow_int8.onnx',
  'mimi_decoder_int8.onnx',
  'bos_before_voice.npy',
].map((name) => `${MODEL_ROOT}/${name}`);

type PreloadMessage = { type: 'preload' };

const post = (message: unknown) => self.postMessage(message);

async function preload() {
  if (typeof caches === 'undefined') {
    post({ type: 'error', error: 'Cache Storage is unavailable.' });
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  let cached = 0;

  for (let index = 0; index < ASSETS.length; index++) {
    const url = ASSETS[index];
    const name = url.split('/').pop() || url;

    try {
      const existing = await cache.match(url);
      if (existing) {
        cached += 1;
        post({ type: 'progress', name, index: index + 1, total: ASSETS.length, fromCache: true });
        continue;
      }

      const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await cache.put(url, response.clone());
      cached += 1;
      post({ type: 'progress', name, index: index + 1, total: ASSETS.length, fromCache: false });
    } catch (error) {
      post({
        type: 'asset-error',
        name,
        index: index + 1,
        total: ASSETS.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const finalEntries = await cache.keys();
  const finalUrls = new Set(finalEntries.map((request) => request.url));
  const complete = ASSETS.every((url) => finalUrls.has(url));

  post({
    type: complete ? 'ready' : 'incomplete',
    cached,
    total: ASSETS.length,
    missing: ASSETS.filter((url) => !finalUrls.has(url)).map((url) => url.split('/').pop()),
  });
}

self.onmessage = (event: MessageEvent<PreloadMessage>) => {
  if (event.data?.type !== 'preload') return;
  preload().catch((error) => {
    post({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  });
};
