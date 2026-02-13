import { GoogleGenAI, Modality } from "@google/genai";

/**
 * OmniVoice AI Model Strategy:
 * 1. Intelligence & Layout Analysis: 'gemini-3-pro-preview' (Best for complex multi-column reasoning)
 * 2. Voice Synthesis: 'gemini-2.5-flash-preview-tts' (State-of-the-art TTS modality)
 */

/**
 * Intelligent Content Interpretation: Uses Gemini 3 Pro for advanced 
 * logic in reconstructing multi-column layouts and fixing OCR errors.
 */
export async function processRawLayout(rawText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are an expert document reconstruction AI. 
      Analyze the following raw extracted text from a complex document page. 
      The text might contain broken words, artifacts from multi-column layouts, 
      mathematical symbols, or table data.
      
      Rules:
      1. Repair hyphenated words and broken sentences.
      2. Convert table-like structures into descriptive, narrative sentences.
      3. Convert mathematical notation into clear, spoken-word English (e.g., √2 to "square root of two").
      4. Remove headers, footers, and page numbers.
      5. Output ONLY the clean, logically ordered narrative optimized for a high-end TTS reader.

      Raw Text:
      ${rawText}`,
    config: {
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 8000 }
    }
  });

  // Accessing text as a property per guidelines
  return response.text || rawText;
}

/**
 * Advanced TTS using Gemini 2.5 Flash Preview TTS
 */
export async function generateSpeech(text: string, voiceName: string = 'Kore'): Promise<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");

  return decode(base64Audio);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}