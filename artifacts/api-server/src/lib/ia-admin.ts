// @ts-nocheck
/**
 * IA Admin — asynchronous gallery offer audit using Gemini vision.
 * Runs in background after the HTTP response is sent to the user.
 *
 * Decision outcomes:
 *   aprovada      → offer moves to status 'nova', points awarded
 *   recusada      → offer stays hidden (status 'recusada')
 *   revisao_manual → admin panel review required
 */
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

export interface IaAdminResult {
  decisao: "aprovada" | "recusada" | "revisao_manual";
  motivo: string;
  scoreConfianca: number;
}

const SYSTEM_PROMPT = `Você é o Administrador de Segurança do AíCompensa, um app colaborativo de comparação de preços de supermercados no Brasil.

Sua tarefa é auditar ofertas enviadas via galeria de fotos (não câmera ao vivo). Esse canal tem risco elevado de fraude e conteúdo falso.

Analise a imagem fornecida e os dados informados pelo usuário sob três critérios:

1. AUTENTICIDADE: A imagem parece um print de tela, meme, foto baixada da internet, montagem digital, ou imagem claramente não tirada em um supermercado ou ponto de venda?
2. VALIDADE CONTEXTUAL: O preço informado é razoável para o produto e categoria no contexto do varejo brasileiro? Exemplos de fraude: Arroz 5kg por R$ 2,00, TV 55" por R$ 50,00.
3. QUALIDADE: A imagem permite confirmar visualmente que aquele produto custa aquele valor? Há etiqueta, prateleira, gôndola ou display de preço visível?

CLASSIFICAÇÃO ESTRITA — responda EXATAMENTE um dos três valores:
- "aprovada": imagem autêntica de supermercado ou mercado, preço plausível, qualidade suficiente para confirmação
- "recusada": print de tela, montagem, meme, imagem não relacionada, ou preço completamente absurdo/impossível
- "revisao_manual": imagem real mas qualidade muito baixa, preço levemente atípico mas possível, ou ambiguidade razoável que exige olho humano

Responda APENAS com JSON válido, sem nenhum texto fora do JSON:
{"decisao":"aprovada","motivo":"Motivo detalhado em português para o log.","scoreConfianca":0.85}

scoreConfianca: número de 0.00 a 1.00 (1.00 = certeza absoluta de aprovação, 0.00 = certeza absoluta de recusa).`;

export async function auditarOfertaGaleria(
  fotoUrl: string,
  produto: string,
  preco: number,
  categoria: string,
): Promise<IaAdminResult> {
  const precoFmt = preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const base64 = fotoUrl.includes(",") ? fotoUrl.split(",")[1]! : fotoUrl;
  const mimeType: "image/jpeg" | "image/png" | "image/webp" =
    fotoUrl.startsWith("data:image/png") ? "image/png"
    : fotoUrl.startsWith("data:image/webp") ? "image/webp"
    : "image/jpeg";

  const userPrompt = `Produto informado pelo usuário: "${produto}"
Preço informado: ${precoFmt}
Categoria: ${categoria}

Audite a imagem e retorne apenas o JSON de decisão.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: { systemInstruction: SYSTEM_PROMPT },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: userPrompt },
          ],
        },
      ],
    });

    const raw = result.text?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in IA Admin response: ${raw.slice(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]) as {
      decisao?: string;
      motivo?: string;
      scoreConfianca?: number;
    };

    const validDecisoes = ["aprovada", "recusada", "revisao_manual"] as const;
    const decisao: IaAdminResult["decisao"] = validDecisoes.includes(
      parsed.decisao as IaAdminResult["decisao"],
    )
      ? (parsed.decisao as IaAdminResult["decisao"])
      : "revisao_manual";

    return {
      decisao,
      motivo: typeof parsed.motivo === "string" && parsed.motivo.length > 0
        ? parsed.motivo
        : "Sem motivo fornecido pela IA.",
      scoreConfianca: Math.min(1, Math.max(0, Number(parsed.scoreConfianca ?? 0.5))),
    };
  } catch (err) {
    logger.warn({ err }, "ia-admin: audit failed — falling back to revisao_manual");
    return {
      decisao: "revisao_manual",
      motivo: "Falha técnica na análise de IA. Revisão humana necessária.",
      scoreConfianca: 0.5,
    };
  }
}
