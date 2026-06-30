// @ts-nocheck
/**
 * OCR route — reads a price tag / shelf label image via Gemini vision
 * and extracts product, price, validity, category, brand, unit, tags.
 *
 * POST /api/ocr/placa
 *   Body: { imageBase64: string }
 *   Auth: requireAuth
 *   Returns: OcrResult
 *
 * GET /api/ocr/classificar?produto=xxx
 *   Checks product dictionary first; falls back to local keyword heuristic.
 *   Returns: ClassificarResult
 */
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { ai } from "@workspace/integrations-gemini-ai";
import { openai, openaiConfigured, openaiBaseUrl } from "@workspace/integrations-openai-ai-server";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import { db, produtoDicionarioTable } from "@workspace/db";
import { ilike, desc, sql } from "drizzle-orm";
import { classificaTipoOferta } from "../lib/classifica-tipo";

const router = Router();

// ── Startup: log OpenAI fallback status ─────────────────────────────────────
if (openaiConfigured) {
  logger.info(
    { baseUrl: openaiBaseUrl },
    "OCR: OpenAI fallback configured",
  );
} else {
  logger.warn(
    "OCR: OpenAI fallback NOT configured — set OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY) " +
    "to enable the fallback when Gemini is unavailable",
  );
}

// Max 20 OCR calls per user per 10 min to contain AI spend
const ocrLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas leituras de etiqueta. Aguarde alguns minutos." },
});

export interface OcrResult {
  produto: string | null;
  preco: number | null;
  marca: string | null;
  /** Weight or volume extracted from the label (e.g. "2L", "5kg", "380g"). */
  pesoVolume: string | null;
  categoria: string | null;
  validade: string | null;
  unidade: string | null;
  observacao: string | null;
  tags: string[];
  confiancaCategoria: "alta" | "media" | "baixa" | null;
  confiancaIa: number | null;
  prioridadeVisual: "marca" | "produto" | null;
  sucesso: boolean;
  parcial: boolean;
  mensagem: string;
  /** Where the validade value came from (null = not applicable). */
  validadeOrigem: "ocr" | "padrao" | null;
  /** How confident the OCR is in the validade value. */
  validadeConfianca: "alta" | "media" | "baixa" | null;
  /** If the OCR returned a date but it was ignored, explains why. */
  validadeIgnoradaMotivo: string | null;
  /** Club/loyalty/app price when the label shows a lower price requiring membership. */
  precoClube: number | null;
  /** Name of the loyalty program shown on the label (e.g. "Vuon", "Clube Comper"). */
  programaClubeName: string | null;
  /** Whether the offer has a normal price only, a club price only, or both. */
  tipoPreco: "normal" | "clube" | "ambos" | "desconhecido" | null;
}

export interface ClassificarResult {
  categoria: string | null;
  confianca: "alta" | "media" | "baixa";
  tags: string[];
  fonte: "dicionario" | "local";
}

const CATEGORIES = [
  "Alimentos", "Bebidas", "Limpeza", "Higiene", "Carnes",
  "Hortifruti", "Bebê", "Pet", "Laticínios", "Padaria", "Congelados", "Outros",
];

// ── Local keyword dictionary ───────────────────────────────────────────────────
const LOCAL_KEYWORDS: Record<string, { keywords: string[]; tags: string[] }> = {
  Alimentos:  {
    keywords: ["arroz", "feijao", "feijão", "macarrao", "macarrão", "farinha", "açucar", "acucar", "açúcar", "sal", "oleo", "óleo", "azeite", "café", "cafe", "achocolatado", "biscoito", "bolacha", "margarina", "massa", "caldo", "molho", "extrato", "vinagre", "atum", "sardinha"],
    tags: ["mercearia", "básico"],
  },
  Bebidas: {
    keywords: ["suco", "refrigerante", "agua", "água", "cerveja", "vinho", "energetico", "energético", "isotônico", "isotonico", "coca", "pepsi", "guarana", "guaraná", "nectar", "néctar"],
    tags: ["bebida"],
  },
  Laticínios: {
    keywords: ["leite", "iogurte", "queijo", "requeijao", "requeijão", "creme de leite", "manteiga"],
    tags: ["laticínio", "proteína"],
  },
  Padaria: {
    keywords: ["pão", "pao", "bolo", "torrada", "croissant", "bisnaguinha", "bisnaga", "pãozinho"],
    tags: ["padaria"],
  },
  Limpeza: {
    keywords: ["detergente", "sabão", "sabao", "amaciante", "desinfetante", "agua sanitaria", "limpador", "esponja", "papel higienico", "papel higiênico", "papel toalha", "alcool", "álcool", "multiuso", "tira manchas", "ypê", "ype", "ariel", "ace"],
    tags: ["limpeza"],
  },
  Higiene: {
    keywords: ["shampoo", "condicionador", "sabonete", "creme dental", "escova", "desodorante", "fio dental", "absorvente", "protetor", "hidratante", "perfume", "barbear"],
    tags: ["higiene"],
  },
  Carnes: {
    keywords: ["carne", "frango", "linguiça", "linguica", "salsicha", "presunto", "peito", "costela", "alcatra", "picanha", "filé", "file", "contrafilé", "contrafile", "patinho", "coxao", "coxão", "acém", "acem", "bacon", "camarao", "camarão", "peixe"],
    tags: ["proteína", "açougue"],
  },
  Hortifruti: {
    keywords: ["banana", "maçã", "maca", "laranja", "tomate", "alface", "cebola", "alho", "batata", "cenoura", "limão", "limao", "manga", "uva", "melancia", "abacaxi", "morango", "brocolis", "brócolis", "pepino", "pimentao", "pimentão", "couve", "repolho", "espinafre"],
    tags: ["fresco", "hortifruti"],
  },
  Congelados: {
    keywords: ["congelado", "pizza", "lasanha", "hamburguer", "hambúrguer", "sorvete", "açaí", "acai", "nuggets"],
    tags: ["congelado"],
  },
  Bebê: {
    keywords: ["fralda", "mamadeira", "chupeta", "ninho", "nestogeno", "aptamil", "milupa", "fórmula", "formula infantil"],
    tags: ["bebê", "infantil"],
  },
  Pet: {
    keywords: ["ração", "racao", "petisco", "areia", "antipulgas", "coleira"],
    tags: ["pet", "animal"],
  },
};

export function normalizeTermo(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Context-priority keywords — checked BEFORE the regular LOCAL_KEYWORDS map.
 *
 * This prevents "ração sabor frango" from matching Carnes via "frango" before
 * Pet is checked. The product-type word (ração, iogurte, biscoito…) is always
 * a stronger signal than a flavor/ingredient word (frango, morango, chocolate…).
 * Order matters: first match wins and returns immediately.
 */
const CONTEXT_PRIORITY: Array<{ keywords: string[]; categoria: string; tags: string[] }> = [
  { keywords: ["ração", "racao", "petisco", "areia gato", "areia felina", "antipulgas", "vermifugo", "vermífugo", "coleira antiparasita"], categoria: "Pet",      tags: ["pet", "animal"]   },
  { keywords: ["fralda", "mamadeira", "chupeta", "nestogeno", "aptamil", "milupa", "formula infantil", "leite infantil", "papinha", "mingau infantil"],             categoria: "Bebê",     tags: ["bebê", "infantil"] },
  { keywords: ["iogurte", "yogurt"],                                                                      categoria: "Laticínios", tags: ["laticínio", "proteína"] },
  { keywords: ["sorvete", "gelato", "açaí", "acai", "nuggets", "empanado", "lasanha", "pizza congelada"],categoria: "Congelados", tags: ["congelado"]              },
  { keywords: ["suco", "néctar", "nectar", "refrigerante", "cerveja", "vinho", "energético", "energetico", "isotônico", "isotonico", "ice tea", "chá gelado"],     categoria: "Bebidas",   tags: ["bebida"]            },
  { keywords: ["biscoito", "bolacha", "cookie", "salgadinho", "snack", "wafer"],                          categoria: "Alimentos", tags: ["mercearia"]              },
  { keywords: ["macarrão", "macarrao", "espaguete", "nhoque", "talharim", "fusilli", "penne", "rigatoni"],categoria: "Alimentos", tags: ["mercearia"]              },
  { keywords: ["shampoo", "condicionador", "mascara capilar", "creme de cabelo", "leave-in"],             categoria: "Higiene",   tags: ["higiene"]                },
  { keywords: ["detergente", "amaciante", "desinfetante", "limpador multiuso", "alvejante"],              categoria: "Limpeza",   tags: ["limpeza"]                },
];

/** Fast local keyword classification — no DB, no AI. */
export function classifyLocal(produto: string): ClassificarResult | null {
  const lower = normalizeTermo(produto);

  // 1. Context-priority pass: product-type words always beat flavor/ingredient words.
  //    "ração sabor frango" → Pet (not Carnes), "iogurte morango" → Laticínios (not Hortifruti)
  for (const ctx of CONTEXT_PRIORITY) {
    if (ctx.keywords.some((kw) => lower.includes(normalizeTermo(kw)))) {
      return { categoria: ctx.categoria, confianca: "alta", tags: ctx.tags, fonte: "local" };
    }
  }

  // 2. Regular keyword matching — flavor words (frango, morango…) only match here
  //    when no stronger product-type context was found above.
  for (const [cat, { keywords, tags }] of Object.entries(LOCAL_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(normalizeTermo(kw)))) {
      return { categoria: cat, confianca: "media", tags, fonte: "local" };
    }
  }
  return null;
}

/**
 * Composes the final product display name from OCR fields.
 *
 * Rules:
 * - marca-first (bebidas, higiene, limpeza): "Marca Peso" — skip generic descriptor
 *   "Coca-Cola" + "2L" → "Coca-Cola 2L"
 * - produto-first (arroz, carnes, hortifruti): "Produto Marca Peso"
 *   "Arroz" + "Blue Ville" + "5kg" → "Arroz Blue Ville 5kg"
 */
function composeProdutoNome(
  produto: string | null,
  marca: string | null,
  pesoVolume: string | null,
  prioridadeVisual: "marca" | "produto" | null,
): string | null {
  const peso = pesoVolume?.trim() || null;
  if (prioridadeVisual === "marca" && marca) {
    return [marca, peso].filter(Boolean).join(" ");
  }
  return [produto, marca, peso].filter(Boolean).join(" ") || null;
}

const SYSTEM_PROMPT = `Você é um Agente de Segurança e Extração de Dados do app AiCompensa. Sua função é validar e processar imagens enviadas por usuários em supermercados brasileiros.

FASE 1 — MODERAÇÃO E VALIDAÇÃO (SEGURANÇA):
Antes de extrair qualquer dado, analise se a imagem é segura:
1. Se a imagem contiver nudez, violência, conteúdo ofensivo ou ilegal, retorne imediatamente: {"erro": "conteudo_improprio"}
2. Se a imagem for uma selfie, um meme, ou não mostrar claramente um produto ou etiqueta de preço de varejo, retorne imediatamente: {"erro": "imagem_invalida"}

ETAPA 2 — EXTRAÇÃO DE DADOS (somente se a imagem for válida):
Extraia as seguintes informações da etiqueta ou produto:
1. produto: Tipo genérico do item (ex: "Arroz", "Refrigerante", "Biscoito", "Iogurte"). Não inclua marca nem peso aqui.
2. marca: Marca fabricante (ex: "Tio João", "Coca-Cola", "Danone"). Null se não visível.
3. peso_volume: Peso ou volume da embalagem (ex: "2L", "500ml", "5kg", "380g", "1kg", "200g"). Somente número + unidade. Null se não visível.
4. medida: Unidade de venda da oferta. Use EXATAMENTE um destes valores: "kg", "g", "un", "litro", "ml", "pacote", "caixa", "fardo".

REGRA CRÍTICA:
- Se aparecer "LATA 380G", "380g", "500g", "900g", "1kg", "900ml", "1L", "2L" como tamanho da embalagem, isso NÃO significa que o preço é por grama/ml/kg/litro.
- Nesses casos, a medida deve ser "un", porque o preço é da embalagem inteira.
- Use "kg" somente quando estiver escrito claramente "R$/kg", "/kg", "por kg", "quilo" ou quando for carne/hortifruti vendido por peso.
- Use "g" somente se o preço estiver claramente por grama.
- Use "litro" ou "ml" somente se o preço estiver claramente por litro/ml.
- Para lata, pacote, caixa, garrafa, frasco, pote, unidade fechada: use "un".

Exemplos:
- "Leite Ninho lata 380g R$ 43,99" → medida: "un"
- "Arroz 5kg R$ 27,90" → medida: "un"
- "Óleo 900ml R$ 6,99" → medida: "un"
- "Carne R$ 39,90/kg" → medida: "kg"
- "Banana R$ 4,99 kg" → medida: "kg"
4. preco: Preço normal/geral (sem clube/fidelidade). Se houver DOIS preços na etiqueta, use o MAIOR (o que não exige cadastro). Apenas número decimal (ex: 41.98).
   preco_clube: Preço de clube/fidelidade/app, quando a etiqueta mostrar um preço mais baixo exigindo cadastro/cartão/app. Apenas número decimal, ou null.
   programa_clube: Nome do programa/clube/app exibido na etiqueta (ex: "Vuon", "Clube Comper", "Cliente Mais", "App"), ou null se não identificado.
   tipo_preco: "normal" (apenas preço regular), "ambos" (preço regular + clube), "clube" (apenas preço clube visível), "desconhecido" (incerto).
5. categoria: Uma de: ${CATEGORIES.join(", ")}. Se incerto, use "Outros".
6. confianca_categoria: Sua confiança na categorização — "alta", "media" ou "baixa".
7. tags: Array de até 3 tags curtas e descritivas do produto (ex: ["proteína", "congelado"], ["orgânico"], ["promoção"]). Use strings simples em português. Array vazio [] se não houver tags relevantes.
8. validade: Data de fim da PROMOÇÃO em formato YYYY-MM-DD, ou null. ATENÇÃO CRÍTICA: só preencha se a imagem mostrar EXPLICITAMENTE texto indicando fim da promoção/oferta, como: "válido até", "validade", "oferta válida até", "promoção até", "até dia", "encerra em", "fim da promoção", "vigência até". NÃO use: datas de fabricação, vencimento do produto alimentar (data de vencimento do alimento ≠ validade da oferta), datas de impressão, ou qualquer data sem contexto explícito de validade da PROMOÇÃO. Se houver qualquer dúvida, retorne null.
9. observacao: Informação extra relevante (ex: "preço na compra de 2", "preço por kg"), ou null.
10. confianca_ia: Número de 0 a 1 indicando sua confiança na leitura geral.

Se houver vários produtos, foque no mais centralizado ou em maior destaque.

TRATAMENTO DE ERROS (após passar pela Etapa 1):
- Se não houver etiqueta de preço visível: {"erro": "etiqueta_nao_encontrada"}
- Se a etiqueta existir mas o preço estiver ilegível: {"erro": "preco_ilegivel"}

FORMATO DE SAÍDA QUANDO VÁLIDO:
{
  "produto": "string ou null",
  "marca": "string ou null",
  "peso_volume": "string ou null",
  "medida": "kg" | "g" | "un" | "litro" | "ml" | "pacote" | "caixa" | "fardo" | null,
  "preco": number ou null,
  "preco_clube": number ou null,
  "programa_clube": "string ou null",
  "tipo_preco": "normal" | "ambos" | "clube" | "desconhecido",
  "categoria": "string ou null",
  "confianca_categoria": "alta" | "media" | "baixa",
  "tags": ["string"],
  "validade": "YYYY-MM-DD ou null",
  "observacao": "string ou null",
  "confianca_ia": number,
  "prioridade_visual": "marca" | "produto",
  "validacao": "sucesso"
}

REGRA prioridade_visual:
- "marca": quando a marca é o principal identificador do produto para o consumidor
  (ex: Coca-Cola, Skol, Nestlé, Ypê, Sadia, Ariel — bebidas, limpeza, higiene, laticínios)
- "produto": quando o tipo/corte/variedade é mais relevante que a marca
  (ex: Frango à Passarinho, Picanha, Banana, Melancia — açougue, hortifruti, padaria)

REGRA CRÍTICA — SABORES E INGREDIENTES NÃO SÃO O PRODUTO PRINCIPAL:
Palavras de sabor, ingrediente ou composição NÃO devem se tornar o produto principal.

Hierarquia de extração (da mais para a menos importante):
1. Produto principal — substantivo central: Ração, Iogurte, Biscoito, Suco, Macarrão, Café, Sorvete
2. Marca — identificador da empresa: Dog Chow, Danone, Nestlé, Nissin, Del Valle
3. Sabor/variante (menor peso) — modificador: "sabor frango", "sabor chocolate", "morango"

Exemplos CORRETOS de extração:
- "Ração Dog Chow sabor frango 1kg" → produto: "Ração sabor frango",  marca: "Dog Chow",   peso_volume: "1kg",   categoria: "Pet"
- "Biscoito Trakinas chocolate 100g"→ produto: "Biscoito chocolate",  marca: "Trakinas",   peso_volume: "100g",  categoria: "Alimentos"
- "Iogurte Danone morango 170g"     → produto: "Iogurte morango",     marca: "Danone",     peso_volume: "170g",  categoria: "Laticínios"
- "Suco Del Valle uva 1L"           → produto: "Suco de uva",         marca: "Del Valle",  peso_volume: "1L",    categoria: "Bebidas"
- "Macarrão Nissin queijo 85g"      → produto: "Macarrão queijo",     marca: "Nissin",     peso_volume: "85g",   categoria: "Alimentos"
- "Café Nespresso cápsula 10un"     → produto: "Café em cápsula",     marca: "Nespresso",  peso_volume: "10un",  categoria: "Bebidas"
- "Sorvete Kibon baunilha 1,5L"     → produto: "Sorvete baunilha",   marca: "Kibon",      peso_volume: "1,5L",  categoria: "Congelados"
- "Coca-Cola 2L"                    → produto: "Refrigerante de cola",marca: "Coca-Cola",  peso_volume: "2L",    categoria: "Bebidas"
- "Arroz Blue Ville 5kg"            → produto: "Arroz",               marca: "Blue Ville", peso_volume: "5kg",   categoria: "Alimentos"

Palavras que são SABORES (não o produto principal) quando acompanhadas de produto principal:
frango, carne, chocolate, baunilha, morango, banana, queijo, leite, uva, limão, coco, manga, laranja, goiaba, pêssego, maçã

A CATEGORIA deve refletir o produto principal, não o sabor:
✗ ERRADO: "ração sabor frango"  → categoria "Carnes"      ✓ CORRETO: categoria "Pet"
✗ ERRADO: "iogurte morango"     → categoria "Hortifruti"  ✓ CORRETO: categoria "Laticínios"
✗ ERRADO: "suco uva"            → categoria "Hortifruti"  ✓ CORRETO: categoria "Bebidas"
✗ ERRADO: "biscoito chocolate"  → categoria "Laticínios"  ✓ CORRETO: categoria "Alimentos"

REGRA CRÍTICA — NUNCA ABREVIE OU SUBSTITUA TEXTO VISÍVEL NA IMAGEM:
- Transcreva exatamente o que está escrito na etiqueta. Não substitua por marcas conhecidas.
- Se a etiqueta mostrar "Café moído Brasileiro 500g", o produto é "Café moído Brasileiro 500g" — não "Braz 500g", não "Café Braz".
- Se um texto parecer incompleto ou truncado, prefira incluir o que está legível em vez de completar com suposições.
- O campo "produto" NUNCA pode ser uma sigla, fragmento ou abreviação com ≤ 4 caracteres (ex: "Braz", "Nsc", "BRF"). Se isso acontecer, releia a imagem e extraia o nome completo.

Exemplos de erros a EVITAR:
- ✗ ERRADO: imagem mostra "Café moído Brasileiro" → produto: "Braz 500g"   ✓ CORRETO: produto: "Café moído Brasileiro 500g"
- ✗ ERRADO: imagem mostra "Achocolatado Nescau"   → produto: "Nsc"         ✓ CORRETO: produto: "Achocolatado", marca: "Nescau"
- ✗ ERRADO: produto com apenas 3-4 letras sem ser sigla consagrada (kg, ml) → releia

REGRAS TÉCNICAS: Responda estritamente em JSON. Sem texto explicativo. Sem Markdown.
preco deve ser número decimal com ponto (ex: 4.99). Converta formato brasileiro "14,90" → 14.90.`;

// ─── Price helpers ─────────────────────────────────────────────────────────────

function parsePreco(raw: unknown): number | null {
  if (typeof raw === "number" && raw > 0) return Math.round(raw * 100) / 100;
  if (typeof raw === "string" && raw.length > 0) {
    let cleaned = raw.replace(/R\$\s*/gi, "").replace(/\s/g, "");
    if (cleaned.includes(",")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    }
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0 && parsed < 100_000) {
      return Math.round(parsed * 100) / 100;
    }
  }
  return null;
}

function extractPrecoFromRaw(text: string): number | null {
  const commaPatterns = [
    /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi,
    /(\d{1,3}(?:\.\d{3})*,\d{2})/g,
  ];
  for (const re of commaPatterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      const numStr = (m[1] ?? m[0]).replace(/\./g, "").replace(",", ".");
      const n = parseFloat(numStr);
      if (!isNaN(n) && n > 0 && n < 100_000) return Math.round(n * 100) / 100;
    }
  }
  const dotPattern = /\b(\d{1,5}\.\d{2})\b/g;
  dotPattern.lastIndex = 0;
  const m3 = dotPattern.exec(text);
  if (m3) {
    const n = parseFloat(m3[1] ?? m3[0]);
    if (!isNaN(n) && n > 0 && n < 100_000) return Math.round(n * 100) / 100;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/ocr/classificar — dictionary + local keyword lookup ──────────────
router.get("/ocr/classificar", async (req, res) => {
  const produto = typeof req.query["produto"] === "string" ? req.query["produto"].trim() : "";
  if (!produto || produto.length < 2) {
    res.status(400).json({ error: "Parâmetro 'produto' obrigatório (mínimo 2 caracteres)" });
    return;
  }

  const normalized = normalizeTermo(produto);

  // 1. Check dictionary (DB) — look for terms that match a substring
  try {
    const rows = await db
      .select()
      .from(produtoDicionarioTable)
      .where(ilike(produtoDicionarioTable.termo, `%${normalized}%`))
      .orderBy(desc(produtoDicionarioTable.quantidadeConfirmacoes))
      .limit(1);

    if (rows.length > 0 && rows[0]) {
      const row = rows[0];
      res.json({
        categoria: row.categoria,
        confianca: (row.confianca as "alta" | "media" | "baixa"),
        tags: row.tags ? row.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        fonte: "dicionario",
      } satisfies ClassificarResult);
      return;
    }
  } catch {
    // fallthrough to local
  }

  // 2. Local keyword classification
  const local = classifyLocal(produto);
  if (local) {
    res.json(local);
    return;
  }

  res.json({ categoria: "Outros", confianca: "baixa", tags: [], fonte: "local" } satisfies ClassificarResult);
});

// ── Gemini retry helper (503 / 429 only) ─────────────────────────────────────
const GEMINI_MAX_RETRIES = 2;           // up to 3 total attempts
const GEMINI_BASE_DELAY_MS = 1_000;     // 1 s → 2 s
const GEMINI_JITTER_FACTOR = 0.3;       // ±30 %

function isRetryableGeminiError(err: unknown): boolean {
  const status = (err as { status?: number }).status
    ?? (err as { httpStatusCode?: number }).httpStatusCode;
  return status === 503 || status === 429;
}

async function callGeminiWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  log: { warn: (...a: unknown[]) => void },
): ReturnType<typeof ai.models.generateContent> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      if (attempt < GEMINI_MAX_RETRIES && isRetryableGeminiError(err)) {
        const base = GEMINI_BASE_DELAY_MS * 2 ** attempt;
        const jitter = base * GEMINI_JITTER_FACTOR * (Math.random() * 2 - 1);
        const delay = Math.max(0, Math.round(base + jitter));
        const status = (err as { status?: number }).status
          ?? (err as { httpStatusCode?: number }).httpStatusCode;
        log.warn(
          { attempt: attempt + 1, status, delayMs: delay },
          "OCR: Gemini retryable error — backing off",
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err; // non-retryable → fall through to OpenAI fallback
    }
  }
  throw lastErr; // exhausted retries
}

// ── POST /api/ocr/placa ───────────────────────────────────────────────────────
router.post("/ocr/placa", requireAuth, ocrLimiter, async (req, res) => {
  const { imageBase64 } = req.body as { imageBase64?: string };

  if (!imageBase64 || typeof imageBase64 !== "string") {
    res.status(400).json({ error: "imageBase64 é obrigatório" });
    return;
  }

  let rawBase64: string;
  let mimeType: string = "image/jpeg";

  if (imageBase64.startsWith("data:")) {
    const match = imageBase64.match(/^data:(image\/(?:jpeg|png|webp|jpg));base64,(.+)$/i);
    if (!match) {
      res.status(400).json({ error: "Formato de imagem inválido. Use JPEG, PNG ou WebP." });
      return;
    }
    mimeType = match[1]!.toLowerCase().replace("jpg", "jpeg");
    rawBase64 = match[2]!;
  } else {
    rawBase64 = imageBase64;
  }

  if (!rawBase64 || rawBase64.length < 100) {
    res.status(400).json({ error: "Imagem inválida ou muito pequena." });
    return;
  }

  try {
    const response = await callGeminiWithRetry({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: rawBase64, mimeType } },
            { text: "Analise esta etiqueta de preço de supermercado brasileiro e extraia as informações conforme as instruções. Se houver vários produtos, foque no mais centralizado na imagem." },
          ],
        },
      ],
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        systemInstruction: SYSTEM_PROMPT,
      },
    }, req.log);

    const raw = response.text?.trim() ?? "";
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    let parsed: Record<string, unknown> = {};
    let jsonParseOk = true;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      req.log.warn({ raw }, "OCR: failed to parse Gemini response as JSON — will try regex fallback");
      jsonParseOk = false;
    }

    // ── Handle structured error codes from model ────────────────────────────
    if (parsed["erro"]) {
      const erroCode = parsed["erro"];
      if (erroCode === "conteudo_improprio" || erroCode === "imagem_invalida") {
        req.log.warn({ userId: req.session.userId, erroCode }, "OCR: content safety block");
        res.status(422).json({ error: erroCode });
        return;
      }
      const erroMsg = erroCode === "etiqueta_nao_encontrada"
        ? "Nenhuma etiqueta de preço encontrada. Aponte a câmera para a placa do produto."
        : erroCode === "preco_ilegivel"
          ? "Etiqueta encontrada, mas o preço está ilegível. Tente com melhor iluminação."
          : "Não identificamos nenhuma informação legível. Tente com melhor iluminação ou ângulo.";
      req.log.info({ erroCode }, "OCR: model returned error code");
      res.json({
        produto: null, preco: null, marca: null, pesoVolume: null, categoria: null,
        validade: null, unidade: null, observacao: null, tags: [],
        confiancaCategoria: null, confiancaIa: null, prioridadeVisual: null,
        sucesso: false, parcial: false, mensagem: erroMsg,
        validadeOrigem: null, validadeConfianca: null, validadeIgnoradaMotivo: null,
        precoClube: null, programaClubeName: null, tipoPreco: null,
      } satisfies OcrResult);
      return;
    }

    // ── Extract fields ──────────────────────────────────────────────────────
    const produtoRaw = parsed["produto"];
    // Reject suspiciously short product names (brand fragments like "Braz", "Nsc")
    const produtoTrimmed = typeof produtoRaw === "string" ? produtoRaw.trim() : "";
    const isSuspiciouslyShort = produtoTrimmed.length > 0 && produtoTrimmed.length <= 4
      && !/^(kg|g|ml|un|l)$/i.test(produtoTrimmed);
    if (isSuspiciouslyShort) {
      req.log.warn({ produtoRaw: produtoTrimmed }, "OCR: produto rejeitado por ser muito curto (possível fragmento de marca)");
    }
    const produtoBase = produtoTrimmed.length >= 1 && !isSuspiciouslyShort
      ? produtoTrimmed : null;

    let preco = parsePreco(parsed["preco"]);
    if (preco === null) preco = extractPrecoFromRaw(jsonStr || raw);
    const precoClube     = parsePreco(parsed["preco_clube"]);
    const programaClube  = typeof parsed["programa_clube"] === "string" && parsed["programa_clube"].trim()
      ? parsed["programa_clube"].trim() : null;
    const tipoPrecRaw    = parsed["tipo_preco"];
    const tipoPreco: "normal" | "clube" | "ambos" | "desconhecido" =
      tipoPrecRaw === "normal" || tipoPrecRaw === "clube" || tipoPrecRaw === "ambos"
        ? tipoPrecRaw
        : precoClube !== null ? "ambos" : preco !== null ? "normal" : "desconhecido";

    const marca = typeof parsed["marca"] === "string" && parsed["marca"].trim()
      ? parsed["marca"].trim() : null;

    const pesoVolume = typeof parsed["peso_volume"] === "string" && parsed["peso_volume"].trim()
      ? parsed["peso_volume"].trim() : null;

    const catRaw = typeof parsed["categoria"] === "string" ? parsed["categoria"] : null;
    const categoria = catRaw && CATEGORIES.includes(catRaw) ? catRaw : (catRaw ? "Outros" : null);

    const validadeRaw = typeof parsed["validade"] === "string" ? parsed["validade"] : null;
    let validade: string | null = null;
    let validadeOrigem: "ocr" | "padrao" | null = null;
    let validadeConfianca: "alta" | "media" | "baixa" | null = null;
    let validadeIgnoradaMotivo: string | null = null;

    if (validadeRaw && /^\d{4}-\d{2}-\d{2}$/.test(validadeRaw)) {
      // Treat as end-of-day UTC (same logic as parseValidadeDate in ofertas.ts)
      const validadeDate = new Date(`${validadeRaw}T23:59:59.999Z`);
      const hoje = new Date();
      hoje.setUTCHours(0, 0, 0, 0);

      if (validadeDate < hoje) {
        // Retroactive date — never use, it would immediately expire the offer
        validadeIgnoradaMotivo =
          `OCR detectou data ${validadeRaw} que já passou — ignorada para evitar expiração imediata`;
        validadeOrigem = "padrao";
        validadeConfianca = "baixa";
      } else {
        // Valid future date — use it, confidence is medium (user should confirm)
        validade = validadeRaw;
        validadeOrigem = "ocr";
        validadeConfianca = "media";
      }
    }

    const unidadeRaw = parsed["medida"] ?? parsed["unidade"];
    const unidade = typeof unidadeRaw === "string" && unidadeRaw.trim() ? unidadeRaw.trim() : null;

    const observacao = typeof parsed["observacao"] === "string" && parsed["observacao"].trim()
      ? parsed["observacao"].trim() : null;

    const confiancaIaRaw = parsed["confianca_ia"];
    const confiancaIa = typeof confiancaIaRaw === "number" && confiancaIaRaw >= 0 && confiancaIaRaw <= 1
      ? Math.round(confiancaIaRaw * 100) / 100 : null;

    // Tags — accept array of strings, max 3
    const tagsRaw = parsed["tags"];
    const tags: string[] = Array.isArray(tagsRaw)
      ? tagsRaw.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim().toLowerCase())
          .slice(0, 3)
      : [];

    // Visual priority hint from AI
    const prioridadeVisualRaw = parsed["prioridade_visual"];
    const prioridadeVisual: "marca" | "produto" | null =
      prioridadeVisualRaw === "marca" || prioridadeVisualRaw === "produto"
        ? prioridadeVisualRaw : null;

    // Compose enriched product name: Marca + Peso or Produto + Marca + Peso
    const produto = composeProdutoNome(produtoBase, marca, pesoVolume, prioridadeVisual);

    // Category confidence
    const confCatRaw = parsed["confianca_categoria"];
    const confiancaCategoria: "alta" | "media" | "baixa" | null =
      confCatRaw === "alta" || confCatRaw === "media" || confCatRaw === "baixa"
        ? confCatRaw : null;

    // ── Classify result ─────────────────────────────────────────────────────
    const hasProduto = produto !== null;
    const hasPreco   = preco !== null;
    const sucesso    = hasProduto || hasPreco;
    const parcial    = sucesso && !(hasProduto && hasPreco);

    let mensagem: string;
    if (!sucesso) {
      mensagem = jsonParseOk
        ? "Não identificamos nenhuma informação legível. Tente com melhor iluminação ou ângulo."
        : "Não conseguimos interpretar a resposta. Tente outra foto.";
    } else if (parcial) {
      mensagem = "Detectamos parte das informações. Confira antes de publicar.";
    } else {
      mensagem = "Etiqueta lida com sucesso! Confira antes de publicar.";
    }

    req.log.info({ produto, preco, confiancaIa, sucesso, parcial, jsonParseOk, tags, confiancaCategoria }, "OCR result");

    // Fire-and-forget: update product dictionary if confident
    if (produto && categoria && (confiancaCategoria === "alta" || confiancaCategoria === "media")) {
      const termoNorm = normalizeTermo(produto);
      const tagsStr = tags.length > 0 ? tags.join(",") : null;
      setImmediate(() => {
        db.execute(sql`
          INSERT INTO produto_dicionario (termo, categoria, tags, quantidade_confirmacoes, confianca, fonte, ultima_atualizacao)
          VALUES (${termoNorm}, ${categoria}, ${tagsStr}, 1, ${confiancaCategoria}, 'ia', NOW())
          ON CONFLICT (termo) DO UPDATE SET
            categoria = EXCLUDED.categoria,
            tags = EXCLUDED.tags,
            quantidade_confirmacoes = produto_dicionario.quantidade_confirmacoes + 1,
            confianca = CASE WHEN produto_dicionario.quantidade_confirmacoes >= 4 THEN 'alta'
                             WHEN produto_dicionario.quantidade_confirmacoes >= 1 THEN 'media'
                             ELSE 'baixa' END,
            ultima_atualizacao = NOW()
        `).catch(() => {});
      });
    }

    const result: OcrResult = {
      produto, preco, marca, pesoVolume, categoria, validade, unidade, observacao,
      tags, confiancaCategoria, confiancaIa, prioridadeVisual,
      sucesso, parcial, mensagem,
      validadeOrigem, validadeConfianca, validadeIgnoradaMotivo,
      precoClube, programaClubeName: programaClube, tipoPreco,
    };

    res.json(result);
  } catch (err) {
  const geminiStatus = (err as { status?: number }).status
    ?? (err as { httpStatusCode?: number }).httpStatusCode
    ?? null;
  const geminiMessage = err instanceof Error ? err.message : String(err);
  const detail = geminiMessage;

  logger.error(
    { err, status: geminiStatus, message: geminiMessage },
    "OCR: Gemini failed after retries, trying OpenAI fallback",
  );

  // Guard: skip fallback if OpenAI is not configured (no API key)
  if (!openai) {
    logger.warn("OCR: OpenAI fallback skipped — no API key configured");
    res.status(500).json({
      error: "ocr_failed",
      detail: "Gemini failed and OpenAI fallback is not configured.",
      produto: null,
      preco: null,
      marca: null,
      pesoVolume: null,
      categoria: null,
      validade: null,
      unidade: null,
      observacao: null,
      tags: [],
      confiancaCategoria: null,
      confiancaIa: null,
      prioridadeVisual: null,
      sucesso: false,
      parcial: false,
      mensagem: "Não foi possível ler os dados automaticamente. Tente novamente.",
      validadeOrigem: null,
      validadeConfianca: null,
      validadeIgnoradaMotivo: null,
      precoClube: null,
      programaClubeName: null,
      tipoPreco: null,
    } satisfies OcrResult);
    return;
  }

  try {
    const fallback = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analise esta etiqueta de preço de supermercado brasileiro. Extraia produto, preco, marca, categoria, validade, unidade, observacao, tags, confianca_ia, prioridade_visual e confianca_categoria. Responda somente JSON.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${rawBase64}`,
              },
            },
          ],
        },
      ],
    });

    const raw = fallback.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw);

    const precoFallback =
      typeof parsed.preco === "number"
        ? parsed.preco
        : parsed.preco
          ? Number(String(parsed.preco).replace("R$", "").replace(".", "").replace(",", ".").trim())
          : null;

    const fbMarca = typeof parsed.marca === "string" && parsed.marca.trim() ? parsed.marca.trim() : null;
    const fbPesoVolume = typeof parsed.peso_volume === "string" && parsed.peso_volume.trim() ? parsed.peso_volume.trim() : null;
    const fbPrioridade = parsed.prioridade_visual === "marca" || parsed.prioridade_visual === "produto" ? parsed.prioridade_visual : null;
    const fbProdutoBase = typeof parsed.produto === "string" && parsed.produto.trim() ? parsed.produto.trim() : null;
    const fbProduto = composeProdutoNome(fbProdutoBase, fbMarca, fbPesoVolume, fbPrioridade);

    const fbPrecoClube    = typeof parsed.preco_clube === "number" && parsed.preco_clube > 0 ? parsed.preco_clube : null;
    const fbProgramaClube = typeof parsed.programa_clube === "string" && parsed.programa_clube.trim() ? parsed.programa_clube.trim() : null;
    const fbTipoPreco: "normal" | "clube" | "ambos" | "desconhecido" =
      parsed.tipo_preco === "normal" || parsed.tipo_preco === "clube" || parsed.tipo_preco === "ambos"
        ? parsed.tipo_preco
        : fbPrecoClube !== null ? "ambos" : "normal";
    res.json({
      produto: fbProduto,
      preco: Number.isFinite(precoFallback) ? precoFallback : null,
      marca: fbMarca,
      pesoVolume: fbPesoVolume,
      categoria: parsed.categoria ?? null,
      validade: parsed.validade ?? null,
      unidade: parsed.unidade ?? null,
      observacao: parsed.observacao ?? null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
      confiancaCategoria: parsed.confianca_categoria ?? null,
      confiancaIa: parsed.confianca_ia ?? null,
      prioridadeVisual: fbPrioridade,
      sucesso: !!(fbProduto || precoFallback),
      parcial: !(fbProduto && precoFallback),
      mensagem: "Etiqueta lida com IA reserva. Confira antes de publicar.",
      validadeOrigem: null,
      validadeConfianca: null,
      validadeIgnoradaMotivo: null,
      precoClube: fbPrecoClube,
      programaClubeName: fbProgramaClube,
      tipoPreco: fbTipoPreco,
    } satisfies OcrResult);
    return;
  } catch (fallbackErr) {
    const oaiStatus = (fallbackErr as { status?: number }).status ?? null;
    const oaiMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    const oaiCode = (fallbackErr as { code?: string }).code ?? null;
    logger.error(
      { fallbackErr, status: oaiStatus, message: oaiMessage, code: oaiCode },
      "OCR: OpenAI fallback failed",
    );

    res.status(500).json({
      error: "ocr_failed",
      detail,
      produto: null,
      preco: null,
      marca: null,
      pesoVolume: null,
      categoria: null,
      validade: null,
      unidade: null,
      observacao: null,
      tags: [],
      confiancaCategoria: null,
      confiancaIa: null,
      prioridadeVisual: null,
      sucesso: false,
      parcial: false,
      mensagem: "Não foi possível ler os dados automaticamente. Tente novamente.",
      validadeOrigem: null,
      validadeConfianca: null,
      validadeIgnoradaMotivo: null,
      precoClube: null,
      programaClubeName: null,
      tipoPreco: null,
    } satisfies OcrResult);
  }
}
});

// ── POST /api/ocr/classifica-tipo ─────────────────────────────────────────────
// Classifies an image as "presencial" or "encarte" with a confidence score.
// Used by the publish form to pre-fill the tipo selector before submission.
router.post("/ocr/classifica-tipo", requireAuth, ocrLimiter, async (req, res) => {
  const { imageBase64 } = req.body as { imageBase64?: string };

  if (!imageBase64 || typeof imageBase64 !== "string") {
    res.status(400).json({ error: "imageBase64 é obrigatório" });
    return;
  }

  const result = await classificaTipoOferta(imageBase64);
  req.log.info({ tipo: result.tipo, confianca: result.confianca }, "classifica-tipo result");
  res.json(result);
});

export default router;
