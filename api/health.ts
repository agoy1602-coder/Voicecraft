import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    engine: 'VoiceCraft Studio v2.4'
  });
}
