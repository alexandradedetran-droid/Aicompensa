// @ts-nocheck
/**
 * IA Admin Audit — rule-based + Gemini analysis of admin offers.
 * Called from Central Inteligente endpoints.
 *
 * The AI suggests. The admin decides. No automated mutations.
 */
import { ai } from "@workspace/integrations-gemini-ai";
import { db, adminOfertaAuditsTable, ofertasTable } from "@workspace/db";
import { and, ne, sql, gte } from "drizzle-orm";
import { logger } from "./logger";
import { detectCategoryFromProduct } from "./normaliza";

// ── Price threshold rules ─────────────────────────────────────────────────────
const PRICE_RULES: Array<{ pattern: RegExp; maxPrice: number; motivo: string }> = [
  { pattern: /leite/i,                  maxPrice: 20, motivo: "Leite acima de R$20 é incomum no varejo nacional" },
  { pattern: /frango/i,                 maxPrice: 60, motivo: "Frango acima de R$60/kg está fora do padrão" },
  { pattern: /arroz.*(5\s*kg)|5kg.*arroz/i, maxPrice: 80, motivo: "Arroz 5 kg acima de R$80 é suspeito" },
  { pattern: /ovo/i,                    maxPrice: 50, motivo: "Ovos acima de R$50 estão fora do padrão" },
];

// ── Hard category override rules (product → forced correct category) ──────────
const CATEGORY_RULES: Array<{
  pattern: RegExp;
  correctCategory: string;
  wrongCategories: RegExp;
}> = [
  {
    pattern: /dog\s*chow|ração|pet\s*food|pedigree|whiskas|purina|royal\s*canin|hills/i,
    correctCategory: "Pet/Ração",
    wrongCategories: /açougue|carnes|alimentos|hortifruti/i,
  },
  {
    pattern: /sabor\s+(frango|carne|atum|peixe|boi|cordeiro)/i,
    correctCategory: "Pet/Ração",
    wrongCategories: /açougue|carnes/i,
  },
];

export interface AuditInput {
  id: number;
  produto: string;
  marca: string | null;
  categoria: string;
  preco: number;
  mercado: string;
  bairro: string | null;
  cidade: string | null;
  fotoUrl: string | null;
  hasFoto: boolean;
  confirmacoes: number;
  denuncias: number;
  validacoes: number;
  produtoNormalizado: string | null;
}

export interface AuditResult {
  risco: "baixo" | "medio" | "alto";
  motivo: string;
  sugestaoAcao: "manter" | "corrigir_categoria" | "revisar_preco" | "arquivar" | "marcar_suspeita";
  precoSuspeito: boolean;
  categoriaErrada: boolean;
  possivelDuplicada: boolean;
  fotoRuim: boolean;
  categoriaSugerida: string | null;
  idsDuplicadosSuspeitos: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkPriceRules(produto: string, preco: number): string | null {
  for (const rule of PRICE_RULES) {
    if (rule.pattern.test(produto) && preco > rule.maxPrice) {
      return rule.motivo;
    }
  }
  return null;
}

function checkCategoryRules(
  produto: string,
  categoria: string,
): { errada: boolean; sugerida: string | null } {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(produto) && rule.wrongCategories.test(categoria)) {
      return { errada: true, sugerida: rule.correctCategory };
    }
  }
  return { errada: false, sugerida: null };
}

async function findDuplicates(input: AuditInput): Promise<number[]> {
  try {
    const window = new Date(Date.now() - 7 * 24 * 3_600_000);
    const lo = input.preco * 0.85;
    const hi = input.preco * 1.15;

    const rows = await db
      .select({ id: ofertasTable.id })
      .from(ofertasTable)
      .where(
        and(
          ne(ofertasTable.id, input.id),
          sql`lower(${ofertasTable.mercado}) = lower(${input.mercado})`,
          gte(ofertasTable.dataCriacao, window),
          sql`${ofertasTable.preco} between ${lo} and ${hi}`,
          sql`${ofertasTable.status} NOT IN ('removida', 'recusada', 'arquivada')`,
          input.produtoNormalizado
            ? sql`${ofertasTable.produtoNormalizado} = ${input.produtoNormalizado}`
            : sql`lower(${ofertasTable.produto}) = lower(${input.produto})`,
        ),
      )
      .limit(5);

    return rows.map((r) => r.id);
  } catch (err) {
    logger.warn({ err }, "ia-admin-audit: duplicate check failed");
    return [];
  }
}

async function checkPhotoQuality(
  fotoUrl: string,
  produto: string,
  preco: number,
): Promise<{ fotoRuim: boolean; motivo: string }> {
  try {
    const base64 = fotoUrl.includes(",") ? fotoUrl.split(",")[1]! : fotoUrl;
    const mimeType: "image/jpeg" | "image/png" | "image/webp" =
      fotoUrl.startsWith("data:image/png")  ? "image/png"
      : fotoUrl.startsWith("data:image/webp") ? "image/webp"
      : "image/jpeg";

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction:
          "Você é auditor de qualidade de fotos de um app de supermercado. " +
          "Responda APENAS com JSON válido, sem texto fora do JSON.",
      },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text:
                `Produto: "${produto}", Preço informado: R$${preco.toFixed(2)}. ` +
                `A foto está nítida e permite confirmar o preço visualmente? ` +
                `Responda: {"foto_ok": boolean, "motivo": "texto curto em português"}`,
            },
          ],
        },
      ],
    });

    const raw = result.text?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { fotoRuim: false, motivo: "" };

    const parsed = JSON.parse(match[0]) as { foto_ok?: boolean; motivo?: string };
    return {
      fotoRuim: parsed.foto_ok === false,
      motivo: parsed.foto_ok === false
        ? (parsed.motivo ?? "Foto com baixa qualidade ou preço ilegível")
        : "",
    };
  } catch (err) {
    logger.warn({ err }, "ia-admin-audit: photo quality check failed — skipping");
    return { fotoRuim: false, motivo: "" };
  }
}

// ── Main service ──────────────────────────────────────────────────────────────

export async function iaAdminAuditService(input: AuditInput): Promise<AuditResult> {
  const motivos: string[] = [];
  let risco: AuditResult["risco"] = "baixo";
  let sugestaoAcao: AuditResult["sugestaoAcao"] = "manter";
  let precoSuspeito  = false;
  let categoriaErrada = false;
  let possivelDuplicada = false;
  let fotoRuim = false;
  let categoriaSugerida: string | null = null;

  // 1. Price rules
  const precoMotivo = checkPriceRules(input.produto, input.preco);
  if (precoMotivo) {
    precoSuspeito = true;
    motivos.push(precoMotivo);
    risco = "alto";
    sugestaoAcao = "revisar_preco";
  }

  // 2. Hard category rules
  const catRule = checkCategoryRules(input.produto, input.categoria);
  if (catRule.errada) {
    categoriaErrada = true;
    categoriaSugerida = catRule.sugerida;
    motivos.push(`Categoria incorreta: "${input.categoria}" → sugerida: "${catRule.sugerida}"`);
    if (risco === "baixo") risco = "medio";
    if (sugestaoAcao === "manter") sugestaoAcao = "corrigir_categoria";
  }

  // 3. detectCategoryFromProduct (AI-powered heuristic)
  if (!catRule.errada) {
    const searchStr = `${input.produto} ${input.marca ?? ""}`.trim();
    const detected = detectCategoryFromProduct(searchStr);
    if (detected && detected !== input.categoria && detected !== "Outros") {
      categoriaErrada = true;
      categoriaSugerida = detected;
      motivos.push(`Categoria detectada: "${detected}", informada: "${input.categoria}"`);
      if (risco === "baixo") risco = "medio";
      if (sugestaoAcao === "manter") sugestaoAcao = "corrigir_categoria";
    }
  }

  // 4. Duplicate check (DB query — no AI)
  const duplicados = await findDuplicates(input);
  if (duplicados.length > 0) {
    possivelDuplicada = true;
    motivos.push(`Possível duplicata de: #${duplicados.join(", #")}`);
    if (risco === "baixo") risco = "medio";
  }

  // 5. Photo quality (Gemini — only if photo exists and is reasonably sized)
  const hasRealPhoto = input.fotoUrl && input.fotoUrl.length > 200;
  if (hasRealPhoto) {
    const photoCheck = await checkPhotoQuality(input.fotoUrl!, input.produto, input.preco);
    if (photoCheck.fotoRuim) {
      fotoRuim = true;
      motivos.push(photoCheck.motivo);
      if (risco === "baixo") risco = "medio";
    }
  } else if (!input.hasFoto) {
    fotoRuim = true;
    motivos.push("Oferta sem foto — mais difícil de confirmar pela comunidade");
  }

  // 6. Denúncias escalation
  if (input.denuncias >= 3) {
    motivos.push(`${input.denuncias} denúncias registradas`);
    if (risco !== "alto") risco = "medio";
    if (sugestaoAcao === "manter") sugestaoAcao = "marcar_suspeita";
  }

  const motivo =
    motivos.length > 0
      ? motivos.join("; ")
      : "Oferta dentro dos parâmetros esperados";

  // ── Upsert to DB ─────────────────────────────────────────────────────────────
  await db
    .insert(adminOfertaAuditsTable)
    .values({
      ofertaId:               input.id,
      analisadoEm:            new Date(),
      risco,
      motivo,
      sugestaoAcao,
      precoSuspeito,
      categoriaErrada,
      possivelDuplicada,
      fotoRuim,
      categoriaSugerida:       categoriaSugerida ?? null,
      idsDuplicadosSuspeitos:  duplicados.length > 0 ? JSON.stringify(duplicados) : null,
    })
    .onConflictDoUpdate({
      target: adminOfertaAuditsTable.ofertaId,
      set: {
        analisadoEm:            new Date(),
        risco,
        motivo,
        sugestaoAcao,
        precoSuspeito,
        categoriaErrada,
        possivelDuplicada,
        fotoRuim,
        categoriaSugerida:      categoriaSugerida ?? null,
        idsDuplicadosSuspeitos: duplicados.length > 0 ? JSON.stringify(duplicados) : null,
      },
    });

  return {
    risco, motivo, sugestaoAcao,
    precoSuspeito, categoriaErrada, possivelDuplicada, fotoRuim,
    categoriaSugerida, idsDuplicadosSuspeitos: duplicados,
  };
}
