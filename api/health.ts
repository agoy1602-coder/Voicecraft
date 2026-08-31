import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const voicecraftKey = process.env.VOICECRAFT_API_KEY;

  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    geminiConfigured: Boolean(geminiKey || voicecraftKey),
    diagnostics: {
      geminiApiKeyPresent: Boolean(geminiKey),
      voicecraftApiKeyPresent: Boolean(voicecraftKey),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelRegion: process.env.VERCEL_REGION ?? null
    },
    engine: 'VoiceCraft Studio v2.4'
  });
}
