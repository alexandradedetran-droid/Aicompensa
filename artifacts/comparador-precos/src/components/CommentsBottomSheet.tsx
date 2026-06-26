/**
 * CommentsBottomSheet — portal-based, completely independent of the offer card DOM.
 *
 * Rendering: createPortal(…, document.body) → no parent stacking/scroll context.
 *
 * Keyboard handling:
 *   - Tracks window.visualViewport (resize + scroll events).
 *   - keyboardHeight = window.innerHeight − vp.height − vp.offsetTop
 *   - Input bar is always position:fixed.
 *     · Keyboard closed → bottom: 0 (safe-area padding inside the bar)
 *     · Keyboard open   → bottom: keyboardHeight + 8px (floats just above keyboard)
 *   - Sheet stays as a bottom sheet at all times; the sheet's scroll area
 *     carries a padding-bottom equal to the input bar height so comments
 *     are never hidden under the input.
 */

import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Flag, Loader2, Send, ChevronDown } from "lucide-react";
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

// ── Quick reactions ────────────────────────────────────────────────────────────

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

// ── Avatars ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500",   "bg-teal-500", "bg-red-500",     "bg-indigo-500",
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

// ── API helper ────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL;
const api  = (path: string) =>
  `${BASE}api/${path}`.replace(/\/+/g, "/").replace(/^\/api/, "/api");
const MAX_TEXT = 120;
const INPUT_BAR_H = 64; // px — used for scroll padding

// ── Body scroll lock ──────────────────────────────────────────────────────────

let _isLocked = false;
let _savedY   = 0;

function lockBody() {
  if (_isLocked) return;
  _isLocked = true;
  _savedY   = window.scrollY;
  Object.assign(document.body.style, {
    overflow: "hidden",
    position: "fixed",
    top:      `-${_savedY}px`,
    left:     "0",
    right:    "0",
  });
}

function unlockBody() {
  if (!_isLocked) return;
  _isLocked = false;
  Object.assign(document.body.style, {
    overflow: "",
    position: "",
    top:      "",
    left:     "",
    right:    "",
  });
  window.scrollTo(0, _savedY);
}

// ── useVisualViewport ─────────────────────────────────────────────────────────

interface VP { height: number; offsetTop: number }

function useVisualViewport(enabled: boolean): VP {
  const [vp, setVp] = useState<VP>(() => ({
    height:    window.visualViewport?.height    ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }));

  useEffect(() => {
    if (!enabled) {
      setVp({ height: window.innerHeight, offsetTop: 0 });
      return;
    }
    const update = () =>
      setVp({
        height:    window.visualViewport?.height    ?? window.innerHeight,
        offsetTop: window.visualViewport?.offsetTop ?? 0,
      });
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return vp;
}

// ── CommentsBottomSheet ────────────────────────────────────────────────────────

export type CommentsBottomSheetProps = {
  ofertaId: number;
  ofertaNome: string;
  open: boolean;
  onClose: () => void;
};

export function CommentsBottomSheet({
  ofertaId,
  ofertaNome,
  open,
  onClose,
}: CommentsBottomSheetProps) {
  const { requireLogin }              = useLoginPrompt();
  const [data, setData]               = useState<CommentsResponse | null>(null);
  const [loading, setLoading]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]               = useState(0);
  const [sort, setSort]               = useState<"recent" | "curtidas">("recent");
  const [text, setText]               = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [quickLoading, setQuickLoading] = useState<string | null>(null);
  const [likingId, setLikingId]       = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Viewport / keyboard ───────────────────────────────────────────────────
  const vp = useVisualViewport(open);
  const windowH = window.innerHeight;

  // keyboardHeight = how much of the screen the keyboard covers.
  // On desktop / no keyboard → 0.
  const keyboardHeight = Math.max(0, windowH - vp.height - vp.offsetTop);

  // Input bar bottom offset: floats just above the keyboard (+ 8 px gap).
  // When keyboard is absent the bar sits at the natural bottom of the sheet.
  const inputBarBottom = keyboardHeight > 40 ? keyboardHeight + 8 : 0;

  // ── Body scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    lockBody();
    return () => unlockBody();
  }, [open]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(
    async (p: number, s: string, reset: boolean) => {
      if (reset) setLoading(true); else setLoadingMore(true);
      try {
        const r = await fetch(
          api(`ofertas/${ofertaId}/comentarios?sort=${s}&page=${p}`),
          { credentials: "include" },
        );
        if (!r.ok) throw new Error();
        const json: CommentsResponse = await r.json();
        setData(prev =>
          !prev || reset
            ? json
            : { ...json, comments: [...prev.comments, ...json.comments] },
        );
      } catch {
        toast.error("Não foi possível carregar comentários.");
      } finally {
        setLoading(false); setLoadingMore(false);
      }
    },
    [ofertaId],
  );

  useEffect(() => {
    if (!open) return;
    setPage(0); setData(null);
    load(0, sort, true);
  }, [open, ofertaId]); // eslint-disable-line

  useEffect(() => {
    if (!open || !data) return;
    setPage(0); load(0, sort, true);
  }, [sort]); // eslint-disable-line

  const loadMore = () => { const n = page + 1; setPage(n); load(n, sort, false); };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitComment = async (tag?: string, texto?: string) => {
    const user = getCurrentUser();
    if (!user) { requireLogin(() => submitComment(tag, texto)); return; }
    setSubmitting(true);
    try {
      const r = await fetch(api(`ofertas/${ofertaId}/comentarios`), {
        method:  "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tag, texto: texto?.trim() || undefined }),
      });
      const json = await r.json();
      if (!r.ok) { toast.error(json.error ?? "Não foi possível publicar. Verifique sua conexão."); return; }
      toast.success("Comentário publicado! +1 ponto 🎉");
      setText(""); setPage(0); load(0, sort, true);
    } catch {
      toast.error("Falha na conexão. Tente novamente.");
    } finally {
      setSubmitting(false); setQuickLoading(null);
    }
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
      const r = await fetch(
        api(`comentarios/${commentId}/curtir`),
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) return;
      const { curtidoPorMim, curtidas } = await r.json();
      setData(prev =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map(c =>
                c.id === commentId ? { ...c, curtidoPorMim, curtidas: curtidas ?? c.curtidas } : c,
              ),
            }
          : null,
      );
    } finally { setLikingId(null); }
  };

  const handleReport = async (cid: number) => {
    const user = getCurrentUser();
    if (!user) { requireLogin(() => handleReport(cid)); return; }
    await fetch(api(`comentarios/${cid}/denunciar`), { method: "POST", credentials: "include" });
    toast.info("Comentário denunciado.");
    setData(prev =>
      prev ? { ...prev, comments: prev.comments.filter(c => c.id !== cid) } : null,
    );
  };

  const handleDelete = async (cid: number) => {
    const r = await fetch(api(`comentarios/${cid}`), { method: "DELETE", credentials: "include" });
    if (r.ok) {
      toast.success("Comentário removido.");
      setData(prev =>
        prev
          ? { ...prev, total: prev.total - 1, comments: prev.comments.filter(c => c.id !== cid) }
          : null,
      );
    }
  };

  // Scroll input into view after the browser finishes opening the keyboard
  const handleInputFocus = () => {
    setTimeout(() => inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
  };

  const me = getCurrentUser();
  const positiveCount   = (data?.tagSummary?.compensa ?? 0) + (data?.tagSummary?.disponivel ?? 0);
  const negativeCount   = (data?.tagSummary?.esgotado ?? 0) + (data?.tagSummary?.acabando ?? 0) + (data?.tagSummary?.subiu ?? 0);
  const totalVotes      = positiveCount + negativeCount;
  const positivePercent = totalVotes >= 3 ? Math.round((positiveCount / totalVotes) * 100) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="cbs-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed", inset: 0,
              zIndex: 9998,
              background: "rgba(0,0,0,0.5)",
            }}
            onClick={onClose}
          />

          {/* ── Bottom sheet ──
              Stays anchored at bottom:0 at all times.
              The scroll area carries a bottom padding equal to INPUT_BAR_H
              so the last comment is never hidden under the floating input.
          ── */}
          <motion.div
            key="cbs-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.8 }}
            style={{
              position:      "fixed",
              bottom:        0,
              left:          0,
              right:         0,
              height:        Math.min(Math.round(windowH * 0.88), 720),
              zIndex:        9999,
              background:    "#fff",
              borderRadius:  "24px 24px 0 0",
              display:       "flex",
              flexDirection: "column",
              boxShadow:     "0 -4px 40px rgba(0,0,0,0.14)",
            }}
          >
            {/* Handle */}
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
                    {loading
                      ? "carregando…"
                      : `${data?.total ?? 0} ${(data?.total ?? 0) === 1 ? "comentário" : "comentários"}`}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 shrink-0 mt-0.5"
                >
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
                  <span>
                    <strong>{positivePercent}%</strong> disseram que ainda compensa
                  </span>
                </div>
              )}
            </div>

            {/* Quick reactions */}
            <div className="px-4 pt-2.5 pb-2.5 shrink-0 border-b border-gray-100">
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {QUICK_REACTIONS.map(r => {
                  const count     = data?.tagSummary[r.tag] ?? 0;
                  const isLoading = quickLoading === r.tag;
                  return (
                    <button
                      key={r.tag}
                      onClick={() => handleQuickReaction(r.tag)}
                      disabled={submitting}
                      className={cn(
                        "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold",
                        "transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap",
                        r.bg, count > 0 ? "ring-1 ring-current ring-offset-1" : "",
                      )}
                    >
                      {isLoading
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <span className="text-sm leading-none">{r.emoji}</span>}
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
                    sort === s
                      ? "text-gray-900 border-gray-900"
                      : "text-gray-400 border-transparent",
                  )}
                >
                  {s === "recent" ? "Mais recentes" : "Mais curtidos"}
                </button>
              ))}
            </div>

            {/* Scrollable list
                padding-bottom reserves room for the floating input bar. */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{
                WebkitOverflowScrolling: "touch" as never,
                paddingBottom: INPUT_BAR_H + 16,
              }}
            >
              {loading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                </div>
              )}
              {!loading && data?.comments.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10">
                  <span className="text-4xl">💬</span>
                  <p className="text-sm text-gray-500 font-semibold mt-1">
                    Seja o primeiro a comentar!
                  </p>
                  <p className="text-xs text-gray-400 text-center px-8">
                    Use uma reação rápida ou escreva algo abaixo.
                  </p>
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
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-gray-400"
                >
                  {loadingMore
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ChevronDown className="h-3.5 w-3.5" />}
                  Carregar mais
                </button>
              )}
            </div>
          </motion.div>

          {/* ── Floating input bar ──
              position:fixed, independent of the sheet's flex layout.
              bottom adjusts dynamically: 0 normally, keyboardHeight+8px when keyboard is open.
              This guarantees the input is ALWAYS just above the keyboard — never at the top.
          ── */}
          <motion.div
            key="cbs-input"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.8, delay: 0.05 }}
            style={{
              position:   "fixed",
              left:       0,
              right:      0,
              bottom:     inputBarBottom,
              zIndex:     10000,
              background: "#fff",
              borderTop:  "1px solid #f3f4f6",
              // Smooth transition when keyboard opens/closes
              transition: "bottom 0.22s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            <div
              className="flex items-center gap-2.5 px-4"
              style={{
                paddingTop:    10,
                paddingBottom: inputBarBottom > 0
                  ? 10
                  : "max(10px, env(safe-area-inset-bottom, 10px))",
              }}
            >
              {/* Avatar */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-black",
                avatarColor(me?.nome ?? "?"),
              )}>
                {avatarInitials(me?.nome ?? "?")}
              </div>

              {/* Input pill */}
              <div
                className="flex-1 flex items-center bg-gray-100 rounded-full px-4 gap-2"
                style={{ minHeight: 40 }}
              >
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleTextSubmit()}
                  onFocus={handleInputFocus}
                  placeholder="Adicionar comentário…"
                  className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 min-w-0 py-2.5"
                  autoComplete="off"
                  enterKeyHint="send"
                />
                {text.length > 80 && (
                  <span className={cn(
                    "text-[10px] font-mono shrink-0",
                    text.length >= MAX_TEXT ? "text-red-400" : "text-gray-400",
                  )}>
                    {MAX_TEXT - text.length}
                  </span>
                )}
              </div>

              {/* Send */}
              <button
                onClick={handleTextSubmit}
                disabled={!text.trim() || submitting}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F2C14E] text-[#130926] disabled:opacity-30 active:scale-95 transition-all shrink-0 shadow-sm"
              >
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(sheet, document.body);
}

// ── CommentItem ───────────────────────────────────────────────────────────────

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
          <span className="text-xs font-bold text-gray-900 truncate">
            {comment.nomeUsuario.split(" ")[0]}
          </span>
          {isMe && (
            <span className="text-[10px] font-bold text-[#B8900E] bg-amber-50 px-1.5 py-0.5 rounded-full leading-none">
              você
            </span>
          )}
          <span className="text-[10px] text-gray-400 ml-auto shrink-0">
            {timeAgo(comment.criadoEm)}
          </span>
        </div>

        {tag && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full mb-1">
            {tag.emoji} {tag.label}
          </span>
        )}

        {comment.texto && (
          <p className="text-sm text-gray-700 leading-snug">{comment.texto}</p>
        )}

        <div className="flex items-center gap-4 mt-1.5">
          <button
            onClick={onLike}
            disabled={isLiking}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-95",
              comment.curtidoPorMim ? "text-red-500" : "text-gray-400 hover:text-red-400",
            )}
          >
            <Heart className={cn(
              "h-3.5 w-3.5 transition-all",
              comment.curtidoPorMim && "fill-current scale-110",
            )} />
            {comment.curtidas > 0 && <span>{comment.curtidas}</span>}
          </button>

          {/* More menu */}
          <div className="relative ml-auto">
            <button
              onClick={() => setShowMenu(p => !p)}
              className="text-gray-300 hover:text-gray-500 text-sm font-bold px-1 leading-none"
            >
              ···
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 bottom-7 z-[10000] bg-white border border-gray-100 shadow-xl rounded-2xl py-1 min-w-[130px]"
                  onClick={e => e.stopPropagation()}
                >
                  {isMe ? (
                    <button
                      onClick={() => { onDelete(); setShowMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center gap-2"
                    >
                      🗑 Excluir
                    </button>
                  ) : (
                    <button
                      onClick={() => { onReport(); setShowMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Flag className="h-3.5 w-3.5" /> Denunciar
                    </button>
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
