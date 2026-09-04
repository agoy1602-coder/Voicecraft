# VoiceCraft clone loading investigation — 2026-09-04

## Verified facts
- The current production worker is deployed and loads ORT from `/ort/`.
- The browser can fetch `mimi_encoder_int8.onnx` directly with HTTP 200 and a 20,779,616-byte content length.
- Pocket TTS english_2026-04 uses roughly 146 MB of model assets in total; voice cloning adds the ~20.8 MB Mimi encoder.
- The current downloader uses 2 MiB ranges and retries, but it only persists the **complete** model in Cache Storage.
- Therefore an interrupted first download (for example after ~12 MB) is retried during that browser session, but a page refresh loses the completed ranges and starts again from byte 0.
- The downloader has no per-request AbortController timeout. A stalled fetch can therefore leave the UI waiting indefinitely because the clone operation cannot begin until `engine.load()` finishes.
- The Create Clone component currently calls `analyzeAndClone()` without forwarding its progress callback, so the user sees a generic loading state instead of the actual model/range progress.

## Scope for the fix
Do not replace Pocket TTS, do not add ElevenLabs, and do not alter the existing clone/TTS architecture. Harden model acquisition only: persist completed byte ranges, reuse them after refresh, and abort/retry stalled range requests. Keep the existing PWA/offline shell untouched in this fix.
