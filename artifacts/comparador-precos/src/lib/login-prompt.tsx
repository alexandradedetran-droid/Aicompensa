import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogIn, UserPlus, Store } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";

// ── Context ──────────────────────────────────────────────────────────────────

interface LoginPromptContextValue {
  requireLogin: (action: () => void) => void;
  openPrompt: (returnTo?: string) => void;
}

const LoginPromptContext = createContext<LoginPromptContextValue>({
  requireLogin: (action) => action(),
  openPrompt: () => {},
});

export function useLoginPrompt() {
  return useContext(LoginPromptContext);
}

// ── Provider + floating modal ─────────────────────────────────────────────────

export function LoginPromptProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();

  const openPrompt = useCallback((returnTo?: string) => {
    if (returnTo) sessionStorage.setItem("loginReturnTo", returnTo);
    setIsOpen(true);
  }, []);

  const requireLogin = useCallback(
    (action: () => void) => {
      if (getCurrentUser()) {
        action();
      } else {
        openPrompt();
      }
    },
    [openPrompt],
  );

  function goTo(path: string) {
    setIsOpen(false);
    setLocation(path);
  }

  return (
    <LoginPromptContext.Provider value={{ requireLogin, openPrompt }}>
      {children}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              key="sheet"
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ duration: 0.28, type: "spring", damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-[1001] mx-auto max-w-lg px-4 pb-safe-area-inset-bottom"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}
            >
              <div className="relative bg-[#1e293b] rounded-3xl p-6 border border-[#334155] shadow-2xl">
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="text-center mb-6">
                  <div className="text-4xl mb-3">🔒</div>
                  <h2 className="text-white font-black text-lg leading-snug mb-2">
                    Entre para publicar ofertas e ganhar pontos.
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Valide preços, compartilhe promoções e suba no ranking da comunidade!
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => goTo("/login")}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-white font-black rounded-2xl py-4 text-base transition-all flex items-center justify-center gap-2"
                  >
                    <LogIn className="h-5 w-5" />
                    Entrar
                  </button>

                  <button
                    onClick={() => goTo("/cadastro")}
                    className="w-full bg-[#0f172a] hover:bg-[#0a1120] active:scale-[0.98] text-emerald-400 font-bold rounded-2xl py-4 text-base transition-all border border-emerald-500/30 flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-5 w-5" />
                    Criar conta grátis
                  </button>

                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-full text-slate-400 hover:text-slate-300 font-medium text-sm py-2 transition-colors flex items-center justify-center gap-2"
                  >
                    <Store className="h-4 w-4" />
                    Continuar vendo ofertas
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </LoginPromptContext.Provider>
  );
}

// ── Inline gate — shown when a protected page is accessed directly ─────────────

interface LoginGateProps {
  returnTo?: string;
}

export function LoginGate({ returnTo }: LoginGateProps) {
  const [, setLocation] = useLocation();

  function goTo(path: string) {
    if (returnTo) sessionStorage.setItem("loginReturnTo", returnTo);
    setLocation(path);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center min-h-full px-6 py-20 bg-[#0f172a]"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-white font-black text-xl leading-snug mb-2">
            Entre para publicar ofertas e ganhar pontos.
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Valide preços, compartilhe promoções e suba no ranking da comunidade!
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => goTo("/login")}
            className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-white font-black rounded-2xl py-4 text-base transition-all flex items-center justify-center gap-2"
          >
            <LogIn className="h-5 w-5" />
            Entrar
          </button>

          <button
            onClick={() => goTo("/cadastro")}
            className="w-full bg-[#1e293b] hover:bg-[#263548] active:scale-[0.98] text-emerald-400 font-bold rounded-2xl py-4 text-base transition-all border border-emerald-500/30 flex items-center justify-center gap-2"
          >
            <UserPlus className="h-5 w-5" />
            Criar conta grátis
          </button>

          <button
            onClick={() => setLocation("/")}
            className="w-full text-slate-400 hover:text-slate-300 font-medium text-sm py-2 transition-colors flex items-center justify-center gap-2"
          >
            <Store className="h-4 w-4" />
            Continuar vendo ofertas
          </button>
        </div>
      </div>
    </motion.div>
  );
}
