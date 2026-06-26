import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, Trash2, Search, CheckCircle, Camera,
  Store, Loader2, Sparkles, MapPin, ChevronDown,
  ChevronUp, Zap, TrendingDown, Users, Copy,
  LogOut, UserPlus, X, Bell, Brain, Target, ChevronRight, Mic, ArrowLeft,
  CheckSquare, Square, AlertTriangle, Share2, QrCode, Link2, MessageCircle,
  Download, WifiOff,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useListOfertas, getListOfertasQueryKey, customFetch } from "@workspace/api-client-react";
import { matchTier } from "@workspace/synonyms";
import { toast } from "sonner";
import { getCurrentUser, type CurrentUser } from "@/lib/current-user";
import { useParams, useLocation } from "wouter";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface ListaItem {
  id: string;
  nome: string;
  adicionadoEm: string;
  quantidade?: number;
  unidade?: UnidadeOpcao;
}

interface OfertaItem {
  id: number;
  produto: string;
  preco: number;
  mercado: string;
  bairro?: string | null;
  dataCriacao: string;
  fotoUrl?: string | null;
}

interface ItemMatch {
  item: ListaItem;
  melhor: OfertaItem | null;
  bestByMarket: OfertaItem[];
  isNew: boolean;
}

interface SharedMember {
  usuarioId: number;
  nome: string;
  papel: "owner" | "member";
  permissao: "edit" | "view";
}
interface SharedItem {
  id: number;
  usuarioId: number;
  nomeUsuario: string;
  nome: string;
  comprado: boolean;
  compradoPorNome: string | null;
  adicionadoEm: string;
}
interface SharedListState {
  lista: { id: number; nome: string; emoji: string; codigo: string; criadorId: number };
  meuPapel: "owner" | "member";
  minhaPermissao: "edit" | "view";
  membros: SharedMember[];
  itens: SharedItem[];
}

/* ── Sprint #07 — Compra Inteligente (tipos inline) ─────────────────────── */

interface ComparadorItem {
  produtoId: string;
  ofertaId: number;
  produto: string;
  preco: number;
  mercado: string;
  validade: string | null;
  imagemExibicao: string | null;
  confiancaScore: number;
  confiancaNivel: "alta" | "media" | "baixa";
  motivoConfianca: string;
}

interface MercadoComparado {
  nomeMercado: string;
  total: number;
  produtosEncontrados: number;
  produtosFaltando: number;
  coberturaPercentual: number;
  confiancaMedia: number;
  economiaEstimada: number;
  itens: ComparadorItem[];
}

interface CombinacaoComparacao {
  mercados: string[];
  total: number;
  economiaExtra: number;
  produtosEncontrados: number;
  produtosFaltando: number;
  coberturaPercentual: number;
  confiancaMedia: number;
  itensPorMercado: Record<string, ComparadorItem[]>;
}

interface ResultadoComparacao {
  melhorMercado: MercadoComparado | null;
  melhorCombinacao: CombinacaoComparacao | null;
  rankingMercados: MercadoComparado[];
  produtosResolvidosCount: number;
  produtosTotalCount: number;
}

interface PresetListDef {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  categoria: string;
  itens: string[];
}

/* ── Storage keys ───────────────────────────────────────────────────────────── */

const LISTA_KEY            = "comparador_lista_compras";
const CHECKED_KEY          = "comparador_lista_checked";
const SHARED_CODE_KEY      = "comparador_lista_compartilhada_codigo";
const ASSISTENTE_USADO_KEY = "comparador_lista_assistente_usado";
const LISTA_NOME_KEY  = "comparador_grupo_nome";
const LISTA_EMOJI_KEY = "comparador_grupo_emoji";

const LISTA_EMOJIS = ["🛒", "🏠", "👨‍👩‍👧", "🎉", "🥩", "🧹", "🍕", "👶", "🐶", "💪", "🌿", "🎁"];

function makeInviteUrl(codigo: string) {
  return `${window.location.origin}/lista/${codigo}`;
}

type ListaCompView = "start" | "creating" | "join" | "active" | "sharing";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function loadLista(): ListaItem[] {
  try { return JSON.parse(localStorage.getItem(LISTA_KEY) ?? "[]") as ListaItem[]; }
  catch { return []; }
}
function saveLista(items: ListaItem[]) {
  localStorage.setItem(LISTA_KEY, JSON.stringify(items));
}

function loadChecked(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHECKED_KEY) ?? "[]") as string[]); }
  catch { return new Set(); }
}
function saveChecked(s: Set<string>) {
  localStorage.setItem(CHECKED_KEY, JSON.stringify([...s]));
}

function loadAssistenteUsado(): boolean {
  try { return localStorage.getItem(ASSISTENTE_USADO_KEY) === "1"; }
  catch { return false; }
}
function markAssistenteUsado() {
  localStorage.setItem(ASSISTENTE_USADO_KEY, "1");
}

function computeSpeedGroups(matches: ItemMatch[]): Map<string, ItemMatch[]> {
  const uncovered = new Set(matches.map(m => m.item.id));
  const groups    = new Map<string, ItemMatch[]>();
  while (uncovered.size > 0) {
    const counter = new Map<string, ItemMatch[]>();
    for (const match of matches) {
      if (!uncovered.has(match.item.id)) continue;
      for (const oferta of match.bestByMarket) {
        if (!counter.has(oferta.mercado)) counter.set(oferta.mercado, []);
        counter.get(oferta.mercado)!.push(match);
      }
    }
    if (counter.size === 0) break;
    let bestMarket = ""; let bestItems: ItemMatch[] = [];
    for (const [mk, list] of counter) {
      const unique = [...new Map(list.map(m => [m.item.id, m])).values()];
      if (unique.length > bestItems.length) { bestMarket = mk; bestItems = unique; }
    }
    if (!bestMarket) break;
    groups.set(bestMarket, bestItems);
    for (const m of bestItems) uncovered.delete(m.item.id);
  }
  const noOffer = matches.filter(m => uncovered.has(m.item.id));
  if (noOffer.length > 0) groups.set("__sem_oferta__", noOffer);
  return groups;
}

/* ── Empty State Premium ────────────────────────────────────────────────────── */

const QUICK_CHIPS = [
  { label: "Carne",           emoji: "🥩" },
  { label: "Leite",           emoji: "🥛" },
  { label: "Arroz",           emoji: "🍚" },
  { label: "Café",            emoji: "☕" },
  { label: "Papel higiênico", emoji: "🧻" },
  { label: "Ovos",            emoji: "🥚" },
  { label: "Frango",          emoji: "🍗" },
  { label: "Refrigerante",    emoji: "🥤" },
];

const LIST_TEMPLATES = [
  { label: "Compra mensal",   emoji: "👨‍👩‍👧", items: ["Arroz", "Feijão", "Macarrão", "Óleo", "Sal", "Açúcar", "Café", "Leite", "Ovos", "Frango"] },
  { label: "Churrasco",       emoji: "🥩", items: ["Picanha", "Linguiça", "Frango", "Carvão", "Sal grosso", "Cerveja", "Refrigerante", "Pão de alho"] },
  { label: "Café da manhã",   emoji: "🍳", items: ["Pão", "Manteiga", "Queijo", "Ovos", "Leite", "Café", "Iogurte"] },
  { label: "Bebê",            emoji: "👶", items: ["Fralda", "Lenço umedecido", "Leite em pó", "Papinha", "Pomada fraldas"] },
  { label: "Festa",           emoji: "🎉", items: ["Refrigerante", "Suco", "Cerveja", "Salgadinho", "Prato descartável", "Copo descartável"] },
  { label: "Fitness",         emoji: "🏋️", items: ["Frango", "Ovos", "Batata doce", "Aveia", "Iogurte grego", "Atum", "Banana"] },
];

const PRESET_LISTS: PresetListDef[] = [
  {
    id: "compra-semana",
    nome: "Compra da Semana",
    descricao: "Itens essenciais para a semana inteira.",
    icone: "🛒",
    categoria: "mercado",
    itens: [
      "Arroz", "Feijão", "Macarrão", "Óleo de soja", "Sal", "Açúcar",
      "Café", "Leite", "Ovos", "Frango", "Pão francês", "Manteiga",
      "Alface", "Tomate", "Cebola", "Alho", "Batata", "Cenoura",
      "Banana", "Maçã", "Laranja", "Detergente", "Sabão em pó",
      "Papel higiênico", "Sabonete",
    ],
  },
  {
    id: "churrasco",
    nome: "Churrasco",
    descricao: "Tudo para um churrasco perfeito.",
    icone: "🥩",
    categoria: "churrasco",
    itens: [
      "Picanha", "Frango", "Linguiça", "Carvão",
      "Sal grosso", "Cerveja", "Refrigerante", "Pão de alho",
      "Farofa", "Vinagrete", "Tomate", "Cebola",
    ],
  },
  {
    id: "limpeza-casa",
    nome: "Limpeza da Casa",
    descricao: "Produtos para deixar tudo em ordem.",
    icone: "🧹",
    categoria: "limpeza",
    itens: [
      "Detergente", "Sabão em pó", "Amaciante", "Desinfetante",
      "Água sanitária", "Esponja de aço", "Rodo", "Vassoura",
      "Limpador multiuso", "Álcool 70%", "Luva de borracha",
      "Papel higiênico", "Pano de prato", "Saco de lixo", "Lã de aço",
    ],
  },
  {
    id: "bebe",
    nome: "Bebê",
    descricao: "Essenciais para cuidar do seu bebê.",
    icone: "👶",
    categoria: "bebe",
    itens: [
      "Fralda", "Lenço umedecido", "Leite em pó",
      "Papinha de fruta", "Papinha de legumes", "Pomada para fralda",
      "Shampoo infantil", "Sabonete infantil", "Algodão",
      "Soro fisiológico", "Mamadeira", "Chupeta",
      "Creme hidratante infantil", "Protetor solar infantil",
      "Óleo de amêndoas", "Talco infantil", "Colherzinha", "Bavinha",
    ],
  },
  {
    id: "pet-shop",
    nome: "Pet Shop",
    descricao: "Tudo para o seu pet ficar feliz.",
    icone: "🐶",
    categoria: "pet",
    itens: [
      "Ração seca", "Ração úmida", "Petisco", "Areia para gato",
      "Tapete higiênico", "Shampoo pet", "Coleira",
      "Vermífugo", "Sachê de ração", "Brinquedo pet",
      "Escova pet", "Cama pet",
    ],
  },
];

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
});

function EmptyStatePremium({
  onAdd,
  onAddBulk,
  isLoggedIn,
  onOpenAi,
}: {
  onAdd: (nome: string) => void;
  onAddBulk: (nomes: string[]) => void;
  isLoggedIn: boolean;
  onOpenAi: () => void;
}) {
  return (
    <motion.div
      key="empty-premium"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="px-4 pt-1 pb-8 space-y-4"
    >
      {/* ── 1. Hero ─────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.05)} className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-white to-amber-50 border border-amber-200 rounded-3xl p-5 shadow-sm">
        {/* decorative circles */}
        <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-amber-100/60 blur-xl pointer-events-none" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-emerald-100/50 blur-xl pointer-events-none" />

        <div className="relative">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
            className="text-4xl mb-3 w-fit"
          >
            🛒
          </motion.div>
          <h2 className="text-[19px] font-black text-slate-800 leading-snug mb-1">
            Sua próxima economia<br />começa aqui
          </h2>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">
            Monte sua lista e descubra onde comprar gastando menos.
          </p>

          {/* stat chips */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-full px-3 py-1.5 shadow-sm">
              <span className="text-base leading-none">💰</span>
              <div>
                <p className="text-[10px] text-slate-400 leading-none">Economia média</p>
                <p className="text-[13px] font-black text-slate-800 leading-tight">R$47,80</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-orange-200 rounded-full px-3 py-1.5 shadow-sm">
              <span className="text-base leading-none">🔥</span>
              <div>
                <p className="text-[10px] text-slate-400 leading-none">Perto de você</p>
                <p className="text-[13px] font-black text-slate-800 leading-tight">28 promoções</p>
              </div>
            </div>
            {isLoggedIn && (
              <div className="flex items-center gap-1.5 bg-white border border-violet-200 rounded-full px-3 py-1.5 shadow-sm">
                <span className="text-base leading-none">🎁</span>
                <div>
                  <p className="text-[10px] text-slate-400 leading-none">Ao usar a lista</p>
                  <p className="text-[13px] font-black text-slate-800 leading-tight">Ganhe pontos</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── 2. Quick add chips ──────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.12)}>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-amber-400" /> Adicionar rapidamente
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map(chip => (
            <motion.button
              key={chip.label}
              whileTap={{ scale: 0.93 }}
              whileHover={{ scale: 1.04 }}
              transition={{ duration: 0.12 }}
              onClick={() => onAdd(chip.label)}
              className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition-colors active:bg-amber-100"
            >
              <span>{chip.emoji}</span> {chip.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── 3. Ready-made lists ─────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.18)}>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5">
          <ShoppingCart className="h-3 w-3 text-slate-400" /> Listas prontas
        </p>
        <div className="grid grid-cols-2 gap-2">
          {LIST_TEMPLATES.map(tpl => (
            <motion.button
              key={tpl.label}
              whileTap={{ scale: 0.96 }}
              onClick={() => onAddBulk(tpl.items)}
              className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl px-3.5 py-3 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors active:scale-95 group"
            >
              <span className="text-xl shrink-0">{tpl.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate group-hover:text-amber-800 transition-colors">{tpl.label}</p>
                <p className="text-[10px] text-slate-400">{tpl.items.length} itens</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0 group-hover:text-[#F2C14E] transition-colors" />
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── 4. AI block premium ─────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.24)} className="relative overflow-hidden bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-5 shadow-md">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="h-9 w-9 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-bold text-violet-200 uppercase tracking-wide mb-0.5">Assistente AíCompensa IA</p>
            <p className="text-sm font-semibold text-white leading-snug mb-3">
              Posso montar uma lista baseada no que você costuma comprar
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={onOpenAi}
                className="flex items-center gap-1.5 bg-white text-violet-700 text-xs font-black px-3.5 py-2 rounded-xl hover:bg-violet-50 active:scale-95 transition-all"
              >
                <Sparkles className="h-3.5 w-3.5" /> Montar lista inteligente
              </button>
              <button
                onClick={() => { window.location.href = "/ofertas"; }}
                className="flex items-center gap-1.5 bg-white/15 text-white text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-white/25 active:scale-95 transition-all border border-white/20"
              >
                🔥 Ofertas perto de mim
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── 5. Weekly goal gamification ─────────────────────────────────────── */}
      <motion.div {...fadeUp(0.3)} className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Target className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">Meta da semana</p>
              <p className="text-[10px] text-slate-400">Comunidade AíCompensa</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400">economia média</p>
            <p className="text-base font-black text-amber-600">R$47,80</p>
          </div>
        </div>
        <div className="mb-1.5">
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-[#D4A017]"
              initial={{ width: 0 }}
              animate={{ width: "68%" }}
              transition={{ delay: 0.6, duration: 0.7, ease: "easeOut" }}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          🏆 <span className="font-bold text-slate-600">2.847 usuários</span> economizaram esta semana. Sua vez!
        </p>
      </motion.div>

      {/* ── 6. Alerts visual block ──────────────────────────────────────────── */}
      {isLoggedIn && (
        <motion.div {...fadeUp(0.35)} className="bg-amber-50 border border-amber-200 rounded-3xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-xl bg-[#F2C14E] flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4 text-white" />
            </div>
            <p className="text-sm font-black text-amber-800">Alertas automáticos ativos</p>
          </div>
          <div className="space-y-1.5">
            {[
              "Item baixar de preço",
              "Promoção surgir perto de você",
              "Lista ficar mais barata",
            ].map(txt => (
              <div key={txt} className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-[#F2C14E] flex items-center justify-center shrink-0">
                  <CheckCircle className="h-2.5 w-2.5 text-white" />
                </div>
                <p className="text-xs text-amber-700 font-medium">{txt}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ── Estado vazio simples — usado depois da primeira utilização do Assistente
   de Entrada (Sprint #03.2). O sheet não reabre automaticamente; este estado
   é o único caminho de volta ao Assistente quando a lista volta a ficar vazia. */

function EmptyStateSimples({ onCriarLista }: { onCriarLista: () => void }) {
  return (
    <motion.div
      key="empty-simples"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center text-center py-16 px-6"
    >
      <div className="text-5xl mb-4">🛒</div>
      <h2 className="text-[17px] font-black text-slate-800 mb-1.5">Sua lista está vazia</h2>
      <p className="text-sm text-slate-500 mb-6 max-w-[260px] leading-relaxed">
        Crie sua lista em segundos: digite, fale, fotografe ou cole o texto.
      </p>
      <button
        onClick={onCriarLista}
        className="flex items-center gap-2 text-sm font-black text-white px-5 py-3 rounded-2xl shadow-sm active:scale-95 transition-all"
        style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}
      >
        <Plus className="h-4 w-4" /> Criar lista
      </button>
    </motion.div>
  );
}

/* ── Progress bar ───────────────────────────────────────────────────────────── */

function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const pendentes = total - done;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="px-4 mt-3">
      <div className="bg-white rounded-2xl border border-border px-4 py-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <span className="flex items-center gap-1.5 text-[13px] font-black text-[#1A1A1A]">
            <ShoppingCart className="h-3.5 w-3.5 text-slate-400" /> {total} {total === 1 ? "item" : "itens"}
          </span>
          <span className="text-[13px] font-black text-[#D4A017]">{pct}%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #F2C14E, #D4A017)" }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <p className="text-[11px] text-slate-400 font-semibold mt-2.5">
          {done} comprado{done !== 1 ? "s" : ""} • {pendentes} restante{pendentes !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

/* ── AI Suggestions panel ───────────────────────────────────────────────────── */

function AiSuggestions({ items, onAdd }: { items: ListaItem[]; onAdd: (nome: string) => void; }) {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [erro, setErro]           = useState("");
  const addedNomes = new Set(items.map(i => i.nome.toLowerCase()));

  const analyze = async () => {
    if (items.length === 0) { toast.error("Adicione itens à lista primeiro."); return; }
    setLoading(true); setErro(""); setSugestoes([]);
    try {
      const data = await customFetch<{ sugestoes: string[] }>("/api/lista/sugestoes", {
        method: "POST",
        body: JSON.stringify({ itens: items.map(i => i.nome) }),
      });
      setSugestoes(data.sugestoes ?? []);
    } catch { setErro("Não foi possível obter sugestões agora. Tente de novo."); }
    setLoading(false);
  };

  return (
    <div className="mx-4 mb-4 bg-white rounded-2xl border border-border overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left">
        <div className="h-7 w-7 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1A1A1A]">✨ Sugestões para sua lista</p>
          <p className="text-[11px] text-[#6B7280]">Posso sugerir itens que combinam com sua lista</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[#6B7280]" /> : <ChevronDown className="h-4 w-4 text-[#6B7280]" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3.5 pb-4 border-t border-border pt-3">
              <p className="text-xs text-[#4B5563] mb-3 font-medium">A IA analisa sua lista e sugere o que você pode estar esquecendo.</p>
              {sugestoes.length === 0 && !loading && (
                <button onClick={() => void analyze()} className="w-full flex items-center justify-center gap-2 bg-violet-600 border border-violet-700 text-white font-bold text-sm py-2.5 rounded-xl hover:bg-violet-700 transition-colors active:scale-[0.98] shadow-sm">
                  <Sparkles className="h-4 w-4" /> Analisar minha lista
                </button>
              )}
              {loading && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                  <span className="text-sm text-[#4B5563] font-medium">Analisando sua lista...</span>
                </div>
              )}
              {erro && <p className="text-xs text-red-600 font-medium text-center py-1">{erro}</p>}
              {sugestoes.length > 0 && (
                <div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {sugestoes.map(s => {
                      const jaEsta = addedNomes.has(s.toLowerCase());
                      return (
                        <button key={s} onClick={() => { if (!jaEsta) onAdd(s); }} disabled={jaEsta}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border font-semibold transition-all active:scale-95 ${jaEsta ? "border-[#F2C14E] bg-amber-50 text-amber-700 cursor-default" : "border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200 hover:border-violet-400"}`}>
                          {jaEsta ? "✓" : "+"} {s}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => void analyze()} className="text-xs text-[#6B7280] hover:text-[#1A1A1A] font-medium underline transition-colors">Analisar novamente</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Participantes Strip — card compacto no topo da lista ──────────────────── */

function ParticipantesStrip({
  listState,
  onOpenLista,
}: {
  listState: SharedListState | null;
  onOpenLista: () => void;
}) {
  if (!listState || listState.membros.length === 0) return null;

  const { lista, membros } = listState;

  return (
    <motion.button
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpenLista}
      className="mx-4 mt-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 w-[calc(100%-32px)] active:scale-[0.98] transition-all text-left"
    >
      <span className="text-xl shrink-0">{lista.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-emerald-900 truncate">{lista.nome}</p>
        <p className="text-[10px] text-emerald-600">
          {membros.length} participante{membros.length !== 1 ? "s" : ""} · toque para ver
        </p>
      </div>
      <div className="flex -space-x-1.5 shrink-0">
        {membros.slice(0, 4).map(m => (
          <div key={m.usuarioId}
            className="h-6 w-6 rounded-full bg-emerald-200 border-2 border-white flex items-center justify-center text-[9px] font-black text-emerald-800">
            {m.nome.charAt(0).toUpperCase()}
          </div>
        ))}
        {membros.length > 4 && (
          <div className="h-6 w-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[9px] font-black text-white">
            +{membros.length - 4}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-emerald-400 shrink-0" />
    </motion.button>
  );
}

/* ── Lista Compartilhada Panel ───────────────────────────────────────────────── */

function ListaCompartilhadaPanel({
  isOpen,
  onClose,
  currentUserId,
  listState,
  onListStateChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: number;
  listState: SharedListState | null;
  onListStateChange: (s: SharedListState | null) => void;
}) {
  const [loading, setLoading]           = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [joinInput, setJoinInput]       = useState("");
  const [newItem, setNewItem]           = useState("");
  const [actionLoading, setAction]      = useState(false);
  const [view, setView]                 = useState<ListaCompView>(() => listState ? "active" : "start");
  const [nomeInput, setNomeInput]       = useState("Nossa Lista");
  const [emojiInput, setEmojiInput]     = useState("🛒");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const pollingRef                      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUpdatedRef                  = useRef<Date | null>(null);
  const qrContainerRef                  = useRef<HTMLDivElement>(null);

  const code       = listState?.lista.codigo ?? null;
  const nomeLista  = listState?.lista.nome   ?? localStorage.getItem(LISTA_NOME_KEY) ?? "Lista";
  const emojiLista = listState?.lista.emoji  ?? localStorage.getItem(LISTA_EMOJI_KEY) ?? "🛒";
  const inviteUrl  = code ? makeInviteUrl(code) : "";
  const somenteLeitura = listState?.minhaPermissao === "view";

  const fetchLista = useCallback(async (showSyncing = false) => {
    if (showSyncing) setSyncing(true);
    try {
      const data = await customFetch<SharedListState>("/api/lista/compartilhada/atual");
      setNetworkError(false);
      // Backend returns null lista when no active list
      if ("lista" in data && !data.lista) {
        onListStateChange(null);
        localStorage.removeItem(SHARED_CODE_KEY);
        localStorage.removeItem(LISTA_NOME_KEY);
        localStorage.removeItem(LISTA_EMOJI_KEY);
        setView("start");
      } else {
        onListStateChange(data);
        lastUpdatedRef.current = new Date();
        if (data.lista) {
          localStorage.setItem(SHARED_CODE_KEY, data.lista.codigo);
          localStorage.setItem(LISTA_NOME_KEY,  data.lista.nome);
          localStorage.setItem(LISTA_EMOJI_KEY, data.lista.emoji);
        }
      }
    } catch {
      setNetworkError(true);
    }
    if (showSyncing) setSyncing(false);
  }, [onListStateChange]);

  // Sync view with listState
  useEffect(() => {
    setView(listState ? "active" : "start");
  }, [listState?.lista?.id]);

  // Polling while panel is open
  useEffect(() => {
    if (!isOpen) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }
    setLoading(true);
    void fetchLista().finally(() => setLoading(false));
    pollingRef.current = setInterval(() => { void fetchLista(true); }, 5000);
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [isOpen, fetchLista]);

  async function handleCreate() {
    const nome = nomeInput.trim() || "Nossa Lista";
    setAction(true);
    try {
      await customFetch("/api/lista/compartilhada", {
        method: "POST",
        body: JSON.stringify({ nome, emoji: emojiInput }),
      });
      await fetchLista();
      setView("active");
      toast.success("Lista criada! Convide participantes usando o link ou código.");
    } catch { toast.error("Não foi possível criar a lista."); }
    setAction(false);
  }

  async function handleJoin() {
    const cod = joinInput.trim().toUpperCase();
    if (cod.length !== 6) { toast.error("Código deve ter 6 caracteres."); return; }
    setAction(true);
    try {
      await customFetch("/api/lista/compartilhada/entrar", {
        method: "POST",
        body: JSON.stringify({ codigo: cod }),
      });
      await fetchLista();
      setView("active");
      toast.success("Entrou na lista compartilhada!");
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "Código inválido ou lista não encontrada.";
      toast.error(msg);
    }
    setAction(false);
  }

  async function handleAddItem() {
    if (!code || newItem.trim().length < 2) return;
    setAction(true);
    try {
      await customFetch(`/api/lista/compartilhada/${code}/itens`, {
        method: "POST",
        body: JSON.stringify({ nome: newItem.trim() }),
      });
      setNewItem("");
      await fetchLista();
    } catch { toast.error("Não foi possível adicionar o item."); }
    setAction(false);
  }

  async function handleToggle(itemId: number) {
    if (!code) return;
    try {
      await customFetch(`/api/lista/compartilhada/${code}/itens/${itemId}`, { method: "PATCH" });
      await fetchLista();
    } catch { toast.error("Erro ao atualizar item."); }
  }

  async function handleRemoveItem(itemId: number) {
    if (!code) return;
    try {
      await customFetch(`/api/lista/compartilhada/${code}/itens/${itemId}`, { method: "DELETE" });
      await fetchLista();
    } catch { toast.error("Sem permissão para remover este item."); }
  }

  async function handleLeave() {
    if (!code) return;
    setConfirmLeave(false);
    setAction(true);
    try {
      await customFetch(`/api/lista/compartilhada/${code}/sair`, { method: "DELETE" });
      onListStateChange(null);
      localStorage.removeItem(SHARED_CODE_KEY);
      localStorage.removeItem(LISTA_NOME_KEY);
      localStorage.removeItem(LISTA_EMOJI_KEY);
      setView("start");
      const ehDono = listState?.meuPapel === "owner";
      toast.success(ehDono ? "Lista encerrada." : "Você saiu da lista compartilhada.");
    } catch { toast.error("Erro ao sair da lista."); }
    setAction(false);
  }

  function copyCode() {
    if (!listState) return;
    void navigator.clipboard.writeText(listState.lista.codigo).then(() => toast.success("Código copiado."));
  }

  function copyLink() {
    void navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Link copiado."));
  }

  function shareWhatsApp() {
    const cod = listState?.lista.codigo ?? "";
    const msg = encodeURIComponent(
      `🛒 Vamos fazer nossa lista de compras juntos no AíCompensa!\n\nEntre usando este link:\n${inviteUrl}\n\nOu utilize o código:\n${cod}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  function shareNativo() {
    if (navigator.share) {
      void navigator.share({
        title: "Lista Compartilhada",
        text: "Vamos compartilhar nossa lista de compras.",
        url: inviteUrl,
      }).catch(() => {});
    } else {
      copyLink();
    }
  }

  function downloadQR() {
    const svg = qrContainerRef.current?.querySelector("svg");
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `aicompensa-lista-${listState?.lista.codigo ?? "compartilhada"}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("QR Code salvo!");
  }

  const comprados  = listState?.itens.filter(i => i.comprado).length ?? 0;
  const totalItens = listState?.itens.length ?? 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 pt-2 pb-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                {(view === "creating" || view === "join" || view === "sharing") && (
                  <button
                    onClick={() => setView(listState ? "active" : "start")}
                    className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 text-muted-foreground transition-colors shrink-0"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <span className="text-xl shrink-0">
                  {view === "start" ? "🤝" : emojiLista}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[15px] font-black text-foreground leading-tight truncate">
                    {view === "start"    && "Lista Compartilhada"}
                    {view === "creating" && "Nova Lista Compartilhada"}
                    {view === "join"     && "Entrar numa Lista"}
                    {view === "active"   && nomeLista}
                    {view === "sharing"  && "Convidar Participantes"}
                  </h2>
                  {view === "active" && listState && (
                    <p className="text-[10px] text-slate-400 leading-none mt-0.5 flex items-center gap-1">
                      <span>Lista Compartilhada · {listState.membros.length} participante{listState.membros.length !== 1 ? "s" : ""}</span>
                      {syncing && <span className="text-slate-400"> · Atualizando...</span>}
                      {!syncing && lastUpdatedRef.current && <span className="text-emerald-500"> · ✓ Atualizado agora</span>}
                      {networkError && <span className="text-red-400"> · Sem internet</span>}
                    </p>
                  )}
                  {view === "start" && (
                    <p className="text-[10px] text-slate-400 leading-none mt-0.5">Compartilhe sua lista de compras</p>
                  )}
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-muted-foreground shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">

              {/* Loading */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                </div>
              )}

              {/* ── START ──────────────────────────────────────────────────────── */}
              {!loading && view === "start" && (
                <>
                  <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-green-50 border border-emerald-200 rounded-3xl p-5 text-center">
                    <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-emerald-100/50 blur-xl pointer-events-none" />
                    <div className="text-5xl mb-3">🤝</div>
                    <h3 className="text-[17px] font-black text-slate-800 mb-1.5">Lista Compartilhada</h3>
                    <p className="text-sm text-slate-500 mb-4 leading-relaxed max-w-xs mx-auto">
                      Crie uma lista com família ou amigos.<br />Todos veem o que já foi comprado em tempo real.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {["✓ Sem duplicatas", "✓ Quem comprou o quê", "✓ Atualização automática"].map(b => (
                        <span key={b} className="bg-white border border-emerald-200 text-xs font-semibold text-emerald-700 px-3 py-1.5 rounded-full">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setView("creating")}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-black text-white shadow-md active:scale-[0.98] transition-all"
                    style={{ background: "linear-gradient(135deg, #065f46 0%, #059669 100%)" }}
                  >
                    <Plus className="h-5 w-5" /> Criar lista compartilhada
                  </motion.button>

                  <button
                    onClick={() => setView("join")}
                    className="w-full flex items-center justify-center gap-2.5 border border-slate-200 bg-white py-3.5 rounded-2xl text-[14px] font-bold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all"
                  >
                    <UserPlus className="h-4 w-4" /> Entrar com código
                  </button>
                </>
              )}

              {/* ── CREATING ───────────────────────────────────────────────────── */}
              {!loading && view === "creating" && (
                <>
                  <div>
                    <p className="text-sm font-black text-slate-700 mb-2">Nome da lista</p>
                    <input
                      type="text" maxLength={40} placeholder="Nossa Lista de Compras"
                      value={nomeInput} onChange={e => setNomeInput(e.target.value)}
                      className="w-full border border-border rounded-xl h-12 px-4 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                    />
                  </div>

                  <div>
                    <p className="text-sm font-black text-slate-700 mb-2">Ícone da lista</p>
                    <div className="grid grid-cols-6 gap-2">
                      {LISTA_EMOJIS.map(emoji => (
                        <motion.button
                          key={emoji}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setEmojiInput(emoji)}
                          className={`h-11 rounded-xl text-xl flex items-center justify-center border-2 transition-all ${
                            emojiInput === emoji
                              ? "border-emerald-500 bg-emerald-50 shadow-sm"
                              : "border-slate-200 hover:border-emerald-300"
                          }`}
                        >
                          {emoji}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void handleCreate()} disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-black text-white shadow-md disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #065f46 0%, #059669 100%)" }}
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {actionLoading ? "Criando lista..." : "Criar lista compartilhada"}
                  </motion.button>
                </>
              )}

              {/* ── JOIN ───────────────────────────────────────────────────────── */}
              {!loading && view === "join" && (
                <>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <p className="text-sm text-slate-600 font-medium leading-relaxed mb-3">
                      Peça o código de 6 caracteres para quem criou a lista:
                    </p>
                    <input
                      type="text" maxLength={6} placeholder="ABC123"
                      value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())}
                      className="w-full border border-border rounded-xl h-14 px-4 text-center text-2xl font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                    />
                  </div>
                  <button
                    onClick={() => void handleJoin()} disabled={actionLoading || joinInput.length !== 6}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-black text-white shadow-md disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #065f46 0%, #059669 100%)" }}
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {actionLoading ? "Entrando..." : "Entrar na lista"}
                  </button>
                </>
              )}

              {/* ── ACTIVE ─────────────────────────────────────────────────────── */}
              {!loading && view === "active" && !listState && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                </div>
              )}

              {!loading && view === "active" && listState && (
                <>
                  {/* Network error banner */}
                  {networkError && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                      <WifiOff className="h-4 w-4 text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-500 font-medium">Sem internet. Exibindo dados salvos.</p>
                    </div>
                  )}

                  {/* View-only banner */}
                  {somenteLeitura && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-700 font-semibold">
                        Você participa desta lista em modo somente leitura.
                      </p>
                    </div>
                  )}

                  {/* Participants card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                        {listState.membros.length} participante{listState.membros.length !== 1 ? "s" : ""}
                      </p>
                      <button
                        onClick={() => setInviteSheetOpen(true)}
                        className="flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all"
                      >
                        <Share2 className="h-3 w-3" /> Convidar
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {listState.membros.map(m => (
                        <div key={m.usuarioId} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border ${
                          m.usuarioId === currentUserId
                            ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                            : "bg-white border-slate-200 text-slate-600"
                        }`}>
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                            m.usuarioId === currentUserId ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-700"
                          }`}>
                            {m.nome.charAt(0).toUpperCase()}
                          </div>
                          {m.nome.split(" ")[0]}
                          {m.papel === "owner" && <span className="text-[9px] opacity-50">dono</span>}
                          {m.usuarioId === currentUserId && m.papel !== "owner" && <span className="text-[9px] opacity-60">você</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress */}
                  {totalItens > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-foreground">
                          {comprados}/{totalItens} comprado{comprados !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {Math.round((comprados / totalItens) * 100)}%
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-emerald-500 rounded-full"
                          animate={{ width: `${totalItens > 0 ? (comprados / totalItens) * 100 : 0}%` }}
                          transition={{ duration: 0.4 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Add item — hidden in view-only mode */}
                  {!somenteLeitura && (
                    <div className="flex gap-2">
                      <input
                        type="text" placeholder="Adicionar item à lista..."
                        value={newItem} onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") void handleAddItem(); }}
                        className="flex-1 border border-border rounded-xl h-11 px-3 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                      />
                      <button
                        onClick={() => void handleAddItem()} disabled={actionLoading || newItem.trim().length < 2}
                        className="h-11 w-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 disabled:opacity-50 active:scale-95 transition-all"
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </div>
                  )}

                  {/* Items */}
                  {listState.itens.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {somenteLeitura ? "Nenhum item ainda." : "Nenhum item ainda. Adicione o primeiro!"}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {listState.itens.map(item => (
                        <div key={item.id} className={`flex items-center gap-3 bg-white border border-border rounded-xl px-3 py-2.5 transition-opacity ${item.comprado ? "opacity-50" : ""}`}>
                          <button
                            onClick={() => { if (!somenteLeitura) void handleToggle(item.id); }}
                            disabled={somenteLeitura}
                            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${item.comprado ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-emerald-400"} ${somenteLeitura ? "cursor-default" : ""}`}
                          >
                            {item.comprado && <CheckCircle className="h-3 w-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${item.comprado ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {item.nome}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.comprado && item.compradoPorNome
                                ? `✓ ${item.compradoPorNome}`
                                : `+ ${item.nomeUsuario.split(" ")[0]}`}
                            </p>
                          </div>
                          {!somenteLeitura && item.usuarioId === currentUserId && (
                            <button onClick={() => void handleRemoveItem(item.id)} className="text-gray-300 hover:text-red-400 transition-colors p-0.5 shrink-0">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Leave — with confirmation */}
                  <button
                    onClick={() => setConfirmLeave(true)} disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 text-red-500 border border-red-200 py-2.5 rounded-2xl text-sm font-semibold hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    {listState.meuPapel === "owner" ? "Encerrar lista" : "Sair da lista"}
                  </button>
                </>
              )}

              {/* ── SHARING ────────────────────────────────────────────────────── */}
              {!loading && view === "sharing" && listState && (
                <>
                  {/* Code badge */}
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3">
                    <div className="flex-1">
                      <p className="text-[11px] text-amber-700 font-semibold mb-0.5">Código da lista</p>
                      <p className="text-2xl font-black text-amber-800 tracking-widest">{listState.lista.codigo}</p>
                    </div>
                    <button onClick={copyCode} className="p-2.5 rounded-xl bg-white border border-amber-200 hover:bg-amber-100 active:scale-95 transition-all">
                      <Copy className="h-4 w-4 text-amber-700" />
                    </button>
                  </div>

                  {/* Share actions */}
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={copyLink}
                      className="flex flex-col items-center gap-1.5 bg-white border border-slate-200 rounded-2xl p-3.5 hover:border-slate-300 active:scale-95 transition-all">
                      <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Link2 className="h-4 w-4 text-slate-600" />
                      </div>
                      <span className="text-[11px] font-black text-slate-700">Copiar link</span>
                    </button>
                    <button onClick={shareWhatsApp}
                      className="flex flex-col items-center gap-1.5 bg-white border border-green-200 rounded-2xl p-3.5 hover:bg-green-50 active:scale-95 transition-all">
                      <div className="h-9 w-9 rounded-xl bg-green-100 flex items-center justify-center">
                        <MessageCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <span className="text-[11px] font-black text-green-700">WhatsApp</span>
                    </button>
                    <button onClick={shareNativo}
                      className="flex flex-col items-center gap-1.5 bg-white border border-blue-200 rounded-2xl p-3.5 hover:bg-blue-50 active:scale-95 transition-all">
                      <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
                        <Share2 className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-[11px] font-black text-blue-700">Compartilhar</span>
                    </button>
                  </div>

                  {/* QR Code */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col items-center gap-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <QrCode className="h-3 w-3" /> QR Code para entrar
                    </p>
                    <div ref={qrContainerRef} className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <QRCodeSVG value={inviteUrl} size={160} />
                    </div>
                    <p className="text-[11px] text-slate-500 text-center font-medium">Escaneie para entrar rapidamente.</p>
                    <button
                      onClick={downloadQR}
                      className="flex items-center gap-2 text-xs font-black text-slate-600 border border-slate-200 bg-white px-4 py-2 rounded-xl hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      <Download className="h-3.5 w-3.5" /> Salvar QR Code
                    </button>
                  </div>
                </>
              )}

            </div>
          </motion.div>

          {/* Confirmação — Sair da lista */}
          <ConfirmDialog
            open={confirmLeave}
            title={listState?.meuPapel === "owner" ? "Encerrar lista?" : "Sair da lista?"}
            message={
              listState?.meuPapel === "owner"
                ? listState.membros.length > 1
                  ? "A lista será transferida para outro participante."
                  : "A lista será encerrada e todos os itens serão perdidos."
                : "Você precisará de um novo código para entrar novamente."
            }
            confirmLabel={listState?.meuPapel === "owner" ? "Encerrar" : "Sair"}
            onConfirm={() => void handleLeave()}
            onCancel={() => setConfirmLeave(false)}
          />

          {/* Convidar pessoas — bottom sheet */}
          {code && (
            <InviteBottomSheet
              isOpen={inviteSheetOpen}
              onClose={() => setInviteSheetOpen(false)}
              onShowQR={() => { setInviteSheetOpen(false); setView("sharing"); }}
              code={code}
              nomeLista={nomeLista}
              inviteUrl={inviteUrl}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Invite Bottom Sheet ────────────────────────────────────────────────────── */

function InviteBottomSheet({
  isOpen, onClose, onShowQR, code, nomeLista, inviteUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  onShowQR: () => void;
  code: string;
  nomeLista: string;
  inviteUrl: string;
}) {
  function shareWhatsApp() {
    const msg = encodeURIComponent(
      `🛒 Vamos fazer nossa lista de compras juntos no AíCompensa!\n\nEntre usando este link:\n${inviteUrl}\n\nOu utilize o código:\n${code}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
    onClose();
  }

  function shareNativo() {
    if (navigator.share) {
      void navigator.share({ title: "Lista Compartilhada", text: "Vamos compartilhar nossa lista de compras.", url: inviteUrl })
        .then(() => onClose())
        .catch(() => {});
    } else {
      void navigator.clipboard.writeText(inviteUrl).then(() => { toast.success("Link copiado."); onClose(); });
    }
  }

  function copyLink() {
    void navigator.clipboard.writeText(inviteUrl).then(() => { toast.success("Link copiado."); onClose(); });
  }

  function copyCode() {
    void navigator.clipboard.writeText(code).then(() => { toast.success("Código copiado."); onClose(); });
  }

  const options = [
    { icon: MessageCircle, label: "WhatsApp", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", action: shareWhatsApp },
    { icon: Share2, label: "Compartilhar", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", action: shareNativo },
    { icon: Link2, label: "Copiar link", color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", action: copyLink },
    { icon: Copy, label: "Copiar código", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", action: copyCode },
    { icon: QrCode, label: "Mostrar QR Code", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", action: () => { onShowQR(); } },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-4 pt-2 pb-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[15px] font-black text-slate-800">Convidar pessoas</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{nomeLista} · código {code}</p>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-slate-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {options.map(({ icon: Icon, label, color, bg, border, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border ${bg} ${border} active:scale-[0.98] transition-all`}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${bg}`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <span className={`text-sm font-bold ${color}`}>{label}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 ml-auto" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Deep Link Modal ────────────────────────────────────────────────────────── */

function DeepLinkModal({
  codigo, loading, error, onEntrar, onCancelar,
}: {
  codigo: string;
  loading: boolean;
  error: string | null;
  onEntrar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/50"
        onClick={onCancelar}
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-sm text-slate-500">Verificando convite...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🤝</div>
              <h2 className="text-lg font-black text-slate-800 mb-1.5">Convite para lista compartilhada</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Você recebeu um convite para entrar em uma lista de compras do AíCompensa.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 text-center">
              <p className="text-[11px] text-amber-700 font-semibold mb-1">Código do convite</p>
              <p className="text-3xl font-black text-amber-800 tracking-widest">{codigo}</p>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={onEntrar}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white shadow-md"
                style={{ background: "linear-gradient(135deg, #065f46 0%, #059669 100%)" }}
              >
                <UserPlus className="h-4 w-4" /> Entrar na lista
              </button>
              <button
                onClick={onCancelar}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */

/* ── Price validation ──────────────────────────────────────────────────────── */

const PRICE_RULES: Array<{ pattern: RegExp; limite: number }> = [
  { pattern: /frango/i,                                          limite: 60  },
  { pattern: /picanha|contra.?fil[eé]|alcatra|costela\s*bov/i,  limite: 180 },
  { pattern: /carne|patinho|ac[eé]m|coxão|bife|músculo/i,       limite: 130 },
  { pattern: /leite/i,                                           limite: 22  },
  { pattern: /arroz.*(5|10)\s*kg|(5|10)\s*kg.*arroz/i,          limite: 90  },
  { pattern: /\barroz\b/i,                                       limite: 35  },
  { pattern: /\bovos?\b/i,                                       limite: 55  },
  { pattern: /feijão/i,                                          limite: 35  },
  { pattern: /açúcar/i,                                          limite: 18  },
  { pattern: /óleo.*(soja|cozinha)|soja.*óleo/i,                 limite: 25  },
  { pattern: /macarrão|massa\b/i,                                limite: 25  },
  { pattern: /café\b/i,                                          limite: 70  },
];

function isPriceSuspeito(produto: string, preco: number): boolean {
  for (const r of PRICE_RULES) {
    if (r.pattern.test(produto) && preco > r.limite) return true;
  }
  return false;
}

/* ── Market name normalization ─────────────────────────────────────────────── */

const MARKET_CHAINS: Array<{ pattern: RegExp; nome: string }> = [
  { pattern: /comper/i,          nome: "Comper"          },
  { pattern: /pague\s*menos/i,   nome: "Pague Menos"     },
  { pattern: /assaí|assai/i,     nome: "Assaí"           },
  { pattern: /carrefour/i,       nome: "Carrefour"       },
  { pattern: /atacad[aã]o/i,     nome: "Atacadão"        },
  { pattern: /big\s*box/i,       nome: "Big Box"         },
  { pattern: /oba\s*hortif/i,    nome: "OBA Hortifruti"  },
  { pattern: /\bextra\b/i,       nome: "Extra"           },
  { pattern: /fort\s*atac/i,     nome: "Fort Atacadista" },
  { pattern: /sam'?s\s*club/i,   nome: "Sam's Club"      },
];

function normalizeMarket(mercado: string): { rede: string; unidade: string | null } {
  const t = mercado.trim();
  for (const chain of MARKET_CHAINS) {
    if (chain.pattern.test(t)) {
      const unit = t.replace(chain.pattern, "").replace(/^[\s\-–—_]+|[\s\-–—_]+$/g, "").trim();
      return { rede: chain.nome, unidade: unit.length > 0 ? unit : null };
    }
  }
  return { rede: t, unidade: null };
}

function displayMarket(mercado: string): string {
  const { rede, unidade } = normalizeMarket(mercado);
  return unidade ? `${rede} — ${unidade}` : rede;
}

/* ── Assistente IA — Templates com preview de ofertas ──────────────────────── */

interface TemplateMatch {
  nome: string;
  melhor: OfertaItem | null;
  saving: number;
}

function AssistenteIA({
  ofertas,
  onAddBulk,
}: {
  ofertas: OfertaItem[];
  onAddBulk: (nomes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const selectedTemplate = selectedIdx !== null ? (LIST_TEMPLATES[selectedIdx] ?? null) : null;

  const templateMatches: TemplateMatch[] = useMemo(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.items.map(nome => {
      const withTier = ofertas
        .map(o => ({ o, tier: matchTier(o.produto, nome) as 0 | 1 | 2 | 3 }))
        .filter(({ tier }) => tier > 0)
        .sort((a, b) => b.tier !== a.tier ? b.tier - a.tier : a.o.preco - b.o.preco);
      const melhor = withTier[0]?.o ?? null;
      const maxPreco = withTier.at(-1)?.o.preco ?? null;
      const saving = melhor && maxPreco && maxPreco > melhor.preco ? maxPreco - melhor.preco : 0;
      return { nome, melhor, saving };
    });
  }, [selectedTemplate, ofertas]);

  const totalEncontrado = templateMatches.filter(m => m.melhor !== null).length;
  const totalEconomia = templateMatches.reduce((s, m) => s + m.saving, 0);

  function handleAddAll() {
    if (!selectedTemplate) return;
    onAddBulk(selectedTemplate.items);
    setOpen(false);
    setSelectedIdx(null);
  }

  return (
    <div className="mx-4 mb-2">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 bg-white border border-border rounded-2xl px-3.5 py-3 text-left shadow-sm"
      >
        <div
          className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}
        >
          <Brain className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1A1A1A]">Templates inteligentes</p>
          <p className="text-[11px] text-[#6B7280]">Monte uma lista com templates prontos e preview de ofertas</p>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-[#6B7280] shrink-0" />
          : <ChevronDown className="h-4 w-4 text-[#6B7280] shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-t-0 border-border rounded-b-2xl px-4 pt-4 pb-4">
              {/* Template grid */}
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet-400" /> Escolha um template
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {LIST_TEMPLATES.map((tpl, idx) => (
                  <motion.button
                    key={tpl.label}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedIdx(selectedIdx === idx ? null : idx)}
                    className={`flex flex-col items-center gap-1 rounded-xl p-2.5 border text-center transition-all ${
                      selectedIdx === idx
                        ? "border-violet-500 bg-violet-50"
                        : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"
                    }`}
                  >
                    <span className="text-xl">{tpl.emoji}</span>
                    <span className={`text-[10px] font-bold leading-tight ${selectedIdx === idx ? "text-violet-700" : "text-slate-700"}`}>
                      {tpl.label}
                    </span>
                    <span className="text-[9px] text-slate-400">{tpl.items.length} itens</span>
                  </motion.button>
                ))}
              </div>

              {/* Preview */}
              {selectedTemplate && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {/* Summary header */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-black text-[#1A1A1A]">
                      {selectedTemplate.emoji} {selectedTemplate.label}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {totalEncontrado}/{selectedTemplate.items.length} com oferta
                      </span>
                      {totalEconomia > 0.5 && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                          💰 {R(totalEconomia)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Items list with offer matches */}
                  <div className="space-y-1.5 mb-3">
                    {templateMatches.map(({ nome, melhor, saving }) => (
                      <div
                        key={nome}
                        className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                          melhor
                            ? "bg-amber-50 border border-amber-100"
                            : "bg-gray-50 border border-gray-100"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1A1A1A] truncate">{nome}</p>
                          {melhor ? (
                            <p className="text-[10px] text-[#6B7280] flex items-center gap-1 truncate">
                              <Store className="h-3 w-3 shrink-0" />
                              {displayMarket(melhor.mercado)}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400">Sem oferta encontrada</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {melhor ? (
                            <>
                              <p className="text-sm font-extrabold text-amber-700">{R(melhor.preco)}</p>
                              {saving > 0.01 && (
                                <p className="text-[9px] text-emerald-600 font-semibold leading-none">-{R(saving)}</p>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAddAll}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-sm"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar à minha lista
                  </motion.button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Ler lista manuscrita — utilitário de resize ────────────────────────────── */

function resizeImageForOcr(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width  = Math.round(img.width  * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Falha ao carregar imagem")); };
    img.src = url;
  });
}

/* ── Lista por voz — Web Speech API ─────────────────────────────────────────
   Tipos mínimos: SpeechRecognition ainda não consta no lib.dom.d.ts padrão. */

interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike } };
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ── Tipos e helpers do modal de lista manuscrita ──────────────────────────── */

type UnidadeOpcao = "un" | "kg" | "g" | "L" | "ml" | "pacote" | "caixa";
type ModalStage   = "analyzing" | "editor" | "success";
const UNIDADES: UnidadeOpcao[] = ["un", "kg", "g", "L", "ml", "pacote", "caixa"];

interface ModalItem {
  id: string;
  produto: string;
  quantidade: number;
  unidade: UnidadeOpcao;
  emoji: string;
  categoria: string;
  confianca: "alta" | "revisar" | "baixa";
  editado: boolean;
}

const CONFIANCA_CONFIG = {
  alta:    { dot: "🟢", label: "Alta",    itemCls: "" },
  revisar: { dot: "🟡", label: "Revisar", itemCls: "border-yellow-300 bg-yellow-50/60" },
  baixa:   { dot: "🔴", label: "Baixa",   itemCls: "border-yellow-400 bg-yellow-50" },
} as const;

const CATEGORIAS_OCR: Array<{ test: RegExp; categoria: string; emoji: string; unidade: UnidadeOpcao }> = [
  { test: /batata|tomate|cenoura|cebola|alface|couve|brócol|abobrinha|berinjela|pepino|pimentão|vagem|maçã|banana|laranja|limão|uva|morango|manga|abacaxi|mamão|melancia|pêra|abóbora|beterraba|mandioca|aipim|alho.?poró|salsinha|coentro|cebolinha|rúcula|agrião|quiabo|chuchu|jiló/i, categoria: "Hortifruti", emoji: "🥬", unidade: "kg" },
  { test: /carne|frango|peixe|costela|picanha|alcatra|patinho|contra.?filé|filé|maminha|músculo|coxão|acém|cupim|bisteca|linguiça|salsicha|bacon|lombinho|bife|sobrecoxa|tilápia|salmão|sardinha|camarão|bacalhau/i, categoria: "Açougue", emoji: "🥩", unidade: "kg" },
  { test: /leite|queijo|iogurte|requeijão|manteiga|creme.?de.?leite|nata|coalhada|ricota|mussarela|parmesão|cottage|catupiry/i, categoria: "Laticínios", emoji: "🥛", unidade: "un" },
  { test: /cerveja|refrigerante|suco|água.?mineral|vinho|cachaça|whisky|vodka|energético|isotônico|água.?coco|kombucha/i, categoria: "Bebidas", emoji: "🥤", unidade: "un" },
  { test: /detergente|sabão|amaciante|desinfetante|água.?sanitária|esponja|vassoura|rodo|limpador|alvejante/i, categoria: "Limpeza", emoji: "🧼", unidade: "un" },
  { test: /shampoo|condicionador|sabonete|creme.?dental|pasta.?dental|escova.?dente|fio.?dental|desodorante|absorvente|fralda|lenço.?umedecido|papel.?higiênico|cotonete|barbeador|hidratante/i, categoria: "Higiene", emoji: "🧻", unidade: "un" },
];

function inferCategoriaOcr(produto: string): { categoria: string; emoji: string; unidade: UnidadeOpcao } {
  for (const c of CATEGORIAS_OCR) {
    if (c.test.test(produto)) return { categoria: c.categoria, emoji: c.emoji, unidade: c.unidade };
  }
  return { categoria: "Mercearia", emoji: "📦", unidade: "un" };
}

/* ── Agrupamento por categoria — tela "Minha Lista" (Sprint #03) ────────────
   Reaproveita inferCategoriaOcr (mesma fonte usada pelo OCR/voz) só para
   decidir em qual grupo visual o item cai. Ordem fixa de exibição. */

const CATEGORIA_GRUPOS: Array<{ categoria: string; emoji: string }> = [
  { categoria: "Hortifruti",  emoji: "🥬" },
  { categoria: "Açougue",     emoji: "🥩" },
  { categoria: "Laticínios",  emoji: "🥛" },
  { categoria: "Bebidas",     emoji: "🥤" },
  { categoria: "Mercearia",   emoji: "📦" },
  { categoria: "Limpeza",     emoji: "🧼" },
  { categoria: "Higiene",     emoji: "🧻" },
];

function inferConfianca(produto: string, categoria: string): "alta" | "revisar" | "baixa" {
  const p = produto.trim();
  if (p.length < 3) return "baixa";
  if (categoria !== "Mercearia" && p.length >= 5) return "alta";
  if (p.length >= 6) return "alta";
  if (p.length >= 4) return "revisar";
  return "baixa";
}

/* ── LerManuscritaModal — full screen, 3 stages ─────────────────────────────── */

function LerManuscritaModal({
  itensIniciais,
  onClose,
  onConfirm,
  onComparar,
}: {
  itensIniciais: Array<{ id: string; produto: string; quantidade: number; unidade?: UnidadeOpcao; categoria?: string }>;
  onClose: () => void;
  onConfirm: (itens: Array<{ produto: string; quantidade: number; unidade: UnidadeOpcao }>) => void;
  onComparar: () => void;
}) {
  const [stage, setStage]             = useState<ModalStage>("analyzing");
  const [itens, setItens]             = useState<ModalItem[]>(() =>
    itensIniciais.map(i => {
      const cat = inferCategoriaOcr(i.produto);
      const categoria = i.categoria ?? cat.categoria;
      return {
        id: i.id,
        produto: i.produto,
        quantidade: i.quantidade,
        categoria,
        emoji: cat.emoji,
        unidade: i.unidade ?? cat.unidade,
        confianca: inferConfianca(i.produto, categoria),
        editado: false,
      };
    })
  );
  const [novoItem, setNovoItem]       = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentEdits, setRecentEdits] = useState<Set<string>>(new Set());
  const editTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /* Avança automaticamente de "analyzing" para "editor" após 800 ms */
  useEffect(() => {
    if (stage !== "analyzing") return;
    const t = setTimeout(() => setStage("editor"), 800);
    return () => clearTimeout(t);
  }, [stage]);

  /* Limpa timers de destaque ao desmontar */
  useEffect(() => {
    const timers = editTimersRef.current;
    return () => { timers.forEach(t => clearTimeout(t)); };
  }, []);

  /* Resumo por categoria — tela de análise */
  const categoriaSummary = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number }>();
    for (const item of itens) {
      const existing = map.get(item.categoria);
      if (existing) existing.count++;
      else map.set(item.categoria, { emoji: item.emoji, count: 1 });
    }
    return [...map.entries()]
      .map(([cat, v]) => ({ categoria: cat, emoji: v.emoji, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [itens]);

  const itensFiltrados = searchQuery.trim()
    ? itens.filter(i => i.produto.toLowerCase().includes(searchQuery.toLowerCase()))
    : itens;

  const validosCount = itens.filter(i => i.produto.trim().length > 0).length;

  function update(id: string, patch: Partial<{ produto: string; quantidade: number; unidade: UnidadeOpcao }>) {
    setItens(prev => prev.map(i => i.id === id ? { ...i, ...patch, editado: true } : i));
    const existing = editTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    setRecentEdits(prev => new Set([...prev, id]));
    const t = setTimeout(() => {
      setRecentEdits(prev => { const n = new Set(prev); n.delete(id); return n; });
      editTimersRef.current.delete(id);
    }, 2000);
    editTimersRef.current.set(id, t);
  }

  function remove(id: string) { setItens(prev => prev.filter(i => i.id !== id)); }

  function addNovo() {
    const nome = novoItem.trim();
    if (nome.length < 2) return;
    const cat = inferCategoriaOcr(nome);
    setItens(prev => [...prev, {
      id: crypto.randomUUID(), produto: nome, quantidade: 1,
      ...cat, confianca: inferConfianca(nome, cat.categoria), editado: false,
    }]);
    setNovoItem("");
  }

  function confirm() {
    const validos = itens.filter(i => i.produto.trim().length > 0);
    if (validos.length === 0) { onClose(); return; }
    onConfirm(validos);
    setStage("success");
  }

  return (
    /* z-[9999] garante cobertura do bottom nav (z-50) e do botão "+" flutuante */
    <div
      className="fixed inset-0 z-[9999] bg-white flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <AnimatePresence mode="wait">

        {/* ── Tela 1: analisando (800 ms) ──────────────────────────────── */}
        {stage === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col items-center justify-center px-8 text-center"
          >
            <motion.div
              animate={{ scale: [1, 1.09, 1] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              className="text-7xl mb-5 select-none"
            >
              🤖
            </motion.div>
            <p className="text-xl font-black text-slate-800 mb-1">IA analisando...</p>
            <p className="text-sm text-slate-400 mb-7">Identificando produtos e categorias</p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="w-full max-w-xs space-y-2"
            >
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                <span className="text-base select-none">✔</span>
                <span className="font-bold text-emerald-700 text-sm">
                  {itens.length} produto{itens.length !== 1 ? "s" : ""} encontrado{itens.length !== 1 ? "s" : ""}
                </span>
              </div>
              {categoriaSummary.map((cat, idx) => (
                <motion.div
                  key={cat.categoria}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.42 + idx * 0.06 }}
                  className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5"
                >
                  <span className="text-base select-none">{cat.emoji}</span>
                  <span className="text-sm font-semibold text-slate-600">
                    {cat.count} {cat.categoria}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* ── Tela 2: editor ────────────────────────────────────────────── */}
        {stage === "editor" && (
          <motion.div
            key="editor"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
              <span className="text-2xl select-none">🤖</span>
              <div className="flex-1">
                <h2 className="text-[16px] font-black text-[#1A1A1A] leading-tight">
                  IA identificou {itens.length} produto{itens.length !== 1 ? "s" : ""}
                </h2>
                <p className="text-[11px] text-slate-400">Revise antes de adicionar à sua lista</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors shrink-0">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Busca */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar item..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 h-10 rounded-xl border border-slate-200 bg-slate-50 text-sm text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition"
                />
              </div>
            </div>

            {/* Lista — rolável, overscroll-contain evita bounce no iOS */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2 space-y-2">
              {itensFiltrados.map(item => {
                const conf     = CONFIANCA_CONFIG[item.confianca];
                const isEdited = recentEdits.has(item.id);
                const itemCls  = isEdited
                  ? "border-emerald-300 bg-emerald-50/70"
                  : item.confianca !== "alta"
                  ? conf.itemCls
                  : "border-slate-200 bg-slate-50";
                return (
                  <div
                    key={item.id}
                    className={`border rounded-2xl px-3 py-2.5 flex items-center gap-2.5 transition-all duration-300 ${itemCls}`}
                  >
                    <span className="text-lg shrink-0 select-none">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <input
                          value={item.produto}
                          onChange={e => update(item.id, { produto: e.target.value })}
                          className="flex-1 min-w-0 text-[14px] font-semibold text-[#1A1A1A] bg-transparent border-none focus:outline-none leading-tight"
                          placeholder="Nome do produto"
                        />
                        <span
                          className="text-[11px] shrink-0 select-none"
                          title={`Confiança: ${conf.label}`}
                        >{conf.dot}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 leading-none">{item.categoria}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => update(item.id, { quantidade: Math.max(1, item.quantidade - 1) })}
                        className="h-6 w-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center active:scale-90 transition-all font-bold text-sm"
                      >−</button>
                      <span className="text-[13px] font-black text-slate-700 w-4 text-center">{item.quantidade}</span>
                      <button
                        onClick={() => update(item.id, { quantidade: item.quantidade + 1 })}
                        className="h-6 w-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center active:scale-90 transition-all font-bold text-sm"
                      >+</button>
                      <select
                        value={item.unidade}
                        onChange={e => update(item.id, { unidade: e.target.value as UnidadeOpcao })}
                        className="text-[11px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded-md px-1 py-0.5 focus:outline-none cursor-pointer ml-1"
                      >
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <button onClick={() => remove(item.id)} className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}

              {itensFiltrados.length === 0 && searchQuery.trim().length > 0 && (
                <p className="text-center text-sm text-slate-400 py-8">Nenhum item encontrado</p>
              )}

              {/* Adicionar manualmente — oculto durante busca ativa */}
              {!searchQuery && (
                <div className="flex gap-2 pt-1 pb-1">
                  <input
                    type="text"
                    placeholder="Adicionar mais um item..."
                    value={novoItem}
                    onChange={e => setNovoItem(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addNovo(); }}
                    className="flex-1 h-11 px-4 rounded-xl border border-dashed border-slate-300 bg-white text-sm text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                  />
                  <button
                    onClick={addNovo}
                    className="h-11 w-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>

            {/* CTA fixo — bottom nav (60px) + safe-area do dispositivo */}
            <div
              className="px-4 pt-3 border-t border-slate-100 shrink-0"
              style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
            >
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={confirm}
                disabled={validosCount === 0}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-black text-white shadow-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}
              >
                🛒 Adicionar {validosCount} produto{validosCount !== 1 ? "s" : ""}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Tela 3: sucesso + comparar ────────────────────────────────── */}
        {stage === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, type: "spring", damping: 20 }}
            className="flex-1 flex flex-col items-center justify-center px-8 text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.08, type: "spring", damping: 10, stiffness: 200 }}
              className="text-7xl mb-5 select-none"
            >
              ✅
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
            >
              <h2 className="text-2xl font-black text-slate-800 mb-2">Lista adicionada!</h2>
              <p className="text-sm text-slate-400 mb-8">
                {validosCount} produto{validosCount !== 1 ? "s" : ""} prontos na sua lista
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              className="w-full max-w-xs space-y-3"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0px)" }}
            >
              <p className="text-[13px] font-medium text-slate-500 mb-2">
                Deseja encontrar o supermercado mais barato para esta lista?
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onComparar}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[15px] font-black text-white shadow-md"
                style={{ background: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)" }}
              >
                💰 Comparar preços
              </motion.button>
              <button
                onClick={onClose}
                className="w-full py-3 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors active:scale-95"
              >
                Agora não
              </button>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

/* ── Item da lista — foto/ícone, status de oferta, checkbox discreto ───────── */

function ListaItemRow({
  match, isChecked, onToggleCheck, onRemove,
  editingItemId, editingValue, onStartEdit, onChangeEditing, onSaveEdit, onCancelEdit,
  onAvisar, currentUser, selectMode, isSelected, onToggleSelect,
}: {
  match: ItemMatch;
  isChecked: boolean;
  onToggleCheck: (id: string) => void;
  onRemove: (id: string) => void;
  editingItemId: string | null;
  editingValue: string;
  onStartEdit: (id: string, nome: string) => void;
  onChangeEditing: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onAvisar: (nome: string) => void;
  currentUser: CurrentUser | null;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const { item, melhor } = match;
  const cat = inferCategoriaOcr(item.nome);
  const unidade = item.unidade ?? cat.unidade;
  const quantidade = item.quantidade ?? 1;
  const suspeito = melhor ? isPriceSuspeito(item.nome, melhor.preco) : false;
  const isEditing = editingItemId === item.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.2 }}
      onClick={selectMode ? () => onToggleSelect(item.id) : undefined}
      className={`flex items-center gap-2 py-1.5 transition-opacity ${isChecked ? "opacity-45" : ""} ${selectMode ? "cursor-pointer" : ""}`}
    >
      {/* Foto/categoria, ou checkbox de seleção em massa (Sprint #03.2) */}
      <div className="h-7 w-7 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
        {selectMode ? (
          isSelected ? <CheckSquare className="h-4 w-4 text-violet-600" /> : <Square className="h-4 w-4 text-slate-300" />
        ) : melhor?.fotoUrl ? (
          <img
            src={melhor.fotoUrl}
            alt={item.nome}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="text-[13px] select-none">{cat.emoji}</span>
        )}
      </div>

      {/* Nome / quantidade / unidade / status da oferta */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            autoFocus
            value={editingValue}
            onChange={e => onChangeEditing(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
            className="text-[13.5px] font-semibold bg-transparent border-b-2 border-violet-400 focus:outline-none text-[#1A1A1A] w-full min-w-0"
          />
        ) : (
          <p
            onClick={() => { if (!isChecked && !selectMode) onStartEdit(item.id, item.nome); }}
            className={`text-[13.5px] font-semibold leading-tight truncate ${isChecked ? "line-through text-muted-foreground" : "text-[#1A1A1A] cursor-text"}`}
          >
            {item.nome}
            <span className="text-[10px] font-medium text-slate-400 ml-1.5">{quantidade} {unidade}</span>
          </p>
        )}

        {melhor ? (
          <div className={`inline-flex items-center gap-1 mt-0.5 px-1.5 rounded-md ${suspeito ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            <span className="text-[10px] leading-none">{suspeito ? "⚠️" : "🟢"}</span>
            <span className="text-[10.5px] font-bold truncate leading-none">{displayMarket(melhor.mercado)}</span>
            <span className="text-[10.5px] font-black leading-none">· {R(melhor.preco)}</span>
          </div>
        ) : currentUser ? (
          <button onClick={() => onAvisar(item.nome)} className="text-[11px] text-amber-600 font-semibold mt-0.5 hover:text-amber-700 transition-colors">
            🔔 Criar alerta
          </button>
        ) : (
          <p className="text-[11px] text-slate-400 mt-0.5">Sem oferta ainda</p>
        )}
      </div>

      {/* Ações: checkbox + remover (ocultas durante seleção em massa) */}
      {!selectMode && (
        <div className="flex items-center gap-1 shrink-0">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => onToggleCheck(item.id)}
            aria-label={isChecked ? "Marcar como pendente" : "Marcar como comprado"}
            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-150 ${isChecked ? "bg-[#D4A017] border-[#D4A017]" : "border-slate-300 hover:border-[#F2C14E] hover:bg-amber-50"}`}
          >
            <AnimatePresence>
              {isChecked && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <CheckCircle className="h-3 w-3 text-white" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <button onClick={() => onRemove(item.id)} aria-label="Remover item"
            className="text-slate-400 hover:text-red-500 hover:bg-red-50 active:scale-90 rounded-lg p-1.5 transition-all shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ── Grupo de categoria — recolhível, com microinteração ao expandir ───────── */

function CategoriaGrupo({
  categoria, emoji, itemMatches, checked, collapsed, onToggleCollapse,
  onToggleCheck, onRemove, editingItemId, editingValue, onStartEdit, onChangeEditing, onSaveEdit, onCancelEdit,
  onAvisar, currentUser, selectMode, selectedIds, onToggleSelect,
}: {
  categoria: string;
  emoji: string;
  itemMatches: ItemMatch[];
  checked: Set<string>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleCheck: (id: string) => void;
  onRemove: (id: string) => void;
  editingItemId: string | null;
  editingValue: string;
  onStartEdit: (id: string, nome: string) => void;
  onChangeEditing: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onAvisar: (nome: string) => void;
  currentUser: CurrentUser | null;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const compradosCount = itemMatches.filter(m => checked.has(m.item.id)).length;
  const ordenados = [...itemMatches].sort((a, b) => {
    const aC = checked.has(a.item.id) ? 1 : 0;
    const bC = checked.has(b.item.id) ? 1 : 0;
    return aC - bC;
  });

  return (
    <div>
      <button onClick={onToggleCollapse} className="w-full flex items-center gap-2.5 py-3 text-left">
        <span className="text-[15px] select-none">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider leading-none">{categoria}</p>
          <p className="text-[10px] text-slate-400 font-semibold mt-1 leading-none">
            {itemMatches.length} {itemMatches.length === 1 ? "item" : "itens"}
            {compradosCount > 0 && ` · ${compradosCount}/${itemMatches.length} comprados`}
          </p>
        </div>
        {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-slate-100">
              <AnimatePresence initial={false}>
                {ordenados.map(match => (
                  <ListaItemRow
                    key={match.item.id}
                    match={match}
                    isChecked={checked.has(match.item.id)}
                    onToggleCheck={onToggleCheck}
                    onRemove={onRemove}
                    editingItemId={editingItemId}
                    editingValue={editingValue}
                    onStartEdit={onStartEdit}
                    onChangeEditing={onChangeEditing}
                    onSaveEdit={onSaveEdit}
                    onCancelEdit={onCancelEdit}
                    onAvisar={onAvisar}
                    currentUser={currentUser}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(match.item.id)}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Assistente de Entrada — bottom sheet com 5 formas de criar a lista ─────
   Sprint #03.2: ponto único para digitar, falar, fotografar, colar texto ou
   (futuramente) importar nota fiscal. "Colar texto" tem sub-passos próprios
   (verificar clipboard → preview → confirmar, ou textarea manual). */

type ColarTextoStep = "fechado" | "verificando" | "preview" | "textarea";

function AssistenteEntradaSheet({
  isOpen, onClose, titulo, subtitulo,
  onDigitar, onFalar, onFotografar, onColarTexto, onListasProntas,
}: {
  isOpen: boolean;
  onClose: () => void;
  titulo: string;
  subtitulo?: string;
  onDigitar: () => void;
  onFalar: () => void;
  onFotografar: () => void;
  onColarTexto: (texto: string) => void;
  onListasProntas: () => void;
}) {
  const [colarStep, setColarStep] = useState<ColarTextoStep>("fechado");
  const [clipboardPreview, setClipboardPreview] = useState("");
  const [textareaValue, setTextareaValue] = useState("");

  function resetColar() {
    setColarStep("fechado");
    setClipboardPreview("");
    setTextareaValue("");
  }

  function handleClose() {
    resetColar();
    onClose();
  }

  async function handleColarTexto() {
    setColarStep("verificando");
    try {
      const texto = await navigator.clipboard.readText();
      if (texto.trim().length > 0) {
        setClipboardPreview(texto.trim());
        setColarStep("preview");
        return;
      }
    } catch {
      // Permissão negada ou API indisponível — segue para textarea manual.
    }
    setColarStep("textarea");
  }

  function confirmarTexto(texto: string) {
    const trimmed = texto.trim();
    if (trimmed.length < 2) return;
    resetColar();
    onColarTexto(trimmed);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="flex items-start gap-2.5 px-5 pt-2 pb-4 shrink-0">
              <div className="flex-1">
                <h2 className="text-[17px] font-black text-[#1A1A1A] leading-snug">{titulo}</h2>
                {subtitulo && <p className="text-[12.5px] text-slate-400 mt-1">{subtitulo}</p>}
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-muted-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
            >
              {colarStep === "fechado" && (
                <div className="space-y-2 pb-2">
                  <button onClick={onListasProntas} className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 text-left hover:border-amber-400 hover:bg-amber-100/70 active:scale-[0.99] transition-all">
                    <span className="text-xl shrink-0">⭐</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#1A1A1A]">Listas prontas</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Comece rapidamente usando uma lista pronta.</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-amber-400 shrink-0" />
                  </button>
                  <button onClick={onDigitar} className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 text-left hover:border-violet-300 hover:bg-violet-50/40 active:scale-[0.99] transition-all">
                    <span className="text-xl shrink-0">⌨️</span>
                    <span className="flex-1 text-sm font-bold text-[#1A1A1A]">Digitar itens</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </button>
                  <button onClick={onFalar} className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 text-left hover:border-violet-300 hover:bg-violet-50/40 active:scale-[0.99] transition-all">
                    <span className="text-xl shrink-0">🎤</span>
                    <span className="flex-1 text-sm font-bold text-[#1A1A1A]">Falar minha lista</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </button>
                  <button onClick={onFotografar} className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 text-left hover:border-violet-300 hover:bg-violet-50/40 active:scale-[0.99] transition-all">
                    <span className="text-xl shrink-0">📸</span>
                    <span className="flex-1 text-sm font-bold text-[#1A1A1A]">Fotografar uma lista</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </button>
                  <button onClick={() => void handleColarTexto()} className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 text-left hover:border-violet-300 hover:bg-violet-50/40 active:scale-[0.99] transition-all">
                    <span className="text-xl shrink-0">📋</span>
                    <span className="flex-1 text-sm font-bold text-[#1A1A1A]">Colar texto</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </button>
                  <div className="w-full flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 opacity-60 cursor-not-allowed">
                    <span className="text-xl shrink-0">🧾</span>
                    <span className="flex-1 text-sm font-bold text-slate-500">Nota fiscal</span>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-200 px-2 py-1 rounded-full shrink-0">Em breve</span>
                  </div>
                </div>
              )}

              {colarStep === "verificando" && (
                <div className="flex items-center justify-center gap-2 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
                  <span className="text-sm font-semibold text-slate-500">Verificando área de transferência...</span>
                </div>
              )}

              {colarStep === "preview" && (
                <div className="space-y-3 pb-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Encontramos isto copiado:</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 max-h-32 overflow-y-auto">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{clipboardPreview}</p>
                  </div>
                  <button onClick={() => confirmarTexto(clipboardPreview)}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-sm"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                    Usar este texto
                  </button>
                  <button onClick={() => setColarStep("textarea")} className="w-full py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                    Escrever manualmente
                  </button>
                </div>
              )}

              {colarStep === "textarea" && (
                <div className="space-y-3 pb-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Cole ou digite sua lista</p>
                  <textarea
                    autoFocus
                    value={textareaValue}
                    onChange={e => setTextareaValue(e.target.value)}
                    placeholder="Ex: 2 kg de arroz, 1 garrafa de óleo, 3 latas de sardinha..."
                    rows={5}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition resize-none"
                  />
                  <button onClick={() => confirmarTexto(textareaValue)} disabled={textareaValue.trim().length < 2}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-sm disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                    Importar texto
                  </button>
                  <button onClick={() => setColarStep("fechado")} className="w-full py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                    Voltar
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Listas Prontas — bottom sheet com modelos expansíveis ──────────────────
   Sprint #03.3: ponto de entrada para importar uma lista pré-definida e abrir
   o Editor Premium para revisão antes de confirmar. */

function ListasProntasSheet({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (itens: string[]) => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-start gap-2.5 px-5 pt-2 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex-1">
                <h2 className="text-[17px] font-black text-[#1A1A1A] leading-snug">⭐ Escolha uma lista</h2>
                <p className="text-[12.5px] text-slate-400 mt-1">Você poderá editar todos os itens depois.</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-muted-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cards */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 space-y-3"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}
            >
              {PRESET_LISTS.map((lista, idx) => (
                <motion.button
                  key={lista.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { onSelect(lista.itens); onClose(); }}
                  className="w-full flex items-center gap-4 bg-white border border-slate-200 rounded-2xl px-5 py-4 text-left hover:border-amber-300 hover:bg-amber-50/40 active:scale-[0.99] transition-all group shadow-sm"
                >
                  <span className="text-4xl shrink-0 select-none">{lista.icone}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-black text-[#1A1A1A] group-hover:text-amber-900 transition-colors leading-tight">
                      {lista.nome}
                    </p>
                    <p className="text-[12px] text-slate-400 mt-0.5 leading-snug">{lista.descricao}</p>
                    <p className="text-[11px] text-slate-300 mt-1.5 font-semibold">≈ {lista.itens.length} itens</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 shrink-0 group-hover:text-amber-400 transition-colors" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Confirmação genérica — usada por "Limpar lista" e "Excluir selecionados" ─
   Nenhuma ação destrutiva em massa ocorre sem essa confirmação explícita. */

function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-6 top-1/3 z-[60] bg-white rounded-3xl shadow-2xl p-5"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-9 w-9 rounded-2xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
              </div>
              <h3 className="text-[15px] font-black text-[#1A1A1A]">{title}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">{message}</p>
            <div className="flex gap-2">
              <button onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all">
                Cancelar
              </button>
              <button onClick={onConfirm}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-black text-white hover:bg-red-600 active:scale-[0.98] transition-all">
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── ComparadorDetalhesSheet — itens de um mercado com nível de confiança ────── */

function ComparadorDetalhesSheet({
  mercado,
  isOpen,
  onClose,
}: {
  mercado: MercadoComparado;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[55]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[56] bg-white rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex items-center gap-2.5 px-4 pt-2 pb-3 border-b border-slate-100 shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-black text-[#1A1A1A] truncate">{displayMarket(mercado.nomeMercado)}</h2>
                <p className="text-[11px] text-slate-400">{mercado.produtosEncontrados} itens · Total: {R(mercado.total)}</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-slate-400 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 space-y-2"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}
            >
              {mercado.itens.map(item => {
                const conf =
                  item.confiancaNivel === "alta"
                    ? { dot: "🟢", label: "Alta confiança", cls: "text-emerald-700 bg-emerald-50 border-emerald-100" }
                    : item.confiancaNivel === "media"
                    ? { dot: "🟡", label: "Média confiança", cls: "text-amber-600 bg-amber-50 border-amber-100" }
                    : { dot: "🔴", label: "Baixa confiança", cls: "text-red-500 bg-red-50 border-red-100" };
                return (
                  <div key={item.ofertaId} className="bg-white border border-slate-200 rounded-2xl px-3.5 py-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.imagemExibicao ? (
                          <img
                            src={item.imagemExibicao}
                            alt={item.produto}
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-lg select-none">{inferCategoriaOcr(item.produto).emoji}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-bold text-slate-800 leading-tight">{item.produto}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{displayMarket(item.mercado)}</p>
                        {item.validade && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Válido até {new Date(item.validade).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </p>
                        )}
                      </div>
                      <p className="text-[15px] font-black text-slate-800 shrink-0">{R(item.preco)}</p>
                    </div>
                    <div className={`mt-2 flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] ${conf.cls}`}>
                      <span className="text-[10px] leading-none mt-px shrink-0">{conf.dot}</span>
                      <div>
                        <span className="font-bold">{conf.label}</span>
                        <span className="text-slate-500"> — {item.motivoConfianca}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── ComparadorPanel — bottom sheet com resultado da comparação ──────────────── */

function ComparadorPanel({
  data,
  onClose,
}: {
  data: ResultadoComparacao;
  onClose: () => void;
}) {
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [detalhesMercado, setDetalhesMercado] = useState<MercadoComparado | null>(null);
  const { melhorMercado, melhorCombinacao, rankingMercados, produtosResolvidosCount, produtosTotalCount } = data;

  function abrirDetalhes(m: MercadoComparado) {
    setDetalhesMercado(m);
    setDetalhesOpen(true);
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col"
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center gap-2.5 px-4 pt-2 pb-3 border-b border-slate-100 shrink-0">
          <span className="text-xl select-none">🏆</span>
          <div className="flex-1">
            <h2 className="text-[16px] font-black text-[#1A1A1A]">Comparador de Compra</h2>
            {produtosResolvidosCount < produtosTotalCount && (
              <p className="text-[11px] text-amber-600 font-semibold">
                ⚠️ {produtosResolvidosCount} de {produtosTotalCount} produtos com catálogo
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-slate-400 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 space-y-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}
        >
          {/* Sem dados */}
          {!melhorMercado && (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="text-4xl mb-3 select-none">🔍</div>
              <p className="text-sm font-bold text-slate-600 mb-1">Nenhuma oferta encontrada</p>
              <p className="text-[12px] text-slate-400 max-w-[280px]">
                Os produtos da sua lista ainda não têm ofertas com catálogo vinculado.
                Cadastre ofertas ou tente nomes mais comuns (ex: "Arroz", "Leite").
              </p>
            </div>
          )}

          {/* Melhor mercado único */}
          {melhorMercado && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                  <Store className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Melhor mercado hoje</p>
                  <p className="text-[15px] font-black text-slate-800 leading-tight truncate">{displayMarket(melhorMercado.nomeMercado)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white rounded-xl px-3 py-2 border border-emerald-100">
                  <p className="text-[10px] text-slate-400">Total estimado</p>
                  <p className="text-[16px] font-black text-slate-800">{R(melhorMercado.total)}</p>
                </div>
                <div className="bg-white rounded-xl px-3 py-2 border border-emerald-100">
                  <p className="text-[10px] text-slate-400">Cobertura</p>
                  <p className="text-[16px] font-black text-emerald-700">{melhorMercado.coberturaPercentual}%</p>
                  <p className="text-[9px] text-slate-400">{melhorMercado.produtosEncontrados}/{produtosTotalCount} itens</p>
                </div>
              </div>

              {melhorMercado.economiaEstimada > 0 && (
                <div className="bg-emerald-100 rounded-xl px-3 py-2 mb-3">
                  <p className="text-[11px] font-black text-emerald-800">
                    💰 Economia de {R(melhorMercado.economiaEstimada)} vs. mercado mais caro
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] text-slate-500 font-semibold">Confiança média</p>
                <span className={`text-[11px] font-black ${melhorMercado.confiancaMedia >= 80 ? "text-emerald-700" : melhorMercado.confiancaMedia >= 50 ? "text-amber-600" : "text-red-500"}`}>
                  {melhorMercado.confiancaMedia >= 80 ? "🟢 Alta" : melhorMercado.confiancaMedia >= 50 ? "🟡 Média" : "🔴 Baixa"}
                </span>
              </div>

              <button
                onClick={() => abrirDetalhes(melhorMercado)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black text-white active:scale-[0.98] transition-all"
                style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
              >
                Ver detalhes
              </button>
            </div>
          )}

          {/* Melhor combinação 2 mercados */}
          {melhorCombinacao && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1">Economize mais em 2 mercados</p>
              <p className="text-sm font-black text-slate-800 mb-3 truncate">
                {melhorCombinacao.mercados.map(m => displayMarket(m)).join(" + ")}
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-white rounded-xl px-3 py-2 border border-amber-100">
                  <p className="text-[10px] text-slate-400">Total combinado</p>
                  <p className="text-[15px] font-black text-slate-800">{R(melhorCombinacao.total)}</p>
                </div>
                <div className="bg-white rounded-xl px-3 py-2 border border-amber-100">
                  <p className="text-[10px] text-slate-400">Economia extra</p>
                  <p className="text-[15px] font-black text-amber-700">+{R(melhorCombinacao.economiaExtra)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                {melhorCombinacao.coberturaPercentual}% de cobertura · {melhorCombinacao.produtosEncontrados} itens
              </p>
            </div>
          )}

          {/* Ranking de mercados */}
          {rankingMercados.length > 1 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" /> Ranking de mercados
              </p>
              <div className="space-y-1.5">
                {rankingMercados.slice(0, 6).map((m, idx) => (
                  <button
                    key={m.nomeMercado}
                    onClick={() => abrirDetalhes(m)}
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-left hover:border-emerald-300 hover:bg-emerald-50/30 active:scale-[0.98] transition-all"
                  >
                    <span className="text-[12px] font-black text-slate-400 shrink-0 w-4">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800 truncate">{displayMarket(m.nomeMercado)}</p>
                      <p className="text-[10px] text-slate-400">{m.produtosEncontrados} itens · {m.coberturaPercentual}%</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-black text-slate-800">{R(m.total)}</p>
                      <span className="text-[10px]">
                        {m.confiancaMedia >= 80 ? "🟢" : m.confiancaMedia >= 50 ? "🟡" : "🔴"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Detalhes por mercado */}
      {detalhesMercado && (
        <ComparadorDetalhesSheet
          mercado={detalhesMercado}
          isOpen={detalhesOpen}
          onClose={() => setDetalhesOpen(false)}
        />
      )}
    </>
  );
}

export default function Lista() {
  const params = useParams<{ codigo?: string }>();
  const [, setLocation] = useLocation();
  const deepLinkCode = params.codigo?.toUpperCase() ?? null;

  const [items, setItems]       = useState<ListaItem[]>(loadLista);
  const [checked, setChecked]   = useState<Set<string>>(loadChecked);
  const [input, setInput]       = useState("");
  const [listaCompOpen, setListaCompOpen]  = useState(false);
  const [listState, setListState]          = useState<SharedListState | null>(null);
  const [deepLinkModal, setDeepLinkModal]  = useState<"idle" | "checking" | "show" | "joining" | "error">("idle");
  const [deepLinkError, setDeepLinkError]  = useState<string | null>(null);
  const [lerModalOpen, setLerModalOpen]   = useState(false);
  const [lerModalItens, setLerModalItens] = useState<Array<{ id: string; produto: string; quantidade: number; unidade?: UnidadeOpcao; categoria?: string }>>([]);
  const [lerLoading, setLerLoading]       = useState(false);
  const [vozStage, setVozStage]           = useState<"idle" | "listening" | "interpreting">("idle");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingValue, setEditingValue]   = useState("");
  const [collapsedCategorias, setCollapsedCategorias] = useState<Set<string>>(new Set());
  const [entradaSheetOpen, setEntradaSheetOpen] = useState(false);
  const [listaProntaSheetOpen, setListaProntaSheetOpen] = useState(false);
  const [selectMode, setSelectMode]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<"limpar" | "excluirSelecionados" | null>(null);
  const [assistenteUsado, setAssistenteUsado] = useState(loadAssistenteUsado);
  const [comparadorOpen, setComparadorOpen]       = useState(false);
  const [comparadorData, setComparadorData]       = useState<ResultadoComparacao | null>(null);
  const [comparadorLoading, setComparadorLoading] = useState(false);
  const inputRef               = useRef<HTMLInputElement>(null);
  const fileInputManuscritaRef = useRef<HTMLInputElement>(null);
  const recognitionRef         = useRef<SpeechRecognitionLike | null>(null);
  const syncTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pricesSectionRef       = useRef<HTMLDivElement>(null);
  const currentUser             = getCurrentUser();

  const { data: feedPage, isLoading } = useListOfertas(
    { limit: 50 },
    { query: { queryKey: getListOfertasQueryKey({ limit: 50 }) } },
  );
  const ofertas = feedPage?.items ?? [];

  useEffect(() => { saveChecked(checked); }, [checked]);

  /* ── Deep link: /lista/:codigo ───────────────────────────────────────────── */
  useEffect(() => {
    if (!deepLinkCode) return;
    setDeepLinkModal("checking");
    setDeepLinkError(null);

    customFetch<SharedListState | { lista: null }>("/api/lista/compartilhada/atual")
      .then(data => {
        const state = data as SharedListState;
        if (state.lista?.codigo === deepLinkCode) {
          // Already a member of this list — open panel directly
          setListState(state);
          setListaCompOpen(true);
          setDeepLinkModal("idle");
          setLocation("/lista");
        } else {
          setDeepLinkModal("show");
        }
      })
      .catch(() => {
        // Not logged in or network error — still show join modal
        setDeepLinkModal("show");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkCode]);

  async function handleDeepLinkJoin() {
    if (!deepLinkCode) return;
    setDeepLinkModal("joining");
    setDeepLinkError(null);
    try {
      await customFetch("/api/lista/compartilhada/entrar", {
        method: "POST",
        body: JSON.stringify({ codigo: deepLinkCode }),
      });
      setDeepLinkModal("idle");
      setListaCompOpen(true);
      setLocation("/lista");
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "Código inválido ou lista não encontrada.";
      setDeepLinkError(msg);
      setDeepLinkModal("error");
    }
  }

  /* ── Assistente de Entrada — abre automaticamente só na primeira utilização ──
     (Sprint #03.2). Depois disso, mesmo que a lista volte a ficar vazia, não
     reabre sozinho — o usuário aciona pelo botão "Criar lista" do estado vazio. */
  const isEmpty = items.length === 0;
  useEffect(() => {
    if (isEmpty && !assistenteUsado) {
      setEntradaSheetOpen(true);
      setAssistenteUsado(true);
      markAssistenteUsado();
    }
  }, [isEmpty, assistenteUsado]);

  /* ── Server sync for push alerts (debounced 2s, logged-in only) ─────────── */
  useEffect(() => {
    if (!currentUser) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void customFetch("/api/lista/sync", {
        method: "POST",
        body: JSON.stringify({ itens: items.map(i => i.nome) }),
      }).catch(() => {});
    }, 2000);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [items, currentUser]);

  /* ── Match items to offers ─────────────────────────────────────────────── */
  const matches: ItemMatch[] = useMemo(() => {
    return items.map(item => {
      // matchTier returns: 0=no match, 1=synonym/extra, 2=canonical expansion, 3=exact
      // E.g. item "breja" → tier 2 for offer "cerveja brahma"; item "macarrão" → tier 3 for "macarrao galo"
      const withTier = ofertas
        .map(o => ({ o, tier: matchTier(o.produto, item.nome) as 0 | 1 | 2 | 3 }))
        .filter(({ tier }) => tier > 0)
        .sort((a, b) => b.tier !== a.tier ? b.tier - a.tier : a.o.preco - b.o.preco);
      const matching = withTier.map(({ o }) => o);
      const byMarket = new Map<string, OfertaItem>();
      for (const o of matching) {
        const mk = o.mercado.toLowerCase();
        if (!byMarket.has(mk) || o.preco < byMarket.get(mk)!.preco) byMarket.set(mk, o);
      }
      const bestByMarket = [...byMarket.values()].sort((a, b) => a.preco - b.preco).slice(0, 3);
      const melhor = bestByMarket[0] ?? null;
      const isNew  = melhor ? Date.now() - new Date(melhor.dataCriacao).getTime() < 6 * 3_600_000 : false;
      return { item, melhor, bestByMarket, isNew };
    });
  }, [items, ofertas]);

  /* ── Totals ────────────────────────────────────────────────────────────── */
  const totalEstimado    = useMemo(() => matches.reduce((s, m) => s + (m.melhor?.preco ?? 0), 0), [matches]);
  const totalMaximo      = useMemo(() => matches.reduce((s, m) => s + (m.bestByMarket.at(-1)?.preco ?? m.melhor?.preco ?? 0), 0), [matches]);
  const economiaPossivel = totalMaximo - totalEstimado;

  /* ── Agrupamento por categoria — tela "Minha Lista" (Sprint #03) ─────────── */
  const groupedMatches = useMemo(() => {
    const byCategoria = new Map<string, ItemMatch[]>();
    for (const m of matches) {
      const { categoria } = inferCategoriaOcr(m.item.nome);
      if (!byCategoria.has(categoria)) byCategoria.set(categoria, []);
      byCategoria.get(categoria)!.push(m);
    }
    return CATEGORIA_GRUPOS
      .map(g => ({ ...g, itemMatches: byCategoria.get(g.categoria) ?? [] }))
      .filter(g => g.itemMatches.length > 0);
  }, [matches]);

  /* ── Melhor mercado — card final, só quando há comparação válida ─────────── */
  const melhorMercado = useMemo(() => {
    if (!matches.some(m => m.melhor !== null)) return null;
    const groups = computeSpeedGroups(matches);
    const entry = [...groups.entries()].find(([mk]) => mk !== "__sem_oferta__");
    if (!entry) return null;
    const [mercado, groupMatches] = entry;
    let economia = 0;
    for (const m of groupMatches) {
      const atMarket = m.bestByMarket.find(o => o.mercado === mercado);
      if (!atMarket || isPriceSuspeito(m.item.nome, atMarket.preco)) continue;
      const validos = m.bestByMarket.filter(o => !isPriceSuspeito(m.item.nome, o.preco));
      if (validos.length < 2) continue;
      const pior = validos.at(-1)!.preco;
      if (pior > atMarket.preco) economia += pior - atMarket.preco;
    }
    return { mercado, economia };
  }, [matches]);

  /* ── Actions ───────────────────────────────────────────────────────────── */
  function addItem(raw?: string) {
    const nome = (raw ?? input).trim();
    if (nome.length < 2) { toast.error("Digite pelo menos 2 caracteres."); return; }
    if (items.some(i => i.nome.toLowerCase() === nome.toLowerCase())) { toast.error("Item já está na lista."); return; }
    const next = [...items, { id: crypto.randomUUID(), nome, adicionadoEm: new Date().toISOString() }];
    setItems(next); saveLista(next); setInput("");
    toast.success(`"${nome}" adicionado!`);
    if (!raw) inputRef.current?.focus();
  }

  function removeItem(id: string) {
    const next = items.filter(i => i.id !== id);
    setItems(next); saveLista(next);
    setChecked(s => { const n = new Set(s); n.delete(id); return n; });
  }

  function toggleCheck(id: string) {
    setChecked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function toggleCategoria(categoria: string) {
    setCollapsedCategorias(prev => {
      const next = new Set(prev);
      if (next.has(categoria)) next.delete(categoria); else next.add(categoria);
      return next;
    });
  }

  function handleAvisar(nome: string) {
    void customFetch("/api/alertas", { method: "POST", body: JSON.stringify({ produto: nome, precoAlvo: 0 }) })
      .then(() => toast.success(`Alerta criado para "${nome}"!`))
      .catch(() => toast.error("Erro ao criar alerta."));
  }

  function addBulkItems(nomes: string[]) {
    const unique = nomes.filter(n => !items.some(i => i.nome.toLowerCase() === n.toLowerCase()));
    if (unique.length === 0) { toast.info("Todos os itens já estão na lista."); return; }
    const next = [
      ...items,
      ...unique.map(nome => ({ id: crypto.randomUUID(), nome, adicionadoEm: new Date().toISOString() })),
    ];
    setItems(next); saveLista(next);
    toast.success(`${unique.length} ${unique.length === 1 ? "item adicionado" : "itens adicionados"}! 🛒`);
  }

  function clearChecked() {
    const next = items.filter(i => !checked.has(i.id));
    setItems(next); saveLista(next); setChecked(new Set());
    toast.success("Itens comprados removidos!");
  }

  /* ── Ações em massa (Sprint #03.2) ─────────────────────────────────────── */
  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function cancelSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function requestLimparLista() {
    if (items.length === 0) return;
    setConfirmAction("limpar");
  }

  function requestExcluirSelecionados() {
    if (selectedIds.size === 0) return;
    setConfirmAction("excluirSelecionados");
  }

  function cancelarConfirmacao() {
    setConfirmAction(null);
  }

  function confirmarAcao() {
    if (confirmAction === "limpar") {
      setItems([]); saveLista([]); setChecked(new Set());
      toast.success("Lista apagada!");
    } else if (confirmAction === "excluirSelecionados") {
      const next = items.filter(i => !selectedIds.has(i.id));
      setItems(next); saveLista(next);
      setChecked(prev => { const n = new Set(prev); for (const id of selectedIds) n.delete(id); return n; });
      toast.success(`${selectedIds.size} ${selectedIds.size === 1 ? "item removido" : "itens removidos"}!`);
    }
    setConfirmAction(null);
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function startEdit(id: string, nome: string) {
    setEditingItemId(id);
    setEditingValue(nome);
  }

  function saveEdit() {
    if (!editingItemId) return;
    const nome = editingValue.trim();
    if (nome.length >= 2 && !items.some(i => i.id !== editingItemId && i.nome.toLowerCase() === nome.toLowerCase())) {
      const next = items.map(i => i.id === editingItemId ? { ...i, nome } : i);
      setItems(next);
      saveLista(next);
    }
    setEditingItemId(null);
    setEditingValue("");
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditingValue("");
  }

  async function handleLerManuscrita(file: File) {
    setLerLoading(true);
    try {
      const b64 = await resizeImageForOcr(file);
      const res = await fetch("/api/lista/ler-manuscrita", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64 }),
      });
      const json = await res.json() as { itens?: { produto: string; quantidade: number }[]; error?: string };
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Não foi possível ler a lista. Tente outra foto.");
        return;
      }
      const itens = (json.itens ?? []).map(i => ({ id: crypto.randomUUID(), ...i }));
      if (itens.length === 0) {
        toast.error("Não encontrei itens de compras na imagem. Tente outra foto.");
        return;
      }
      setLerModalItens(itens);
      setLerModalOpen(true);
    } catch {
      toast.error("Erro ao processar imagem. Tente novamente.");
    } finally {
      setLerLoading(false);
    }
  }

  async function handleInterpretarTexto(texto: string) {
    const trimmed = texto.trim();
    if (trimmed.length < 2) {
      setVozStage("idle");
      toast.error("Não entendi o que você falou. Tente novamente.");
      return;
    }
    setVozStage("interpreting");
    try {
      const data = await customFetch<{
        itens?: Array<{ produto: string; quantidade: number; unidade?: string; categoria?: string }>;
      }>("/api/lista/interpretar-texto", {
        method: "POST",
        body: JSON.stringify({ texto: trimmed }),
      });
      const itens = (data.itens ?? [])
        .filter(i => typeof i.produto === "string" && i.produto.trim().length > 0)
        .map(i => ({
          id: crypto.randomUUID(),
          produto: i.produto,
          quantidade: i.quantidade,
          unidade: UNIDADES.includes(i.unidade as UnidadeOpcao) ? (i.unidade as UnidadeOpcao) : undefined,
          categoria: i.categoria,
        }));
      if (itens.length === 0) {
        toast.error("Não encontrei produtos no que você falou. Tente de novo.");
        return;
      }
      setLerModalItens(itens);
      setLerModalOpen(true);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "Não foi possível interpretar sua lista. Tente novamente.";
      toast.error(msg);
    } finally {
      setVozStage("idle");
    }
  }

  function startVoz() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error("Seu navegador não suporta reconhecimento de voz.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      void handleInterpretarTexto(transcript);
    };
    recognition.onerror = () => {
      setVozStage("idle");
      toast.error("Não foi possível captar sua voz. Tente novamente.");
    };
    recognition.onend = () => {
      setVozStage(stage => (stage === "listening" ? "idle" : stage));
    };

    setVozStage("listening");
    recognition.start();
  }

  /* ── Gatilhos do Assistente de Entrada (Sprint #03.2) ────────────────────
     Cada opção fecha o sheet e dispara o fluxo já existente correspondente. */
  function abrirDigitar() {
    setEntradaSheetOpen(false);
    setTimeout(() => inputRef.current?.focus(), 250);
  }

  function abrirFalar() {
    setEntradaSheetOpen(false);
    setTimeout(() => startVoz(), 250);
  }

  function abrirFotografar() {
    setEntradaSheetOpen(false);
    setTimeout(() => fileInputManuscritaRef.current?.click(), 250);
  }

  function abrirColarTexto(texto: string) {
    setEntradaSheetOpen(false);
    void handleInterpretarTexto(texto);
  }

  function abrirListasProntas() {
    setEntradaSheetOpen(false);
    setTimeout(() => setListaProntaSheetOpen(true), 200);
  }

  function importarListaPronta(itens: string[]) {
    setListaProntaSheetOpen(false);
    const modalItens = itens.map(nome => ({
      id: crypto.randomUUID(),
      produto: nome,
      quantidade: 1,
    }));
    setLerModalItens(modalItens);
    setTimeout(() => setLerModalOpen(true), 200);
  }

  const hasAnyMatch = matches.some(m => m.melhor !== null);
  const concluidos  = checked.size;

  function scrollToPrices() {
    setLerModalOpen(false);
    setTimeout(() => {
      pricesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!hasAnyMatch) {
        toast.info("Quando houver ofertas próximas, elas aparecerão aqui.");
      }
    }, 100);
  }

  async function handleComparar() {
    if (items.length === 0) return;
    setComparadorLoading(true);
    try {
      const data = await customFetch<ResultadoComparacao>("/api/lista/comparar", {
        method: "POST",
        body: JSON.stringify({
          itens: items.map(i => ({ nome: i.nome, quantidade: i.quantidade ?? 1 })),
        }),
      });
      setComparadorData(data);
      setComparadorOpen(true);
    } catch {
      toast.error("Não foi possível comparar os mercados. Tente novamente.");
    } finally {
      setComparadorLoading(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col min-h-full bg-gray-50"
        style={{ paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 88px), 100px)" }}
      >
        {/* ── 1. Cabeçalho compacto ───────────────────────────────────── */}
        <div className="bg-white border-b border-border px-4 pt-5 pb-4 shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <button onClick={() => window.history.back()} aria-label="Voltar"
              className="h-11 w-11 -ml-2.5 shrink-0 rounded-full flex items-center justify-center bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 active:scale-90 transition-all duration-150">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-[17px] font-black text-[#1A1A1A] flex-1 leading-none">Minha Lista</h1>
            {currentUser && (
              <button onClick={() => setListaCompOpen(true)} aria-label="Lista compartilhada"
                className="h-9 w-9 rounded-xl flex items-center justify-center text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all shrink-0">
                <Users className="h-4 w-4" />
              </button>
            )}
          </div>
          {items.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-slate-500 leading-none mb-1">Sua compra estimada</p>
              <p className="text-[28px] font-black text-[#1A1A1A] leading-none tracking-tight">{R(totalEstimado)}</p>
              {economiaPossivel > 0.5 && (
                <p className="text-[12px] font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> Economia possível de {R(economiaPossivel)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── 2. Entrada de produtos — linha única ────────────────────── */}
        <div className="px-4 pt-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef} type="text" placeholder="Adicionar produto..."
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addItem(); }}
                className="w-full pl-9 pr-3 h-12 rounded-xl border border-border bg-white text-sm text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              />
            </div>
            <button onClick={startVoz} disabled={vozStage !== "idle"} aria-label="Falar minha lista"
              className={`h-11 w-11 shrink-0 rounded-xl border flex items-center justify-center active:scale-95 transition-all ${
                vozStage === "listening"
                  ? "border-red-300 bg-red-50 text-red-600"
                  : vozStage === "interpreting"
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-100 text-slate-500"
              }`}>
              {vozStage === "idle" && <Mic className="h-4 w-4" />}
              {vozStage === "listening" && <Mic className="h-4 w-4 animate-pulse" />}
              {vozStage === "interpreting" && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
            <input
              ref={fileInputManuscritaRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handleLerManuscrita(file);
                e.target.value = "";
              }}
            />
            <button onClick={() => fileInputManuscritaRef.current?.click()} disabled={lerLoading} aria-label="Ler lista escrita à mão"
              className="h-11 w-11 shrink-0 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 flex items-center justify-center active:scale-95 transition-all disabled:opacity-60">
              {lerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <button onClick={() => addItem()} aria-label="Adicionar item"
              className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-all shadow-sm shadow-primary/20">
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {/* Status transitório — voz / OCR (UX_GUIDELINES §11: nunca spinner sem texto) */}
          <AnimatePresence>
            {(vozStage !== "idle" || lerLoading) && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                <div className={`mt-2 flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-bold ${lerLoading ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    {vozStage === "listening" && "🎤 Estou ouvindo..."}
                    {vozStage === "interpreting" && "🤖 Interpretando sua lista..."}
                    {lerLoading && "📸 Lendo sua lista..."}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── 3. Barra de progresso ────────────────────────────────────── */}
        {items.length > 0 && <ProgressBar done={concluidos} total={items.length} />}

        {/* ── Lista Compartilhada — strip de participantes ─────────────── */}
        {currentUser && <ParticipantesStrip listState={listState} onOpenLista={() => setListaCompOpen(true)} />}

        {/* ── 4/5. Lista agrupada por categoria ───────────────────────── */}
        <div ref={pricesSectionRef} className="px-4 mt-3 flex-1 flex flex-col min-h-0">
          {items.length > 0 && !selectMode && (
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                <ShoppingCart className="h-3 w-3" />
                {items.length} {items.length === 1 ? "item" : "itens"}
                {isLoading && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
              </p>
              {checked.size > 0 && (
                <button onClick={clearChecked} className="text-[11px] font-bold text-red-500 hover:text-red-700 transition-colors">
                  Remover {checked.size} comprado{checked.size > 1 ? "s" : ""}
                </button>
              )}
            </div>
          )}

          {items.length > 0 && !selectMode && (
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setEntradaSheetOpen(true)}
                className="flex items-center gap-1 text-[11.5px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1.5 rounded-lg hover:bg-violet-100 active:scale-95 transition-all">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
              <div className="flex items-center gap-3">
                <button onClick={enterSelectMode} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors">
                  Selecionar
                </button>
                <button onClick={requestLimparLista} className="text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors">
                  Limpar lista
                </button>
              </div>
            </div>
          )}

          {selectMode && (
            <div className="flex items-center justify-between mb-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
              <span className="text-[12px] font-black text-violet-700">
                {selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={cancelSelectMode} className="text-[11px] font-bold text-slate-500 hover:text-slate-700 px-2 py-1 transition-colors">
                  Cancelar
                </button>
                <button onClick={requestExcluirSelecionados} disabled={selectedIds.size === 0}
                  className="text-[11px] font-black text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors">
                  Excluir selecionados
                </button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            assistenteUsado ? (
              <EmptyStateSimples onCriarLista={() => setEntradaSheetOpen(true)} />
            ) : (
              <EmptyStatePremium
                onAdd={nome => addItem(nome)}
                onAddBulk={addBulkItems}
                isLoggedIn={!!currentUser}
                onOpenAi={() => {
                  inputRef.current?.focus();
                  toast.info("Adicione alguns itens e eu sugerirei o resto! 🧠");
                }}
              />
            )
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-3 divide-y divide-slate-100">
              {groupedMatches.map(g => (
                <CategoriaGrupo
                  key={g.categoria}
                  categoria={g.categoria}
                  emoji={g.emoji}
                  itemMatches={g.itemMatches}
                  checked={checked}
                  collapsed={collapsedCategorias.has(g.categoria)}
                  onToggleCollapse={() => toggleCategoria(g.categoria)}
                  onToggleCheck={toggleCheck}
                  onRemove={removeItem}
                  editingItemId={editingItemId}
                  editingValue={editingValue}
                  onStartEdit={startEdit}
                  onChangeEditing={setEditingValue}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onAvisar={handleAvisar}
                  currentUser={currentUser}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelected}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── 6. Melhor mercado — só quando há comparação válida ──────── */}
        {melhorMercado && (
          <div className="px-4 mt-3">
            <div className="bg-white border border-amber-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Store className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-400 leading-none mb-0.5">🏪 Melhor mercado</p>
                <p className="text-sm font-black text-[#1A1A1A] truncate">{displayMarket(melhorMercado.mercado)}</p>
                {melhorMercado.economia > 0.5 && (
                  <p className="text-[11px] text-emerald-600 font-bold">💰 Economia estimada {R(melhorMercado.economia)}</p>
                )}
              </div>
              <button onClick={scrollToPrices}
                className="shrink-0 text-xs font-black text-white px-3.5 py-2.5 rounded-xl active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)" }}>
                Comparar preços
              </button>
            </div>
          </div>
        )}

        {/* ── 6b. Compra Inteligente — comparar com índice de confiança ──── */}
        {items.length >= 2 && (
          <div className="px-4 mt-3">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => void handleComparar()}
              disabled={comparadorLoading || !currentUser}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[14px] font-black text-white shadow-md disabled:opacity-60 active:scale-[0.98] transition-all"
              style={{ background: "linear-gradient(135deg, #065f46 0%, #059669 100%)" }}
            >
              {comparadorLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Comparando mercados...</>
              ) : (
                <><TrendingDown className="h-4 w-4" /> Comparar Minha Compra</>
              )}
            </motion.button>
            {!currentUser && (
              <p className="text-center text-[11px] text-slate-400 mt-1.5">Faça login para comparar mercados</p>
            )}
          </div>
        )}

        {/* ── 7. Assistente IA — sempre recolhido, no final ───────────── */}
        {items.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-violet-400" /> Assistente IA
            </p>
            <AssistenteIA ofertas={ofertas} onAddBulk={addBulkItems} />
            {!!currentUser && <AiSuggestions items={items} onAdd={nome => addItem(nome)} />}
          </div>
        )}

        {/* ── 8. Publicação — CTA único no final ───────────────────────── */}
        {items.length > 0 && (
          <div className="px-4 mt-3">
            <button onClick={() => { window.location.href = "/publicar"; }}
              className="w-full flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-left hover:bg-amber-100 transition-colors active:scale-[0.98] shadow-sm">
              <span className="text-[12.5px] font-semibold text-amber-800">📷 Não encontrou um preço?</span>
              <span className="text-[11px] font-black text-amber-700 bg-white border border-amber-300 px-3 py-1.5 rounded-xl shrink-0">Publicar oferta</span>
            </button>
          </div>
        )}
      </motion.div>

      {/* ── Lista Compartilhada panel ──────────────────────────────────── */}
      {currentUser && (
        <ListaCompartilhadaPanel
          isOpen={listaCompOpen}
          onClose={() => setListaCompOpen(false)}
          currentUserId={currentUser.id}
          listState={listState}
          onListStateChange={setListState}
        />
      )}

      {/* ── Deep link — modal de entrada ───────────────────────────────── */}
      <AnimatePresence>
        {deepLinkCode && deepLinkModal !== "idle" && (
          <DeepLinkModal
            codigo={deepLinkCode}
            loading={deepLinkModal === "checking" || deepLinkModal === "joining"}
            error={deepLinkModal === "error" ? deepLinkError : null}
            onEntrar={() => void handleDeepLinkJoin()}
            onCancelar={() => { setDeepLinkModal("idle"); setLocation("/lista"); }}
          />
        )}
      </AnimatePresence>

      {/* ── Modal: ler lista manuscrita ────────────────────────────────── */}
      {lerModalOpen && (
        <LerManuscritaModal
          itensIniciais={lerModalItens}
          onClose={() => setLerModalOpen(false)}
          onComparar={scrollToPrices}
          onConfirm={itens => {
            const unique = itens.filter(i => !items.some(existing => existing.nome.toLowerCase() === i.produto.toLowerCase()));
            if (unique.length > 0) {
              const next = [
                ...items,
                ...unique.map(i => ({
                  id: crypto.randomUUID(),
                  nome: i.produto,
                  adicionadoEm: new Date().toISOString(),
                  quantidade: i.quantidade,
                  unidade: i.unidade,
                })),
              ];
              setItems(next);
              saveLista(next);
            }
            /* Modal gerencia seu próprio fechamento via tela de sucesso */
          }}
        />
      )}

      {/* ── Assistente de Entrada (Sprint #03.2) ─────────────────────────── */}
      <AssistenteEntradaSheet
        isOpen={entradaSheetOpen}
        onClose={() => setEntradaSheetOpen(false)}
        titulo={isEmpty ? "🛒 Como vamos começar?" : "Como deseja adicionar itens?"}
        subtitulo={isEmpty ? "Escolha a forma mais fácil para criar sua lista." : undefined}
        onDigitar={abrirDigitar}
        onFalar={abrirFalar}
        onFotografar={abrirFotografar}
        onColarTexto={abrirColarTexto}
        onListasProntas={abrirListasProntas}
      />

      <ListasProntasSheet
        isOpen={listaProntaSheetOpen}
        onClose={() => setListaProntaSheetOpen(false)}
        onSelect={importarListaPronta}
      />

      {/* ── Comparador de Compra (Sprint #07) ────────────────────────────── */}
      <AnimatePresence>
        {comparadorOpen && comparadorData && (
          <ComparadorPanel data={comparadorData} onClose={() => setComparadorOpen(false)} />
        )}
      </AnimatePresence>

      {/* ── Confirmação de ações em massa (Sprint #03.2) ─────────────────── */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "limpar" ? "Apagar lista" : "Excluir itens selecionados"}
        message={
          confirmAction === "limpar"
            ? "Tem certeza que deseja apagar todos os itens da lista?"
            : `Tem certeza que deseja excluir ${selectedIds.size} ${selectedIds.size === 1 ? "item" : "itens"} selecionado${selectedIds.size === 1 ? "" : "s"}?`
        }
        confirmLabel={confirmAction === "limpar" ? "Apagar tudo" : "Excluir"}
        onConfirm={confirmarAcao}
        onCancel={cancelarConfirmacao}
      />
    </>
  );
}
