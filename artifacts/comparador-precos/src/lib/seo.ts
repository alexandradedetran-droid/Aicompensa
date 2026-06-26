/**
 * Lightweight SEO hook — updates document.title and meta tags per route.
 * No external dependencies — pure DOM manipulation.
 * Googlebot executes JavaScript so per-page titles improve indexation.
 */
import { useEffect } from "react";

const SITE_NAME = "AíCompensa";
const BASE_URL  = "https://aicompensa.com.br";
const DEFAULT_DESCRIPTION =
  "Descubra onde realmente compensa comprar. Ofertas reais de supermercado confirmadas pela comunidade, perto de você.";
const DEFAULT_IMAGE = `${BASE_URL}/opengraph.jpg`;

export interface SeoOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  noIndex?: boolean;
}

function setMeta(selector: string, value: string) {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute("content", value);
}

/**
 * Call at the top of each page component to update SEO metadata.
 *
 * @example
 * useSeo({ title: "Ofertas", description: "Compare preços perto de você." });
 */
export function useSeo({ title, description, image, url, noIndex }: SeoOptions = {}) {
  useEffect(() => {
    const fullTitle = title
      ? `${title} — ${SITE_NAME}`
      : `${SITE_NAME} — Economize no Supermercado`;
    const desc  = description ?? DEFAULT_DESCRIPTION;
    const img   = image ?? DEFAULT_IMAGE;
    const pageUrl = url ?? (BASE_URL + window.location.pathname);

    document.title = fullTitle;

    setMeta('meta[name="description"]',      desc);
    setMeta('meta[name="robots"]',           noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1");

    setMeta('meta[property="og:title"]',       fullTitle);
    setMeta('meta[property="og:description"]', desc);
    setMeta('meta[property="og:image"]',       img);
    setMeta('meta[property="og:image:secure_url"]', img);
    setMeta('meta[property="og:url"]',         pageUrl);

    setMeta('meta[name="twitter:title"]',       fullTitle);
    setMeta('meta[name="twitter:description"]', desc);
    setMeta('meta[name="twitter:image"]',       img);

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = pageUrl;
  }, [title, description, image, url, noIndex]);
}
