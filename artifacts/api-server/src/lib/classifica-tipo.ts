// @ts-nocheck
/**
 * Image classifier: detects whether an offer photo is a real in-store shot
 * ("presencial") or a printed/digital promotional flyer ("encarte").
 *
 * Uses Gemini vision. Falls back gracefully on timeout / error so that callers
 * always get a usable result and never block the publish flow.
 */

import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

export type TipoOferta = "presencial" | "encarte";

export interface ClassificaTipoResult {
  tipo: TipoOferta;
  /** Confidence 0–1. Values < 0.75 should prompt a user confirmation UI. */
  confianca: number;
  indicadores: string[];
}

const SYSTEM_PROMPT = `Você é um classificador de imagens para o app AíCompensa (comparador de preços de supermercado brasileiro).

Analise a imagem e classifique em UMA das duas categorias:

"presencial" — Foto tirada fisicamente dentro do supermercado. Indicadores:
- Produto real fotografado na gôndola, prateleira ou checkout
- Etiqueta de preço física fixada no produto ou prateleira
- Fundo do supermercado visível (prateleiras, corredores, freezers)
- Qualidade de câmera com imperfeições naturais (perspectiva, sombra, reflexo)
- Foto de nota fiscal ou cupom fiscal

"encarte" — Material gráfico/promocional impresso ou digital. Indicadores:
- Layout de folheto, panfleto ou flyer de supermercado
- Múltiplos produtos lado a lado com preços destacados
- Fundo colorido artificial, degradê ou arte gráfica profissional
- Logo do mercado em destaque
- Balões de preço, banners promocionais, clipart
- Captura de tela de aplicativo ou site de mercado

Responda SOMENTE em JSON sem nenhum texto extra:
{"tipo":"presencial"|"encarte","confianca":0.0-1.0,"indicadores":["razão1","razão2","razão3"]}

Exemplos:
{"tipo":"presencial","confianca":0.93,"indicadores":["foto de gôndola real","etiqueta física","fundo de supermercado"]}
{"tipo":"encarte","confianca":0.91,"indicadores":["múltiplos produtos","arte gráfica","fundo colorido artificial"]}`;

const CLASSIFY_TIMEOUT_MS = 8_000;

export async function classificaTipoOferta(
  imageBase64: string,
): Promise<ClassificaTipoResult> {
  const fallback: ClassificaTipoResult = { tipo: "presencial", confianca: 0, indicadores: [] };

  let rawBase64: string;
  let mimeType = "image/jpeg";

  if (imageBase64.startsWith("data:")) {
    const m = imageBase64.match(/^data:(image\/(?:jpeg|png|webp|jpg));base64,(.+)$/i);
    if (!m) return fallback;
    mimeType = m[1]!.toLowerCase().replace("jpg", "jpeg");
    rawBase64 = m[2]!;
  } else {
    rawBase64 = imageBase64;
  }

  if (!rawBase64 || rawBase64.length < 100) return fallback;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { data: rawBase64, mimeType } },
              { text: "Classifique esta imagem como presencial ou encarte." },
            ],
          },
        ],
        config: {
          maxOutputTokens: 256,
          responseMimeType: "application/json",
          systemInstruction: SYSTEM_PROMPT,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("classify-timeout")), CLASSIFY_TIMEOUT_MS),
      ),
    ]);

    const raw = response.text?.trim() ?? "";
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const tipo: TipoOferta = parsed["tipo"] === "encarte" ? "encarte" : "presencial";
    const confianca =
      typeof parsed["confianca"] === "number" &&
      parsed["confianca"] >= 0 &&
      parsed["confianca"] <= 1
        ? Math.round(parsed["confianca"] * 100) / 100
        : 0.5;
    const indicadores: string[] = Array.isArray(parsed["indicadores"])
      ? (parsed["indicadores"] as unknown[])
          .filter((i): i is string => typeof i === "string")
          .slice(0, 3)
      : [];

    logger.info({ tipo, confianca, indicadores }, "classifica-tipo: result");
    return { tipo, confianca, indicadores };
  } catch (err) {
    logger.warn({ err }, "classifica-tipo: AI call failed, returning presencial fallback");
    return fallback;
  }
}
