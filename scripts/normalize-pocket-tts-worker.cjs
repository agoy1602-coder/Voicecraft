const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');
if (!fs.existsSync(workerPath)) process.exit(0);

let source = fs.readFileSync(workerPath, 'utf8');
if (!source.includes('// [VoiceCraft] resumable model downloader v2')) process.exit(0);

source = source.replace(/\bconst VC_RANGE_SIZE\b/g, 'var VC_RANGE_SIZE');
source = source.replace(/\bconst VC_MAX_ATTEMPTS\b/g, 'var VC_MAX_ATTEMPTS');
fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] normalized cached Pocket TTS downloader declarations');
