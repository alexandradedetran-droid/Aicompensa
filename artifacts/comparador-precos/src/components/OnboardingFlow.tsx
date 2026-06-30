import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Check, Bell, ShoppingCart, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { customFetch } from "@workspace/api-client-react";
import { usePush } from "@/hooks/use-push";
import { useLocation } from "wouter";

const STORAGE_KEY = "aicompensa:onboarding:done";

const MERCADOS = ["Assaí", "Comper", "Fort Atacadista", "Atacadão", "Outros"];
const CATEGORIAS = [
  { id: "Grãos",      emoji: "🌾", desc: "Arroz, feijão, milho" },
  { id: "Laticínios", emoji: "🥛", desc: "Leite, queijo, iogurte" },
  { id: "Carnes",     emoji: "🍗", desc: "Frango, carne, peixe" },
  { id: "Limpeza",    emoji: "🧼", desc: "Detergente, sabão" },
  { id: "Bebidas",    emoji: "🥤", desc: "Sucos, água, refri" },
];
const QUICK_ITEMS = ["Arroz", "Feijão", "Leite", "Café", "Açúcar"];

// ── Onboarding component ──────────────────────────────────────────────────────

export function OnboardingFlow() {
  const currentUser = getCurrentUser();
  const [, setLocation] = useLocation();

  const [visible, setVisible]       = useState(false);
  const [step, setStep]             = useState(0);
  const [mercados, setMercados]     = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [itens, setItens]           = useState<string[]>([...QUICK_ITEMS]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<{ economiaTotal: number; melhorMercado: string | null } | null>(null);
  const [done, setDone]             = useState(false);

  const { subscribe, subscribed } = usePush();

  useEffect(() => {
    if (!currentUser) return undefined;
    const isDone = localStorage.getItem(STORAGE_KEY) === "true";
    if (!isDone) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [currentUser]);

  if (!visible || !currentUser) return null;

  function toggleMercado(m: string) {
    setMercados(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  function toggleCategoria(c: string) {
    setCategorias(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  function toggleItem(item: string) {
    setItens(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  }

  async function handleFinish() {
    setSubmitting(true);
    try {
      customFetch("/api/growth/event", {
        method: "POST",
        body: JSON.stringify({ tipo: "onboarding_started" }),
      }).catch(() => {});

      const r = await customFetch("/api/growth/onboarding", {
        method: "POST",
        body: JSON.stringify({ mercados, categorias, itens }),
      });
      const data = await (r as Response).json();
      setResult({ economiaTotal: data.economiaTotal ?? 0, melhorMercado: data.melhorMercado ?? null });
    } catch {
      setResult({ economiaTotal: 0, melhorMercado: null });
    } finally {
      setSubmitting(false);
      setStep(5);
    }
  }

  function handleClose() {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
    setDone(true);
  }

  function handleViewAnalise() {
    handleClose();
    setLocation("/lista/analise");
  }

  const TOTAL_STEPS = 5;
  const progress = ((step) / TOTAL_STEPS) * 100;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(11,16,35,0.85)", backdropFilter: "blur(6px)" }}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
        style={{ maxHeight: "92vh" }}
      >
        {/* Progress bar */}
        {step < 5 && (
          <div className="h-1 w-full bg-slate-100">
            <motion.div
              className="h-full bg-[#F2C14E]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}

        <div className="overflow-y-auto" style={{ maxHeight: "calc(92vh - 4px)" }}>
          <AnimatePresence mode="wait">
            {/* ── STEP 0: Welcome ── */}
            {step === 0 && (
              <Step key="0">
                <div className="flex flex-col items-center text-center pt-10 pb-6 px-6">
                  <div className="text-6xl mb-6">🛒</div>
                  <h1 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
                    Bem-vindo ao AíCompensa
                  </h1>
                  <p className="text-slate-500 text-sm leading-relaxed mb-8">
                    Descubra onde realmente vale a pena comprar e economize todos os dias.
                  </p>
                  <button
                    onClick={() => setStep(1)}
                    className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg,#F2C14E,#E0A800)", color: "#0B1023" }}
                  >
                    Começar <ChevronRight className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleClose}
                    className="mt-3 text-xs text-slate-400 underline underline-offset-2"
                  >
                    Pular
                  </button>
                </div>
              </Step>
            )}

            {/* ── STEP 1: Markets ── */}
            {step === 1 && (
              <Step key="1">
                <div className="px-6 pt-7 pb-6">
                  <StepHeader step={1} total={TOTAL_STEPS} />
                  <h2 className="text-lg font-black text-slate-900 mb-1">Seus mercados favoritos</h2>
                  <p className="text-sm text-slate-500 mb-5">
                    Vamos priorizar ofertas nesses mercados para você.
                  </p>
                  <div className="space-y-2 mb-6">
                    {MERCADOS.map(m => (
                      <button
                        key={m}
                        onClick={() => toggleMercado(m)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.98]"
                        style={{
                          borderColor: mercados.includes(m) ? "#F2C14E" : "#E5E7EB",
                          background:  mercados.includes(m) ? "rgba(242,193,78,0.08)" : "white",
                        }}
                      >
                        <span
                          className="h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
                          style={{
                            borderColor: mercados.includes(m) ? "#F2C14E" : "#CBD5E1",
                            background:  mercados.includes(m) ? "#F2C14E" : "white",
                          }}
                        >
                          {mercados.includes(m) && <Check className="h-3 w-3 text-[#0B1023]" />}
                        </span>
                        <span className="font-semibold text-sm text-slate-800">{m}</span>
                      </button>
                    ))}
                  </div>
                  <NavButtons
                    onBack={() => setStep(0)}
                    onNext={() => setStep(2)}
                    nextLabel={mercados.length > 0 ? `Continuar (${mercados.length} escolhidos)` : "Pular"}
                  />
                </div>
              </Step>
            )}

            {/* ── STEP 2: Categories ── */}
            {step === 2 && (
              <Step key="2">
                <div className="px-6 pt-7 pb-6">
                  <StepHeader step={2} total={TOTAL_STEPS} />
                  <h2 className="text-lg font-black text-slate-900 mb-1">O que você compra mais?</h2>
                  <p className="text-sm text-slate-500 mb-5">
                    Personalizamos os alertas com base nas suas categorias preferidas.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 mb-6">
                    {CATEGORIAS.map(c => (
                      <button
                        key={c.id}
                        onClick={() => toggleCategoria(c.id)}
                        className="flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl border-2 transition-all active:scale-95"
                        style={{
                          borderColor: categorias.includes(c.id) ? "#F2C14E" : "#E5E7EB",
                          background:  categorias.includes(c.id) ? "rgba(242,193,78,0.08)" : "white",
                        }}
                      >
                        <span className="text-2xl">{c.emoji}</span>
                        <span className="text-xs font-black text-slate-800">{c.id}</span>
                        <span className="text-[10px] text-slate-400 text-center leading-tight">{c.desc}</span>
                      </button>
                    ))}
                  </div>
                  <NavButtons
                    onBack={() => setStep(1)}
                    onNext={() => setStep(3)}
                    nextLabel={categorias.length > 0 ? `Continuar (${categorias.length} selecionadas)` : "Pular"}
                  />
                </div>
              </Step>
            )}

            {/* ── STEP 3: Notifications ── */}
            {step === 3 && (
              <Step key="3">
                <div className="px-6 pt-7 pb-6">
                  <StepHeader step={3} total={TOTAL_STEPS} />
                  <div className="flex flex-col items-center text-center mb-6">
                    <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4 border border-amber-100">
                      <Bell className="h-8 w-8 text-[#F2C14E]" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 mb-2">Ative as notificações</h2>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Receba alertas somente quando realmente valer a pena comprar — sem spam, só economia real.
                    </p>
                  </div>
                  {!subscribed ? (
                    <button
                      onClick={async () => { await subscribe(); setStep(4); }}
                      className="w-full py-4 rounded-2xl font-black text-base mb-3 transition-all active:scale-95 flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg,#F2C14E,#E0A800)", color: "#0B1023" }}
                    >
                      <Bell className="h-5 w-5" /> Ativar notificações
                    </button>
                  ) : (
                    <div className="w-full py-4 rounded-2xl text-center text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 mb-3">
                      ✅ Notificações já ativas!
                    </div>
                  )}
                  <NavButtons
                    onBack={() => setStep(2)}
                    onNext={() => setStep(4)}
                    nextLabel="Pular por agora"
                    nextVariant="ghost"
                  />
                </div>
              </Step>
            )}

            {/* ── STEP 4: First list ── */}
            {step === 4 && (
              <Step key="4">
                <div className="px-6 pt-7 pb-6">
                  <StepHeader step={4} total={TOTAL_STEPS} />
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                      <ShoppingCart className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 leading-tight">Sua primeira lista</h2>
                      <p className="text-xs text-slate-400">Selecione itens para começar</p>
                    </div>
                  </div>
                  <div className="space-y-2 mb-6">
                    {QUICK_ITEMS.map(item => (
                      <button
                        key={item}
                        onClick={() => toggleItem(item)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.98]"
                        style={{
                          borderColor: itens.includes(item) ? "#F2C14E" : "#E5E7EB",
                          background:  itens.includes(item) ? "rgba(242,193,78,0.08)" : "white",
                        }}
                      >
                        <span
                          className="h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0"
                          style={{
                            borderColor: itens.includes(item) ? "#F2C14E" : "#CBD5E1",
                            background:  itens.includes(item) ? "#F2C14E" : "white",
                          }}
                        >
                          {itens.includes(item) && <Check className="h-3 w-3 text-[#0B1023]" />}
                        </span>
                        <span className="font-semibold text-sm text-slate-800">{item}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleFinish}
                    disabled={submitting}
                    className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#F2C14E,#E0A800)", color: "#0B1023" }}
                  >
                    {submitting ? (
                      <>
                        <div className="h-5 w-5 border-2 border-[#0B1023] border-t-transparent rounded-full animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>Finalizar <Sparkles className="h-4 w-4" /></>
                    )}
                  </button>
                  <NavButtons
                    onBack={() => setStep(3)}
                    hideNext
                  />
                </div>
              </Step>
            )}

            {/* ── STEP 5: First Win ── */}
            {step === 5 && result !== null && (
              <Step key="5">
                <div className="flex flex-col items-center text-center px-6 pt-10 pb-8">
                  {result.economiaTotal > 0 ? (
                    <>
                      <div className="text-6xl mb-4">🎉</div>
                      <p className="text-sm font-semibold text-emerald-600 mb-1">Você pode economizar</p>
                      <p className="text-4xl font-black text-slate-900 mb-1">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(result.economiaTotal)}
                      </p>
                      {result.melhorMercado && (
                        <p className="text-sm text-slate-500 mb-6">comprando no <strong>{result.melhorMercado}</strong></p>
                      )}
                      <button
                        onClick={handleViewAnalise}
                        className="w-full py-4 rounded-2xl font-black text-base mb-3 transition-all active:scale-95"
                        style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "white" }}
                      >
                        Ver análise completa
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-5xl mb-4">📡</div>
                      <h2 className="text-xl font-black text-slate-900 mb-2">Estamos monitorando preços para você</h2>
                      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                        Assim que encontrarmos ofertas nos seus mercados, você será o primeiro a saber.
                      </p>
                    </>
                  )}
                  <button
                    onClick={handleClose}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Explorar o app
                  </button>
                </div>
              </Step>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function StepHeader({ step, total }: { step: number; total: number }) {
  return (
    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
      Passo {step} de {total}
    </p>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = "Continuar",
  nextVariant = "primary",
  hideNext = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextVariant?: "primary" | "ghost";
  hideNext?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mt-2">
      {onBack && (
        <button
          onClick={onBack}
          className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors border border-slate-200"
        >
          Voltar
        </button>
      )}
      {!hideNext && onNext && (
        <button
          onClick={onNext}
          className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
          style={
            nextVariant === "primary"
              ? { background: "linear-gradient(135deg,#F2C14E,#E0A800)", color: "#0B1023" }
              : { background: "transparent", color: "#94A3B8" }
          }
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}
