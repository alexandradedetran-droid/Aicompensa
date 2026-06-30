import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Flag, Loader2, Send, ChevronDown, LogIn } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Comment = {
  id: number;
  tag: string | null;
  texto: string | null;
  curtidas: number;
  criadoEm: string;
  usuarioId: number;
  nomeUsuario: string;
  pontos: number;
  curtidoPorMim: boolean;
};

type CommentsResponse = {
  total: number;
  hasMore: boolean;
  tagSummary: Record<string, number>;
  comments: Comment[];
};

const QUICK_REACTIONS = [
  { emoji: "🔥", label: "Vale muito",    tag: "compensa",   bg: "bg-orange-50 border-orange-200 text-orange-600" },
  { emoji: "🛒", label: "Comprei",       tag: "disponivel", bg: "bg-green-50 border-green-200 text-green-600" },
  { emoji: "📈", label: "Aumentou",      tag: "subiu",      bg: "bg-red-50 border-red-200 text-red-600" },
  { emoji: "❌", label: "Não achei",     tag: "esgotado",   bg: "bg-gray-100 border-gray-200 text-gray-600" },
  { emoji: "⚠️", label: "Estoque baixo", tag: "acabando",   bg: "bg-amber-50 border-amber-200 text-amber-600" },
] as const;

const TAG_LABELS: Record<string, { emoji: string; label: string }> = {
  compensa:   { emoji: "🔥", label: "Vale muito" },
  disponivel: { emoji: "🛒", label: "Comprei" },
  subiu:      { emoji: "📈", label: "Aumentou" },
  esgotado:   { emoji: "❌", label: "Não achei" },
  acabando:   { emoji: "⚠️", label: "Estoque baixo" },
  fila:       { emoji: "🛒", label: "Fila grande" },
};

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
];

function avatarColor(nome: string): string {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}
function avatarInitials(nome: string): string {
  return nome.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function timeAgo(iso: string): string {
  return formatDistanceToNow(new Date(iso), { locale: ptBR, addSuffix: true });
}

const BASE = import.meta.env.BASE_URL;
const api = (path: string) =>
  `${BASE}api/${path}`.replace(/\/+/g, "/").replace(/^\/api/, "/api");
const MAX_TEXT = 120;

// ── Body scroll lock (iOS Safari) ─────────────────────────────────────────────
// _isLocked guards against spurious unlocks: with N cards on screen each
// mounting a CommentsDrawer(open=false), calling unlock on every mount would
// reset window.scrollY to 0 and break the page layout.
let _isLocked = false;
let _savedY   = 0;

function lockBodyScroll() {
  if (_isLocked) return;
  _isLocked = true;
  _savedY   = window.scrollY;
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top      = `-${_savedY}px`;
  document.body.style.left     = "0";
  document.body.style.right    = "0";
}
function unlockBodyScroll() {
  if (!_isLocked) return; // never actually locked — do nothing
  _isLocked                = false;
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top      = "";
  document.body.style.left     = "";
  document.body.style.right    = "";
  window.scrollTo(0, _savedY);
}

// ── Viewport updater — sets TWO CSS variables synchronously ───────────────────
//
// --keyboard-offset  : how many px the keyboard is taking (0 when closed)
// --visual-vh        : current visible viewport height in px
//
// WHY TWO VARS:
//   The sheet needs BOTH to stay above the keyboard:
//   • bottom: var(--keyboard-offset)  → lifts the sheet above the keyboard
//   • height: calc(var(--visual-vh) * 0.85)  → shrinks so it doesn't go off-screen
//
// Without --keyboard-offset the sheet was height-correct but still sitting
// BEHIND the keyboard (anchored at bottom:0 of layout viewport).
//
function applyViewportVars() {
  const vv        = window.visualViewport;
  const vvHeight  = vv?.height  ?? window.innerHeight;
  const vvOffsetY = vv?.offsetTop ?? 0;
  const kbOffset  = Math.max(0, window.innerHeight - vvOffsetY - vvHeight);

  document.documentElement.style.setProperty("--visual-vh",       `${vvHeight}px`);
  document.documentElement.style.setProperty("--keyboard-offset", `${kbOffset}px`);
}

// ── CommentsDrawer ─────────────────────────────────────────────────────────────

type Props = {
  ofertaId: number;
  ofertaNome: string;
  open: boolean;
  onClose: () => void;
};

export function CommentsDrawer({ ofertaId, ofertaNome, open, onClose }: Props) {
  const { requireLogin }                  = useLoginPrompt();
  const [me, setMe]                       = useState(() => getCurrentUser());
  const [data, setData]                   = useState<CommentsResponse | null>(null);
  const [loading, setLoading]             = useState(false);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [page, setPage]                   = useState(0);
  const [sort, setSort]                   = useState<"recent" | "curtidas">("recent");
  const [text, setText]                   = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [quickLoading, setQuickLoading]   = useState<string | null>(null);
  const [likingId, setLikingId]           = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Viewport vars — fire on every keyboard resize ──────────────────────────
  useEffect(() => {
    if (!open) {
      document.documentElement.style.removeProperty("--visual-vh");
      document.documentElement.style.removeProperty("--keyboard-offset");
      return;
    }

    applyViewportVars(); // immediate call on open

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", applyViewportVars);
      vv.addEventListener("scroll", applyViewportVars);
    }
    window.addEventListener("resize", applyViewportVars);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", applyViewportVars);
        vv.removeEventListener("scroll", applyViewportVars);
      }
      window.removeEventListener("resize", applyViewportVars);
      document.documentElement.style.removeProperty("--visual-vh");
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, [open]);

  // ── Body scroll lock ───────────────────────────────────────────────────────
  useEffect(() => {
    if (open) lockBodyScroll();
    else unlockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const load = useCallback(async (p: number, s: string, reset: boolean) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const r = await fetch(api(`ofertas/${ofertaId}/comentarios?sort=${s}&page=${p}`), {
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      const json: CommentsResponse = await r.json();
      setData(prev => (!prev || reset) ? json : { ...json, comments: [...prev.comments, ...json.comments] });
    } catch {
      toast.error("Não foi possível carregar comentários.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [ofertaId]);

  useEffect(() => {
    if (!open) return;
    setMe(getCurrentUser()); // re-read on every open in case login happened after mount
    setPage(0); setData(null);
    load(0, sort, true);
  }, [open, ofertaId]); // eslint-disable-line

  useEffect(() => {
    if (!open || !data) return;
    setPage(0);
    load(0, sort, true);
  }, [sort]); // eslint-disable-line

  const loadMore = () => { const n = page + 1; setPage(n); load(n, sort, false); };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submitComment = async (tag?: string, texto?: string) => {
    const user = getCurrentUser();
    if (!user) { requireLogin(() => submitComment(tag, texto)); return; }
    setSubmitting(true);
    try {
      const r = await fetch(api(`ofertas/${ofertaId}/comentarios`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, texto: texto?.trim() || undefined }),
      });
      const json = await r.json();
      if (!r.ok) { toast.error(json.error ?? "Não foi possível publicar. Verifique sua conexão."); return; }
      toast.success("Comentário publicado! +1 ponto 🎉");
      setText(""); setPage(0); load(0, sort, true);
    } catch { toast.error("Falha na conexão. Tente novamente."); }
    finally { setSubmitting(false); setQuickLoading(null); }
  };

  const handleQuickReaction = (tag: string) => {
    const user = getCurrentUser();
    if (!user) { requireLogin(() => handleQuickReaction(tag)); return; }
    setQuickLoading(tag); submitComment(tag);
  };
  const handleTextSubmit = () => { if (!text.trim()) return; submitComment(undefined, text); };

  const handleLike = async (commentId: number) => {
    const user = getCurrentUser();
    if (!user) { requireLogin(() => handleLike(commentId)); return; }
    setLikingId(commentId);
    try {
      const r = await fetch(api(`comentarios/${commentId}/curtir`), { method: "POST", credentials: "include" });
      if (!r.ok) return;
      const { curtidoPorMim, curtidas } = await r.json();
      setData(prev => prev ? {
        ...prev,
        comments: prev.comments.map(c => c.id === commentId ? { ...c, curtidoPorMim, curtidas: curtidas ?? c.curtidas } : c),
      } : null);
    } finally { setLikingId(null); }
  };

  const handleReport = async (commentId: number) => {
    const user = getCurrentUser();
    if (!user) { requireLogin(() => handleReport(commentId)); return; }
    await fetch(api(`comentarios/${commentId}/denunciar`), { method: "POST", credentials: "include" });
    toast.info("Comentário denunciado.");
    setData(prev => prev ? { ...prev, comments: prev.comments.filter(c => c.id !== commentId) } : null);
  };

  const handleDelete = async (commentId: number) => {
    const r = await fetch(api(`comentarios/${commentId}`), { method: "DELETE", credentials: "include" });
    if (r.ok) {
      toast.success("Comentário removido.");
      setData(prev => prev ? { ...prev, total: prev.total - 1, comments: prev.comments.filter(c => c.id !== commentId) } : null);
    }
  };

  // When input gains focus, scroll it into view after a short delay so the
  // browser has time to open the keyboard and reposition the sheet first.
  const handleInputFocus = () => {
    setTimeout(() => inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 150);
  };

  const positiveCount   = (data?.tagSummary?.compensa ?? 0) + (data?.tagSummary?.disponivel ?? 0);
  const negativeCount   = (data?.tagSummary?.esgotado ?? 0) + (data?.tagSummary?.acabando ?? 0) + (data?.tagSummary?.subiu ?? 0);
  const totalVotes      = positiveCount + negativeCount;
  const positivePercent = totalVotes >= 3 ? Math.round((positiveCount / totalVotes) * 100) : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/45 z-[9990]"
            onClick={onClose}
          />

          {/*
            BOTTOM SHEET
            ═══════════════════════════════════════════════════════════════════
            Two CSS variables drive the layout:

            --keyboard-offset  (px) — keyboard height, 0 when closed
            --visual-vh        (px) — real visible viewport height

            bottom: var(--keyboard-offset)
              → lifts the sheet ABOVE the keyboard instead of sitting behind it.
              → transitions smoothly as keyboard opens/closes.

            height: calc(var(--visual-vh, 100svh) * 0.85)
              → shrinks the sheet so it fits in the visible area above keyboard.
              → prevents the top of the sheet from going off screen.

            The framer-motion enter/exit uses transform:translateY (Y prop),
            which is independent of bottom/height CSS properties — no conflict.
            ═══════════════════════════════════════════════════════════════════
          */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.8 }}
            className="fixed left-0 right-0 z-[9991] bg-white rounded-t-3xl flex flex-col"
            style={{
              bottom: "var(--keyboard-offset, 0px)",
              height: "calc(var(--visual-vh, 100svh) * 0.85)",
              maxHeight: "calc(var(--visual-vh, 100svh) * 0.85)",
              boxShadow: "0 -4px 40px rgba(0,0,0,0.14)",
              willChange: "transform",
              // CSS transitions for keyboard open/close (NOT framer-motion transitions)
              transition: "bottom 0.22s cubic-bezier(0.32,0.72,0,1), height 0.22s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1.5 shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 pb-3 shrink-0 border-b border-gray-100">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Comentários</p>
                  <h2 className="font-bold text-gray-900 text-sm leading-tight truncate">{ofertaNome}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {loading ? "carregando…" : `${data?.total ?? 0} ${(data?.total ?? 0) === 1 ? "comentário" : "comentários"}`}
                  </p>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 shrink-0 mt-0.5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {positivePercent !== null && (
                <div className={cn(
                  "mt-2.5 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold",
                  positivePercent >= 60
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                    : "bg-amber-50 text-amber-700 border border-amber-100",
                )}>
                  <span>{positivePercent >= 60 ? "👍" : "⚠️"}</span>
                  <span><strong>{positivePercent}%</strong> disseram que ainda compensa</span>
                </div>
              )}
            </div>

            {/* Quick reactions */}
            <div className="px-4 pt-3 pb-3 shrink-0 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reação rápida</p>
                {!me && (
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                    <LogIn className="h-3 w-3" /> login necessário
                  </span>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                {QUICK_REACTIONS.map(r => {
                  const count = data?.tagSummary[r.tag] ?? 0;
                  const isLoading = quickLoading === r.tag;
                  return (
                    <button
                      key={r.tag}
                      onClick={() => handleQuickReaction(r.tag)}
                      disabled={submitting}
                      className={cn(
                        "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-bold",
                        "transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap",
                        !me ? "bg-gray-50 border-gray-200 text-gray-400 opacity-70" : r.bg,
                        !me ? "" : count > 0 ? "ring-1 ring-current ring-offset-1" : "",
                      )}
                    >
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-sm leading-none">{r.emoji}</span>}
                      {r.label}
                      {count > 0 && <span className="font-black opacity-60">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sort tabs */}
            <div className="flex gap-5 px-4 border-b border-gray-100 shrink-0">
              {(["recent", "curtidas"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={cn(
                    "pb-2.5 pt-2 text-xs font-bold border-b-2 transition-colors",
                    sort === s ? "text-gray-900 border-gray-900" : "text-gray-400 border-transparent",
                  )}
                >
                  {s === "recent" ? "Mais recentes" : "Mais curtidos"}
                </button>
              ))}
            </div>

            {/* Scroll area — flex-1, independent scroll */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" as never }}
            >
              {/* Comment list — padding-bottom reserves space for sticky input */}
              <div style={{ paddingBottom: 90 }}>
                {loading && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                  </div>
                )}
                {!loading && data?.comments.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-14">
                    <span className="text-5xl">💬</span>
                    <p className="text-sm text-gray-500 font-semibold mt-1">Seja o primeiro a comentar!</p>
                    <p className="text-xs text-gray-400 text-center px-8">Use uma reação rápida acima ou escreva algo abaixo.</p>
                  </div>
                )}
                <div className="px-4 py-3 space-y-4">
                  {data?.comments.map(c => (
                    <CommentItem
                      key={c.id} comment={c} meId={me?.id}
                      onLike={() => handleLike(c.id)}
                      onReport={() => handleReport(c.id)}
                      onDelete={() => handleDelete(c.id)}
                      isLiking={likingId === c.id}
                    />
                  ))}
                </div>
                {data?.hasMore && (
                  <button
                    onClick={loadMore} disabled={loadingMore}
                    className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-gray-400"
                  >
                    {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Carregar mais
                  </button>
                )}
              </div>

              {/*
                INPUT BAR — position:sticky inside the scroll container.
                Stays at the bottom of the visible scroll area.
                The sheet itself is already lifted above the keyboard via
                --keyboard-offset, so this bar is naturally above the keyboard.
              */}
              {/* ── Input bar — adapts for guest vs logged-in user ── */}
              {!me ? (
                /* GUEST: tappable row that opens login prompt */
                <button
                  onClick={() => requireLogin(() => {})}
                  className="flex items-center gap-2.5 px-4 border-t border-gray-100 bg-white w-full text-left active:bg-gray-50 transition-colors"
                  style={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 20,
                    paddingTop: 12,
                    paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                    <LogIn className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="flex-1 flex items-center bg-gray-100 rounded-full px-4 py-2.5">
                    <span className="text-sm text-gray-400 select-none">Faça login para comentar…</span>
                  </div>
                  <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 shrink-0">
                    <Send className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              ) : (
                /* LOGGED IN: full interactive input */
                <div
                  className="flex items-center gap-2.5 px-4 border-t border-gray-100 bg-white"
                  style={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 20,
                    paddingTop: 12,
                    paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
                  }}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-black",
                    avatarColor(me.nome),
                  )}>
                    {avatarInitials(me.nome)}
                  </div>

                  <div className="flex-1 flex items-center bg-gray-100 rounded-full px-4 py-2.5 gap-2">
                    <input
                      ref={inputRef}
                      value={text}
                      onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleTextSubmit()}
                      onFocus={handleInputFocus}
                      placeholder="Adicionar comentário…"
                      className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 min-w-0"
                    />
                    {text.length > 80 && (
                      <span className={cn("text-[10px] font-mono shrink-0", text.length >= MAX_TEXT ? "text-red-400" : "text-gray-400")}>
                        {MAX_TEXT - text.length}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleTextSubmit}
                    disabled={!text.trim() || submitting}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F2C14E] text-[#130926] disabled:opacity-30 active:scale-95 transition-all shrink-0 shadow-sm shadow-[#F2C14E]/20"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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

// ── CommentItem ────────────────────────────────────────────────────────────────

type CommentItemProps = {
  comment: Comment;
  meId?: number;
  onLike: () => void;
  onReport: () => void;
  onDelete: () => void;
  isLiking: boolean;
};

function CommentItem({ comment, meId, onLike, onReport, onDelete, isLiking }: CommentItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const tag  = comment.tag ? TAG_LABELS[comment.tag] : null;
  const isMe = meId === comment.usuarioId;

  return (
    <div className="flex gap-3">
      <div className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black mt-0.5",
        avatarColor(comment.nomeUsuario),
      )}>
        {avatarInitials(comment.nomeUsuario)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-bold text-gray-900 truncate">{comment.nomeUsuario.split(" ")[0]}</span>
          {isMe && (
            <span className="text-[10px] font-bold text-[#B8900E] bg-amber-50 px-1.5 py-0.5 rounded-full leading-none">você</span>
          )}
          <span className="text-[10px] text-gray-400 ml-auto shrink-0">{timeAgo(comment.criadoEm)}</span>
        </div>

        {tag && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full mb-1">
            {tag.emoji} {tag.label}
          </span>
        )}

        {comment.texto && <p className="text-sm text-gray-700 leading-snug">{comment.texto}</p>}

        <div className="flex items-center gap-4 mt-1.5">
          <button
            onClick={onLike} disabled={isLiking}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-95",
              comment.curtidoPorMim ? "text-red-500" : "text-gray-400 hover:text-red-400",
            )}
          >
            <Heart className={cn("h-3.5 w-3.5 transition-all", comment.curtidoPorMim && "fill-current scale-110")} />
            {comment.curtidas > 0 && <span>{comment.curtidas}</span>}
          </button>

          <div className="relative ml-auto">
            <button
              onClick={() => setShowMenu(p => !p)}
              className="text-gray-300 hover:text-gray-500 text-sm font-bold px-1 leading-none"
            >···</button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 bottom-7 z-20 bg-white border border-gray-100 shadow-xl rounded-2xl py-1 min-w-[130px]"
                  onClick={e => e.stopPropagation()}
                >
                  {isMe ? (
                    <button
                      onClick={() => { onDelete(); setShowMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center gap-2"
                    >🗑 Excluir</button>
                  ) : (
                    <button
                      onClick={() => { onReport(); setShowMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                    ><Flag className="h-3.5 w-3.5" /> Denunciar</button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
