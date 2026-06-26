import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellOff, Trash2, Plus, ArrowLeft, ShoppingBag, ChevronRight, Loader2, Smartphone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAlertas,
  useCreateAlerta,
  useDeleteAlerta,
  useGetAlertaMatches,
  getGetAlertasQueryKey,
  getGetAlertaMatchesQueryKey,
} from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";
import { toast } from "@/hooks/use-toast";
import { usePush } from "@/hooks/use-push";

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

// ── Push Permission Banner ────────────────────────────────────────────────────

function PushBanner() {
  const { supported, permission, subscribed, loading, subscribe } = usePush();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem("push-banner-dismissed"));

  if (dismissed || subscribed || permission === "denied" || permission === "unsupported") return null;
  if (!supported && !isIOS()) return null;

  const ios = isIOS();
  const needsInstall = ios && !isStandalone();

  async function handleEnable() {
    if (needsInstall) return; // can't subscribe without standalone on iOS
    const result = await subscribe();
    if (result === "subscribed") {
      toast({ title: "✅ Alertas ativados!", description: "Você receberá notificações quando o preço baixar." });
    } else if (result === "denied") {
      toast({ title: "Permissão negada", description: "Ative nas configurações do navegador.", variant: "destructive" });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mx-4 mb-4 rounded-2xl p-4 border"
      style={{ background: "rgba(139,92,246,0.10)", borderColor: "rgba(139,92,246,0.25)" }}
    >
      {needsInstall ? (
        /* iOS not installed — explain requirement */
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(139,92,246,0.18)", color: "#8B5CF6" }}>
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Notificações no iPhone</p>
            <p className="text-purple-300/80 text-xs mt-1 leading-snug">
              Adicione o AíCompensa à <strong>Tela de Início</strong> pelo Safari para ativar alertas em tempo real.
            </p>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-purple-200/60">
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 font-bold">1</span>
              Toque em <strong>Compartilhar ⬆️</strong>
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 font-bold">2</span>
              <strong>Adicionar à Tela de Início</strong>
            </div>
          </div>
          <button onClick={() => { setDismissed(true); localStorage.setItem("push-banner-dismissed", "1"); }}
            className="shrink-0 text-white/30 hover:text-white/60 transition-colors p-1">
            ✕
          </button>
        </div>
      ) : (
        /* Android / desktop: native permission request */
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(139,92,246,0.18)", color: "#8B5CF6" }}>
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Ativar notificações</p>
            <p className="text-purple-300/70 text-xs mt-0.5">Seja avisado quando o preço baixar.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleEnable}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl font-bold text-xs text-black transition-all active:scale-95 disabled:opacity-60"
              style={{ background: "#F2C14E" }}
            >
              {loading ? "..." : "Ativar"}
            </button>
            <button onClick={() => { setDismissed(true); localStorage.setItem("push-banner-dismissed", "1"); }}
              className="text-white/30 hover:text-white/60 transition-colors p-1 text-sm">
              ✕
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Active subscription status badge ─────────────────────────────────────────

function PushStatusBadge() {
  const { supported, subscribed, loading, unsubscribe } = usePush();
  if (!supported || !subscribed) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: "rgba(242,193,78,0.07)", border: "1px solid rgba(242,193,78,0.15)" }}
    >
      <Bell className="w-3.5 h-3.5 text-[#F2C14E] shrink-0" />
      <p className="text-[#F2C14E]/80/80 text-xs flex-1">Notificações push ativas neste dispositivo</p>
      <button
        onClick={async () => {
          await unsubscribe();
          toast({ title: "Notificações desativadas" });
        }}
        disabled={loading}
        className="flex items-center gap-1 text-[11px] text-white/30 hover:text-red-400 transition-colors"
      >
        <BellOff className="w-3 h-3" />
        Desativar
      </button>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Alertas() {
  const [, setLocation] = useLocation();
  const currentUser = getCurrentUser();
  const qc = useQueryClient();

  const [produto, setProduto] = useState("");
  const [precoAlvo, setPrecoAlvo] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: alertas = [], isLoading: loadingAlertas } = useGetAlertas({
    query: { queryKey: getGetAlertasQueryKey(), enabled: !!currentUser },
  });

  const { data: matches } = useGetAlertaMatches({
    query: { queryKey: getGetAlertaMatchesQueryKey(), enabled: !!currentUser },
  });

  const { mutate: criarAlerta, isPending: criando } = useCreateAlerta();
  const { mutate: deletarAlerta, isPending: deletando } = useDeleteAlerta();

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetAlertasQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAlertaMatchesQueryKey() });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const preco = parseFloat(precoAlvo.replace(",", "."));
    if (!produto.trim() || produto.trim().length < 2) {
      toast({ title: "Produto inválido", description: "Digite pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    if (isNaN(preco) || preco <= 0) {
      toast({ title: "Preço inválido", description: "Digite um preço alvo maior que zero.", variant: "destructive" });
      return;
    }
    criarAlerta(
      { data: { produto: produto.trim(), precoAlvo: preco } },
      {
        onSuccess: () => {
          setProduto("");
          setPrecoAlvo("");
          setShowForm(false);
          invalidate();
          toast({ title: "Alerta criado!", description: `Você será notificado quando ${produto.trim()} estiver abaixo de ${R(preco)}.` });
        },
        onError: () => toast({ title: "Erro", description: "Não foi possível criar o alerta.", variant: "destructive" }),
      }
    );
  }

  function handleDelete(id: number) {
    deletarAlerta(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Alerta removido" });
        },
      }
    );
  }

  // ── Login gate ───────────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="flex flex-col min-h-full bg-[#130926]">
        <div className="px-4 pt-5 pb-4 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-white font-black text-xl">Alertas de Preço</h1>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 py-20 px-8 text-center">
          <Bell className="h-14 w-14 text-slate-700 mb-4" />
          <p className="text-white font-bold text-lg mb-2">Entre para criar alertas</p>
          <p className="text-slate-400 text-sm mb-6">Faça login para ser avisado quando o preço baixar.</p>
          <button
            onClick={() => { sessionStorage.setItem("loginReturnTo", "/alertas"); setLocation("/login"); }}
            className="bg-[#D4A017] hover:bg-[#F2C14E] text-white font-bold px-6 py-3 rounded-2xl transition-colors"
          >
            Entrar na conta
          </button>
          <button
            onClick={() => setLocation("/")}
            className="mt-3 text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  // Group matching offers by alert produto
  type MatchOferta = NonNullable<typeof matches>["ofertas"][number];
  const matchedByAlerta = (matches?.ofertas ?? []).reduce<Record<string, MatchOferta[]>>((acc, o) => {
    const key = o.alertaProduto;
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#130926] pb-4"
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-black text-xl">Alertas de Preço</h1>
          <p className="text-slate-400 text-xs">Avise-me quando o preço baixar</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-[#D4A017] hover:bg-[#F2C14E] text-white font-bold text-xs px-3 py-2 rounded-xl transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo alerta
        </button>
      </div>

      {/* Push notifications banner */}
      <AnimatePresence>
        <PushBanner key="push-banner" />
      </AnimatePresence>

      {/* Active subscription badge */}
      <PushStatusBadge />

      {/* Add alert form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAdd} className="mx-4 mb-4 bg-[#1d0e36] rounded-2xl p-4 border border-[#3a1867] space-y-3">
              <p className="text-[#F2C14E] text-xs font-bold uppercase tracking-widest">Novo alerta</p>
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">Produto</label>
                <input
                  type="text"
                  placeholder="Ex: Arroz, Leite integral, Feijão..."
                  value={produto}
                  onChange={(e) => setProduto(e.target.value)}
                  className="w-full bg-[#130926] text-white placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#D4A017] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-medium">Preço alvo (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 5,99"
                  value={precoAlvo}
                  onChange={(e) => setPrecoAlvo(e.target.value)}
                  className="w-full bg-[#130926] text-white placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#D4A017] transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#3a1867] text-slate-400 text-sm font-medium hover:bg-[#130926] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={criando}
                  className="flex-1 py-2.5 rounded-xl bg-[#D4A017] hover:bg-[#F2C14E] disabled:opacity-60 text-white text-sm font-bold transition-colors"
                >
                  {criando ? "Salvando..." : "Criar alerta"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Matches summary */}
      {(matches?.count ?? 0) > 0 && (
        <div className="mx-4 mb-4 bg-[#D4A017]/40 border border-[#D4A017]/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="h-4 w-4 text-[#F2C14E]" />
            <span className="text-[#F2C14E] font-bold text-sm">
              {matches!.count} {matches!.count === 1 ? "oferta encontrada" : "ofertas encontradas"}!
            </span>
          </div>
          <p className="text-slate-400 text-xs">Esses produtos estão dentro do seu preço alvo agora.</p>
        </div>
      )}

      {/* Alerts list */}
      {loadingAlertas ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-[#F2C14E]" />
        </div>
      ) : alertas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <Bell className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-400 font-semibold mb-1">Nenhum alerta criado</p>
          <p className="text-slate-500 text-sm">
            Crie um alerta e te avisamos quando o preço baixar.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 bg-[#D4A017] hover:bg-[#F2C14E] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            Criar meu primeiro alerta
          </button>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {alertas.map((alerta) => {
            const ofertasMatch = matchedByAlerta[alerta.produto] ?? [];
            const hasMatch = ofertasMatch.length > 0;
            return (
              <motion.div
                key={alerta.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-[#1d0e36] rounded-2xl p-4 border ${hasMatch ? "border-[#F2C14E]/25" : "border-[#3a1867]"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {hasMatch ? (
                      <Bell className="h-4 w-4 text-[#F2C14E] shrink-0" />
                    ) : (
                      <Bell className="h-4 w-4 text-slate-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm truncate">{alerta.produto}</p>
                      <p className="text-slate-400 text-xs">Preço alvo: <span className="text-[#F2C14E] font-bold">{R(alerta.precoAlvo)}</span></p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(alerta.id)}
                    disabled={deletando}
                    aria-label="Remover alerta"
                    className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Matching offers */}
                {hasMatch && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[#F2C14E] text-[11px] font-bold uppercase tracking-wider">
                      ✅ {ofertasMatch.length} {ofertasMatch.length === 1 ? "oferta" : "ofertas"} dentro do alerta
                    </p>
                    {ofertasMatch.slice(0, 3).map((o) => (
                      <Link href="/ofertas" key={o.id}>
                        <div className="flex items-center justify-between bg-[#130926] rounded-xl px-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform">
                          <div className="flex items-center gap-2 min-w-0">
                            <ShoppingBag className="h-3.5 w-3.5 text-[#D4A017] shrink-0" />
                            <div className="min-w-0">
                              <p className="text-white text-xs font-semibold truncate">{o.produto}</p>
                              <p className="text-slate-500 text-[10px] truncate">{o.mercado}{o.bairro ? ` · ${o.bairro}` : ""}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[#F2C14E] font-black text-sm">{R(o.preco)}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {!hasMatch && (
                  <p className="text-slate-600 text-xs mt-2">
                    Nenhuma oferta abaixo de {R(alerta.precoAlvo)} no momento.
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
