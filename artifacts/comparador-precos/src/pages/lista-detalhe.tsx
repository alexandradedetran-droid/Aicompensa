import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Plus, Trash2, Search, CheckCircle, Store,
  TrendingDown, Loader2, Users, Activity, MoreVertical,
  Edit2, Copy, Archive, Trash, ShoppingCart,
} from "lucide-react";
import { useListOfertas, getListOfertasQueryKey, type Oferta } from "@workspace/api-client-react";
import { toast } from "sonner";
import {
  loadItens, saveItens, loadChecked, saveChecked,
  getListaNome, getListaEmoji, setListaNome, setListaEmoji,
  type ListaItem,
} from "@/lib/lista-types";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const EMOJIS = ["🛒", "🏠", "👨‍👩‍👧", "🎉", "🥩", "🧹", "🍕", "👶", "🐶", "💪", "🌿", "🎁"];

type TabKey = "itens" | "pessoas" | "atividade";

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ total, feito }: { total: number; feito: number }) {
  if (total === 0) return null;
  const pct = Math.round((feito / total) * 100);
  return (
    <div className="px-4 py-3 border-b border-[#1e293b]">
      <div className="flex justify-between mb-1.5">
        <span className="text-[11px] text-slate-400">{feito}/{total} itens</span>
        <span className="text-[11px] font-bold text-emerald-400">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-emerald-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ─── Rename modal ─────────────────────────────────────────────────────────────

function RenameModal({
  open,
  currentNome,
  currentEmoji,
  onClose,
  onSave,
}: {
  open: boolean;
  currentNome: string;
  currentEmoji: string;
  onClose: () => void;
  onSave: (nome: string, emoji: string) => void;
}) {
  const [nome, setNome] = useState(currentNome);
  const [emoji, setEmoji] = useState(currentEmoji);

  useEffect(() => {
    if (open) { setNome(currentNome); setEmoji(currentEmoji); }
  }, [open, currentNome, currentEmoji]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-black text-lg">Renomear Lista</h2>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Ícone</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  onClick={() => setEmoji(em)}
                  className={cn(
                    "w-10 h-10 text-xl rounded-xl flex items-center justify-center transition-all",
                    emoji === em
                      ? "bg-emerald-500/20 border-2 border-emerald-500"
                      : "bg-slate-700/50 border border-slate-600 hover:border-slate-400"
                  )}
                >
                  {em}
                </button>
              ))}
            </div>

            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Nome</p>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nome.trim()) onSave(nome.trim(), emoji); }}
              className="w-full px-4 h-12 rounded-xl border border-slate-600 bg-slate-700/50 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition mb-5"
            />

            <button
              onClick={() => nome.trim() && onSave(nome.trim(), emoji)}
              disabled={!nome.trim()}
              className="w-full h-12 rounded-xl font-black text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
            >
              Salvar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Menu dropdown ────────────────────────────────────────────────────────────

function ListaMenu({
  open,
  onClose,
  onRename,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            transition={{ duration: 0.14 }}
            className="absolute right-4 top-14 z-50 w-52 rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <button
              onClick={() => { onClose(); onRename(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-200 text-sm font-semibold hover:bg-white/5 transition"
            >
              <Edit2 className="h-4 w-4 text-slate-400" />
              Renomear
            </button>
            <button
              disabled
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 text-sm font-semibold cursor-not-allowed"
            >
              <Copy className="h-4 w-4" />
              Duplicar
              <span className="ml-auto text-[10px] bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full">
                Em breve
              </span>
            </button>
            <button
              disabled
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 text-sm font-semibold cursor-not-allowed"
            >
              <Archive className="h-4 w-4" />
              Arquivar
              <span className="ml-auto text-[10px] bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full">
                Em breve
              </span>
            </button>
            <div className="border-t border-slate-700/80" />
            <button
              onClick={() => { onClose(); onDelete(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-400 text-sm font-semibold hover:bg-red-500/5 transition"
            >
              <Trash className="h-4 w-4" />
              Excluir lista
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  melhorOferta,
  count,
  isChecked,
  isLoading,
  onToggle,
  onRemove,
}: {
  item: ListaItem;
  melhorOferta: Oferta | null;
  count: number;
  isChecked: boolean;
  isLoading: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isChecked ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
    >
      <div
        className="rounded-2xl overflow-hidden transition-all"
        style={{
          background: isChecked ? "rgba(15,23,42,0.7)" : "#1e293b",
          border: `1px solid ${isChecked ? "#1a2844" : "#334155"}`,
        }}
      >
        <div className="flex items-start gap-3 p-3.5">
          <button
            onClick={() => onToggle(item.id)}
            className={cn(
              "mt-0.5 h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90",
              isChecked
                ? "bg-emerald-500 border-emerald-500"
                : "border-slate-600 hover:border-emerald-400"
            )}
          >
            {isChecked && <CheckCircle className="h-4 w-4 text-white" />}
          </button>

          <div className="flex-1 min-w-0">
            <p className={cn(
              "font-bold text-sm leading-snug",
              isChecked ? "line-through text-slate-500" : "text-white"
            )}>
              {item.nome}
            </p>

            {melhorOferta ? (
              <div
                className="mt-1.5 flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)" }}
              >
                <div>
                  <p className="text-emerald-400 font-black text-base leading-none">
                    {R(melhorOferta.preco)}
                  </p>
                  <p className="text-emerald-500/60 text-[10px] font-semibold mt-0.5 flex items-center gap-1">
                    <Store className="h-2.5 w-2.5" />
                    {melhorOferta.mercado}
                    {melhorOferta.bairro && ` · ${melhorOferta.bairro}`}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">
                  {count} {count === 1 ? "oferta" : "ofertas"}
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                {isLoading
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Buscando preços...</>
                  : "⚠️ Nenhuma oferta encontrada."
                }
              </p>
            )}
          </div>

          <button
            onClick={() => onRemove(item.id)}
            className="text-slate-700 hover:text-red-400 transition-colors p-1 shrink-0 mt-0.5"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Tab: Itens ───────────────────────────────────────────────────────────────

function ItensTab({
  items,
  checked,
  ofertas,
  isLoading,
  shouldFocus,
  onFocusHandled,
  onAdd,
  onToggle,
  onRemove,
  onClearChecked,
}: {
  items: ListaItem[];
  checked: Set<string>;
  ofertas: Oferta[];
  isLoading: boolean;
  shouldFocus: boolean;
  onFocusHandled: () => void;
  onAdd: (nome: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClearChecked: () => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (shouldFocus) {
      setTimeout(() => { inputRef.current?.focus(); onFocusHandled(); }, 80);
    }
  }, [shouldFocus, onFocusHandled]);

  function handleAdd() {
    const nome = input.trim();
    if (!nome || nome.length < 2) { toast.error("Digite pelo menos 2 caracteres."); return; }
    if (items.some((i) => i.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error("Item já está na lista.");
      return;
    }
    onAdd(nome);
    setInput("");
  }

  const matches = useMemo(() => {
    return items.map((item) => {
      const keyword = item.nome.toLowerCase().trim();
      const found = ofertas
        .filter((o) => o.produto.toLowerCase().includes(keyword))
        .sort((a, b) => a.preco - b.preco);
      return { item, melhorOferta: found[0] ?? null, count: found.length };
    });
  }, [items, ofertas]);

  const economia = useMemo(() => {
    let total = 0;
    for (const { item, melhorOferta } of matches) {
      if (!melhorOferta) continue;
      const keyword = item.nome.toLowerCase().trim();
      const precos = ofertas
        .filter((o) => o.produto.toLowerCase().includes(keyword))
        .map((o) => o.preco);
      if (precos.length > 1) total += Math.max(...precos) - Math.min(...precos);
    }
    return total;
  }, [matches, ofertas]);

  const totalMinimo = useMemo(() =>
    matches.reduce((s, { melhorOferta }) => s + (melhorOferta?.preco ?? 0), 0),
    [matches]
  );

  const pendentes = matches.filter(({ item }) => !checked.has(item.id));
  const comprados = matches.filter(({ item }) => checked.has(item.id));

  return (
    <div className="flex flex-col pb-8">
      {/* Economia Estimada — destaque principal */}
      {economia > 0.01 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4 rounded-2xl p-4"
          style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-black text-sm">💰 Economize até {R(economia)}</p>
              <p className="text-emerald-400 text-xs mt-0.5">comparando preços desta lista</p>
            </div>
          </div>
          {totalMinimo > 0 && (
            <div
              className="mt-3 pt-3 flex justify-between items-center"
              style={{ borderTop: "1px solid rgba(16,185,129,0.12)" }}
            >
              <span className="text-slate-400 text-xs">Total mínimo estimado</span>
              <span className="text-emerald-400 font-black text-base">{R(totalMinimo)}</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Add item input */}
      <div className="px-4 mt-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Adicionar produto..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              className="w-full pl-9 pr-4 h-11 rounded-xl border border-slate-700 bg-slate-800/60 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
            />
          </div>
          <button
            onClick={handleAdd}
            className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
          >
            <Plus className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Summary row */}
      {items.length > 0 && (
        <div className="px-4 mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {pendentes.length} pendente{pendentes.length !== 1 ? "s" : ""}
            {isLoading && <Loader2 className="inline h-3 w-3 ml-1.5 animate-spin" />}
          </p>
          {checked.size > 0 && (
            <button
              onClick={onClearChecked}
              className="text-xs font-bold text-red-400 hover:text-red-300 transition"
            >
              Remover {checked.size} comprado{checked.size > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Items */}
      <div className="px-4 mt-3 space-y-2">
        <AnimatePresence mode="popLayout">
          {items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center py-16"
            >
              <div className="text-5xl mb-3">🛒</div>
              <h3 className="text-white font-black text-base mb-1">Lista vazia</h3>
              <p className="text-slate-400 text-sm">
                Adicione produtos para ver os melhores preços.
              </p>
            </motion.div>
          ) : (
            <>
              {pendentes.map(({ item, melhorOferta, count }) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  melhorOferta={melhorOferta}
                  count={count}
                  isChecked={false}
                  isLoading={isLoading}
                  onToggle={onToggle}
                  onRemove={onRemove}
                />
              ))}

              {comprados.length > 0 && (
                <>
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-slate-800" />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Comprados ({comprados.length})
                    </span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>
                  {comprados.map(({ item, melhorOferta, count }) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      melhorOferta={melhorOferta}
                      count={count}
                      isChecked
                      isLoading={isLoading}
                      onToggle={onToggle}
                      onRemove={onRemove}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Tab: Pessoas (Sprint 1.2) ────────────────────────────────────────────────

function PessoasTab() {
  return (
    <div className="flex flex-col items-center text-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
        <Users className="h-8 w-8 text-slate-600" />
      </div>
      <h3 className="text-white font-bold text-base mb-1">Lista Compartilhada</h3>
      <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
        Compartilhe com família e amigos para fazerem a lista juntos.
        Disponível na Sprint 1.2.
      </p>
    </div>
  );
}

// ─── Tab: Atividade (Sprint 1.3) ──────────────────────────────────────────────

function AtividadeTab() {
  return (
    <div className="flex flex-col items-center text-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
        <Activity className="h-8 w-8 text-slate-600" />
      </div>
      <h3 className="text-white font-bold text-base mb-1">Histórico de Atividade</h3>
      <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
        Acompanhe o que foi adicionado e comprado na lista.
        Disponível com listas compartilhadas.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ListaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const isPessoal = id === "pessoal";

  const [items, setItems] = useState<ListaItem[]>(() => isPessoal ? loadItens() : []);
  const [checked, setChecked] = useState<Set<string>>(() => isPessoal ? loadChecked() : new Set());
  const [activeTab, setActiveTab] = useState<TabKey>("itens");
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [shouldFocusInput, setShouldFocusInput] = useState(false);
  const [nome, setNome] = useState(() => isPessoal ? getListaNome() : "Lista");
  const [emoji, setEmoji] = useState(() => isPessoal ? getListaEmoji() : "🛒");

  const { data: feedPage, isLoading } = useListOfertas(
    {},
    { query: { queryKey: getListOfertasQueryKey() } }
  );
  const ofertas = feedPage?.items ?? [];

  // Contextual FAB: switch to itens tab and focus input
  useEffect(() => {
    const handler = () => {
      setActiveTab("itens");
      setShouldFocusInput(true);
    };
    window.addEventListener("aicompensa:fab:add-item", handler);
    return () => window.removeEventListener("aicompensa:fab:add-item", handler);
  }, []);

  function addItem(nome: string) {
    const next = [
      ...items,
      { id: crypto.randomUUID(), nome, adicionadoEm: new Date().toISOString() },
    ];
    setItems(next);
    if (isPessoal) saveItens(next);
    toast.success(`"${nome}" adicionado!`);
  }

  function toggleCheck(itemId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      if (isPessoal) saveChecked(next);
      return next;
    });
  }

  function removeItem(itemId: string) {
    const next = items.filter((i) => i.id !== itemId);
    setItems(next);
    if (isPessoal) saveItens(next);
    setChecked((prev) => {
      const nextChecked = new Set(prev);
      nextChecked.delete(itemId);
      if (isPessoal) saveChecked(nextChecked);
      return nextChecked;
    });
  }

  function clearChecked() {
    const next = items.filter((i) => !checked.has(i.id));
    setItems(next);
    const empty = new Set<string>();
    setChecked(empty);
    if (isPessoal) { saveItens(next); saveChecked(empty); }
    toast.success("Itens comprados removidos!");
  }

  function handleRename(novoNome: string, novoEmoji: string) {
    setNome(novoNome);
    setEmoji(novoEmoji);
    if (isPessoal) { setListaNome(novoNome); setListaEmoji(novoEmoji); }
    setShowRenameModal(false);
    toast.success("Lista renomeada!");
  }

  function handleDelete() {
    if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
    if (isPessoal) {
      saveItens([]);
      saveChecked(new Set());
    }
    setLocation("/listas");
    toast.success("Lista excluída.");
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "itens",     label: "Itens" },
    { key: "pessoas",   label: "Pessoas" },
    { key: "atividade", label: "Atividade" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.22 }}
      className="relative flex flex-col min-h-full bg-[#0f172a]"
    >
      {/* Header */}
      <div className="relative flex items-center px-4 pt-5 pb-3 border-b border-[#1e293b]">
        <button
          onClick={() => setLocation("/listas")}
          className="p-1.5 -ml-1.5 text-slate-400 hover:text-white transition-colors mr-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-xl mr-2 leading-none">{emoji}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight truncate">{nome}</h1>
          <p className="text-slate-500 text-[11px]">
            {isPessoal ? "Lista Pessoal" : "Lista Compartilhada"}
          </p>
        </div>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/5"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        <ListaMenu
          open={showMenu}
          onClose={() => setShowMenu(false)}
          onRename={() => setShowRenameModal(true)}
          onDelete={handleDelete}
        />
      </div>

      {/* Progress bar */}
      <ProgressBar total={items.length} feito={checked.size} />

      {/* Tabs */}
      <div className="flex border-b border-[#1e293b]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 py-3 text-xs font-bold tracking-wide transition-all border-b-2",
              activeTab === tab.key
                ? "text-emerald-400 border-emerald-500"
                : "text-slate-500 border-transparent hover:text-slate-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {activeTab === "itens" && (
          <ItensTab
            items={items}
            checked={checked}
            ofertas={ofertas}
            isLoading={isLoading}
            shouldFocus={shouldFocusInput}
            onFocusHandled={() => setShouldFocusInput(false)}
            onAdd={addItem}
            onToggle={toggleCheck}
            onRemove={removeItem}
            onClearChecked={clearChecked}
          />
        )}
        {activeTab === "pessoas" && <PessoasTab />}
        {activeTab === "atividade" && <AtividadeTab />}
      </div>

      {/* Modals */}
      <RenameModal
        open={showRenameModal}
        currentNome={nome}
        currentEmoji={emoji}
        onClose={() => setShowRenameModal(false)}
        onSave={handleRename}
      />
    </motion.div>
  );
}
