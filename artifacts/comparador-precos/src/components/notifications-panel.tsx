import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, ChevronRight, ShoppingBag, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import {
  useGetAlertaMatches,
  useListOfertas,
  getGetAlertaMatchesQueryKey,
  getListOfertasQueryKey,
} from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  const currentUser = getCurrentUser();

  const { data: alertaMatches } = useGetAlertaMatches({
    query: { queryKey: getGetAlertaMatchesQueryKey(), enabled: !!currentUser && open },
  });

  const { data: trendingData } = useListOfertas({ ordenar: "trending", limit: 3 }, {
    query: { queryKey: getListOfertasQueryKey({ ordenar: "trending", limit: 3 }), enabled: open },
  });
  const trending = trendingData?.items ?? [];

  const matches = alertaMatches?.ofertas ?? [];
  const totalMatches = alertaMatches?.count ?? 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, type: "spring", damping: 22 }}
            className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-[61] w-full max-w-sm px-3 sm:bottom-auto sm:top-16 sm:right-4 sm:left-auto sm:translate-x-0 sm:px-0"
          >
            <div
              className="rounded-3xl overflow-hidden border border-[#3a1867]"
              style={{
                background: "linear-gradient(180deg, #1d0e36 0%, #130926 100%)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(58,24,103,0.4)",
              }}
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#3a1867]/60">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-[#F2C14E]" />
                  <span className="text-white font-black text-sm">Notificações</span>
                  {totalMatches > 0 && (
                    <span className="text-[10px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                      {totalMatches}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="h-7 w-7 rounded-full bg-[#130926] border border-[#3a1867] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {totalMatches > 0 ? (
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#D4A017]">
                        💰 Alertas de Preço Ativos
                      </p>
                    </div>
                    <div className="px-3 space-y-1.5 pb-2">
                      {matches.slice(0, 4).map((o) => (
                        <Link href="/alertas" key={o.id} onClick={onClose}>
                          <div className="flex items-center gap-2.5 bg-[#D4A017]/40 border border-[#D4A017]/40 rounded-2xl px-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform">
                            <ShoppingBag className="h-4 w-4 text-[#F2C14E] shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-bold truncate">{o.produto}</p>
                              <p className="text-slate-400 text-[10px] truncate">
                                {o.mercado}{o.bairro ? ` · ${o.bairro}` : ""}
                              </p>
                            </div>
                            <span className="text-[#F2C14E] font-black text-sm whitespace-nowrap">{R(o.preco)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <Link href="/alertas" onClick={onClose}>
                      <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-[#F2C14E] text-xs font-bold hover:text-[#F2C14E]/80 transition-colors border-t border-[#3a1867]/60">
                        Ver todos os alertas
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </Link>
                  </div>
                ) : currentUser ? (
                  <div className="px-4 py-5 text-center">
                    <Bell className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-400 text-xs font-medium">Nenhum alerta disparado ainda.</p>
                    <Link href="/alertas" onClick={onClose}>
                      <span className="inline-block mt-2 text-xs text-[#D4A017] font-bold hover:text-[#F2C14E]">
                        Criar alertas de preço →
                      </span>
                    </Link>
                  </div>
                ) : (
                  <div className="px-4 py-5 text-center">
                    <Bell className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-400 text-xs font-medium">Faça login para receber notificações.</p>
                  </div>
                )}

                {(trending?.length ?? 0) > 0 && (
                  <div className="border-t border-[#3a1867]/60">
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                        🔥 Bombando agora
                      </p>
                    </div>
                    <div className="px-3 space-y-1.5 pb-3">
                      {(trending ?? []).slice(0, 2).map((o) => (
                        <Link href="/ofertas" key={o.id} onClick={onClose}>
                          <div className="flex items-center gap-2.5 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform">
                            <TrendingUp className="h-4 w-4 text-orange-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-bold truncate">{o.produto}</p>
                              <p className="text-slate-400 text-[10px] truncate">{o.mercado}</p>
                            </div>
                            <span className="text-orange-400 font-black text-sm whitespace-nowrap">{R(o.preco)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
