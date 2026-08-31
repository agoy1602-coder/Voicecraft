import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VOICECRAFT_API_KEY || '';
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    geminiConfigured: !!geminiKey,
    engine: 'VoiceCraft Studio v2.4'
  });
}
