import { GoogleGenAI } from '@google/genai';

const ALLOWED_ORIGIN = 'https://agoy1602-coder.github.io';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY || process.env.VOICECRAFT_API_KEY || '';
  if (!key) {
    return res.status(503).json({
      success: false,
      configured: false,
      error: 'Gemini API key is not available to this production function.',
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

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text prompt is required' });
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
      model: 'gemini-3.1-flash-tts-preview',
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
        error: 'Gemini returned no audio data.',
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
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    const status = error?.status ?? error?.statusCode ?? error?.code ?? null;
    const quota = status === 429 || /429|quota|resource_exhausted/i.test(msg);

    console.error('[VoiceCraft] Gemini TTS error:', msg);

    return res.status(quota ? 429 : 502).json({
      success: false,
      quotaExceeded: quota,
      useClientFallback: quota,
      providerStatus: status,
      error: quota ? 'Gemini TTS rate limit or quota reached.' : `Gemini TTS error: ${msg.slice(0, 300)}`,
    });
  }
}
