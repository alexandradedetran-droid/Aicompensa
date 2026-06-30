import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

/**
 * OpenAI client for image generation/editing.
 *
 * Environment variables (checked in order of priority):
 *   API key : AI_INTEGRATIONS_OPENAI_API_KEY  →  OPENAI_API_KEY
 *   Base URL: AI_INTEGRATIONS_OPENAI_BASE_URL  →  https://api.openai.com/v1
 *
 * If no API key is found, `openai` is exported as `null` instead of crashing
 * the server at import time — callers throw a clear runtime error if invoked
 * without configuration.
 */

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

const resolvedApiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  null;

const resolvedBaseUrl =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || OPENAI_DEFAULT_BASE_URL;

export const openai: OpenAI | null = resolvedApiKey
  ? new OpenAI({ apiKey: resolvedApiKey, baseURL: resolvedBaseUrl })
  : null;

function requireOpenai(): OpenAI {
  if (!openai) {
    throw new Error(
      "OpenAI is not configured. Set OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY) to use image generation.",
    );
  }
  return openai;
}

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const response = await requireOpenai().images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await requireOpenai().images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
