import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Bell, BellOff, Check, CheckCheck, Filter, ShoppingCart, Store, Tag, Settings } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/current-user";
import { resetNotifCount } from "@/hooks/use-notificacoes-count";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppNotification {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  acaoTipo: string | null;
  acaoId: string | null;
  imagemUrl: string | null;
  lida: boolean;
  criadaEm: string;
  metadata?: Record<string, unknown> | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPO_ICON: Record<string, string> = {
  lista_oferta:       "🛒",
  lista_editada:      "📝",
  item_comprado:      "✅",
  preco_caiu:         "📉",
  nova_oferta:        "🔥",
  mercado:            "🏪",
  sistema:            "🔔",
  promocao:           "🎁",
  resumo:             "📊",
  alerta_preco:       "🔔",
  oferta_confirmada:  "✅",
  validacao_recebida: "👍",
  badge_conquistado:  "🏆",
  ranking_semana:     "🏅",
};

type FilterKey = "todas" | "ofertas" | "lista" | "mercados" | "sistema";

const FILTERS: { key: FilterKey; label: string; icon: typeof ShoppingCart }[] = [
  { key: "todas",    label: "Todas",    icon: Bell       },
  { key: "lista",    label: "Lista",    icon: ShoppingCart },
  { key: "ofertas",  label: "Ofertas",  icon: Tag        },
  { key: "mercados", label: "Mercados", icon: Store      },
  { key: "sistema",  label: "Sistema",  icon: Bell       },
];

const FILTER_TIPOS: Record<FilterKey, string[]> = {
  todas:    [],
  lista:    ["lista_oferta", "lista_editada", "item_comprado"],
  ofertas:  ["preco_caiu", "nova_oferta", "alerta_preco", "oferta_confirmada"],
  mercados: ["mercado"],
  sistema:  ["sistema", "promocao", "resumo", "validacao_recebida", "badge_conquistado", "ranking_semana"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `${d}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function groupByDay(notifs: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const weekAgo   = today - 7 * 86_400_000;

  const buckets: Record<string, AppNotification[]> = {
    "Hoje": [],
    "Ontem": [],
    "Esta semana": [],
    "Anteriores": [],
  };

  for (const n of notifs) {
    const t = new Date(n.criadaEm).getTime();
    if (t >= today)     buckets["Hoje"].push(n);
    else if (t >= yesterday) buckets["Ontem"].push(n);
    else if (t >= weekAgo)   buckets["Esta semana"].push(n);
    else                     buckets["Anteriores"].push(n);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

// ── Notification Row ──────────────────────────────────────────────────────────

function NotifRow({
  notif,
  onRead,
  onNavigate,
  onMute,
}: {
  notif: AppNotification;
  onRead: (id: number) => void;
  onNavigate: (notif: AppNotification) => void;
  onMute: (productName: string) => void;
}) {
  const emoji = TIPO_ICON[notif.tipo] ?? "🔔";
  const productName = typeof notif.metadata?.produto === "string" ? notif.metadata.produto : null;

  const handleRowClick = () => {
    onNavigate(notif);
    onRead(notif.id);
  };

  const handleActionNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(notif);
    onRead(notif.id);
  };

  const handleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (productName) onMute(productName);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onClick={handleRowClick}
      className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer active:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${!notif.lida ? "bg-blue-50/40" : "bg-white"}`}
    >
      {/* Unread indicator */}
      {!notif.lida && (
        <span className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0 self-start" />
      )}

      {/* Icon */}
      <div className={`h-10 w-10 rounded-2xl flex items-center justify-center text-xl shrink-0 ${notif.lida ? "bg-slate-100" : "bg-white border border-slate-200 shadow-sm"}`}>
        {emoji}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] leading-snug ${notif.lida ? "text-slate-600 font-medium" : "text-slate-900 font-bold"}`}>
          {notif.titulo}
        </p>
        {notif.mensagem && (
          <p className="text-[12px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
            {notif.mensagem}
          </p>
        )}
        <p className="text-[11px] text-slate-400 font-semibold mt-1">
          {relativeTime(notif.criadaEm)}
        </p>

        {/* Quick actions */}
        {(notif.acaoTipo || productName) && (
          <div className="flex gap-1.5 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
            {notif.acaoTipo === "oferta" && (
              <button
                onClick={handleActionNavigate}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 active:scale-95 transition-all"
              >
                Ver oferta →
              </button>
            )}
            {notif.acaoTipo === "lista" && (
              <button
                onClick={handleActionNavigate}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 active:scale-95 transition-all"
              >
                Abrir lista →
              </button>
            )}
            {productName && (
              <button
                onClick={handleMute}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 active:scale-95 transition-all"
              >
                🔕 Silenciar
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificacoesPage() {
  const [, setLocation] = useLocation();
  const currentUser = getCurrentUser();

  const [notifs, setNotifs]     = useState<AppNotification[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<FilterKey>("todas");

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await customFetch<{ notificacoes: AppNotification[]; naoLidas: number }>(
        "/api/notificacoes?limit=80",
      );
      setNotifs(data.notificacoes ?? []);
      setNaoLidas(data.naoLidas ?? 0);
    } catch {
      toast.error("Erro ao carregar notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchNotifs(); }, [fetchNotifs]);

  async function markRead(id: number) {
    const notif = notifs.find(n => n.id === id);
    if (!notif || notif.lida) return;
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    setNaoLidas(prev => Math.max(0, prev - 1));
    resetNotifCount();
    await customFetch(`/api/notificacoes/${id}/lida`, { method: "PATCH" }).catch(() => {});
  }

  async function muteProduct(productName: string) {
    await customFetch("/api/notificacoes/mute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName }),
    }).catch(() => {});
    toast.success(`🔕 "${productName}" silenciado. Você não receberá mais push sobre este produto.`);
  }

  async function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })));
    setNaoLidas(0);
    resetNotifCount();
    await customFetch("/api/notificacoes/lidas", { method: "PATCH" }).catch(() => {});
    toast.success("Todas as notificações foram marcadas como lidas.");
  }

  function navigate(notif: AppNotification) {
    // Track click for engagement analytics (fire-and-forget)
    void customFetch(`/api/notificacoes/${notif.id}/click`, { method: "POST" }).catch(() => {});

    if (!notif.acaoTipo || !notif.acaoId) return;
    if (notif.acaoTipo === "lista") setLocation(`/lista/${notif.acaoId}`);
    else if (notif.acaoTipo === "oferta") setLocation(`/?oferta=${notif.acaoId}`);
    else if (notif.acaoTipo === "mercado") setLocation(`/mercados/${notif.acaoId}`);
  }

  // Filter
  const visible = notifs.filter(n => {
    const tipos = FILTER_TIPOS[filter];
    return tipos.length === 0 || tipos.includes(n.tipo);
  });

  const groups = groupByDay(visible);

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
        <BellOff className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-slate-600 font-bold mb-1">Faça login para ver suas notificações</p>
        <Link href="/login" className="mt-3 text-sm text-blue-600 font-semibold underline">Entrar</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div
        className="bg-white border-b border-slate-200 px-4 pb-3 shadow-sm shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => window.history.back()}
            className="h-10 w-10 -ml-2 rounded-full flex items-center justify-center bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-90 transition-all shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-[17px] font-black text-slate-900 leading-none">Notificações</h1>
            {naoLidas > 0 && (
              <p className="text-[11px] text-blue-600 font-semibold leading-none mt-0.5">
                {naoLidas} não {naoLidas === 1 ? "lida" : "lidas"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {naoLidas > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="h-9 flex items-center gap-1.5 px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-[11px] hover:bg-blue-100 active:scale-95 transition-all"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar tudo
              </button>
            )}
            <Link
              href="/preferencias-notificacoes"
              className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 border border-slate-200 active:scale-95 transition-all"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                filter === f.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {f.label}
              {f.key === "todas" && naoLidas > 0 && (
                <span className="h-4 w-4 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center">
                  {naoLidas > 9 ? "9+" : naoLidas}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 px-8 text-center"
          >
            <div className="text-5xl mb-4">🔔</div>
            <p className="text-[17px] font-black text-slate-800 mb-1.5">Nenhuma notificação</p>
            <p className="text-sm text-slate-500 max-w-[260px] leading-relaxed">
              {filter === "todas"
                ? "Quando acontecer algo relevante, você verá aqui."
                : `Nenhuma notificação no filtro "${FILTERS.find(f => f.key === filter)?.label}".`}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {groups.map(g => (
              <div key={g.label}>
                <div className="px-4 pt-4 pb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{g.label}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl mx-4 mb-3 overflow-hidden shadow-sm">
                  {g.items.map(n => (
                    <NotifRow
                      key={n.id}
                      notif={n}
                      onRead={id => void markRead(id)}
                      onNavigate={navigate}
                      onMute={name => void muteProduct(name)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Safe area bottom */}
      <div style={{ height: "max(calc(env(safe-area-inset-bottom, 0px) + 80px), 90px)" }} />
    </div>
  );
}
