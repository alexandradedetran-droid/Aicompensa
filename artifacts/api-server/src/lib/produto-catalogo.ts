// @ts-nocheck
import { db, produtosTable } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { ai, generateImage } from "@workspace/integrations-gemini-ai";

const BUCKET = "Oferta-fotos";
const ALIAS_MAX = 20;
const CONFIANCA_MIN_AGRESSIVA = 70;

// ── Retry helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Delays between attempts 2, 3, 4 (attempt 1 is always immediate)
const GERACAO_BACKOFFS = [1_000, 2_000, 4_000]; // 4 tentativas total
const UPLOAD_BACKOFFS  = [2_000, 4_000];          // 3 tentativas total

async function withRetry<T>(
  fn: () => Promise<T>,
  backoffs: number[],
  label: string,
): Promise<T> {
  const maxAttempts = backoffs.length + 1;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = backoffs[attempt - 1]!;
        console.warn(
          `[catalogo] ${label} falhou (tentativa ${attempt}/${maxAttempts}): ${msg}. Retry em ${delay}ms...`,
        );
        await sleep(delay);
      } else {
        console.error(
          `[catalogo] ${label} falhou definitivamente após ${maxAttempts} tentativas. Último erro: ${msg}`,
        );
      }
    }
  }
  throw lastErr;
}

// ── Concurrency limiter + in-memory queue ─────────────────────────────────────

const MAX_CONCURRENT_GENERATIONS = 5;
const MAX_QUEUE_SIZE = 50;
let _activeGenerations = 0;

interface _FilaItem {
  id: string;
  nome: string;
  categoria?: string | null;
  imagemPremiumUrl?: string | null;
  statusImagem: string;
}

const _filaGeracao: _FilaItem[] = [];
const _idsNaFila = new Set<string>();

async function _processarProximoDaFila(): Promise<void> {
  if (_activeGenerations >= MAX_CONCURRENT_GENERATIONS || _filaGeracao.length === 0) return;

  const proximo = _filaGeracao.shift()!;
  _idsNaFila.delete(proximo.id);
  console.log(
    `[catalogo] produto saiu da fila: "${proximo.nome}" (${proximo.id}) [fila restante: ${_filaGeracao.length}]`,
  );

  const [atual] = await db
    .select({ statusImagem: produtosTable.statusImagem, imagemPremiumUrl: produtosTable.imagemPremiumUrl })
    .from(produtosTable)
    .where(eq(produtosTable.id, proximo.id))
    .limit(1);

  if (!atual || atual.statusImagem !== "pendente" || atual.imagemPremiumUrl) {
    console.log(
      `[catalogo] produto da fila ignorado (status atual: ${atual?.statusImagem ?? "não encontrado"}): "${proximo.nome}" (${proximo.id})`,
    );
    _processarProximoDaFila().catch(() => {});
    return;
  }

  gerarImagemPremiumProduto({ ...proximo, statusImagem: "pendente", imagemPremiumUrl: null }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[catalogo] erro ao processar produto da fila "${proximo.nome}" (${proximo.id}): ${msg}`);
  });
}

// ── Prompt sanitization ───────────────────────────────────────────────────────

function sanitizarNomeParaPrompt(nome: string): string {
  return nome
    // Remove quebras de linha e tabs — vetores primários de prompt injection
    .replace(/[\r\n\t]/g, " ")
    // Mantém apenas caracteres seguros (inclui diacríticos do português)
    .replace(/[^\w\s\-.,()áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarSegmento(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

// ── Fingerprint ───────────────────────────────────────────────────────────────

export function buildProdutoFingerprint(parts: {
  marca?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  nomeCanonico?: string | null;
  quantidade?: string | null;
  unidade?: string | null;
  embalagem?: string | null;
}): string | null {
  if (!parts.nomeCanonico) return null;
  const n = normalizarSegmento;
  return [
    parts.marca        ? n(parts.marca)        : "",
    parts.categoria    ? n(parts.categoria)    : "",
    parts.subcategoria ? n(parts.subcategoria) : "",
    n(parts.nomeCanonico),
    parts.quantidade   ?? "",
    parts.unidade      ? n(parts.unidade)      : "",
    parts.embalagem    ? n(parts.embalagem)    : "",
  ].join("|");
}

// ── IA identification ─────────────────────────────────────────────────────────

interface IdentificacaoIA {
  nomeCanonico: string;
  marca: string | null;
  categoria: string;
  subcategoria: string | null;
  embalagem: string | null;
  quantidade: number | null;
  unidade: string | null;
  aliases: string[];
  confianca: number;
}

const IDENTIFICACAO_SYSTEM_PROMPT = `Você é um sistema de identificação de produtos de supermercado brasileiro.
Dado o nome de um produto (e opcionalmente marca, categoria, unidade, quantidade), identifique o produto canonicamente.

Responda APENAS com JSON válido no seguinte formato (sem texto extra fora do JSON):
{
  "nomeCanonico": "Nome padronizado e completo",
  "marca": "Marca do fabricante ou null",
  "categoria": "Categoria",
  "subcategoria": "Subcategoria ou null",
  "embalagem": "Tipo de embalagem ou null",
  "quantidade": 5,
  "unidade": "kg",
  "aliases": ["variação 1", "variação 2"],
  "confianca": 90
}

CATEGORIAS VÁLIDAS: Mercearia, Hortifruti, Laticínios, Carnes, Bebidas, Limpeza, Higiene, Padaria, Frios, Congelados, Outros

UNIDADES VÁLIDAS: kg, g, L, ml, un, pacote, caixa, garrafa, lata, bandeja, dúzia

REGRAS:
- Não inventar marca quando não há evidência clara no nome informado
- Hortifruti e açougue podem ficar sem marca (genérico é válido)
- aliases: máximo 10 variações do mesmo produto (formas alternativas de escrever)
- Produtos diferentes NÃO têm o mesmo nomeCanonico:
  * "Coca-Cola 2L" ≠ "Coca-Cola Zero 2L"
  * "Leite Integral 1L" ≠ "Leite Desnatado 1L"
- quantidade deve ser número puro sem unidade (5 para "5kg"), ou null se não identificável
- confianca: inteiro 0–100 (100 = certeza absoluta)`;

async function identificarProdutoComIA(input: {
  produto: string;
  categoria?: string | null;
  unidade?: string | null;
  quantidade?: string | null;
  marca?: string | null;
}): Promise<IdentificacaoIA | null> {
  const partes = [
    `Produto: "${input.produto}"`,
    input.marca      ? `Marca informada: ${input.marca}`      : null,
    input.categoria  ? `Categoria informada: ${input.categoria}` : null,
    input.unidade    ? `Unidade informada: ${input.unidade}`  : null,
    input.quantidade ? `Quantidade informada: ${input.quantidade}` : null,
  ].filter(Boolean).join("\n");

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: IDENTIFICACAO_SYSTEM_PROMPT,
        temperature: 0.1,
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts: [{ text: partes }] }],
    });

    const raw = result.text?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[catalogo] IA sem JSON para "${input.produto}": ${raw.slice(0, 200)}`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<IdentificacaoIA>;

    if (!parsed.nomeCanonico || typeof parsed.nomeCanonico !== "string") {
      console.warn(`[catalogo] IA retornou nomeCanonico inválido para "${input.produto}"`);
      return null;
    }

    const identificacao: IdentificacaoIA = {
      nomeCanonico: parsed.nomeCanonico,
      marca:        typeof parsed.marca === "string"        ? parsed.marca        : null,
      categoria:    typeof parsed.categoria === "string"    ? parsed.categoria    : (input.categoria ?? "Outros"),
      subcategoria: typeof parsed.subcategoria === "string" ? parsed.subcategoria : null,
      embalagem:    typeof parsed.embalagem === "string"    ? parsed.embalagem    : null,
      quantidade:   typeof parsed.quantidade === "number"   ? parsed.quantidade   : null,
      unidade:      typeof parsed.unidade === "string"      ? parsed.unidade      : null,
      aliases:      Array.isArray(parsed.aliases)
        ? (parsed.aliases as unknown[]).filter((a): a is string => typeof a === "string").slice(0, 10)
        : [],
      confianca:    typeof parsed.confianca === "number"
        ? Math.min(100, Math.max(0, Math.round(parsed.confianca)))
        : 50,
    };

    console.log(`[catalogo] IA identificou "${input.produto}" → "${identificacao.nomeCanonico}" (confiança: ${identificacao.confianca}%)`);
    return identificacao;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[catalogo] identificarProdutoComIA falhou para "${input.produto}": ${msg}`);
    return null;
  }
}

// ── Alias management ──────────────────────────────────────────────────────────

function construirAliases(existentes: string[], novos: (string | null | undefined)[]): string[] | null {
  const base = Array.isArray(existentes) ? existentes : [];
  const adicionais = novos
    .filter((a): a is string => typeof a === "string" && a.length > 0)
    .map(normalizarNome)
    .filter((a) => !base.includes(a));

  if (adicionais.length === 0) return null;
  return [...base, ...adicionais].slice(0, ALIAS_MAX);
}

// ── Image generation (unchanged) ─────────────────────────────────────────────

function buildPromptImagem(nome: string, categoria?: string | null): string {
  const nomeSeguro = sanitizarNomeParaPrompt(nome);
  const cat = categoria ? `, categoria ${categoria}` : "";
  return (
    `Fotografia de e-commerce de alta qualidade: ${nomeSeguro}${cat}. ` +
    `Produto centralizado, fundo branco puro, iluminação suave de estúdio, ` +
    `estilo fotorrealista, embalagem fiel ao produto, produto ocupando 80% da imagem. ` +
    `Sem texto, sem preço, sem pessoas, sem prateleiras de mercado, sem elementos extras.`
  );
}

async function uploadProdutoImagemToStorage(
  b64_json: string,
  mimeType: string,
  produtoId: string,
): Promise<string> {
  return withRetry(
    async () => {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) throw new Error("Supabase não configurado");

      const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
      const path = `produtos/${produtoId}.${ext}`;
      const buffer = Buffer.from(b64_json, "base64");

      const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": mimeType,
          "x-upsert": "true",
        },
        body: buffer,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "(no body)");
        throw new Error(`Upload falhou: ${response.status} ${body}`);
      }

      return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
    },
    UPLOAD_BACKOFFS,
    `uploadProdutoImagem(${produtoId})`,
  );
}

export async function gerarImagemPremiumProduto(produto: {
  id: string;
  nome: string;
  categoria?: string | null;
  imagemPremiumUrl?: string | null;
  statusImagem: string;
}): Promise<void> {
  if (produto.imagemPremiumUrl || produto.statusImagem !== "pendente") return;

  if (_activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
    if (_idsNaFila.has(produto.id)) {
      console.log(`[catalogo] produto já está na fila: "${produto.nome}" (${produto.id})`);
      return;
    }
    if (_filaGeracao.length >= MAX_QUEUE_SIZE) {
      console.warn(
        `[catalogo] fila cheia (${MAX_QUEUE_SIZE} itens): geração descartada para "${produto.nome}" (${produto.id})`,
      );
      return;
    }
    _filaGeracao.push(produto);
    _idsNaFila.add(produto.id);
    console.log(
      `[catalogo] produto entrou na fila: "${produto.nome}" (${produto.id}) [posição: ${_filaGeracao.length}/${MAX_QUEUE_SIZE}]`,
    );
    return;
  }

  _activeGenerations++;

  try {
    await db
      .update(produtosTable)
      .set({ statusImagem: "gerando", atualizadoEm: new Date() })
      .where(eq(produtosTable.id, produto.id));

    const prompt = buildPromptImagem(produto.nome, produto.categoria);

    console.log(
      `[catalogo] iniciando geração de imagem premium para "${produto.nome}" (${produto.id})` +
      ` [gerações ativas: ${_activeGenerations}/${MAX_CONCURRENT_GENERATIONS}]`,
    );

    const { b64_json, mimeType } = await withRetry(
      () => generateImage(prompt),
      GERACAO_BACKOFFS,
      `gerarImagem("${produto.nome}")`,
    );

    const url = await uploadProdutoImagemToStorage(b64_json, mimeType, produto.id);

    await db
      .update(produtosTable)
      .set({
        imagemPremiumUrl: url,
        promptImagem: prompt,
        statusImagem: "pronta",
        atualizadoEm: new Date(),
      })
      .where(eq(produtosTable.id, produto.id));

    console.log(`[catalogo] imagem premium pronta para "${produto.nome}" → ${url}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[catalogo] falha definitiva na geração de imagem para "${produto.nome}" (${produto.id})` +
      ` após todas as tentativas: ${msg}`,
    );

    await db
      .update(produtosTable)
      .set({ statusImagem: "erro", atualizadoEm: new Date() })
      .where(eq(produtosTable.id, produto.id))
      .catch((dbErr) => {
        const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error(
          `[catalogo] falha ao registrar status "erro" para produto ${produto.id}: ${dbMsg}`,
        );
      });
  } finally {
    _activeGenerations--;
    _processarProximoDaFila().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[catalogo] erro ao processar fila de geração: ${msg}`);
    });
  }
}

// ── Startup recovery ─────────────────────────────────────────────────────────

export async function recuperarProdutosPresos(): Promise<void> {
  const dezMinutosAtras = new Date(Date.now() - 10 * 60 * 1_000);

  const result = await db
    .update(produtosTable)
    .set({ statusImagem: "erro", atualizadoEm: new Date() })
    .where(
      and(
        eq(produtosTable.statusImagem, "gerando"),
        lt(produtosTable.atualizadoEm, dezMinutosAtras),
      ),
    )
    .returning({ id: produtosTable.id });

  if (result.length > 0) {
    console.warn(
      `[catalogo] ${result.length} produto(s) preso(s) em "gerando" há mais de 10 min → marcados como "erro"`,
    );
  } else {
    console.log(`[catalogo] nenhum produto preso em "gerando" encontrado na inicialização`);
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function findOrCreateProdutoFromOferta({
  produto,
  unidade,
  categoria,
  marca,
  fotoUrl,
}: {
  produto: string;
  unidade?: string | null;
  categoria?: string | null;
  marca?: string | null;
  fotoUrl?: string | null;
}) {
  const nomeNormalizado = normalizarNome(produto);
  const now = new Date();

  // ── Step 0: IA identification ─────────────────────────────────────────────
  const ia = await identificarProdutoComIA({ produto, categoria, unidade, marca }).catch(() => null);
  const confiancaAlta = (ia?.confianca ?? 0) >= CONFIANCA_MIN_AGRESSIVA;

  const fingerprint = confiancaAlta
    ? buildProdutoFingerprint({
        marca:        ia!.marca,
        categoria:    ia!.categoria,
        subcategoria: ia!.subcategoria,
        nomeCanonico: ia!.nomeCanonico,
        quantidade:   ia!.quantidade?.toString() ?? null,
        unidade:      ia!.unidade,
        embalagem:    ia!.embalagem,
      })
    : null;

  if (!ia) {
    console.log(`[catalogo] IA falhou — usando matching conservador para "${produto}"`);
  } else if (!confiancaAlta) {
    console.log(`[catalogo] confiança baixa (${ia.confianca}%) — matching conservador para "${produto}"`);
  } else {
    console.log(`[catalogo] fingerprint gerado: ${fingerprint}`);
  }

  // ── Steps 1-4: matching in priority order ─────────────────────────────────
  let existing: typeof produtosTable.$inferSelect | null = null;
  let estrategia = "";

  // Step 1: fingerprint exato (apenas se confiança alta)
  if (!existing && fingerprint) {
    const [row] = await db
      .select()
      .from(produtosTable)
      .where(eq(produtosTable.produtoFingerprint, fingerprint))
      .limit(1);
    if (row) { existing = row; estrategia = "fingerprint"; }
  }

  // Step 2: aliases contém nomeNormalizado
  if (!existing && confiancaAlta) {
    const [row] = await db
      .select()
      .from(produtosTable)
      .where(sql`${produtosTable.aliases} @> cast(${JSON.stringify([nomeNormalizado])} as jsonb)`)
      .limit(1);
    if (row) { existing = row; estrategia = "alias"; }
  }

  // Step 3: nomeCanonico da IA normalizado bate com nomeNormalizado existente
  if (!existing && ia?.nomeCanonico && confiancaAlta) {
    const nomeCaononicoNorm = normalizarNome(ia.nomeCanonico);
    if (nomeCaononicoNorm !== nomeNormalizado) {
      const [row] = await db
        .select()
        .from(produtosTable)
        .where(eq(produtosTable.nomeNormalizado, nomeCaononicoNorm))
        .limit(1);
      if (row) { existing = row; estrategia = "nomeCanonico"; }
    }
  }

  // Step 4: nomeNormalizado (compatibilidade com produtos antigos)
  if (!existing) {
    const [row] = await db
      .select()
      .from(produtosTable)
      .where(eq(produtosTable.nomeNormalizado, nomeNormalizado))
      .limit(1);
    if (row) { existing = row; estrategia = "nomeNormalizado"; }
  }

  // ── Found existing product ────────────────────────────────────────────────
  if (existing) {
    console.log(`[catalogo] produto existente encontrado via ${estrategia}: "${produto}" → "${existing.nomeCanonico ?? existing.nome}"`);

    const novosAliases = construirAliases(
      existing.aliases as string[],
      [nomeNormalizado, ia?.nomeCanonico ? normalizarNome(ia.nomeCanonico) : null],
    );
    if (novosAliases) {
      console.log(`[catalogo] alias adicionado a "${existing.nome}": ${JSON.stringify(novosAliases.slice(-2))}`);
    }

    const updates: Record<string, unknown> = {
      totalOfertas: sql`${produtosTable.totalOfertas} + 1`,
      ultimaOfertaEm: now,
      atualizadoEm: now,
    };

    if (novosAliases)                               updates.aliases = novosAliases;
    if (!existing.nomeCanonico && ia?.nomeCanonico) updates.nomeCanonico = ia.nomeCanonico;
    if (!existing.produtoFingerprint && fingerprint) updates.produtoFingerprint = fingerprint;
    if (!existing.embalagem && ia?.embalagem)       updates.embalagem = ia.embalagem;
    if (!existing.confiancaIA && ia?.confianca)     updates.confiancaIA = ia.confianca;
    if (!existing.subcategoria && ia?.subcategoria) updates.subcategoria = ia.subcategoria;
    if (!existing.marca && ia?.marca)               updates.marca = ia.marca;

    await db.update(produtosTable).set(updates).where(eq(produtosTable.id, existing.id));
    return existing;
  }

  // ── Create new product ────────────────────────────────────────────────────
  const aliasesIniciais = [
    ...new Set([
      nomeNormalizado,
      ia?.nomeCanonico ? normalizarNome(ia.nomeCanonico) : null,
      ...(ia?.aliases?.map(normalizarNome) ?? []),
    ].filter((a): a is string => typeof a === "string" && a.length > 0)),
  ].slice(0, ALIAS_MAX);

  const [created] = await db
    .insert(produtosTable)
    .values({
      nome:               produto,
      nomeNormalizado,
      nomeCanonico:       ia?.nomeCanonico ?? null,
      marca:              ia?.marca ?? marca ?? null,
      categoria:          ia?.categoria ?? categoria ?? null,
      subcategoria:       ia?.subcategoria ?? null,
      embalagem:          ia?.embalagem ?? null,
      quantidade:         ia?.quantidade?.toString() ?? null,
      unidade:            ia?.unidade ?? unidade ?? null,
      aliases:            aliasesIniciais,
      confiancaIA:        ia?.confianca ?? null,
      produtoFingerprint: fingerprint ?? null,
      imagemOriginalUrl:  fotoUrl ?? null,
      statusImagem:       "pendente",
      totalOfertas:       1,
      primeiraOfertaEm:   now,
      ultimaOfertaEm:     now,
    })
    .returning();

  console.log(
    `[catalogo] novo produto criado: "${produto}" → "${ia?.nomeCanonico ?? produto}"` +
    ` (fingerprint: ${fingerprint ?? "n/a"}, confiança: ${ia?.confianca ?? "n/a"}%)`,
  );

  return created!;
}
