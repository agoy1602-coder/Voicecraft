import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
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
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: 'Say clearly: VoiceCraft diagnostic test.' }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audio) {
      return res.status(502).json({
        success: false,
        configured: true,
        error: 'Gemini responded but returned no audio data.',
      });
    }

    return res.status(200).json({
      success: true,
      configured: true,
      model: 'gemini-3.1-flash-tts-preview',
      audioReturned: true,
    });
  } catch (error: any) {
    const message = String(error?.message || error || 'Unknown Gemini error');
    const providerStatus = error?.status ?? error?.statusCode ?? error?.code ?? null;
    const quotaExceeded = providerStatus === 429 || /429|quota|resource_exhausted/i.test(message);

    return res.status(quotaExceeded ? 429 : 502).json({
      success: false,
      configured: true,
      quotaExceeded,
      providerStatus,
      error: message.slice(0, 500),
    });
  }
}
