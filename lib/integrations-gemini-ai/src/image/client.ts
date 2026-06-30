import { GoogleGenAI, Modality } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY;

if (!apiKey || apiKey === "_DUMMY_API_KEY_") {
  throw new Error("GEMINI_API_KEY inválida ou não configurada");
}

export const ai = new GoogleGenAI({ apiKey });

const GENERATE_IMAGE_TIMEOUT_MS = 60_000;

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`generateImage: timeout após ${GENERATE_IMAGE_TIMEOUT_MS / 1_000}s`)),
      GENERATE_IMAGE_TIMEOUT_MS,
    )
  );

  const imagePromise = ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const response = await Promise.race([imagePromise, timeoutPromise]);

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
