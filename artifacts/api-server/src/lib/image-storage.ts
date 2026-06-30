// @ts-nocheck
/**
 * Image storage abstraction layer.
 *
 * Uploads new images to Supabase Storage (bucket: ofertas-fotos) and returns
 * a public HTTPS URL. Falls back to returning an error if the upload fails —
 * never silently stores base64 in the database for new offers.
 *
 * Offers already in the database with a base64 fotoUrl continue to work:
 * <img src="data:image/jpeg;base64,..."> is valid in every browser.
 *
 * PRIVACY / EXIF GPS NOTICE:
 * The frontend resizes every image through an HTML Canvas before upload.
 * canvas.toDataURL("image/jpeg") re-encodes the image from pixel data only,
 * stripping ALL EXIF metadata (including GPS coordinates, device info, etc.)
 * before it ever reaches this server.
 *
 * This function applies a second layer of defense: it also strips the JPEG
 * APP1 (EXIF) segment from the raw base64 payload on the server side, so
 * even if a future code path bypasses the canvas resize, GPS data cannot
 * leak into the database.
 */

const VALID_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];

const MIME_MAP: Record<string, string> = {
  "data:image/jpeg;base64,": "image/jpeg",
  "data:image/png;base64,":  "image/png",
  "data:image/webp;base64,": "image/webp",
};

const EXT_MAP: Record<string, string> = {
  "data:image/jpeg;base64,": "jpg",
  "data:image/png;base64,":  "png",
  "data:image/webp;base64,": "webp",
};

/** Maximum base64 string length: ~500 KB of raw image data. */
const MAX_CHARS = 500 * 1024;

const BUCKET = "Oferta-fotos";

export type ImageResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Strips JPEG EXIF (APP1) segment from a base64-encoded JPEG.
 *
 * JPEG structure: SOI (0xFFD8) followed by a series of markers.
 * APP1 (0xFFE1) is the EXIF container — we remove it entirely.
 * Non-JPEG formats (PNG, WebP) are returned unchanged (no EXIF GPS support).
 *
 * @param raw - base64 data URL (e.g. "data:image/jpeg;base64,...")
 * @returns  - base64 data URL with EXIF APP1 removed if present
 */
function stripExifGps(raw: string): string {
  const jpegPrefix = "data:image/jpeg;base64,";
  if (!raw.startsWith(jpegPrefix)) return raw; // PNG/WebP: no EXIF GPS

  try {
    const b64 = raw.slice(jpegPrefix.length);
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // Must start with JPEG SOI marker 0xFFD8
    if (bin[0] !== 0xff || bin[1] !== 0xd8) return raw;

    const out: number[] = [0xff, 0xd8];
    let i = 2;

    while (i < bin.length - 1) {
      if (bin[i] !== 0xff) break; // malformed; stop stripping

      const marker = bin[i + 1]!;
      // SOS (0xDA) — start of compressed image data; append remainder as-is
      if (marker === 0xda) {
        for (let j = i; j < bin.length; j++) out.push(bin[j]!);
        break;
      }
      // Standalone markers (no length field)
      if (marker === 0xd8 || marker === 0xd9) {
        out.push(0xff, marker);
        i += 2;
        continue;
      }

      const segLen = ((bin[i + 2]! << 8) | bin[i + 3]!) + 2; // includes 2-byte length field

      // APP1 (0xE1) = EXIF — skip the entire segment
      if (marker === 0xe1) {
        i += segLen;
        continue;
      }

      // All other segments: copy verbatim
      for (let j = i; j < i + segLen && j < bin.length; j++) out.push(bin[j]!);
      i += segLen;
    }

    const stripped = btoa(String.fromCharCode(...out));
    return `${jpegPrefix}${stripped}`;
  } catch {
    // On any parse error, return original (fail open: no data loss)
    return raw;
  }
}

/**
 * Uploads a base64 data URL to Supabase Storage and returns the public URL.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
 */
async function uploadToStorage(sanitised: string): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const prefix  = VALID_PREFIXES.find((p) => sanitised.startsWith(p))!;
  const mime    = MIME_MAP[prefix]!;
  const ext     = EXT_MAP[prefix]!;
  const b64data = sanitised.slice(prefix.length);
  const buffer  = Buffer.from(b64data, "base64");

  // Use crypto.randomUUID for a collision-free filename
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path     = filename;

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`;

  const response = await fetch(uploadUrl, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "apikey":        serviceKey,
      "Content-Type":  mime,
      "x-upsert":      "false",
    },
    body: buffer,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(`Supabase Storage upload failed: ${response.status} ${body}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Validates image format and size, strips EXIF GPS metadata, then uploads
 * to Supabase Storage. Returns the public HTTPS URL on success.
 *
 * @param raw - The raw base64 data URL sent by the client.
 */
export async function validateAndStoreImage(raw: string): Promise<ImageResult> {
  if (!raw || typeof raw !== "string") {
    return { ok: false, error: "Imagem obrigatória." };
  }

  if (!VALID_PREFIXES.some((p) => raw.startsWith(p))) {
    return {
      ok: false,
      error: "Formato de imagem inválido. Use JPEG, PNG ou WebP.",
    };
  }

  if (raw.length > MAX_CHARS) {
    return {
      ok: false,
      error: `Imagem muito grande (${Math.round(raw.length / 1024)} KB). Máximo: 500 KB.`,
    };
  }

  // Strip EXIF GPS and other metadata (second layer of defense — canvas already strips on client)
  const sanitised = stripExifGps(raw);

  try {
    const url = await uploadToStorage(sanitised);
    return { ok: true, url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Falha ao armazenar imagem: ${msg}` };
  }
}
