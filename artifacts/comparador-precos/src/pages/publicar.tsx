import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Loader2, Tag, Store, DollarSign, Calendar, Hash, Camera, X,
  Sparkles, ChevronRight, Check, ScanLine, AlertCircle, Pencil, Info, Image as ImageIcon,
  Lock, RefreshCw, Share2, Copy, ExternalLink,
} from "lucide-react";
import { useCreateOferta, getListOfertasQueryKey, getGetStatsQueryKey, classificaTipoOferta as callClassificaTipoAPI } from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";
import { LoginGate } from "@/lib/login-prompt";
import { MarketPicker } from "@/components/MarketPicker";
import { type ConfirmedMarket } from "@/lib/geo";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { ScannerIA } from "@/components/scanner-ia";

/* ── Categories & auto-detect ───────────────────────────────────────────── */

const CATEGORIES = [
  "Alimentos", "Bebidas", "Limpeza", "Higiene", "Carnes",
  "Hortifruti", "Bebê", "Pet", "Laticínios", "Padaria", "Congelados", "Outros",
];

const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  Alimentos:  { emoji: "🌾", color: "#f59e0b" },
  Bebidas:    { emoji: "🥤", color: "#3b82f6" },
  Limpeza:    { emoji: "🧹", color: "#8b5cf6" },
  Higiene:    { emoji: "🧴", color: "#06b6d4" },
  Carnes:     { emoji: "🥩", color: "#ef4444" },
  Hortifruti: { emoji: "🥦", color: "#22c55e" },
  Bebê:       { emoji: "🍼", color: "#ec4899" },
  Pet:        { emoji: "🐾", color: "#f97316" },
  "Laticínios": { emoji: "🥛", color: "#0ea5e9" },
  Padaria:    { emoji: "🍞", color: "#d97706" },
  Congelados: { emoji: "❄️", color: "#38bdf8" },
  Outros:     { emoji: "📦", color: "#64748b" },
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Alimentos:    ["arroz", "feijao", "feijão", "macarrao", "macarrão", "farinha", "açucar", "acucar", "açúcar", "sal", "oleo", "óleo", "azeite", "café", "cafe", "achocolatado", "biscoito", "bolacha", "margarina", "massa", "caldo", "molho", "extrato", "vinagre", "atum", "sardinha"],
  Bebidas:      ["suco", "refrigerante", "agua", "água", "cerveja", "vinho", "energetico", "energético", "isotônico", "isotonico", "coca", "pepsi", "guarana", "guaraná", "nectar", "néctar"],
  "Laticínios": ["leite", "iogurte", "queijo", "requeijao", "requeijão", "creme de leite", "manteiga"],
  Padaria:      ["pão", "pao", "bolo", "torrada", "croissant", "bisnaguinha", "bisnaga"],
  Limpeza:      ["detergente", "sabão", "sabao", "amaciante", "desinfetante", "agua sanitaria", "limpador", "esponja", "papel higienico", "papel higiênico", "papel toalha", "alcool", "álcool", "multiuso", "tira manchas", "ypê", "ype"],
  Higiene:      ["shampoo", "condicionador", "sabonete", "creme dental", "escova", "desodorante", "fio dental", "absorvente", "protetor", "hidratante", "perfume", "barbear"],
  Carnes:       ["carne", "frango", "linguiça", "linguica", "salsicha", "presunto", "peito", "costela", "alcatra", "picanha", "filé", "file", "contrafilé", "contrafile", "patinho", "coxao", "coxão", "acém", "acem", "bacon", "camarao", "camarão", "peixe"],
  Hortifruti:   ["banana", "maçã", "maca", "laranja", "tomate", "alface", "cebola", "alho", "batata", "cenoura", "limão", "limao", "manga", "uva", "melancia", "abacaxi", "morango", "brocolis", "brócolis", "pepino", "pimentao", "pimentão", "couve"],
  Congelados:   ["congelado", "pizza", "lasanha", "hamburguer", "hambúrguer", "sorvete", "açaí", "acai", "nuggets"],
  Bebê:         ["fralda", "mamadeira", "chupeta", "ninho", "nestogeno", "aptamil", "milupa"],
  Pet:          ["ração", "racao", "petisco", "areia", "antipulgas", "coleira"],
};

function detectCategory(product: string): string | null {
  const lower = product.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
      return cat;
    }
  }
  return null;
}

/* ── Schema ─────────────────────────────────────────────────────────────── */

const UNIDADES = ["un", "kg", "g", "litro", "ml", "pacote", "caixa", "fardo"] as const;
type UnidadeType = typeof UNIDADES[number];

const UNIDADES_COM_BARRA = new Set<UnidadeType>(["kg", "g", "litro", "ml"]);

const schema = z.object({
  produto:   z.string().min(2,  "Informe o nome do produto"),
  categoria: z.string().min(1,  "Selecione uma categoria"),
  marca:     z.string().optional(),
  preco:     z.coerce.number().positive("O preço deve ser maior que zero"),
  mercado:   z.string().min(2,  "Informe o nome do mercado"),
  bairro:    z.string().min(2,  "Informe o bairro"),
  cidade:    z.string().min(2,  "Informe a cidade"),
  validade:  z.string().optional(),
  unidade:   z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/* ── OCR result type ─────────────────────────────────────────────────────── */

interface OcrResult {
  produto: string | null;
  preco: number | null;
  marca: string | null;
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
}

/* ── Location utils ──────────────────────────────────────────────────────── */

/** Haversine distance in metres between two GPS points. */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Reverse-geocode lat/lng via Nominatim. Returns bairro + cidade strings. */
async function reverseGeocode(lat: number, lng: number): Promise<{ bairro: string; cidade: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
      { headers: { "User-Agent": "AiCompensa/1.0 (aicompensa.com.br)" } },
    );
    if (!res.ok) return { bairro: "", cidade: "" };
    const data = await res.json() as { address?: Record<string, string> };
    const addr = data.address ?? {};
    const bairro =
      addr.suburb ?? addr.neighbourhood ?? addr.district ?? addr.quarter ?? addr.hamlet ?? "";
    const cidade =
      addr.city ?? addr.town ?? addr.municipality ?? addr.county ?? addr.state_district ?? "";
    return { bairro, cidade };
  } catch {
    return { bairro: "", cidade: "" };
  }
}

/* ── Image utils ─────────────────────────────────────────────────────────── */

const MAX_B64_CHARS = 500 * 1024;

function resizeImage(file: File, maxPx = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = maxPx;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else                { width  = Math.round((width  * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        const qualities = [0.78, 0.65, 0.50, 0.35, 0.20];
        for (const q of qualities) {
          const b64 = canvas.toDataURL("image/jpeg", q);
          if (b64.length <= MAX_B64_CHARS) { resolve(b64); return; }
        }
        reject(new Error("Imagem muito grande mesmo após compressão. Tente uma foto com menos detalhes."));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Reads EXIF DateTimeOriginal from a JPEG file without any library.
 *  Returns the capture date, or null if unavailable (PNG, no EXIF, screenshot). */
async function readExifDate(file: File): Promise<Date | null> {
  try {
    const buf  = await file.arrayBuffer();
    const text = new TextDecoder("ascii", { fatal: false }).decode(new Uint8Array(buf).slice(0, 65536));
    const m    = /(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}/.exec(text);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    // Sanity check: date must be plausible (2010–now)
    if (d.getFullYear() < 2010 || d > new Date()) return null;
    return d;
  } catch { return null; }
}

/* ── Helper components ───────────────────────────────────────────────────── */

function Req() {
  return <span className="text-red-400 ml-0.5">*</span>;
}

function DarkInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-[#0d0620] text-white placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#D4A017]/40 transition-colors ${className}`}
    />
  );
}

/* ── Live preview card ───────────────────────────────────────────────────── */

function LivePreview({ produto, categoria, preco, mercado, bairro, photo, unidade }: {
  produto: string; categoria: string; preco: number | string;
  mercado: string; bairro: string; photo: string | null; unidade?: string;
}) {
  const hasContent = produto.length > 1 || mercado.length > 1;
  if (!hasContent) return null;
  const meta = CATEGORY_META[categoria] ?? CATEGORY_META["Outros"];
  const precoNum = typeof preco === "number" ? preco : parseFloat(String(preco).replace(",", "."));
  const precoStr = !isNaN(precoNum) && precoNum > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(precoNum)
    : null;
  const showBarra = unidade && unidade !== "un" && UNIDADES_COM_BARRA.has(unidade as UnidadeType);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="mb-4"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
        Preview da oferta
      </p>
      <div className="bg-[#1d0e36] rounded-2xl p-3 flex gap-3 border border-[#3a1867]/80 shadow-lg overflow-hidden">
        <div
          className="w-[64px] h-[64px] rounded-xl shrink-0 flex items-center justify-center text-2xl overflow-hidden"
          style={{ background: `${meta.color}22`, border: `1.5px solid ${meta.color}44` }}
        >
          {photo
            ? <img src={photo} alt="" className="w-full h-full object-cover rounded-xl" />
            : <span>{meta.emoji}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${meta.color}22`, color: meta.color }}
            >
              {meta.emoji} {categoria || "Categoria"}
            </span>
          </div>
          <p className="text-white font-black text-sm leading-tight truncate">
            {produto || "Nome do produto"}
          </p>
          <p className="text-slate-400 text-xs truncate">
            {mercado || "Mercado"}{bairro ? ` · ${bairro}` : ""}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {precoStr ? (
              <span className="text-[#F2C14E] font-black text-base leading-none">
                {precoStr}
                {showBarra && (
                  <span className="text-xs font-bold text-[#D4A017]/70">/{unidade}</span>
                )}
              </span>
            ) : (
              <span className="text-slate-600 text-sm">R$ —</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── OCR filled badge ────────────────────────────────────────────────────── */

function OcrFilledBadge({ field }: { field: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-300 bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.5 rounded-full ml-1.5">
      <ScanLine className="h-2.5 w-2.5" /> IA
    </span>
  );
}

/* ── Auth gate ───────────────────────────────────────────────────────────── */

export default function Publicar() {
  if (!getCurrentUser()) {
    return <LoginGate returnTo="/publicar" />;
  }
  return <PublicarForm />;
}

/* ── Main form ───────────────────────────────────────────────────────────── */

function PublicarForm() {
  useSeo({
    title: "Publicar Oferta",
    description: "Publique uma oferta de supermercado e ajude a comunidade a economizar. Ganhe pontos por cada oferta confirmada.",
    url: "https://aicompensa.com.br/publicar",
  });
  const [, setLocation]        = useLocation();
  const queryClient            = useQueryClient();
  const [isLocating, setIsLocating]         = useState(false);
  const [autoLocating, setAutoLocating]     = useState(false);
  // Raw GPS captured on mount (used only for suggestions before market is confirmed)
  const [coords, setCoords]                 = useState<{ lat: number; lng: number } | null>(null);
  // Frozen market coords — set when user confirms the market; submitted with the offer
  const [lockedCoords, setLockedCoords]     = useState<{ lat: number; lng: number } | null>(null);
  const [marketCoordsLocked, setMarketCoordsLocked] = useState(false);
  const [driftWarning, setDriftWarning]     = useState(false);
  const geoWatchIdRef                       = useRef<number | null>(null);
  const [photoB64, setPhotoB64]             = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [ocrDone, setOcrDone]           = useState(false);
  const [autoDetected, setAutoDetected] = useState<string | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);

  // ── Continuous publishing flow ────────────────────────────────────────────
  type SuccessCtx = {
    pontos: number;
    wasConfirmation: boolean;
    isPendente: boolean;
    produto: string; preco: number; ofertaId: number;
    mercado: string; bairro: string; cidade: string; categoria: string;
    lockedCoords: { lat: number; lng: number } | null;
    locationMode: "none" | "gps_confirmed" | "manual_only";
    marketContext: ConfirmedMarket | null;
  };
  const [successCtx, setSuccessCtx]     = useState<SuccessCtx | null>(null);
  const [ofertasNaSessao, setOfertasNaSessao] = useState(0);
  const modoMercadoAtivo = ofertasNaSessao >= 2;

  // OCR-specific state
  const [ocrLoading, setOcrLoading]           = useState(false);
  const [ocrFilledFields, setOcrFilledFields] = useState<Set<string>>(new Set());
  const [ocrError, setOcrError]               = useState<string | null>(null);
  const [ocrPhotoPreview, setOcrPhotoPreview] = useState<string | null>(null);
  const [photoFromOcr, setPhotoFromOcr]       = useState(false);
  const [photoSource, setPhotoSource]         = useState<"camera" | "galeria" | null>(null);
  const [exifWarning, setExifWarning]         = useState(false);
  // AI category suggestion — set after OCR, used for hybrid conflict dialog
  const [aiSuggestedCategory, setAiSuggestedCategory] = useState<string | null>(null);
  const [showCatConflictDialog, setShowCatConflictDialog] = useState(false);
  const [pendingCatChange, setPendingCatChange]           = useState<string | null>(null);
  // PRIVACY: ALL photo sources require explicit GPS confirmation — "none" = not confirmed yet
  // "gps_confirmed" = user clicked "Estou no mercado agora" | "manual_only" = text fields only
  const [locationMode, setLocationMode] = useState<"none" | "gps_confirmed" | "manual_only">("none");
  // Confirmed market from MarketPicker — drives locationMode + lockedCoords
  const [confirmedMarket, setConfirmedMarket] = useState<ConfirmedMarket | null>(null);
  // Tipo de oferta: presencial (foto no mercado) ou encarte (folder/panfleto)
  const [tipoOferta, setTipoOferta]       = useState<"presencial" | "encarte" | null>(null);
  const [classificandoTipo, setClassificandoTipo] = useState(false);
  const [tipoConfianca, setTipoConfianca] = useState<number | null>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);

  /* ── Background AI tipo classification ── */
  const runClassificaTipo = async (b64: string) => {
    setClassificandoTipo(true);
    setTipoOferta(null);
    setTipoConfianca(null);
    try {
      const result = await callClassificaTipoAPI({ imageBase64: b64 });
      setTipoOferta(result.tipo as "presencial" | "encarte");
      setTipoConfianca(result.confianca);
    } catch {
      // fallback: user will see the selector and pick manually
    } finally {
      setClassificandoTipo(false);
    }
  };

  const resetTipoState = () => {
    setTipoOferta(null);
    setTipoConfianca(null);
    setClassificandoTipo(false);
  };

  const createMutation = useCreateOferta();

  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const t = setTimeout(() => setCooldownSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownSecs]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      produto: "", categoria: "", marca: "",
      preco: undefined as unknown as number,
      mercado: "", bairro: "", cidade: "", validade: "",
    },
  });

  const watched = useWatch({ control: form.control });

  /* ── Product photo — câmera ── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setOcrDone(false);
    setPhotoFromOcr(false);
    setExifWarning(false);
    try {
      const b64 = await resizeImage(file);
      setPhotoB64(b64);
      setPhotoSource("camera");
      resetTipoState();
      // AI classification runs in background — camera photos default to presencial
      runClassificaTipo(b64).catch(() => { setTipoOferta("presencial"); setClassificandoTipo(false); });
      // PRIVACY: camera photos also require explicit store confirmation —
      // GPS at photo-capture time could still be home if the form was opened there
      setConfirmedMarket(null);
      setLocationMode("none");
      setLockedCoords(null);
      setMarketCoordsLocked(false);
      setDriftWarning(false);
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    } catch {
      toast.error("Erro ao processar a imagem. Tente novamente.");
    } finally {
      setPhotoLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Shared OCR logic — runs on any File (camera scan OR gallery) ── */
  const runOcrOnFile = async (file: File): Promise<boolean> => {
    setOcrLoading(true);
    setOcrError(null);
    setOcrFilledFields(new Set());

    try {
      // 1200px for OCR accuracy, 900px for the product photo — in parallel
      const [b64Ocr, b64Photo] = await Promise.all([
        resizeImage(file, 1200),
        resizeImage(file, 900),
      ]);
      setOcrPhotoPreview(b64Ocr);

      // Keep the photo regardless of OCR outcome
      setPhotoB64(b64Photo);
      setPhotoFromOcr(true);

      const response = await fetch("/api/ocr/placa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64Ocr }),
      });

      const result: OcrResult & { error?: string } = await response.json();

      // Content safety block — reject the image
      if (response.status === 422) {
        setPhotoB64(null);
        setPhotoFromOcr(false);
        if (result.error === "conteudo_improprio") {
          setOcrError("Imagem com conteúdo impróprio. Envie apenas fotos de produtos ou etiquetas de preço.");
          toast.error("⛔ Imagem bloqueada por segurança.", { duration: 5000 });
        } else {
          setOcrError("Imagem não reconhecida como produto de supermercado. Aponte a câmera para uma etiqueta ou embalagem.");
          toast.error("⛔ Imagem inválida para oferta.", { duration: 5000 });
        }
        return false; // blocked — caller should reset photoSource
      }

      if (!response.ok) throw new Error(result.error ?? "Erro no servidor");

      const filled = new Set<string>();

      if (result.produto) {
        form.setValue("produto", result.produto, { shouldValidate: true });
        filled.add("produto");
        const detected = detectCategory(result.produto);
        if (detected && !form.getValues("categoria")) {
          form.setValue("categoria", detected, { shouldValidate: true });
          filled.add("categoria");
        }
      }
      if (result.preco && result.preco > 0) {
        form.setValue("preco", result.preco, { shouldValidate: true });
        filled.add("preco");
      }
      if (result.marca) {
        form.setValue("marca", result.marca, { shouldValidate: true });
        filled.add("marca");
      }
      if (result.categoria && CATEGORIES.includes(result.categoria)) {
        form.setValue("categoria", result.categoria, { shouldValidate: true });
        filled.add("categoria");
        // Save AI suggestion for hybrid conflict dialog
        setAiSuggestedCategory(result.categoria);
      }
      if (result.validade) {
        form.setValue("validade", result.validade, { shouldValidate: true });
        filled.add("validade");
      }

      if (result.unidade && UNIDADES.includes(result.unidade as UnidadeType)) {
        form.setValue("unidade", result.unidade, { shouldValidate: true });
        filled.add("unidade");
      }

      setOcrFilledFields(filled);
      setOcrDone(true);

      if (result.sucesso && !result.parcial) {
        const confStr = result.confiancaIa != null
          ? ` (confiança: ${Math.round(result.confiancaIa * 100)}%)`
          : "";
        toast.success(`📸 Foto adicionada e dados identificados${confStr}`, { duration: 4000 });
        if (result.observacao) toast.info(`💡 ${result.observacao}`, { duration: 5000 });
      } else if (result.sucesso && result.parcial) {
        setOcrError(result.mensagem);
        toast.info(`📸 Foto adicionada. ${result.mensagem}`, { duration: 5000 });
        if (result.observacao) toast.info(`💡 ${result.observacao}`, { duration: 5000 });
      } else {
        setOcrError(result.mensagem);
        toast.warning(`📸 Foto adicionada. ⚠️ ${result.mensagem}`, { duration: 5000 });
      }
      return true; // accepted
    } catch (err) {
      // On error: keep photo but allow manual fill
      setPhotoFromOcr(false);
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setOcrError("Não foi possível ler os dados automaticamente. Preencha manualmente.");
      toast.warning(`📸 Foto salva. Preencha os campos manualmente.`, { duration: 5000 });
      if (msg !== "Erro inesperado") toast.error(`Detalhe: ${msg}`, { duration: 4000 });
      return true; // error but photo kept — show MarketPicker anyway
    } finally {
      setOcrLoading(false);
    }
  };

  /* ── Product photo — galeria (+ OCR automático) ── */
  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExifWarning(false);
    setPhotoSource("galeria");

    // PRIVACY: clear all GPS state — gallery photos must never inherit home/previous coords
    setConfirmedMarket(null);
    setLocationMode("none");
    setLockedCoords(null);
    setMarketCoordsLocked(false);
    setDriftWarning(false);
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    }

    // Check EXIF date in the background (non-blocking)
    readExifDate(file).then((exifDate) => {
      if (exifDate) {
        const ageDays = (Date.now() - exifDate.getTime()) / 86_400_000;
        if (ageDays > 7) setExifWarning(true);
      }
    });

    if (galleryInputRef.current) galleryInputRef.current.value = "";

    // Run OCR on the gallery image — fills photo + form fields automatically
    await runOcrOnFile(file);

    // Keep "Da galeria" badge — runOcrOnFile sets photoFromOcr=true for scan-button flow,
    // but for gallery we want the source badge to reflect "galeria"
    setPhotoFromOcr(false);

    // AI tipo classification in background — gallery photos often encartes
    resetTipoState();
    resizeImage(file, 900).then((b64) => {
      runClassificaTipo(b64).catch(() => setClassificandoTipo(false));
    }).catch(() => {});
  };

  /* ── OCR: read price tag via dedicated scan button ── */
  const handleOcrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (ocrFileInputRef.current) ocrFileInputRef.current.value = "";
    // Mark as camera source BEFORE running OCR so MarketPicker is shown after the photo
    // is accepted. This is the root cause of coordinates never being saved for OCR-first
    // offers: photoSource stayed null → MarketPicker never rendered → locationMode="none".
    setPhotoSource("camera");
    const accepted = await runOcrOnFile(file);
    if (!accepted) {
      // Content blocked — remove the camera source flag so MarketPicker doesn't appear
      setPhotoSource(null);
    }
    // Keep "camera" badge for accepted photos (AI tipo classification runs in background)
  };

  /**
   * Race-condition fix: if GPS resolves AFTER the user already confirmed a market
   * that has no coordinates in our DB, retroactively apply the GPS fallback.
   * Without this, fast users who pick the market before GPS settles lose their coords.
   */
  useEffect(() => {
    if (!coords) return;                                              // GPS not ready yet
    if (!confirmedMarket) return;                                     // no market selected
    if (lockedCoords) return;                                         // already have coords
    if (confirmedMarket.lat !== undefined && confirmedMarket.lng !== undefined) return; // market has own coords
    // GPS just arrived after market was already chosen — apply the fallback now
    setLockedCoords(coords);
    setMarketCoordsLocked(true);
    setLocationMode("gps_confirmed");
  }, [coords, confirmedMarket, lockedCoords]);

  /* ── Auto-capture GPS on mount: suggest bairro/cidade only ── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    setAutoLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        setAutoLocating(false);
        // Reverse-geocode to pre-fill bairro + cidade (only if fields are empty)
        const { bairro, cidade } = await reverseGeocode(lat, lng);
        if (bairro && !form.getValues("bairro")) form.setValue("bairro", bairro, { shouldValidate: false });
        if (cidade && !form.getValues("cidade")) form.setValue("cidade", cidade,  { shouldValidate: false });
      },
      () => { setAutoLocating(false); },
      { timeout: 12000, enableHighAccuracy: false },
    );
    // Cleanup watch on unmount
    return () => {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lock market coords when user confirms the market field. */
  const lockMarketCoords = (currentCoords: { lat: number; lng: number } | null) => {
    if (marketCoordsLocked || !currentCoords) return;
    setLockedCoords(currentCoords);
    setMarketCoordsLocked(true);
    // Start drift watch — warn if user moves >500 m from the locked market position
    if (geoWatchIdRef.current !== null) navigator.geolocation.clearWatch(geoWatchIdRef.current);
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const dist = haversine(
          currentCoords.lat, currentCoords.lng,
          pos.coords.latitude,  pos.coords.longitude,
        );
        if (dist > 500) {
          setDriftWarning(true);
          if (geoWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(geoWatchIdRef.current);
            geoWatchIdRef.current = null;
          }
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 30000 },
    );
  };

  /** Reset all market/location state — shows MarketPicker again. */
  const resetMarketLocation = () => {
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    }
    setConfirmedMarket(null);
    setMarketCoordsLocked(false);
    setLockedCoords(null);
    setDriftWarning(false);
    setLocationMode("none");
  };

  /** Called by MarketPicker when the user confirms a market. */
  const handleMarketConfirmed = (market: ConfirmedMarket) => {
    setConfirmedMarket(market);
    form.setValue("mercado", market.nome, { shouldValidate: true });
    if (market.bairro) form.setValue("bairro", market.bairro, { shouldValidate: false });
    if (market.cidade) form.setValue("cidade", market.cidade, { shouldValidate: false });
    if (market.lat !== undefined && market.lng !== undefined) {
      // Market has its own registered coordinates — use them (most accurate)
      setLockedCoords({ lat: market.lat, lng: market.lng });
      setMarketCoordsLocked(true);
      setLocationMode("gps_confirmed");
    } else if (coords) {
      // Market has no coordinates in our DB, but the user's device GPS is available.
      // Use the user's current position as a proxy for the market location.
      // This is safe: the user confirmed they are at this store right now.
      setLockedCoords(coords);
      setMarketCoordsLocked(true);
      setLocationMode("gps_confirmed");
    } else {
      setLockedCoords(null);
      setMarketCoordsLocked(false);
      setLocationMode("manual_only");
    }
  };

  /* ── Manual GPS button (only used when not yet locked) ── */
  const getLocation = () => {
    if (marketCoordsLocked) return; // already frozen
    if (!navigator.geolocation) { toast.error("Seu navegador não suporta geolocalização"); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        setIsLocating(false);
        toast.success("Localização capturada!");
        const { bairro, cidade } = await reverseGeocode(lat, lng);
        if (bairro && !form.getValues("bairro")) form.setValue("bairro", bairro, { shouldValidate: false });
        if (cidade  && !form.getValues("cidade"))  form.setValue("cidade",  cidade,  { shouldValidate: false });
      },
      () => { toast.error("Erro ao capturar localização. Verifique as permissões."); setIsLocating(false); },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  /* ── Submit ── */
  const onSubmit = (data: FormValues) => {
    if (!photoB64) {
      toast.error("Adicione uma foto do produto antes de publicar.");
      return;
    }
    const payloadLat  = locationMode === "gps_confirmed" ? lockedCoords?.lat  : undefined;
    const payloadLng  = locationMode === "gps_confirmed" ? lockedCoords?.lng  : undefined;
    const payloadTipo = tipoOferta ?? (photoSource === "camera" ? "presencial" : (photoSource === "galeria" ? "galeria" : "manual"));
    // [GPS-AUDIT] Log location state before every POST /api/ofertas
    console.log("[GPS-AUDIT] submit", {
      photoSource,
      locationMode,
      coords,
      lockedCoords,
      confirmedMarketLat: confirmedMarket?.lat,
      confirmedMarketLng: confirmedMarket?.lng,
      payloadLat,
      payloadLng,
      tipoOrigem: payloadTipo,
    });
    createMutation.mutate(
      {
        data: {
          produto:    data.produto,
          categoria:  data.categoria,
          marca:      data.marca || undefined,
          preco:      data.preco,
          mercado:    data.mercado,
          bairro:     data.bairro,
          cidade:     data.cidade,
          fotoUrl:    photoB64,
          validade:   data.validade || undefined,
          // PRIVACY (universal): coordinates are ONLY sent when user explicitly confirmed
          // they are at the store right now — applies to ALL photo sources (camera, gallery, folder).
          // Never send ambient GPS (could be home/office). Bairro+cidade fields are always safe.
          latitude:   payloadLat,
          longitude:  payloadLng,
          tipoOrigem: payloadTipo,
          unidade:    data.unidade || "un",
        },
      },
      {
        onSuccess: (responseData) => {
          queryClient.invalidateQueries({ queryKey: getListOfertasQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
          const isConf = !!(responseData as { wasConfirmation?: boolean })?.wasConfirmation;
          const isPend = photoSource === "galeria";
          const ptNova = tipoOferta === "encarte" ? 6 : 10;
          setSuccessCtx({
            pontos: isConf ? 2 : ptNova,
            wasConfirmation: isConf,
            isPendente: isPend,
            produto: data.produto,
            preco: Number(data.preco),
            ofertaId: (responseData as { id?: number })?.id ?? 0,
            mercado: data.mercado,
            bairro: data.bairro,
            cidade: data.cidade,
            categoria: data.categoria,
            lockedCoords,
            locationMode,
            marketContext: confirmedMarket,
          });
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error;
          toast.error(msg ?? "Erro ao publicar a oferta. Tente novamente.");
        },
      }
    );
  };

  const onInvalid = () => {
    if (!photoB64) toast.error("Adicione uma foto do produto antes de publicar.");
    else toast.error("Preencha todos os campos obrigatórios.");
  };

  // ── "Publicar outra" — resets product fields, keeps market context ────────
  const handlePublicarOutra = () => {
    if (!successCtx) return;
    form.reset({
      produto: "",
      preco: undefined as unknown as number,
      marca: "",
      categoria: "",
      mercado: successCtx.mercado,
      bairro: successCtx.bairro,
      cidade: successCtx.cidade,
      validade: "",
      unidade: "un",
    });
    setPhotoB64(null);
    setPhotoFromOcr(false);
    setPhotoSource(null);
    setOcrDone(false);
    setOcrFilledFields(new Set());
    setOcrError(null);
    setExifWarning(false);
    setAutoDetected(null);
    setLockedCoords(successCtx.lockedCoords);
    setLocationMode(successCtx.locationMode);
    setMarketCoordsLocked(successCtx.locationMode === "gps_confirmed");
    setConfirmedMarket(successCtx.marketContext);
    setDriftWarning(false);
    setOfertasNaSessao((n) => n + 1);
    setSuccessCtx(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Reopen the OCR camera (same input as the "Escanear oferta" CTA card)
    // so the AI fills produto/preço/categoria automatically, matching first-use behavior.
    setTimeout(() => ocrFileInputRef.current?.click(), 120);
  };

  const currentUser = getCurrentUser();

  return (
    <>
      <ScannerIA isVisible={ocrLoading} photoPreview={ocrPhotoPreview} />
      <motion.div
        key={ofertasNaSessao}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
        className="max-w-xl mx-auto w-full pb-8"
      >
      {/* ── Gamification strip ── */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(135deg, #1a4d00 0%, #0f3300 100%)", borderBottom: "1px solid rgba(242,193,78,0.15)" }}
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#F2C14E]/20 shrink-0">
          <Sparkles className="h-5 w-5 text-[#F2C14E]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#F2C14E]/80 font-black text-sm">Compartilhe e ganhe pontos!</p>
          <p className="text-[#D4A017]/70 text-xs">Presencial <span className="text-[#F2C14E] font-bold">+10 pts</span> · Encarte <span className="text-[#F2C14E] font-bold">+6 pts</span> · Confirmar <span className="text-[#F2C14E] font-bold">+2 pts</span></p>
          {currentUser && (
            <p className="text-[#B8900E]/80 text-[10px] mt-0.5">
              {(currentUser.semLimite || currentUser.colaboradorPioneiro)
                ? "📤 Publicação sem limite diário"
                : (() => {
                    const usado = currentUser.ofertasHoje ?? 0;
                    const limite = currentUser.limiteDiario ?? 5;
                    const quase = usado >= limite - 1 && usado < limite;
                    return (
                      <span className={quase ? "text-orange-400 font-bold" : ""}>
                        📤 Hoje: {usado}/{limite} ofertas{quase ? " — perto do limite" : ""}
                      </span>
                    );
                  })()
              }
            </p>
          )}
        </div>
        {currentUser && (
          <div className="shrink-0 text-right">
            <p className="text-[#F2C14E] font-black text-base leading-none">{currentUser.pontos ?? 0}</p>
            <p className="text-[#B8900E] text-[10px]">pontos</p>
          </div>
        )}
      </div>

      {/* ── Modo Mercado banner ── */}
      <AnimatePresence>
        {modoMercadoAtivo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2.5 flex items-center gap-2.5"
              style={{ background: "linear-gradient(90deg, #0c2a4a 0%, #0a1f38 100%)", borderBottom: "1px solid rgba(56,189,248,0.2)" }}>
              <span className="text-lg leading-none">🏪</span>
              <div className="flex-1 min-w-0">
                <p className="text-sky-300 font-black text-xs">Modo Mercado ativo</p>
                <p className="text-sky-500/70 text-[10px] truncate">
                  {ofertasNaSessao} oferta{ofertasNaSessao !== 1 ? "s" : ""} publicada{ofertasNaSessao !== 1 ? "s" : ""} nesta sessão · mercado pré-preenchido
                </p>
              </div>
              <span className="shrink-0 text-sky-400 font-black text-sm bg-sky-400/10 border border-sky-400/20 px-2 py-0.5 rounded-full">
                ⚡ Rápido
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pt-4 pb-6">
        {/* ── Title ── */}
        <div className="mb-4">
          <h1 className="text-2xl font-black tracking-tight text-[#F2C14E] mb-0.5">Achou promoção?</h1>
          <p className="text-slate-500 text-sm">Campos com <span className="text-red-400">*</span> são obrigatórios.</p>
        </div>

        {/* Hidden inputs */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleGalleryFileChange}
        />

        {/* ── OCR Scan Area ── */}
        <input
          ref={ocrFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleOcrFileChange}
        />

        <motion.div
          className="mb-5"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <AnimatePresence mode="wait">
            {/* ── SUCCESS: dados identificados ── */}
            {ocrDone && ocrFilledFields.size > 0 ? (
              <motion.div
                key="ocr-success"
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 360, damping: 28 }}
                className="rounded-3xl overflow-hidden"
                style={{
                  background: "linear-gradient(160deg, rgba(13,6,28,0.97), rgba(8,2,18,0.99))",
                  border: "1px solid rgba(58,24,103,0.7)",
                }}
              >
                {/* Header */}
                <div
                  className="px-4 py-3 flex items-center gap-2"
                  style={{
                    borderBottom: "1px solid rgba(58,24,103,0.5)",
                    background: "rgba(19,9,38,0.6)",
                  }}
                >
                  <p className="text-white font-black text-sm">A IA identificou</p>
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(242,193,78,0.1)",
                      color: "#F2C14E",
                      border: "1px solid rgba(242,193,78,0.25)",
                    }}
                  >
                    BETA
                  </span>
                  <button
                    type="button"
                    onClick={() => ocrFileInputRef.current?.click()}
                    className="ml-auto flex items-center gap-1 active:opacity-60 transition-opacity"
                  >
                    <span className="text-[11px] font-bold text-slate-400">Editar tudo</span>
                    <Pencil className="h-3 w-3 text-slate-400" />
                  </button>
                </div>

                {/* 4-col fields grid */}
                <div className="px-3 py-3 grid grid-cols-4 gap-2">
                  {(
                    [
                      { field: "produto",   label: "Produto",   Icon: Tag,        color: "#F2C14E", bg: "rgba(242,193,78,0.1)",  val: watched.produto },
                      { field: "preco",     label: "Preço",     Icon: DollarSign, color: "#22c55e", bg: "rgba(34,197,94,0.1)",   val: watched.preco ? `R$ ${String(watched.preco).replace(".", ",")}` : null },
                      { field: "mercado",   label: "Mercado",   Icon: Store,      color: "#8B5CF6", bg: "rgba(139,92,246,0.14)", val: watched.mercado },
                      { field: "categoria", label: "Categ.",    Icon: Hash,       color: "#f97316", bg: "rgba(249,115,22,0.1)",  val: watched.categoria },
                      { field: "marca",     label: "Marca",     Icon: Sparkles,   color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  val: watched.marca },
                    ] as Array<{ field: string; label: string; Icon: React.ElementType; color: string; bg: string; val: string | null | undefined }>
                  )
                    .filter((f) => ocrFilledFields.has(f.field))
                    .map(({ field, label, Icon, color, bg, val }, idx) => (
                      <motion.div
                        key={field}
                        initial={{ opacity: 0, y: 12, scale: 0.88 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          delay: idx * 0.09,
                          type: "spring",
                          stiffness: 400,
                          damping: 24,
                        }}
                        className="flex flex-col items-center gap-1 rounded-2xl py-2.5 px-1 relative overflow-hidden"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {/* Sweep shimmer */}
                        <motion.div
                          aria-hidden
                          className="absolute inset-0 pointer-events-none"
                          initial={{ x: "-120%" }}
                          animate={{ x: "220%" }}
                          transition={{ delay: idx * 0.09 + 0.1, duration: 0.5, ease: "easeOut" }}
                          style={{
                            background: "linear-gradient(90deg, transparent, rgba(242,193,78,0.06), transparent)",
                          }}
                        />
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-xl"
                          style={{ background: bg }}
                        >
                          <Icon className="h-4 w-4" style={{ color }} />
                        </div>
                        <p className="text-[9px] text-slate-500 font-semibold leading-none">{label}</p>
                        <p className="text-white font-black text-[10px] text-center leading-tight w-full px-0.5 truncate">
                          {val || "—"}
                        </p>
                      </motion.div>
                    ))}
                </div>

                {/* Info note */}
                {ocrError ? (
                  <div
                    className="mx-3 mb-3 flex items-start gap-2 rounded-xl px-3 py-2"
                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-amber-300 text-[11px]">{ocrError} Complete manualmente.</p>
                  </div>
                ) : (
                  <div
                    className="mx-3 mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <Info className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                    <p className="text-slate-500 text-[11px]">Revise os dados antes de continuar.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              /* ── IDLE / LOADING: área de scan ── */
              <motion.div key="ocr-idle">
                {/* Main scan card — whole area is tappable */}
                <motion.button
                  type="button"
                  disabled={ocrLoading}
                  onClick={() => ocrFileInputRef.current?.click()}
                  className="relative w-full overflow-hidden rounded-3xl text-center"
                  style={{
                    background: "linear-gradient(160deg, rgba(13,6,28,0.95) 0%, rgba(8,2,18,0.98) 100%)",
                    border: "1.5px dashed rgba(242,193,78,0.42)",
                    padding: "32px 24px 28px",
                  }}
                  whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
                  animate={{
                    boxShadow: [
                      "0 0 0 0px rgba(242,193,78,0.0), 0 8px 40px rgba(242,193,78,0.05)",
                      "0 0 0 3px rgba(242,193,78,0.08), 0 8px 40px rgba(242,193,78,0.14)",
                      "0 0 0 0px rgba(242,193,78,0.0), 0 8px 40px rgba(242,193,78,0.05)",
                    ],
                  }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  {/* Dot-grid texture */}
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: "radial-gradient(rgba(242,193,78,0.05) 1px, transparent 1px)",
                      backgroundSize: "22px 22px",
                    }}
                  />

                  <div className="relative flex flex-col items-center gap-5">
                    {/* Camera with scanner brackets + sparkles + glow */}
                    <div className="relative w-[88px] h-[88px] flex items-center justify-center">
                      {/* Corner scanner brackets */}
                      <span
                        className="absolute top-0 left-0 w-6 h-6 pointer-events-none"
                        style={{ borderTop: "2px solid #F2C14E", borderLeft: "2px solid #F2C14E" }}
                      />
                      <span
                        className="absolute top-0 right-0 w-6 h-6 pointer-events-none"
                        style={{ borderTop: "2px solid #F2C14E", borderRight: "2px solid #F2C14E" }}
                      />
                      <span
                        className="absolute bottom-0 left-0 w-6 h-6 pointer-events-none"
                        style={{ borderBottom: "2px solid #F2C14E", borderLeft: "2px solid #F2C14E" }}
                      />
                      <span
                        className="absolute bottom-0 right-0 w-6 h-6 pointer-events-none"
                        style={{ borderBottom: "2px solid #F2C14E", borderRight: "2px solid #F2C14E" }}
                      />
                      {/* Sparkle dots */}
                      {([[-18, -18], [-18, 18], [18, -18], [18, 18]] as const).map(([dx, dy], i) => (
                        <motion.div
                          key={i}
                          aria-hidden
                          className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
                          style={{
                            background: "#F2C14E",
                            top: `calc(50% + ${dy}px - 3px)`,
                            left: `calc(50% + ${dx}px - 3px)`,
                          }}
                          animate={{ opacity: [0.15, 1, 0.15], scale: [0.6, 1.4, 0.6] }}
                          transition={{
                            duration: 1.7 + i * 0.28,
                            repeat: Infinity,
                            delay: i * 0.45,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                      {/* Soft circular glow */}
                      <div
                        aria-hidden
                        className="absolute pointer-events-none rounded-full"
                        style={{
                          inset: "-10px",
                          background: "rgba(242,193,78,0.12)",
                          filter: "blur(16px)",
                        }}
                      />
                      <Camera className="h-10 w-10 relative" style={{ color: "#F2C14E" }} />
                    </div>

                    {/* Two-tone title */}
                    <div className="flex flex-col items-center gap-1.5">
                      <p className="font-black text-[21px] tracking-tight leading-none">
                        <span className="text-white">Escanear </span>
                        <span style={{ color: "#F2C14E" }}>oferta</span>
                      </p>
                      <p className="text-slate-400 text-[13px] leading-snug text-center">
                        Tire uma foto da oferta<br />e a IA preenche o resto.
                      </p>
                    </div>

                    {/* "Abrir câmera" — explicit CTA button inside the card */}
                    <div
                      className="flex items-center gap-2 rounded-full px-6 py-2.5"
                      style={{ background: "#F2C14E" }}
                    >
                      <Camera className="h-4 w-4" style={{ color: "#0d0620" }} />
                      <span className="font-black text-[14px]" style={{ color: "#0d0620" }}>
                        Abrir câmera
                      </span>
                    </div>
                  </div>
                </motion.button>

                {/* Info card */}
                {!ocrLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.18 }}
                    className="mt-2.5 flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{
                      background: "rgba(19,9,38,0.7)",
                      border: "1px solid rgba(58,24,103,0.75)",
                    }}
                  >
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
                      style={{ background: "rgba(139,92,246,0.14)" }}
                    >
                      <Sparkles className="h-4 w-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-[13px] leading-none mb-0.5">
                        Preenchimento automático
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        A IA identifica produto, preço, mercado e categoria.
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                  </motion.div>
                )}

                {/* Error message */}
                <AnimatePresence>
                  {ocrError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 flex items-start gap-2 rounded-2xl px-3.5 py-2.5"
                      style={{
                        background: "rgba(245,158,11,0.07)",
                        border: "1px solid rgba(245,158,11,0.22)",
                      }}
                    >
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-amber-300 text-xs font-medium">{ocrError}</p>
                        <p className="text-amber-400/60 text-[11px] mt-0.5">
                          Tente com melhor iluminação ou preencha manualmente.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Live preview ── */}
        <AnimatePresence>
          <LivePreview
            produto={watched.produto ?? ""}
            categoria={watched.categoria ?? ""}
            preco={watched.preco ?? ""}
            mercado={watched.mercado ?? ""}
            bairro={watched.bairro ?? ""}
            photo={photoB64}
            unidade={watched.unidade}
          />
        </AnimatePresence>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">

            {/* ── FOTO ── */}
            <div className={`rounded-2xl border-2 transition-colors overflow-hidden ${photoB64 ? "border-[#D4A017]/40" : "border-[#3a1867]"}`}>
              <div className="px-3 pt-3 pb-2 flex items-center gap-2">
                <Camera className="h-4 w-4" style={{ color: photoB64 ? "#F2C14E" : "#94a3b8" }} />
                <p className="text-sm font-bold" style={{ color: photoB64 ? "#F2C14E" : "#94a3b8" }}>
                  Foto do produto <Req />
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />

              {photoB64 ? (
                <div className="relative">
                  <img
                    src={photoB64}
                    alt="Preview"
                    className="w-full object-cover"
                    style={{ maxHeight: 240 }}
                  />
                  {/* EXIF age warning — top left */}
                  {exifWarning && (
                    <div className="absolute top-2 left-2">
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full backdrop-blur-sm"
                        style={{ background: "rgba(245,158,11,0.92)", color: "#fff" }}>
                        ⚠️ Foto antiga
                      </span>
                    </div>
                  )}
                  {/* Source badge — bottom left */}
                  {photoFromOcr ? (
                    <div className="absolute bottom-2 left-2">
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full backdrop-blur-sm"
                        style={{ background: "rgba(139,92,246,0.85)", color: "#fff", border: "1px solid rgba(167,139,250,0.5)" }}>
                        <ScanLine className="h-2.5 w-2.5" /> Foto do escaneamento
                      </span>
                    </div>
                  ) : photoSource === "galeria" ? (
                    <div className="absolute bottom-2 left-2">
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full backdrop-blur-sm"
                        style={{ background: "rgba(109,40,217,0.85)", color: "#ddd8fe", border: "1px solid rgba(139,92,246,0.4)" }}>
                        <ImageIcon className="h-2.5 w-2.5" /> Da galeria
                      </span>
                    </div>
                  ) : photoSource === "camera" ? (
                    <div className="absolute bottom-2 left-2">
                      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full backdrop-blur-sm"
                        style={{ background: "rgba(22,101,52,0.85)", color: "#86efac", border: "1px solid rgba(74,222,128,0.3)" }}>
                        <Camera className="h-2.5 w-2.5" /> Câmera
                      </span>
                    </div>
                  ) : null}
                  {/* Action buttons — top right */}
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoB64(null); setPhotoFromOcr(false); setPhotoSource(null);
                        setExifWarning(false); setConfirmedMarket(null); setLocationMode("none");
                        setLockedCoords(null); setMarketCoordsLocked(false); setDriftWarning(false);
                        resetTipoState();
                      }}
                      className="flex items-center gap-1 bg-black/60 text-white text-xs font-bold px-2.5 py-1.5 rounded-full backdrop-blur-sm"
                    >
                      Trocar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoB64(null); setPhotoFromOcr(false); setPhotoSource(null);
                        setExifWarning(false); setConfirmedMarket(null); setLocationMode("none");
                        setLockedCoords(null); setMarketCoordsLocked(false); setDriftWarning(false);
                        resetTipoState();
                      }}
                      className="flex items-center gap-1 bg-red-600/80 text-white text-xs font-bold px-2 py-1.5 rounded-full backdrop-blur-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : photoLoading ? (
                <div className="w-full flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-[#F2C14E]" />
                </div>
              ) : (
                /* ── Two-option picker ── */
                <div className="divide-y divide-[#3a1867]/60">
                  {/* Camera */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-4 transition-colors active:scale-[0.98] hover:bg-white/[0.02]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#F2C14E]/10 border border-[#F2C14E]/20 flex items-center justify-center shrink-0">
                      <Camera className="h-5 w-5 text-[#F2C14E]" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">📸 Tirar foto agora</p>
                      <p className="text-xs text-slate-500 mt-0.5">Maior confiança no feed</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                  </button>
                  {/* Gallery */}
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-4 transition-colors active:scale-[0.98] hover:bg-white/[0.02]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-violet-400/10 border border-violet-400/20 flex items-center justify-center shrink-0">
                      <ImageIcon className="h-5 w-5 text-violet-400" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">🖼️ Escolher da galeria</p>
                      <p className="text-xs text-slate-500 mt-0.5">Use fotos recentes para mais confiança</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                  </button>
                  {/* Info hint */}
                  <p className="text-[10px] text-slate-600 text-center py-2.5 px-4">
                    Fotos tiradas na hora têm mais confiança no feed
                  </p>
                </div>
              )}
            </div>

            {/* ── Tipo de oferta selector ── */}
            {photoB64 && (
              <div className="rounded-2xl border border-[#3a1867]/70 bg-[#1d0e36]/60 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo de oferta</p>
                  {classificandoTipo && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> IA classificando…
                    </span>
                  )}
                  {!classificandoTipo && tipoOferta && (tipoConfianca ?? 0) >= 0.75 && (
                    <span className="text-[10px] text-[#D4A017] font-bold">✓ Auto-detectado</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoOferta("presencial")}
                    className={cn(
                      "flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all",
                      tipoOferta === "presencial"
                        ? "bg-[#F2C14E]/15 border-[#F2C14E]/50 text-[#F2C14E]/80"
                        : "bg-white/[0.03] border-[#3a1867]/60 text-slate-500 hover:border-slate-600",
                    )}
                  >
                    <span className="text-base">📸</span>
                    <div className="text-left min-w-0">
                      <p className="text-xs leading-tight">No mercado</p>
                      <p className="text-[10px] font-normal text-slate-500 leading-tight">+10 pts</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoOferta("encarte")}
                    className={cn(
                      "flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all",
                      tipoOferta === "encarte"
                        ? "bg-indigo-400/15 border-indigo-400/50 text-indigo-300"
                        : "bg-white/[0.03] border-[#3a1867]/60 text-slate-500 hover:border-slate-600",
                    )}
                  >
                    <span className="text-base">📰</span>
                    <div className="text-left min-w-0">
                      <p className="text-xs leading-tight">Folder / encarte</p>
                      <p className="text-[10px] font-normal text-slate-500 leading-tight">+6 pts</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ── MARKET PICKER: shown when photo selected but market not yet confirmed ── */}
            {photoSource !== null && confirmedMarket === null && (
              <MarketPicker
                userCoords={coords}
                photoSource={photoSource}
                onConfirm={handleMarketConfirmed}
              />
            )}

            {/* Confirmed market badge */}
            {confirmedMarket !== null && (
              <div className="rounded-2xl border border-[#D4A017]/40 bg-[#D4A017]/40 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Store className="h-4 w-4 text-[#F2C14E] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[#F2C14E]/80 text-xs font-bold truncate">{confirmedMarket.nome}</p>
                    <p className="text-slate-500 text-[11px]">
                      {[confirmedMarket.bairro, confirmedMarket.cidade].filter(Boolean).join(" · ")}
                      {confirmedMarket.lat
                        ? <span className="text-[#B8900E] ml-1">· 📍 GPS confirmado</span>
                        : <span className="text-slate-600 ml-1">· ✏️ Só bairro/cidade</span>
                      }
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetMarketLocation}
                  className="shrink-0 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
                >
                  Trocar
                </button>
              </div>
            )}

            {/* ── Section: produto ── */}
            <div className="bg-[#1d0e36]/60 rounded-2xl p-4 border border-[#3a1867]/70 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Produto</p>

              <FormField control={form.control} name="produto" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300 text-xs font-bold flex items-center">
                    Nome do produto <Req />
                    {ocrFilledFields.has("produto") && <OcrFilledBadge field="produto" />}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
                      <DarkInput
                        placeholder="ex: Arroz 5kg tipo 1"
                        className={`pl-9 ${ocrFilledFields.has("produto") ? "border-violet-500/50" : ""}`}
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          const detected = detectCategory(e.target.value);
                          if (detected && !form.getValues("categoria")) {
                            form.setValue("categoria", detected, { shouldValidate: true });
                            setAutoDetected(detected);
                            setTimeout(() => setAutoDetected(null), 3000);
                          }
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )} />

              {/* Auto-detect toast inline */}
              <AnimatePresence>
                {autoDetected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 bg-[#D4A017]/40 border border-[#D4A017]/40 rounded-xl px-3 py-2"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#F2C14E] shrink-0" />
                    <p className="text-[#F2C14E] text-xs font-bold">
                      Categoria detectada: {CATEGORY_META[autoDetected]?.emoji} {autoDetected}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Categoria + Marca */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="categoria" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300 text-xs font-bold flex items-center">
                      Categoria <Req />
                      {ocrFilledFields.has("categoria") && <OcrFilledBadge field="categoria" />}
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(val) => {
                        // Hybrid conflict: if AI suggested a different category, ask user
                        if (aiSuggestedCategory && val !== aiSuggestedCategory) {
                          setPendingCatChange(val);
                          setShowCatConflictDialog(true);
                          // Don't apply yet — wait for dialog choice
                        } else {
                          field.onChange(val);
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger
                          className={`h-10 rounded-xl text-sm border-[#3a1867] bg-[#0d0620] text-white focus:ring-0 focus:border-[#D4A017]/40 ${ocrFilledFields.has("categoria") ? "border-violet-500/50" : ""}`}
                        >
                          <SelectValue placeholder="Selecionar">
                            {field.value
                              ? `${CATEGORY_META[field.value]?.emoji ?? ""} ${field.value}`
                              : "Selecionar"
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#1d0e36] border-[#3a1867] text-white">
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="focus:bg-[#3a1867] focus:text-white">
                            {CATEGORY_META[c]?.emoji} {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )} />

                <FormField control={form.control} name="marca" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300 text-xs font-bold flex items-center">
                      Marca <span className="text-slate-500 font-normal ml-1">(opcional)</span>
                      {ocrFilledFields.has("marca") && <OcrFilledBadge field="marca" />}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
                        <DarkInput
                          placeholder="ex: Tio João"
                          className={`pl-9 ${ocrFilledFields.has("marca") ? "border-violet-500/50" : ""}`}
                          {...field}
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Section: preço e local ── */}
            <div className="bg-[#1d0e36]/60 rounded-2xl p-4 border border-[#3a1867]/70 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preço e local</p>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="preco" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300 text-xs font-bold flex items-center">
                      Preço (R$) <Req />
                      {ocrFilledFields.has("preco") && <OcrFilledBadge field="preco" />}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
                        <DarkInput
                          type="number" step="0.01" min="0" placeholder="0,00"
                          className={`pl-9 text-[#F2C14E] font-bold ${ocrFilledFields.has("preco") ? "border-violet-500/50" : ""}`}
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || e.target.value)}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )} />

                <FormField control={form.control} name="unidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300 text-xs font-bold flex items-center">
                      Unidade
                      {ocrFilledFields.has("unidade") && <OcrFilledBadge field="unidade" />}
                    </FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        value={field.value ?? "un"}
                        onChange={(e) => field.onChange(e.target.value)}
                        className={`w-full bg-[#0d0620] text-white rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#D4A017]/40 transition-colors appearance-none ${ocrFilledFields.has("unidade") ? "border-violet-500/50" : ""}`}
                      >
                        {UNIDADES.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="mercado" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300 text-xs font-bold flex items-center gap-1">
                      Mercado <Req />
                      {marketCoordsLocked && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-[#F2C14E] bg-[#D4A017]/40 border border-[#D4A017]/40 px-1.5 py-0.5 rounded-full ml-1">
                          <Lock className="h-2.5 w-2.5" /> Local fixado
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
                        <DarkInput
                          placeholder="ex: Extra"
                          className="pl-9"
                          {...field}
                          onBlur={(e) => {
                            field.onBlur();
                            // PRIVACY: NEVER auto-lock GPS on blur for any photo source.
                            // Location is ONLY locked via the explicit confirmation panel above.
                            void e; // suppress lint — value is validated by react-hook-form
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300 text-xs font-bold">Bairro <Req /></FormLabel>
                    <FormControl>
                      <DarkInput placeholder="ex: Centro" {...field} />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )} />

                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300 text-xs font-bold">Cidade <Req /></FormLabel>
                    <FormControl>
                      <DarkInput placeholder="ex: São Paulo" {...field} />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="validade" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300 text-xs font-bold flex items-center">
                    Válido até <span className="text-slate-500 font-normal ml-1">(opcional)</span>
                    {ocrFilledFields.has("validade") && <OcrFilledBadge field="validade" />}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
                      <DarkInput
                        type="date"
                        className={`pl-9 ${ocrFilledFields.has("validade") ? "border-violet-500/50" : ""}`}
                        {...field}
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )} />

              {/* GPS — localização do mercado (resumo após confirmação no painel acima) */}
              {locationMode === "gps_confirmed" && lockedCoords && (
                <div className="space-y-1.5">
                  <label className="text-slate-300 text-xs font-bold block">
                    Localização do mercado
                  </label>
                  <div className="rounded-xl border border-[#D4A017]/40 bg-[#D4A017]/40 px-3 py-2.5 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-[#F2C14E] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#F2C14E] text-xs font-bold">Local do mercado fixado</p>
                      <p className="text-slate-600 text-[11px]">
                        {lockedCoords.lat.toFixed(4)}, {lockedCoords.lng.toFixed(4)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setLocationMode("none"); setLockedCoords(null); setMarketCoordsLocked(false); }}
                      className="shrink-0 text-[11px] font-bold text-slate-400 hover:text-slate-200 underline underline-offset-2"
                    >
                      Trocar
                    </button>
                  </div>
                </div>
              )}
              {locationMode === "manual_only" && (
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-3 py-2 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <p className="text-slate-500 text-[11px]">Sem GPS — localização pública: somente bairro e cidade</p>
                </div>
              )}
            </div>

            {/* ── Submit ── */}
            <button
              type="submit"
              disabled={createMutation.isPending || cooldownSecs > 0}
              className="w-full h-13 rounded-2xl flex items-center justify-center gap-2 text-base font-black transition-all active:scale-[0.98] disabled:opacity-70"
              style={{
                height: "52px",
                background: createMutation.isPending || cooldownSecs > 0
                  ? "linear-gradient(135deg, #4a7c12, #5a9416)"
                  : "linear-gradient(135deg, #D4A017, #F2C14E)",
                boxShadow: "0 4px 24px rgba(242,193,78,0.35)",
                color: "#0d0620",
              }}
            >
              {createMutation.isPending
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <ChevronRight className="h-5 w-5" />
              }
              {createMutation.isPending
                ? "Publicando..."
                : cooldownSecs > 0
                  ? `Aguarde ${cooldownSecs}s...`
                  : "Publicar Oferta · +10pts"}
            </button>
          </form>
        </Form>
      </div>
    </motion.div>

    {/* ── Success bottom-sheet ─────────────────────────────────────────── */}
    <AnimatePresence>
      {successCtx && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.75)" }}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="w-full max-w-lg rounded-t-3xl pb-10 overflow-hidden"
            style={{ background: "linear-gradient(160deg, #0d1f05 0%, #0a1a03 100%)", border: "1px solid rgba(242,193,78,0.25)", borderBottom: "none" }}
          >
            {/* Confetti dots */}
            <div className="relative h-2 overflow-visible">
              {["#F2C14E","#facc15","#34d399","#f472b6","#60a5fa"].map((c, i) => (
                <motion.div key={i}
                  initial={{ y: 0, x: `${10 + i * 20}%`, opacity: 1, scale: 1 }}
                  animate={{ y: -60, opacity: 0, scale: 0.4, rotate: 360 }}
                  transition={{ duration: 0.9, delay: i * 0.08, ease: "easeOut" }}
                  className="absolute top-0 w-2.5 h-2.5 rounded-full"
                  style={{ background: c }}
                />
              ))}
            </div>

            <div className="px-6 pt-4 pb-2 text-center">
              {/* Big checkmark */}
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 14, stiffness: 260, delay: 0.1 }}
                className="mx-auto mb-3 w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(242,193,78,0.15)", border: "2px solid rgba(242,193,78,0.4)" }}
              >
                <Check className="h-8 w-8 text-[#F2C14E]" strokeWidth={2.5} />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white font-black text-xl mb-1"
              >
                {successCtx.wasConfirmation
                  ? "Preço confirmado!"
                  : successCtx.isPendente
                    ? "Oferta enviada!"
                    : "Oferta publicada!"}
              </motion.h2>

              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
              >
                <span className="inline-flex items-center gap-1.5 text-[#F2C14E] font-black text-base bg-[#F2C14E]/10 border border-[#F2C14E]/20 px-3 py-1 rounded-full">
                  🎉 +{successCtx.pontos} pontos
                </span>
                <p className="text-slate-500 text-xs mt-2">
                  {successCtx.wasConfirmation
                    ? "Obrigado por confirmar o preço da comunidade!"
                    : successCtx.isPendente
                      ? "Sua oferta passará por validação em breve."
                      : "Você ajudou a comunidade a economizar."}
                </p>
              </motion.div>

              {/* Market context pill */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="mt-3 inline-flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold bg-white/5 border border-white/10 px-3 py-1.5 rounded-full"
              >
                <Store className="h-3 w-3 shrink-0" />
                {successCtx.mercado} · {successCtx.bairro}
              </motion.div>
            </div>

            {/* Product + Price info */}
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42 }}
              className="mx-6 mt-4 rounded-2xl border border-[#3a1867]/80 bg-[#1d0e36]/60 divide-y divide-[#3a1867]/50"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide">Produto</span>
                <span className="text-white text-sm font-bold text-right max-w-[60%] truncate">
                  {successCtx.produto}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide">Preço</span>
                <span className="text-[#F2C14E] text-base font-black">
                  R$ {successCtx.preco.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </motion.div>

            {/* Share action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="px-5 pt-3 grid grid-cols-3 gap-2"
            >
              <button
                onClick={() => {
                  const precoFormatado = successCtx.preco.toFixed(2).replace(".", ",");
                  const msg = encodeURIComponent(
                    `🔥 Oferta encontrada no AíCompensa\n\nProduto: ${successCtx.produto}\nPreço: R$ ${precoFormatado}\nMercado: ${successCtx.mercado}\n\nVeja mais ofertas:\nhttps://aicompensa.com.br`
                  );
                  window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
                }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-bold transition-all active:scale-95"
                style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", color: "#25d366" }}
              >
                <Share2 className="h-4 w-4" />
                WhatsApp
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText("https://aicompensa.com.br")
                    .then(() => toast.success("Link copiado!"))
                    .catch(() => toast.error("Não foi possível copiar"));
                }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-bold transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
              >
                <Copy className="h-4 w-4" />
                Copiar Link
              </button>

              <button
                onClick={() => { setSuccessCtx(null); setLocation("/ofertas"); }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-bold transition-all active:scale-95"
                style={{ background: "rgba(242,193,78,0.08)", border: "1px solid rgba(242,193,78,0.2)", color: "#F2C14E" }}
              >
                <ExternalLink className="h-4 w-4" />
                Ver Oferta
              </button>
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="px-5 pt-3 space-y-3"
            >
              <button
                onClick={handlePublicarOutra}
                className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 font-black text-base transition-all active:scale-[0.97]"
                style={{
                  background: "linear-gradient(135deg, #D4A017, #F2C14E)",
                  boxShadow: "0 4px 20px rgba(242,193,78,0.35)",
                  color: "#0d0620",
                }}
              >
                <Camera className="h-5 w-5" strokeWidth={2.5} />
                Publicar outra oferta
              </button>

              <button
                onClick={() => { setSuccessCtx(null); setLocation("/ofertas"); }}
                className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-slate-400 transition-all active:scale-[0.97] hover:text-white"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                🏠 Voltar ao feed
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Modo Mercado FAB ──────────────────────────────────────────────── */}
    <AnimatePresence>
      {modoMercadoAtivo && !successCtx && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 16, stiffness: 300 }}
          className="fixed bottom-24 right-4 z-40 flex flex-col items-center gap-1"
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
            style={{
              background: "linear-gradient(135deg, #D4A017, #F2C14E)",
              boxShadow: "0 6px 24px rgba(242,193,78,0.5)",
            }}
            title="Fotografar próximo produto"
          >
            <Camera className="h-6 w-6 text-[#0d0620]" strokeWidth={2.5} />
          </button>
          <span className="text-[9px] font-black text-[#F2C14E] bg-[#F2C14E]/10 border border-[#F2C14E]/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            📸 {ofertasNaSessao}ª oferta
          </span>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Hybrid AI category conflict dialog ─────────────────────────────── */}
    <AnimatePresence>
      {showCatConflictDialog && aiSuggestedCategory && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
          onClick={() => {
            if (pendingCatChange) form.setValue("categoria", pendingCatChange, { shouldValidate: true });
            setShowCatConflictDialog(false);
            setPendingCatChange(null);
          }}
        >
          <motion.div
            initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-[#1d0e36] rounded-t-3xl border border-[#3a1867] p-6 w-full max-w-lg pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="h-5 w-5 text-violet-400 shrink-0" />
              <p className="text-white font-bold text-sm">Sugestão da IA</p>
            </div>
            <p className="text-slate-300 text-sm mb-5 leading-relaxed">
              Esse produto parece pertencer à categoria{" "}
              <span className="font-bold text-violet-300">
                {CATEGORY_META[aiSuggestedCategory]?.emoji} {aiSuggestedCategory}
              </span>
              . Deseja manter mesmo assim?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  form.setValue("categoria", aiSuggestedCategory, { shouldValidate: true });
                  setShowCatConflictDialog(false);
                  setPendingCatChange(null);
                }}
                className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors"
              >
                Usar sugestão da IA
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingCatChange) form.setValue("categoria", pendingCatChange, { shouldValidate: true });
                  setShowCatConflictDialog(false);
                  setPendingCatChange(null);
                }}
                className="flex-1 py-3 rounded-xl bg-[#2d1248] hover:bg-[#3a1867] text-slate-300 font-bold text-sm transition-colors"
              >
                Manter minha escolha
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
