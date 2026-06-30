import { GoogleGenAI } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY;

if (!apiKey || apiKey === "_DUMMY_API_KEY_") {
  throw new Error("GEMINI_API_KEY inválida ou não configurada");
}

export const ai = new GoogleGenAI({
  apiKey,
});
