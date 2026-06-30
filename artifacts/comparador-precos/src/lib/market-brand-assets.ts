// Catalogo local de ativos visuais por rede de mercado.
// Adicione novas redes aqui quando os arquivos de logo estiverem disponiveis em public/markets/.
// Este catalogo sera substituido por painel admin em sprint futura.

export interface MarketBrandAsset {
  key: string;
  aliases: string[];
  logoUrl: string;
  /** Cor principal da marca (hex) — usada para acentos visuais nos cards */
  brandColor: string;
  /** Gradiente CSS do banner do card. Se omitido, getBannerGradient() gera um a partir de brandColor */
  brandGradient?: string;
  /** URL pública estável da fachada/foto da loja (opcional; fallback = gradiente da marca) */
  fachadaUrl?: string;
  verified: boolean;
}

export const MARKET_BRAND_ASSETS: MarketBrandAsset[] = [
  {
    key: "comper",
    aliases: ["comper", "comper supermercado", "supermercado comper"],
    logoUrl: "/markets/comper.png",
    brandColor: "#004B8D",
    brandGradient: "linear-gradient(145deg, #001E5B 0%, #004B8D 60%, #0060B8 100%)",
    verified: true,
  },
  {
    key: "havan",
    aliases: ["havan", "lojas havan"],
    logoUrl: "/markets/havan.svg",
    brandColor: "#003087",
    brandGradient: "linear-gradient(145deg, #001040 0%, #003087 60%, #003FA8 100%)",
    verified: true,
  },
  {
    key: "assai",
    aliases: ["assai", "assai atacadista", "assaí", "assaí atacadista"],
    logoUrl: "/markets/assai.svg",
    brandColor: "#FF7B00",
    brandGradient: "linear-gradient(145deg, #7A2F00 0%, #CC5500 55%, #FF7B00 100%)",
    verified: false,
  },
  {
    key: "fort",
    aliases: ["fort atacadista", "fort", "fort supermercado"],
    logoUrl: "/markets/fort.svg",
    brandColor: "#E30613",
    brandGradient: "linear-gradient(145deg, #5C0000 0%, #B00010 55%, #E30613 100%)",
    verified: false,
  },
  {
    key: "atacadao",
    aliases: ["atacadao", "atacadão", "atacadão supermercado"],
    logoUrl: "/markets/atacadao.svg",
    brandColor: "#9B0E0E",
    brandGradient: "linear-gradient(145deg, #2E0000 0%, #6B0505 55%, #9B0E0E 100%)",
    verified: false,
  },
  {
    key: "pantanal",
    aliases: ["atacadista pantanal", "pantanal", "supermercado pantanal"],
    logoUrl: "/markets/pantanal.svg",
    brandColor: "#2E7D32",
    brandGradient: "linear-gradient(145deg, #0A2D0C 0%, #1B5E20 55%, #2E7D32 100%)",
    verified: false,
  },
  {
    key: "biglar",
    aliases: ["biglar", "big lar", "big lar supermercado"],
    logoUrl: "/markets/biglar.svg",
    brandColor: "#E65100",
    brandGradient: "linear-gradient(145deg, #5C1A00 0%, #BF360C 55%, #E65100 100%)",
    verified: false,
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Separadores aceitos após o prefixo da rede para match de unidade.
// Match só ocorre se o alias estiver no INÍCIO do nome seguido de um desses separadores.
// Isso evita falso positivo quando a palavra aparece no meio do nome.
const UNIT_SEPARATORS = [" ", " - ", " • ", "/"];

function matchesAlias(normalizedNome: string, normalizedAlias: string): boolean {
  if (normalizedNome === normalizedAlias) return true;
  return UNIT_SEPARATORS.some((sep) => normalizedNome.startsWith(normalizedAlias + sep));
}

/**
 * Retorna o asset de marca correspondente ao nome do mercado, ou null se nao encontrado.
 * Prioridade de uso: mercado.logoUrl -> resolveMarketBrandAsset(nome)?.logoUrl -> fallback Building2
 *
 * Suporta match exato por alias E match por prefixo seguro (separadores: espaco, " - ", " • ", "/").
 * Exemplo: "Comper CPA" resolve para a rede "comper" via prefixo.
 */
export function resolveMarketBrandAsset(nome: string): MarketBrandAsset | null {
  const normalizedNome = normalize(nome);
  for (const asset of MARKET_BRAND_ASSETS) {
    if (asset.aliases.some((alias) => matchesAlias(normalizedNome, normalize(alias)))) {
      return asset;
    }
  }
  return null;
}

/**
 * Retorna o gradiente CSS do banner para um asset de marca.
 * Usa brandGradient do asset se disponível; caso contrário, gera um gradiente
 * do escuro para a cor da marca.
 */
export function getBannerGradient(
  asset: MarketBrandAsset | null,
  fallbackColor?: string,
): string {
  if (asset?.brandGradient) return asset.brandGradient;
  const color = fallbackColor ?? asset?.brandColor ?? "#374151";
  return `linear-gradient(145deg, #1a1a2e 0%, ${color} 100%)`;
}
