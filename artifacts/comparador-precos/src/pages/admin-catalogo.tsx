import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { getAdminToken } from "@/lib/admin-auth";
import { getApiToken } from "@/lib/current-user";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LastUpload {
  barcode: string;
  name: string;
  brand: string | null;
  url: string;
  imageStatus: string;
  createdAt: string;
}

interface CatalogStats {
  officialImages: number;
  candidateImages: number;
  adminUploaded: number;
  pendingReview: number;
  todayUploads: number;
  weekUploads: number;
  productsToday: number;
  productsWeek: number;
  productsWithOfficial: number;
  productsWithoutImage: number;
  totalProducts: number;
  coveragePct: number;
  lastUploaded: LastUpload[];
}

interface CatalogImage {
  id: number;
  url: string;
  imageType: string | null;
  imageSource: string;
  imageStatus: string;
  selectedBy: string | null;
  widthPx: number | null;
  heightPx: number | null;
  fileSizeBytes: number | null;
  phash: string | null;
  notes: string | null;
  createdAt: string;
}

interface CatalogProduct {
  barcode: string;
  name: string;
  brand: string | null;
  categories: string[] | null;
  quantity: string | null;
  category: string | null;
  createdAt: string;
  officialImage: CatalogImage | null;
  images: CatalogImage[];
}

interface SearchResult {
  barcode: string;
  name: string;
  brand: string | null;
  categories: string[] | null;
  officialCount: number;
  candidateCount: number;
  officialUrl: string | null;
}

interface CreateForm {
  barcode: string;
  name: string;
  brand: string;
  category: string;
  quantity: string;
}

interface PreviewMeta {
  widthPx: number;
  heightPx: number;
  kb: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const tok = getAdminToken() ?? getApiToken();
  if (tok) {
    if (getAdminToken()) h["x-admin-token"] = tok;
    else h["Authorization"] = `Bearer ${tok}`;
  }
  return h;
}

function sourceBadgeCls(source: string): string {
  if (source === "ADMIN_UPLOAD") return "bg-violet-100 text-violet-700 border-violet-200";
  if (source === "ADMIN")        return "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (source === "OFF")          return "bg-sky-100 text-sky-700 border-sky-200";
  if (source === "CATALOG")      return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function statusBadgeCls(status: string): string {
  if (status === "selected")  return "bg-lime-100 text-lime-700 border-lime-200";
  if (status === "candidate") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "rejected")  return "bg-red-100 text-red-700 border-red-200";
  if (status === "review")    return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtKb(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, color, sub,
}: {
  icon: string;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{ background: `${color}22` }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-black text-gray-900 leading-tight">{value}</div>
        <div className="text-[11px] font-semibold text-gray-500 mt-0.5 leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Fullscreen overlay ────────────────────────────────────────────────────────

function FullscreenOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
        onClick={onClose}
      >
        ✕
      </button>
      <img
        src={url}
        alt="Fullscreen"
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </motion.div>
  );
}

// ── Create Product Form ───────────────────────────────────────────────────────

function CreateProductForm({
  initialBarcode,
  onCreated,
  onCancel,
}: {
  initialBarcode: string;
  onCreated: (barcode: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CreateForm>({
    barcode: initialBarcode,
    name: "",
    brand: "",
    category: "",
    quantity: "",
  });
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const r = await fetch("/api/admin/catalog/products", {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify({
          barcode:  form.barcode.trim(),
          name:     form.name.trim(),
          brand:    form.brand.trim() || undefined,
          category: form.category.trim() || undefined,
          quantity: form.quantity.trim() || undefined,
        }),
      });
      const data = await r.json() as { error?: string; barcode?: string };
      if (!r.ok) {
        if (r.status === 409) {
          toast({ title: "Produto já existe — abrindo…" });
          onCreated(form.barcode.trim());
          return;
        }
        throw new Error(data.error ?? "Erro ao criar produto");
      }
      toast({ title: `✅ Produto "${form.name.trim()}" criado!` });
      onCreated(form.barcode.trim());
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro ao criar", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const field = (
    key: keyof CreateForm,
    label: string,
    placeholder: string,
    opts?: { inputMode?: "numeric"; required?: boolean; ref?: React.RefObject<HTMLInputElement | null> }
  ) => (
    <div>
      <label className="text-xs font-bold text-gray-600 mb-1 block">
        {label}{opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        ref={opts?.ref}
        type="text"
        inputMode={opts?.inputMode}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
        className="w-full h-12 rounded-xl border-2 border-gray-200 px-4 text-sm font-semibold focus:outline-none focus:border-lime-400 transition-colors"
      />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-gray-800">➕ Criar Novo Produto</h3>
          <p className="text-xs text-amber-700 mt-0.5">Código <span className="font-mono font-bold">{initialBarcode}</span> não encontrado.</p>
        </div>
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {field("barcode",  "Código de barras",    "Ex: 7891234567890", { inputMode: "numeric" })}
        {field("name",     "Nome do produto",     "Ex: Leite Integral 1L",  { required: true, ref: nameRef })}
        {field("brand",    "Marca",               "Ex: Nestlé")}
        {field("category", "Categoria",           "Ex: Laticínios")}
        {field("quantity", "Quantidade / Volume", "Ex: 1L, 500g")}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={creating}
          className="flex-1 h-12 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={creating || !form.name.trim()}
          className="flex-[2] h-12 rounded-xl bg-lime-500 text-white font-black text-sm hover:bg-lime-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {creating
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Criando…</>
            : "✅ Criar produto"}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminCatalogoTab() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showLastUploaded, setShowLastUploaded] = useState(false);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [productLoading, setProductLoading] = useState(false);

  const [createBarcode, setCreateBarcode] = useState<string | null>(null);

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<PreviewMeta | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [markAsOfficial, setMarkAsOfficial] = useState(true);

  const [actionId, setActionId] = useState<number | null>(null);

  const [supermarketMode, setSupermarketMode] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("sm-catalog-mode") === "1"
  );

  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  const cameraRef       = useRef<HTMLInputElement>(null);
  const galleryRef      = useRef<HTMLInputElement>(null);
  const initialUploadRef = useRef<HTMLInputElement>(null);
  const barcodeRef      = useRef<HTMLInputElement>(null);

  // ── Supermarket mode persist ───────────────────────────────────────────────
  const toggleSupermarketMode = () => {
    setSupermarketMode(prev => {
      const next = !prev;
      localStorage.setItem("sm-catalog-mode", next ? "1" : "0");
      toast({ title: next ? "🛒 Modo Supermercado ON" : "Modo Supermercado OFF" });
      return next;
    });
  };

  // ── Reset to scanner ──────────────────────────────────────────────────────
  const resetToScanner = useCallback(() => {
    setProduct(null);
    setSearch("");
    setPreviewSrc(null);
    setPreviewMeta(null);
    setSelectedFile(null);
    setSearchResults([]);
    setCreateBarcode(null);
    setTimeout(() => barcodeRef.current?.focus(), 80);
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch("/api/admin/catalog/stats", { headers: adminHeaders(), credentials: "include" });
      if (r.ok) setStats(await r.json());
    } catch { /* silent */ }
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/admin/catalog/search?q=${encodeURIComponent(q)}`, {
        headers: adminHeaders(), credentials: "include",
      });
      if (r.ok) setSearchResults(await r.json());
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const isBarcode = /^\d{4,14}$/.test(search.trim());
    if (isBarcode) { void runSearch(search.trim()); return; }
    if (search.length < 3) { setSearchResults([]); return; }
    const t = setTimeout(() => void runSearch(search.trim()), 450);
    return () => clearTimeout(t);
  }, [search, runSearch]);

  // ── Load product ──────────────────────────────────────────────────────────
  const loadProduct = useCallback(async (barcode: string) => {
    setProductLoading(true);
    setProduct(null);
    setCreateBarcode(null);
    setPreviewSrc(null);
    setPreviewMeta(null);
    setSelectedFile(null);
    setSearchResults([]);
    setSearch(barcode);
    try {
      const r = await fetch(`/api/admin/catalog/product/${barcode}`, {
        headers: adminHeaders(), credentials: "include",
      });
      if (r.ok) {
        setProduct(await r.json());
      } else if (r.status === 404) {
        const isBarcode = /^\d{4,14}$/.test(barcode.trim());
        if (isBarcode) {
          setCreateBarcode(barcode.trim());
        } else {
          toast({ title: `"${barcode}" não encontrado`, variant: "destructive" });
        }
      } else {
        const err = await r.json().catch(() => ({})) as { error?: string };
        toast({ title: err.error ?? "Erro ao carregar produto", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao carregar produto", variant: "destructive" });
    }
    finally { setProductLoading(false); }
  }, []);

  // ── File capture ──────────────────────────────────────────────────────────
  const handleFileCapture = (file: File) => {
    const kb = Math.round(file.size / 1024);
    setSelectedFile(file);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPreviewMeta({ widthPx: img.naturalWidth, heightPx: img.naturalHeight, kb });
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;

    const reader = new FileReader();
    reader.onload = e => setPreviewSrc((e.target?.result as string) ?? null);
    reader.readAsDataURL(file);
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedFile || !product) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("barcode", product.barcode);
      form.append("image", selectedFile);

      const headers: Record<string, string> = {};
      const tok = getAdminToken() ?? getApiToken();
      if (tok) {
        if (getAdminToken()) headers["x-admin-token"] = tok;
        else headers["Authorization"] = `Bearer ${tok}`;
      }

      const r = await fetch("/api/admin/catalog/images/upload", {
        method: "POST",
        headers,
        credentials: "include",
        body: form,
      });
      const data = await r.json() as { ok?: boolean; image?: { id: number; url: string }; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Upload falhou");

      if (markAsOfficial && data.image?.id) {
        await fetch(`/api/admin/catalog/images/${data.image.id}/make-official`, {
          method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, credentials: "include",
        });
      }

      toast({ title: markAsOfficial ? "✅ Imagem oficial definida!" : "📤 Imagem enviada como candidata!" });
      setPreviewSrc(null);
      setPreviewMeta(null);
      setSelectedFile(null);

      if (supermarketMode) {
        await loadStats();
        resetToScanner();
      } else {
        await Promise.all([loadProduct(product.barcode), loadStats()]);
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro no upload", variant: "destructive" });
    }
    finally { setUploading(false); }
  };

  // ── Image actions ─────────────────────────────────────────────────────────
  const handleMakeOfficial = async (imageId: number) => {
    setActionId(imageId);
    try {
      const r = await fetch(`/api/admin/catalog/images/${imageId}/make-official`, {
        method: "PATCH", headers: adminHeaders(), credentials: "include",
      });
      if (!r.ok) throw new Error("Falhou");
      toast({ title: "✅ Imagem oficial definida!" });
      if (product) await loadProduct(product.barcode);
      await loadStats();
    } catch {
      toast({ title: "Erro ao definir oficial", variant: "destructive" });
    }
    finally { setActionId(null); }
  };

  const handleRemoveOfficial = async (imageId: number) => {
    setActionId(imageId);
    try {
      const r = await fetch(`/api/admin/catalog/images/${imageId}/remove-official`, {
        method: "PATCH", headers: adminHeaders(), credentials: "include",
      });
      if (!r.ok) throw new Error("Falhou");
      toast({ title: "Imagem oficial removida." });
      if (product) await loadProduct(product.barcode);
      await loadStats();
    } catch {
      toast({ title: "Erro ao remover oficial", variant: "destructive" });
    }
    finally { setActionId(null); }
  };

  const handleDelete = async (imageId: number) => {
    setActionId(imageId);
    try {
      const r = await fetch(`/api/admin/catalog/images/${imageId}`, {
        method: "DELETE", headers: adminHeaders(), credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Falhou");
      }
      toast({ title: "🗑 Imagem rejeitada." });
      if (product) await loadProduct(product.barcode);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro ao rejeitar", variant: "destructive" });
    }
    finally { setActionId(null); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Fullscreen overlay */}
      <AnimatePresence>
        {fullscreenUrl && (
          <FullscreenOverlay url={fullscreenUrl} onClose={() => setFullscreenUrl(null)} />
        )}
      </AnimatePresence>

      <motion.div key="catalogo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

        {/* ── Header ── */}
        <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">📷</span>
                <h2 className="text-base font-black text-white">Catálogo de Imagens</h2>
              </div>
              <p className="text-purple-300 text-xs">Gerencie imagens oficiais · sprint 4.2.5</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => void loadStats()}
                className="text-xs font-bold px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-white border border-white/20"
              >
                ↻
              </button>
              <button
                onClick={toggleSupermarketMode}
                className={cn(
                  "text-xs font-black px-3 py-1.5 rounded-xl transition-all border",
                  supermarketMode
                    ? "bg-lime-400 text-gray-900 border-lime-300 shadow-lg shadow-lime-400/30"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20",
                )}
              >
                🛒 {supermarketMode ? "SM ON" : "SM"}
              </button>
            </div>
          </div>

          {supermarketMode && (
            <div className="mt-3 bg-lime-400/20 border border-lime-400/40 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-sm">🛒</span>
              <p className="text-xs font-bold text-lime-300">Modo Supermercado ativo — após upload, volta ao scanner automaticamente.</p>
            </div>
          )}
        </div>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statsLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
            ))
          ) : stats ? (
            <>
              {/* Row 1 — catalog health */}
              <StatCard icon="✅" label="Com imagem oficial"  value={stats.productsWithOfficial} color="#84cc16" />
              <StatCard icon="📸" label="Candidatos"          value={stats.candidateImages}       color="#6366f1" />
              <StatCard icon="❌" label="Sem imagem"          value={stats.productsWithoutImage}  color="#ef4444" />
              <StatCard
                icon="📊"
                label="Cobertura"
                value={`${stats.coveragePct}%`}
                color="#f59e0b"
                sub={`de ${stats.totalProducts.toLocaleString()} produtos`}
              />
              {/* Row 2 — activity */}
              <StatCard icon="📅" label="Uploads hoje"        value={stats.todayUploads}   color="#0ea5e9" />
              <StatCard icon="🗓" label="Uploads semana"       value={stats.weekUploads}    color="#8b5cf6" />
              <StatCard icon="🔍" label="Aguardando revisão"  value={stats.pendingReview}  color="#f97316" />
              <StatCard icon="➕" label="Criados hoje"         value={stats.productsToday}  color="#10b981" />
            </>
          ) : null}
        </div>

        {/* ── Last uploaded products ── */}
        {stats && stats.lastUploaded.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowLastUploaded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-black text-gray-800">📋 Últimos uploads admin</span>
              <span className="text-xs text-gray-400">{showLastUploaded ? "▲ ocultar" : `▼ ver ${stats.lastUploaded.length}`}</span>
            </button>
            <AnimatePresence>
              {showLastUploaded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="divide-y divide-gray-50">
                    {stats.lastUploaded.map(lu => (
                      <button
                        key={`${lu.barcode}-${lu.createdAt}`}
                        onClick={() => void loadProduct(lu.barcode)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-lime-50 transition-colors text-left"
                      >
                        <img
                          src={lu.url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 truncate">{lu.name}</div>
                          <div className="text-xs text-gray-400">{lu.barcode}{lu.brand ? ` · ${lu.brand}` : ""}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                            statusBadgeCls(lu.imageStatus),
                          )}>
                            {lu.imageStatus}
                          </span>
                          <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(lu.createdAt)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Barcode search ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-black text-gray-800 mb-3">🔍 Buscar produto</h3>
          <div className="flex gap-2">
            <input
              ref={barcodeRef}
              type="text"
              inputMode="numeric"
              placeholder="Código de barras ou nome do produto…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && search.trim()) void loadProduct(search.trim());
              }}
              className="flex-1 h-14 rounded-xl border-2 border-gray-200 px-4 text-base font-semibold focus:outline-none focus:border-lime-400 transition-colors"
            />
            <button
              onClick={() => { if (search.trim()) void loadProduct(search.trim()); }}
              disabled={!search.trim() || productLoading}
              className="h-14 w-14 rounded-xl bg-lime-500 hover:bg-lime-400 text-white text-2xl font-black flex items-center justify-center disabled:opacity-40 transition-colors shrink-0"
            >
              {productLoading
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : "→"}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
            >
              📷 Câmera
            </button>
            <button
              onClick={() => initialUploadRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
            >
              🖼️ Upload de imagem
            </button>
            <p className="text-xs text-gray-400">ou leitor Bluetooth · cole o código</p>
          </div>

          {/* Scan-only camera input (no capture — user points at barcode label) */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              e.target.value = "";
              toast({ title: "📷 Escaneamento via câmera — use um app de scanner externo ou o leitor Bluetooth para melhor resultado.", variant: "destructive" });
            }}
          />

          {/* Gallery upload — always available; if product is already loaded feeds handleFileCapture */}
          <input
            ref={initialUploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              e.target.value = "";
              if (product) {
                handleFileCapture(f);
              } else {
                toast({ title: "Selecione um produto primeiro", description: "Escaneie o código de barras ou digite o código para associar a imagem.", variant: "destructive" });
              }
            }}
          />

          {/* Suggestions dropdown */}
          <AnimatePresence>
            {searchResults.length > 0 && !product && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-2 rounded-xl border border-gray-100 overflow-hidden shadow-sm"
              >
                {searchResults.map(r => (
                  <button
                    key={r.barcode}
                    onClick={() => void loadProduct(r.barcode)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-lime-50 transition-colors border-b last:border-0 text-left"
                  >
                    {r.officialUrl ? (
                      <img src={r.officialUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-lg shrink-0">📦</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 truncate">{r.name}</div>
                      <div className="text-xs text-gray-400">{r.barcode}{r.brand ? ` · ${r.brand}` : ""}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {r.officialCount > 0 && (
                        <span className="text-[10px] font-bold bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded-full">✅ {r.officialCount}</span>
                      )}
                      {r.candidateCount > 0 && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">📸 {r.candidateCount}</span>
                      )}
                      {r.officialCount === 0 && r.candidateCount === 0 && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">❌ sem foto</span>
                      )}
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {searching && <p className="text-xs text-gray-400 mt-2 text-center animate-pulse">Buscando…</p>}
        </div>

        {/* ── Create product form ── */}
        <AnimatePresence>
          {createBarcode && (
            <CreateProductForm
              initialBarcode={createBarcode}
              onCreated={barcode => void loadProduct(barcode)}
              onCancel={() => { setCreateBarcode(null); setSearch(""); }}
            />
          )}
        </AnimatePresence>

        {/* ── Product detail ── */}
        <AnimatePresence>
          {product && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >

              {/* Product info card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-black text-gray-900 leading-tight">{product.name}</h2>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-xs text-gray-500 font-mono bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg">{product.barcode}</span>
                      {product.brand && (
                        <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">{product.brand}</span>
                      )}
                      {product.quantity && (
                        <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg font-semibold">{product.quantity}</span>
                      )}
                      {product.category && (
                        <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">{product.category}</span>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full border",
                        product.officialImage ? "bg-lime-100 text-lime-700 border-lime-200" : "bg-red-100 text-red-600 border-red-200"
                      )}>
                        {product.officialImage ? "✅ Imagem oficial" : "❌ Sem imagem oficial"}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                        {product.images.length} imagem{product.images.length !== 1 ? "s" : ""}
                      </span>
                      {product.createdAt && (
                        <span className="text-xs text-gray-400">criado {fmtDate(product.createdAt)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={resetToScanner}
                    className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center shrink-0 text-sm transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* ── No-image CTA ── */}
              {!product.officialImage && !previewSrc && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">📸</span>
                    <div>
                      <h3 className="text-sm font-black text-orange-900">Produto sem imagem</h3>
                      <p className="text-xs text-orange-600 mt-0.5">Adicione a primeira foto deste produto</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => cameraRef.current?.click()}
                      className="flex-1 h-16 rounded-2xl bg-lime-500 hover:bg-lime-400 active:scale-95 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all shadow-lg shadow-lime-200"
                    >
                      <span className="text-2xl">📷</span>
                      <span>Tirar Foto</span>
                    </button>
                    <button
                      onClick={() => galleryRef.current?.click()}
                      className="flex-1 h-16 rounded-2xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all shadow-lg shadow-indigo-200"
                    >
                      <span className="text-2xl">🖼️</span>
                      <span>Escolher da Galeria</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Official image panel */}
              {product.officialImage && !previewSrc && (
                <div className="bg-white rounded-2xl border-2 border-lime-200 shadow-sm p-4">
                  <h3 className="text-sm font-black text-gray-800 mb-3">🏆 Imagem Oficial Atual</h3>
                  <div className="flex gap-4">
                    <button
                      className="relative shrink-0 group"
                      onClick={() => setFullscreenUrl(product.officialImage!.url)}
                    >
                      <img
                        src={product.officialImage.url}
                        alt={product.name}
                        className="w-36 h-36 rounded-xl object-cover bg-gray-100 border-2 border-lime-200 group-hover:brightness-90 transition-all"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                        <span className="text-white text-2xl">🔍</span>
                      </div>
                    </button>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex gap-1 flex-wrap">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", sourceBadgeCls(product.officialImage.imageSource))}>
                          {product.officialImage.imageSource}
                        </span>
                        {product.officialImage.selectedBy && (
                          <span className="text-[10px] text-gray-400">por {product.officialImage.selectedBy}</span>
                        )}
                      </div>
                      {product.officialImage.widthPx && (
                        <div className="text-xs text-gray-400">📐 {product.officialImage.widthPx}×{product.officialImage.heightPx}px</div>
                      )}
                      {product.officialImage.fileSizeBytes && (
                        <div className="text-xs text-gray-400">💾 {fmtKb(product.officialImage.fileSizeBytes)}</div>
                      )}
                      <div className="text-xs text-gray-400">📅 {fmtDate(product.officialImage.createdAt)}</div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <button
                          onClick={() => setFullscreenUrl(product.officialImage!.url)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          🔍 Tela cheia
                        </button>
                        <a
                          href={product.officialImage.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          download
                        >
                          ⬇ Download
                        </a>
                        <button
                          disabled={actionId === product.officialImage.id}
                          onClick={() => handleRemoveOfficial(product.officialImage!.id)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
                        >
                          🗑 Remover oficial
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload section */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-black text-gray-800 mb-3">📷 Adicionar Nova Imagem</h3>

                {!previewSrc ? (
                  <>
                    <div className="flex gap-3">
                      <button
                        onClick={() => cameraRef.current?.click()}
                        className="flex-1 h-20 rounded-2xl bg-lime-500 hover:bg-lime-400 active:scale-95 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all shadow-lg shadow-lime-200"
                      >
                        <span className="text-3xl">📷</span>
                        <span>Câmera</span>
                      </button>
                      <button
                        onClick={() => galleryRef.current?.click()}
                        className="flex-1 h-20 rounded-2xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all shadow-lg shadow-indigo-200"
                      >
                        <span className="text-3xl">🖼</span>
                        <span>Galeria</span>
                      </button>
                    </div>
                    <input
                      ref={cameraRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileCapture(f); e.target.value = ""; }}
                    />
                    <input
                      ref={galleryRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileCapture(f); e.target.value = ""; }}
                    />
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <button
                        className="relative shrink-0 group"
                        onClick={() => setFullscreenUrl(previewSrc)}
                      >
                        <img
                          src={previewSrc}
                          alt="Preview"
                          className="w-36 h-36 rounded-xl object-cover bg-gray-100 border-2 border-gray-200 group-hover:brightness-90 transition-all"
                        />
                        <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                          <span className="text-white text-2xl">🔍</span>
                        </div>
                      </button>
                      <div className="flex-1 space-y-2">
                        {previewMeta && (
                          <div className="bg-gray-50 rounded-xl p-2.5 space-y-1 border border-gray-100">
                            <div className="text-[11px] text-gray-500 font-semibold">📐 {previewMeta.widthPx} × {previewMeta.heightPx} px</div>
                            <div className="text-[11px] text-gray-500 font-semibold">💾 {previewMeta.kb} KB</div>
                            <div className="text-[11px] text-gray-400">
                              📊 {previewMeta.widthPx > 0 ? (previewMeta.widthPx / previewMeta.heightPx).toFixed(2) : "—"} ratio
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => setMarkAsOfficial(v => !v)}
                          className={cn(
                            "w-full h-14 rounded-xl font-black text-sm flex items-center justify-center gap-2 border-2 transition-all",
                            markAsOfficial
                              ? "bg-lime-500 text-white border-lime-500 shadow-lg shadow-lime-200"
                              : "bg-white text-gray-600 border-gray-200 hover:border-lime-300",
                          )}
                        >
                          {markAsOfficial ? "✅ Salvar como OFICIAL" : "📸 Salvar como candidata"}
                        </button>
                        {markAsOfficial && product.officialImage && (
                          <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 border border-amber-200">
                            ⚠️ Substituirá a imagem oficial atual.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setPreviewSrc(null); setPreviewMeta(null); setSelectedFile(null); }}
                        disabled={uploading}
                        className="flex-1 h-12 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 disabled:opacity-50 transition-colors"
                      >
                        ✕ Cancelar
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={uploading || !selectedFile}
                        className="flex-[2] h-12 rounded-xl bg-lime-500 text-white font-black text-sm hover:bg-lime-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        {uploading
                          ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando…</>
                          : "📤 Enviar imagem"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Candidate gallery */}
              {product.images.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-black text-gray-800 mb-3">
                    🗂 Todas as imagens ({product.images.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {product.images.map(img => {
                      const isOff = img.imageStatus === "selected";
                      const isReview = img.imageStatus === "review";
                      const busy  = actionId === img.id;
                      return (
                        <div
                          key={img.id}
                          className={cn(
                            "rounded-xl border overflow-hidden transition-opacity",
                            isOff    && "border-2 border-lime-300 shadow-md",
                            isReview && !isOff && "border-2 border-orange-200",
                            !isOff && !isReview && "border border-gray-100",
                            busy && "opacity-40 pointer-events-none",
                          )}
                        >
                          {/* Image */}
                          <div className="relative">
                            <button
                              className="w-full"
                              onClick={() => setFullscreenUrl(img.url)}
                            >
                              <img
                                src={img.url}
                                alt=""
                                className="w-full aspect-square object-cover bg-gray-100 hover:brightness-90 transition-all"
                                loading="lazy"
                              />
                            </button>
                            {isOff && (
                              <div className="absolute top-1 right-1 bg-lime-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow">
                                ✅ OFICIAL
                              </div>
                            )}
                            {isReview && !isOff && (
                              <div className="absolute top-1 right-1 bg-orange-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow">
                                🔍 REVISÃO
                              </div>
                            )}
                          </div>

                          {/* Meta */}
                          <div className="p-2 space-y-1.5">
                            <div className="flex gap-1 flex-wrap">
                              <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded-full border", sourceBadgeCls(img.imageSource))}>
                                {img.imageSource}
                              </span>
                            </div>
                            {img.widthPx && (
                              <div className="text-[9px] text-gray-400">{img.widthPx}×{img.heightPx}px</div>
                            )}
                            {img.fileSizeBytes && (
                              <div className="text-[9px] text-gray-400">{fmtKb(img.fileSizeBytes)}</div>
                            )}
                            <div className="text-[9px] text-gray-300">{fmtDate(img.createdAt)}</div>

                            {/* Actions */}
                            <div className="flex gap-1">
                              {!isOff && (
                                <button
                                  onClick={() => handleMakeOfficial(img.id)}
                                  className="flex-1 text-[10px] font-bold py-1 rounded-lg bg-lime-50 text-lime-700 hover:bg-lime-100 transition-colors border border-lime-200"
                                >
                                  ✅
                                </button>
                              )}
                              {isOff && (
                                <button
                                  onClick={() => handleRemoveOfficial(img.id)}
                                  className="flex-1 text-[10px] font-bold py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
                                >
                                  ✕ rm
                                </button>
                              )}
                              <button
                                onClick={() => setFullscreenUrl(img.url)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors border border-gray-200"
                                title="Tela cheia"
                              >
                                🔍
                              </button>
                              <a
                                href={img.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors border border-gray-200"
                                download
                                title="Download"
                              >
                                ⬇
                              </a>
                              {!isOff && (
                                <button
                                  onClick={() => handleDelete(img.id)}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors border border-red-200"
                                  title="Rejeitar"
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Product timeline — activity log derived from images */}
              {product.images.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-black text-gray-800 mb-3">📋 Atividade do produto</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                      <span>Produto criado em {fmtDate(product.createdAt)}</span>
                    </div>
                    {[...product.images]
                      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                      .map(img => (
                        <div key={img.id} className="flex items-start gap-3 text-xs text-gray-500">
                          <span className={cn(
                            "w-2 h-2 rounded-full mt-1 shrink-0",
                            img.imageStatus === "selected" ? "bg-lime-400" :
                            img.imageStatus === "review"   ? "bg-orange-400" : "bg-indigo-300",
                          )} />
                          <div>
                            <span className="font-semibold text-gray-700">
                              {img.imageStatus === "selected" ? "✅ Imagem oficial definida" :
                               img.imageStatus === "review"   ? "🔍 Imagem em revisão" :
                               "📸 Imagem candidata adicionada"}
                            </span>
                            <span className="ml-1 text-gray-400">
                              · {img.imageSource}{img.selectedBy ? ` por ${img.selectedBy}` : ""}
                              {img.widthPx ? ` · ${img.widthPx}×${img.heightPx}px` : ""}
                            </span>
                            <div className="text-[10px] text-gray-300 mt-0.5">{fmtDate(img.createdAt)}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── Sticky bottom upload CTA ── */}
              {!previewSrc && (
                <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0">
                  <div className="bg-white/95 backdrop-blur-sm border-t-2 border-gray-100 px-4 pt-3 pb-4 shadow-[0_-4px_24px_rgba(0,0,0,0.10)]">
                    <p className="text-[10px] font-bold text-gray-400 text-center uppercase tracking-wide mb-2">Adicionar foto</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => cameraRef.current?.click()}
                        className="flex-1 h-12 rounded-xl bg-lime-500 hover:bg-lime-400 active:scale-95 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-lime-200"
                      >
                        <span>📷</span> Tirar Foto
                      </button>
                      <button
                        onClick={() => galleryRef.current?.click()}
                        className="flex-1 h-12 rounded-xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-200"
                      >
                        <span>🖼️</span> Escolher da Galeria
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Next product hint */}
              {supermarketMode ? (
                <div className="bg-lime-50 border border-lime-200 rounded-2xl p-3 flex items-center gap-3">
                  <span className="text-xl">🛒</span>
                  <div>
                    <p className="text-xs font-bold text-lime-800">Modo Supermercado</p>
                    <p className="text-[10px] text-lime-600">Após o upload, o scanner abre automaticamente.</p>
                  </div>
                  <button
                    onClick={resetToScanner}
                    className="ml-auto text-xs font-bold px-3 py-1.5 rounded-xl bg-lime-200 text-lime-800 hover:bg-lime-300 transition-colors shrink-0"
                  >
                    → Próximo
                  </button>
                </div>
              ) : (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 flex items-center gap-3">
                  <span className="text-xl">⚡</span>
                  <div>
                    <p className="text-xs font-bold text-purple-800">Próximo produto</p>
                    <p className="text-[10px] text-purple-600">Clique em ✕ acima ou escaneie outro código.</p>
                  </div>
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </>
  );
}
