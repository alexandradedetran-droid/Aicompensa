import OpenAI from "openai";

/**
 * OpenAI client for the OCR fallback.
 *
 * Environment variables (checked in order of priority):
 *   API key : AI_INTEGRATIONS_OPENAI_API_KEY  →  OPENAI_API_KEY
 *   Base URL: AI_INTEGRATIONS_OPENAI_BASE_URL  →  https://api.openai.com/v1
 *
 * If no API key is found, `openai` is exported as `null` instead of crashing
 * the server — the OCR route handles the null case gracefully and skips the
 * fallback with a clear log message.
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

/** Whether the OpenAI fallback is available (API key configured). */
export const openaiConfigured = resolvedApiKey !== null;

/** The resolved base URL (for diagnostic logging at startup). */
export const openaiBaseUrl = resolvedBaseUrl;
