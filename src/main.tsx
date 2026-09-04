import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import App from './App.tsx';
import './index.css';

registerSW({immediate: true});
installPocketTtsBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Cache-only Pocket TTS preparation. Do not initialize the heavy ONNX
// inference engine during application startup because that can monopolize
// the UI thread on mobile devices. The actual engine remains lazy and is
// initialized by Create Clone when needed.
const POCKET_TTS_CACHE = 'voicecraft-pocket-tts-v1';
const POCKET_TTS_BASE = 'https://huggingface.co/vlapky/pocket-tts-onnx/resolve/main/onnx/english_2026-04';
const POCKET_TTS_ASSETS = [
  'bundle.json',
  'tokenizer.model',
  'mimi_encoder_int8.onnx',
  'text_conditioner_int8.onnx',
  'flow_lm_main_int8.onnx',
  'flow_lm_flow_int8.onnx',
  'mimi_decoder_int8.onnx',
  'bos_before_voice.npy',
];

window.addEventListener('load', () => {
  window.setTimeout(async () => {
    if (!navigator.onLine) return;

    try {
      const cache = await caches.open(POCKET_TTS_CACHE);

      for (const asset of POCKET_TTS_ASSETS) {
        const url = `${POCKET_TTS_BASE}/${asset}`;
        if (await cache.match(url)) continue;

        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Pocket TTS asset ${asset}: HTTP ${response.status}`);
        await cache.put(url, response.clone());
      }

      console.log('[VoiceCraft] Pocket TTS assets cached for offline use.');
    } catch (error) {
      console.warn('[VoiceCraft] Pocket TTS asset warmup deferred:', error);
    }
  }, 1000);
});
