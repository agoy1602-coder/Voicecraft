import fs from 'node:fs';
import path from 'node:path';

const workerPath = path.resolve('node_modules/pocket-tts-js/src/worker.js');

if (!fs.existsSync(workerPath)) {
  console.log('[PocketTTS diagnostic] worker.js not present; skipping instrumentation.');
  process.exit(0);
}

let source = fs.readFileSync(workerPath, 'utf8');

const replacements = [
  [
    '    const outputs = await mimiEncoderSession.run({ audio: input });',
    '    post({ type: "progress", label: "mimi encoder started" });\n    console.info("[VoiceCloneTrace] MIMI_ENTER");\n    const outputs = await mimiEncoderSession.run({ audio: input });\n    console.info("[VoiceCloneTrace] MIMI_RETURN");\n    post({ type: "progress", label: "mimi encoder finished" });',
  ],
  [
    '    const result = await flowLmMainSession.run({\n        sequence: emptySeq,\n        text_embeddings: voiceTensor,\n        ...flowLmState,\n    });',
    '    post({ type: "progress", label: "flow state started" });\n    console.info("[VoiceCloneTrace] FLOW_STATE_ENTER");\n    const result = await flowLmMainSession.run({\n        sequence: emptySeq,\n        text_embeddings: voiceTensor,\n        ...flowLmState,\n    });\n    console.info("[VoiceCloneTrace] FLOW_STATE_RETURN");\n    post({ type: "progress", label: "flow state finished" });',
  ],
  [
    '            post({ id, type: "result", result: { ref } });',
    '            console.info("[VoiceCloneTrace] CLONE_RESULT_SENT", ref);\n            post({ type: "progress", label: "clone result sent" });\n            post({ id, type: "result", result: { ref } });',
  ],
];

let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(to)) continue;
  if (!source.includes(from)) {
    throw new Error(`[PocketTTS diagnostic] Expected worker snippet not found:\n${from}`);
  }
  source = source.replace(from, to);
  changed = true;
}

if (changed) {
  fs.writeFileSync(workerPath, source);
  console.log('[PocketTTS diagnostic] Instrumentation applied.');
} else {
  console.log('[PocketTTS diagnostic] Instrumentation already present.');
}
