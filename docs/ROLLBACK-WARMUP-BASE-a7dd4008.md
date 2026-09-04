# Warm-up experiment rollback point

This file records the known-good rollback commit before the next isolated warm-up fix.

- Branch: `experiment/pocket-tts-offline-cache-trace`
- Commit: `a7dd4008ffe95b18daabbfa55808b06fa0863598`
- Parent: `21c7673bbd78550d1f8d733d99c83edd41a33e25`
- Observation: Pocket TTS warm-up populated `voicecraft-pocket-tts-v1` with 8 assets, but the UI became unclickable while initialization was occurring.

Do not treat this commit as production-ready; it is the rollback anchor for the isolated experiment.