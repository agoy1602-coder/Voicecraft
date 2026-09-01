import { GoogleGenAI } from '@google/genai';

const PRODUCTION_ORIGIN = 'https://agoy1602-coder.github.io';
const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

function setCors(req: any, res: any) {
  const origin = req?.headers?.origin || '';
  // Keep the public production frontend allowed, and allow only Voicecraft's
  // own Vercel preview/production origins. Do not open the Gemini proxy to
  // arbitrary websites.
  const isVoicecraftVercelOrigin = /^https:\/\/voicecraft-[a-z0-9-]+-ago-y\.vercel\.app$/i.test(origin);
  const allowedOrigin = origin === PRODUCTION_ORIGIN || isVoicecraftVercelOrigin
    ? origin
    : PRODUCTION_ORIGIN;

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
}

function requestId() {
  return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getRetryAfterSeconds(error: any) {
  const raw = error?.response?.headers?.get?.('retry-after') ?? error?.headers?.['retry-after'] ?? error?.retryAfterSeconds;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(300, Math.ceil(parsed)) : 15;
}

export default async function handler(req: any, res: any) {
  const id = requestId();
  setCors(req, res);
  res.setHeader('X-VoiceCraft-Request-Id', id);
  res.setHeader('X-VoiceCraft-Engine', 'gemini-cloud');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      errorCode: 'METHOD_NOT_ALLOWED',
      error: 'Method not allowed',
      requestId: id,
    });
  }

  const key = process.env.GEMINI_API_KEY || process.env.VOICECRAFT_API_KEY || '';
  if (!key) {
    return res.status(503).json({
      success: false,
      configured: false,
      errorCode: 'GEMINI_NOT_CONFIGURED',
      error: 'Gemini API key is not available to this production function.',
      requestId: id,
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      text,
      voice = 'Kore',
      tone = 'professional',
      language = 'en-US',
      speed = 1,
      pitch = 1,
      customPromptModifier = '',
      isClonedVoice = false,
      clonedProfileData = null,
    } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, errorCode: 'INVALID_TEXT', error: 'Text prompt is required', requestId: id });
    }

    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const ttsVoice = validVoices.includes(voice) ? voice : 'Kore';

    let delivery = `Speak naturally and expressively in ${language}, with a ${tone} tone`;
    if (speed < 0.8) delivery += ', slowly and clearly';
    if (speed > 1.25) delivery += ', swiftly and clearly';
    if (customPromptModifier) delivery += `. ${customPromptModifier}`;
    if (isClonedVoice && clonedProfileData) {
      delivery += `. Match the supplied vocal profile: ${clonedProfileData.timbreDescription || clonedProfileData.name || 'custom voice'}.`;
    }

    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: `${delivery}:\n\n"${text}"` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: ttsVoice },
          },
        },
      },
    });

    const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) {
      return res.status(502).json({
        success: false,
        quotaExceeded: false,
        useClientFallback: false,
        errorCode: 'NO_AUDIO_RETURNED',
        error: 'Gemini returned no audio data.',
        requestId: id,
      });
    }

    return res.status(200).json({
      success: true,
      audioBase64,
      format: 'pcm_24khz',
      sampleRate: 24000,
      voiceUsed: ttsVoice,
      tone,
      language,
      characters: text.length,
      generatedAt: Date.now(),
      requestId: id,
      engine: 'gemini-cloud',
      model: TTS_MODEL,
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    const status = error?.status ?? error?.statusCode ?? error?.code ?? null;
    const quota = status === 429 || /429|quota|resource_exhausted|rate.?limit/i.test(msg);
    const retryAfterSeconds = getRetryAfterSeconds(error);

    console.error('[VoiceCraft] Gemini TTS error:', { requestId: id, status, quota, message: msg });

    return res.status(quota ? 429 : 502).json({
      success: false,
      quotaExceeded: quota,
      useClientFallback: quota,
      providerStatus: status,
      retryAfterSeconds: quota ? retryAfterSeconds : undefined,
      errorCode: quota ? 'GEMINI_QUOTA' : 'GEMINI_PROVIDER_ERROR',
      error: quota ? 'Gemini TTS rate limit or quota reached.' : `Gemini TTS error: ${msg.slice(0, 300)}`,
      requestId: id,
    });
  }
}
