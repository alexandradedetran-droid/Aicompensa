import { GoogleGenAI, Modality } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY;

if (!apiKey || apiKey === "_DUMMY_API_KEY_") {
  throw new Error("GEMINI_API_KEY inválida ou não configurada");
}

export const ai = new GoogleGenAI({ apiKey });

export async function generateImage(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}
