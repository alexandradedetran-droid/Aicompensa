/**
 * Comper Relay — roda LOCALMENTE (Windows) para contornar bloqueio Cloudflare no Railway.
 *
 * Fluxo:
 *   1. Lê WordPress Media API de ofertas.comper.com.br (acessível do Windows)
 *   2. Filtra encartes MT (Mato Grosso)
 *   3. Baixa as imagens localmente
 *   4. Envia para Railway via POST /admin/ofertabot/sources/:id/relay-comper
 *
 * Uso:
 *   tsx scripts/src/comper-relay.ts [sourceId]
 *   sourceId padrão = 7 (Comper #7 em produção)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Carrega .env do diretório scripts/ sem depender de dotenv
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(resolve(__dir, "../.env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2]!.trim();
  }
} catch { /* .env opcional */ }

const RAILWAY_URL = process.env["RAILWAY_URL"] ?? "https://workspaceapi-server-production-8491.up.railway.app";
const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "";
const BOT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const WP_MEDIA_API = "https://ofertas.comper.com.br/wp-json/wp/v2/media";
const WP_SOURCE_URL = "https://ofertas.comper.com.br/cidade/cuiaba-mt/";

if (!ADMIN_TOKEN) {
  console.error("❌ ADMIN_TOKEN não definido. Crie scripts/.env com ADMIN_TOKEN=...");
  process.exit(1);
}

const sourceId = Number(process.argv[2] ?? "7");

interface WpMediaItem {
  source_url: string;
  slug: string;
}

interface RelayPage {
  index: number;
  url: string;
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeKb: number;
  isUseful: boolean;
}

interface RelayEncarte {
  nome: string;
  titulo: string;
  validade: string | null;
  pages: RelayPage[];
}

async function fetchWpMediaPage(page: number): Promise<WpMediaItem[]> {
  const url = `${WP_MEDIA_API}?per_page=100&_fields=source_url,slug&search=MT_COMPER&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": BOT_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`WP API retornou HTTP ${res.status} para ${url}`);
  return res.json() as Promise<WpMediaItem[]>;
}

function groupByEncarte(items: WpMediaItem[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    if (!item.slug.match(/^mt_/i) || !item.slug.includes("_page-")) continue;
    const basename = item.source_url.split("/").pop()?.split("?")[0] ?? "";
    const key = basename.replace(/_page-\d+\.jpe?g$/i, "");
    if (!key || !key.toUpperCase().includes("COMPER")) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item.source_url.split("?")[0]!);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      const nA = parseInt(a.match(/_page-(\d+)/)?.[1] ?? "0", 10);
      const nB = parseInt(b.match(/_page-(\d+)/)?.[1] ?? "0", 10);
      return nA - nB;
    });
  }
  return groups;
}

function parseValidadeFromKey(key: string): string | null {
  const m = key.match(/(\d{2})-a-(\d{2})_(\d{2})_(\d{2})$/);
  if (!m) return null;
  const [, , endDay, month, yr] = m;
  return `${2000 + parseInt(yr!, 10)}-${month!.padStart(2, "0")}-${endDay!.padStart(2, "0")}`;
}

function humanizeTitulo(key: string): string {
  const m = key.match(/COMPER[-_](.+?)[-_](\d{2})-a-(\d{2})_(\d{2})_(\d{2})$/i);
  if (m) {
    const desc = m[1]!.replace(/^-+|-+$/g, "").replace(/-/g, " ").trim();
    const [, , startDay, endDay, month, yr] = m;
    return `Comper — ${desc} (${startDay}/${month} a ${endDay}/${month}/${yr})`;
  }
  return `Comper — ${key}`;
}

async function downloadImage(url: string, index: number): Promise<RelayPage | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`  ⚠ HTTP ${res.status} ao baixar ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const sizeKb = Math.round(buf.length / 1024);
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType: RelayPage["mimeType"] = ct.includes("png") ? "image/png"
      : ct.includes("webp") ? "image/webp"
      : "image/jpeg";
    return {
      index,
      url,
      base64: buf.toString("base64"),
      mimeType,
      sizeKb,
      isUseful: sizeKb > 5,
    };
  } catch (err) {
    console.warn(`  ⚠ Erro ao baixar ${url}: ${err}`);
    return null;
  }
}

async function main() {
  console.log(`\n🔄 Comper Relay — source #${sourceId}`);
  console.log(`   WP Media API: ${WP_MEDIA_API}`);
  console.log(`   Railway: ${RAILWAY_URL}\n`);

  // 1. Buscar itens na WP Media API
  console.log("📡 Buscando itens na WordPress Media API...");
  const items: WpMediaItem[] = [];
  const page1 = await fetchWpMediaPage(1);
  items.push(...page1);
  console.log(`   Página 1: ${page1.length} itens`);
  if (page1.length === 100) {
    const page2 = await fetchWpMediaPage(2);
    items.push(...page2);
    console.log(`   Página 2: ${page2.length} itens`);
  }

  // 2. Agrupar por encarte
  const grouped = groupByEncarte(items);
  console.log(`\n📦 ${grouped.size} encartes MT encontrados:`);
  for (const [key, urls] of grouped) {
    console.log(`   • ${key} (${urls.length} páginas)`);
  }

  if (grouped.size === 0) {
    console.log("\n❌ Nenhum encarte MT encontrado. Encerrando.");
    process.exit(1);
  }

  // 3. Baixar imagens e montar payload
  const relayEncartes: RelayEncarte[] = [];

  for (const [key, imageUrls] of grouped) {
    const titulo = humanizeTitulo(key);
    console.log(`\n📥 Baixando "${titulo}" (${imageUrls.length} páginas)...`);

    const pages: RelayPage[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i]!;
      process.stdout.write(`   [${i + 1}/${imageUrls.length}] ${url.split("/").pop()} — `);
      const page = await downloadImage(url, i);
      if (page) {
        console.log(`${page.sizeKb}KB ✓`);
        pages.push(page);
      } else {
        console.log("FALHOU");
      }
    }

    const usefulCount = pages.filter(p => p.isUseful).length;
    if (usefulCount === 0) {
      console.log(`   ⚠ Nenhuma página útil — encarte ignorado`);
      continue;
    }

    relayEncartes.push({
      nome: key,
      titulo,
      validade: parseValidadeFromKey(key),
      pages,
    });
  }

  if (relayEncartes.length === 0) {
    console.log("\n❌ Nenhum encarte com páginas úteis. Encerrando.");
    process.exit(1);
  }

  // 4. Enviar para Railway — em lotes de até MAX_PAGES_PER_CHUNK páginas para evitar
  //    timeout/reset de conexão do proxy Railway (limite empírico ~8MB por requisição).
  const MAX_PAGES_PER_CHUNK = 4;
  let totalProcessados = 0, totalDuplicados = 0, totalErros = 0;

  async function sendChunk(chunkEncarte: RelayEncarte, chunkIndex?: number): Promise<void> {
    const sizeKb = chunkEncarte.pages.reduce((s, p) => s + p.sizeKb, 0);
    const payloadSizeKb = Math.round(sizeKb * 1.37); // base64 overhead ~37%
    const label = chunkIndex !== undefined
      ? `"${chunkEncarte.titulo}" chunk ${chunkIndex + 1}`
      : `"${chunkEncarte.titulo}"`;
    console.log(`\n🚀 Enviando ${label} (~${Math.round(payloadSizeKb / 1024)}MB, ${chunkEncarte.pages.length} págs)...`);

    try {
      const res = await fetch(`${RAILWAY_URL}/api/admin/ofertabot/sources/${sourceId}/relay-comper`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ encartes: [chunkEncarte], htmlUrl: WP_SOURCE_URL }),
        signal: AbortSignal.timeout(900_000), // 15 min por chunk (Gemini paralelo ~3 min/4 págs)
      });

      const json = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        console.error(`   ❌ HTTP ${res.status}:`, json);
        totalErros++;
      } else {
        console.log(`   ✅ processados=${json["processados"]} duplicados=${json["duplicados"]} erros=${json["erros"]}`);
        totalProcessados += Number(json["processados"] ?? 0);
        totalDuplicados += Number(json["duplicados"] ?? 0);
        totalErros += Number(json["erros"] ?? 0);
      }
    } catch (err) {
      console.error(`   ❌ Erro de rede: ${err}`);
      totalErros++;
    }
  }

  for (const encarte of relayEncartes) {
    if (encarte.pages.length <= MAX_PAGES_PER_CHUNK) {
      await sendChunk(encarte);
    } else {
      // Dividir em chunks de MAX_PAGES_PER_CHUNK páginas
      for (let i = 0; i < encarte.pages.length; i += MAX_PAGES_PER_CHUNK) {
        const chunkPages = encarte.pages.slice(i, i + MAX_PAGES_PER_CHUNK).map((p, idx) => ({ ...p, index: idx }));
        const chunkNome = `${encarte.nome}_chunk${Math.floor(i / MAX_PAGES_PER_CHUNK) + 1}`;
        const chunkTitulo = `${encarte.titulo} [pág ${i + 1}-${Math.min(i + MAX_PAGES_PER_CHUNK, encarte.pages.length)}]`;
        await sendChunk({
          nome: chunkNome,
          titulo: chunkTitulo,
          validade: encarte.validade,
          pages: chunkPages,
        }, Math.floor(i / MAX_PAGES_PER_CHUNK));
      }
    }
  }

  console.log(`\n📊 Resumo final:`);
  console.log(`   Processados: ${totalProcessados}`);
  console.log(`   Duplicados:  ${totalDuplicados}`);
  console.log(`   Erros:       ${totalErros}`);
}

main().catch(err => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
