import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, ChevronRight, TrendingDown, ArrowRight, Bot,
} from "lucide-react";
import { useListOfertas, getListOfertasQueryKey } from "@workspace/api-client-react";
import {
  loadItens, loadChecked,
  getListaNome, getListaEmoji,
  setListaNome, setListaEmoji,
} from "@/lib/lista-types";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const TEMPLATES = [
  { emoji: "🛒", nome: "Compra da Semana" },
  { emoji: "🥩", nome: "Churrasco" },
  { emoji: "👶", nome: "Lista do Bebê" },
  { emoji: "🎉", nome: "Festa" },
  { emoji: "🧹", nome: "Limpeza" },
  { emoji: "🌿", nome: "Orgânicos" },
];

const EMOJIS = ["🛒", "🏠", "👨‍👩‍👧", "🎉", "🥩", "🧹", "🍕", "👶", "🐶", "💪", "🌿", "🎁"];

// ─── Assistente AíCompensa block ──────────────────────────────────────────────

function AssistenteBlock({
  totalItens,
  itensComOferta,
  economia,
}: {
  totalItens: number;
  itensComOferta: number;
  economia: number;
}) {
  if (totalItens === 0) return null;

  return (
    <div
      className="mx-4 mb-4 rounded-2xl overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0f2749 0%, #0a1e3a 100%)", border: "1px solid #1e3a5f" }}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
            Assistente AíCompensa
          </span>
        </div>

        <p className="text-white text-sm font-semibold leading-snug mb-3">
          {itensComOferta === 0
            ? "Ainda não encontrei ofertas para os itens desta lista."
            : itensComOferta === totalItens
              ? `Todos os ${totalItens} itens têm ofertas ativas! 🎉`
              : `${itensComOferta} de ${totalItens} itens têm ofertas ativas esta semana.`
          }
        </p>

        {economia > 0 && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}
          >
            <TrendingDown className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-emerald-300 text-xs font-bold">
              Economia estimada: {R(economia)} comprando nos melhores preços
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── "Sua Próxima Compra" card ────────────────────────────────────────────────

function ProximaCompraCard({
  nome,
  emoji,
  totalItens,
  pendentes,
  economia,
  onClick,
}: {
  nome: string;
  emoji: string;
  totalItens: number;
  pendentes: number;
  economia: number;
  onClick: () => void;
}) {
  const pct = totalItens > 0 ? Math.round(((totalItens - pendentes) / totalItens) * 100) : 0;

  return (
    <div className="mx-4 mb-4">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
        Sua Próxima Compra
      </p>
      <button
        onClick={onClick}
        className="w-full text-left rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
        style={{
          background: "linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)",
          border: "1px solid rgba(16,185,129,0.3)",
          boxShadow: "0 4px 32px rgba(16,185,129,0.12)",
        }}
      >
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{emoji}</span>
              <div>
                <p className="text-white font-black text-base leading-tight">{nome}</p>
                <p className="text-emerald-300 text-xs mt-0.5">
                  {pendentes === 0
                    ? "Tudo pronto! ✓"
                    : `${pendentes} ${pendentes === 1 ? "item pendente" : "itens pendentes"}`
                  }
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-emerald-300 mt-0.5 shrink-0" />
          </div>

          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-emerald-300/70">{pct}% concluído</span>
              <span className="text-[10px] text-emerald-300/70">
                {totalItens - pendentes}/{totalItens}
              </span>
            </div>
            <div className="h-1.5 bg-emerald-900/50 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          {economia > 0 && (
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-emerald-300 text-xs font-bold">
                Economize até {R(economia)} nesta compra
              </span>
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

// ─── Create list modal ────────────────────────────────────────────────────────

function CreateListModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (nome: string, emoji: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [emoji, setEmoji] = useState("🛒");

  function handleCreate() {
    const trimmed = nome.trim();
    if (!trimmed) return;
    onCreate(trimmed, emoji);
    setNome("");
    setEmoji("🛒");
  }

  useEffect(() => {
    if (open) { setNome(""); setEmoji("🛒"); }
  }, [open]);

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
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-white font-black text-lg">Nova Lista</h2>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Ícone</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={cn(
                      "w-10 h-10 text-xl rounded-xl flex items-center justify-center transition-all",
                      emoji === e
                        ? "bg-emerald-500/20 border-2 border-emerald-500 scale-110"
                        : "bg-slate-700/50 border border-slate-600 hover:border-slate-400"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>

              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Nome</p>
              <input
                autoFocus
                type="text"
                placeholder="ex: Compra da Semana"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                className="w-full px-4 h-12 rounded-xl border border-slate-600 bg-slate-700/50 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition mb-5"
              />

              <button
                onClick={handleCreate}
                disabled={!nome.trim()}
                className="w-full h-12 rounded-xl font-black text-sm text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
              >
                Criar Lista
              </button>

              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-5 mb-2">
                Ou use um modelo
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.nome}
                    onClick={() => { setNome(t.nome); setEmoji(t.emoji); }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-600 bg-slate-700/30 text-slate-300 text-xs font-semibold hover:border-emerald-500/50 hover:text-white transition"
                  >
                    <span>{t.emoji}</span>
                    <span>{t.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Listas() {
  const [, setLocation] = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Re-read from localStorage each render (fresh after navigation back)
  const itens = useMemo(() => loadItens(), []);
  const checkedSet = useMemo(() => loadChecked(), []);
  const nome = useMemo(() => getListaNome(), []);
  const emoji = useMemo(() => getListaEmoji(), []);

  const { data: feedPage } = useListOfertas(
    {},
    { query: { queryKey: getListOfertasQueryKey() } }
  );
  const ofertas = feedPage?.items ?? [];

  const { economia, itensComOferta } = useMemo(() => {
    let total = 0;
    let comOferta = 0;
    for (const item of itens) {
      const keyword = item.nome.toLowerCase().trim();
      const precos = ofertas
        .filter((o) => o.produto.toLowerCase().includes(keyword))
        .map((o) => o.preco);
      if (precos.length > 0) {
        comOferta++;
        if (precos.length > 1)
          total += Math.max(...precos) - Math.min(...precos);
      }
    }
    return { economia: total, itensComOferta: comOferta };
  }, [itens, ofertas]);

  // FAB contextual: open create modal
  useEffect(() => {
    const handler = () => setShowCreateModal(true);
    window.addEventListener("aicompensa:fab:nova-lista", handler);
    return () => window.removeEventListener("aicompensa:fab:nova-lista", handler);
  }, []);

  function handleCreateList(novoNome: string, novoEmoji: string) {
    setListaNome(novoNome);
    setListaEmoji(novoEmoji);
    setShowCreateModal(false);
    setLocation("/listas/pessoal");
  }

  const hasItens = itens.length > 0;
  const pendentes = itens.filter((i) => !checkedSet.has(i.id)).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="flex flex-col min-h-full bg-[#0f172a] pb-8"
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-black text-white tracking-tight">Compras</h1>
        <p className="text-slate-400 text-sm mt-0.5">Suas listas de compras</p>
      </div>

      {/* Sua Próxima Compra */}
      {hasItens && (
        <ProximaCompraCard
          nome={nome}
          emoji={emoji}
          totalItens={itens.length}
          pendentes={pendentes}
          economia={economia}
          onClick={() => setLocation("/listas/pessoal")}
        />
      )}

      {/* Assistente AíCompensa */}
      <AssistenteBlock
        totalItens={itens.length}
        itensComOferta={itensComOferta}
        economia={economia}
      />

      <div className="px-4 space-y-3">
        {hasItens ? (
          <>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Suas Listas
            </p>

            {/* Personal list card */}
            <button
              onClick={() => setLocation("/listas/pessoal")}
              className="w-full text-left rounded-2xl p-4 active:scale-[0.98] transition-transform"
              style={{ background: "#1e293b", border: "1px solid #334155" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl">
                    {emoji}
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm leading-tight">{nome}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {itens.length} {itens.length === 1 ? "item" : "itens"} · Pessoal
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </div>
            </button>

            {/* Add new list CTA */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-dashed border-slate-700 text-slate-400 text-sm font-semibold hover:border-emerald-500/40 hover:text-emerald-400 transition-all active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Criar nova lista
            </button>
          </>
        ) : (
          <>
            {/* Empty state */}
            <div className="flex flex-col items-center text-center py-12 px-4">
              <div className="w-20 h-20 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mb-4">
                <ShoppingCart className="h-10 w-10 text-slate-600" />
              </div>
              <h3 className="text-white font-black text-lg mb-1">Nenhuma lista ainda</h3>
              <p className="text-slate-400 text-sm mb-6 max-w-xs leading-relaxed">
                Monte sua lista de compras e encontre os melhores preços da comunidade.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 h-12 px-6 rounded-2xl font-black text-sm text-white active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
              >
                <Plus className="h-5 w-5" />
                Criar primeira lista
              </button>
            </div>

            {/* Templates */}
            <div className="pt-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                Modelos prontos
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.nome}
                    onClick={() => {
                      setListaNome(t.nome);
                      setListaEmoji(t.emoji);
                      setLocation("/listas/pessoal");
                    }}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300 text-xs font-semibold active:scale-95 transition hover:border-emerald-500/40 hover:text-white"
                  >
                    <span className="text-base">{t.emoji}</span>
                    <span>{t.nome}</span>
                    <ArrowRight className="h-3 w-3 opacity-40" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <CreateListModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateList}
      />
    </motion.div>
  );
}
