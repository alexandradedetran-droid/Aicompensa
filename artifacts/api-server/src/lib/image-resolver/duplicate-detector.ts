/**
 * Phase 2 — Duplicate Detector
 *
 * Computes a perceptual hash (DCT pHash, 64-bit) for each candidate image
 * and clusters visually similar images by Hamming distance.
 *
 * Algorithm: DCT-based pHash (perceptual hash)
 *   1. Fetch the image from its URL.
 *   2. Resize to 32×32 grayscale via sharp.
 *   3. Apply 2D Discrete Cosine Transform (DCT).
 *   4. Extract top-left 8×8 low-frequency coefficients (64 values).
 *   5. Compare each value to the mean; encode as 1-bit above / 0-bit at-or-below.
 *   6. 64-bit result → 16-char lowercase hex string.
 *
 * Why DCT pHash over dHash:
 *   dHash (difference of adjacent pixels) is fast but sensitive to minor crops,
 *   translations, and brightness gradients. DCT pHash operates in the frequency
 *   domain, making it robust to rescaling, mild crops, and JPEG compression artifacts.
 *
 * Hamming distance thresholds (configurable via IMAGE_SCORE_CONFIG):
 *   0–5   → duplicate
 *   6–10  → near_identical
 *   11–15 → possible_variation
 *   >15   → different
 *
 * Clustering: union-find (disjoint sets) over all pairs with distance ≤ hashNearDuplicateDistance.
 * The representative of each cluster is the member with the highest score.
 *
 * `sharp` is runtime-optional: if it cannot be loaded, `computePhash` returns null
 * and clustering falls back to URL equality — the pipeline continues without crashing.
 *
 * pHash cache: if a candidate already has `phash` set (even null), it is not recomputed.
 *   undefined → not yet computed (will download + hash)
 *   null      → previously attempted but failed (skip silently)
 *   string    → valid hash (reuse immediately)
 */

import type { ImageCandidate, DedupCluster, HashComparison, HammingBand } from "./types.js";
import { IMAGE_SCORE_CONFIG as CFG } from "./image-score-config.js";

// ── DCT pHash constants ───────────────────────────────────────────────────────

const RESIZE = 32;  // Resize target: 32×32 grayscale pixels
const KEEP   = 8;   // Extract top-left 8×8 DCT coefficients → 64-bit hash

/** Lazily initialised cosine basis matrix: table[u][x] = cos((2x+1)uπ / 2N) */
let cosTable: Float64Array | null = null;

function getCosTable(): Float64Array {
  if (cosTable) return cosTable;
  cosTable = new Float64Array(RESIZE * RESIZE);
  for (let u = 0; u < RESIZE; u++) {
    for (let x = 0; x < RESIZE; x++) {
      cosTable[u * RESIZE + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * RESIZE));
    }
  }
  return cosTable;
}

/**
 * Computes the top-left KEEP×KEEP block of a 2D DCT on a RESIZE×RESIZE pixel array.
 * Only the low-frequency block is needed, so we skip computing the rest.
 * Runtime: O(KEEP² × RESIZE²) = O(64 × 1024) = ~65K multiply-adds per image.
 */
function dctLowFreq(pixels: Uint8Array): Float64Array {
  const table = getCosTable();
  const dct = new Float64Array(KEEP * KEEP);
  for (let u = 0; u < KEEP; u++) {
    for (let v = 0; v < KEEP; v++) {
      let sum = 0;
      for (let x = 0; x < RESIZE; x++) {
        const cu = table[u * RESIZE + x]!;
        for (let y = 0; y < RESIZE; y++) {
          sum += pixels[x * RESIZE + y]! * cu * table[v * RESIZE + y]!;
        }
      }
      dct[u * KEEP + v] = sum;
    }
  }
  return dct;
}

// ── Hamming distance ──────────────────────────────────────────────────────────

/** Counts differing bits between two 16-char hex hashes (64-bit). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i += 4) {
    const diff = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    let n = diff;
    while (n) { dist++; n &= n - 1; }
  }
  return dist;
}

export function classifyHamming(distance: number): HammingBand {
  const t = CFG.thresholds;
  if (distance <= t.hashDuplicateDistance)          return "duplicate";
  if (distance <= t.hashNearDuplicateDistance)      return "near_identical";
  if (distance <= t.hashPossibleVariationDistance)  return "possible_variation";
  return "different";
}

// ── pHash computation ─────────────────────────────────────────────────────────

/**
 * Computes a 64-bit DCT perceptual hash directly from a Buffer.
 * Returns a 16-char lowercase hex string, or null on any failure.
 * Used by the admin upload route to avoid a redundant HTTP round-trip.
 */
export async function computePhashFromBuffer(buffer: Buffer): Promise<string | null> {
  let sharpModule: typeof import("sharp") | null = null;
  try {
    sharpModule = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch {
    return null;
  }
  try {
    const { data } = await (sharpModule as any)(buffer)
      .resize(RESIZE, RESIZE, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return phashFromPixels(data as Uint8Array);
  } catch {
    return null;
  }
}

/** Encodes a RESIZE×RESIZE grayscale pixel array into a 16-char hex pHash. */
function phashFromPixels(pixels: Uint8Array): string {
  const dct = dctLowFreq(pixels);
  let mean = 0;
  for (let i = 0; i < dct.length; i++) mean += dct[i]!;
  mean /= dct.length;
  let hash = 0n;
  for (let i = 0; i < dct.length; i++) {
    if (dct[i]! > mean) hash |= 1n << BigInt(i);
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Computes a 64-bit DCT perceptual hash for the image at `url`.
 * Returns a 16-char lowercase hex string, or null on any failure.
 *
 * Uses pHash cache: if the candidate already has a non-undefined phash value,
 * callers should skip this function (see enrichWithPhashes).
 */
export async function computePhash(url: string): Promise<string | null> {
  let sharpModule: typeof import("sharp") | null = null;
  try {
    sharpModule = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch {
    return null;
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "AiCompensa-ImageResolver/1.0" },
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());

    const { data } = await (sharpModule as any)(buffer)
      .resize(RESIZE, RESIZE, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return phashFromPixels(data as Uint8Array);
  } catch {
    return null;
  }
}

// ── Union-Find ────────────────────────────────────────────────────────────────

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]!);
    return this.parent[x]!;
  }
  union(x: number, y: number): void {
    this.parent[this.find(x)] = this.find(y);
  }
}

// ── Clustering ────────────────────────────────────────────────────────────────

export interface ClusteringInput {
  candidate: ImageCandidate;
  score: number;
}

/**
 * Clusters candidates by perceptual similarity.
 * Pairs with Hamming distance ≤ hashNearDuplicateDistance (default 10) are merged.
 * The representative of each cluster is the member with the highest score.
 * Candidates without a phash are each placed in their own singleton cluster.
 */
export function clusterByPhash(inputs: ClusteringInput[]): DedupCluster[] {
  const n = inputs.length;
  if (n === 0) return [];

  const uf = new UnionFind(n);
  const threshold = CFG.thresholds.hashNearDuplicateDistance;

  for (let i = 0; i < n; i++) {
    const hi = inputs[i]!.candidate.phash;
    if (!hi) continue;
    for (let j = i + 1; j < n; j++) {
      const hj = inputs[j]!.candidate.phash;
      if (!hj) continue;
      if (hammingDistance(hi, hj) <= threshold) uf.union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const g = groups.get(root) ?? [];
    g.push(i);
    groups.set(root, g);
  }

  const clusters: DedupCluster[] = [];
  for (const indices of groups.values()) {
    indices.sort((a, b) => inputs[b]!.score - inputs[a]!.score);
    const [repIdx, ...dupIdxs] = indices;
    clusters.push({
      representative: inputs[repIdx!]!.candidate,
      duplicates:     dupIdxs.map((i) => inputs[i]!.candidate),
    });
  }

  return clusters;
}

/**
 * Enriches candidates with pHashes, respecting the cache:
 * - phash is a string  → reuse, skip download
 * - phash is null      → previously failed, skip download
 * - phash is undefined → compute now
 *
 * Downloads run concurrently up to `concurrency` (default 3).
 */
export async function enrichWithPhashes(
  candidates: ImageCandidate[],
  concurrency = 3,
): Promise<ImageCandidate[]> {
  const results: ImageCandidate[] = new Array(candidates.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIdx++;
      if (i >= candidates.length) break;
      const c = candidates[i]!;
      if (c.phash !== undefined) {
        // Cache hit: already computed (including failed attempts stored as null)
        results[i] = c;
      } else {
        const phash = await computePhash(c.url);
        results[i] = { ...c, phash: phash ?? null };
      }
    }
  }

  const workerCount = Math.min(concurrency, candidates.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

// ── Public comparison utility ─────────────────────────────────────────────────

/** Compares two candidates and returns a HashComparison. Useful for testing. */
export function compareCandidates(
  a: ImageCandidate,
  b: ImageCandidate,
): HashComparison | null {
  if (!a.phash || !b.phash) return null;
  const dist = hammingDistance(a.phash, b.phash);
  return { a, b, hammingDistance: dist, band: classifyHamming(dist) };
}
