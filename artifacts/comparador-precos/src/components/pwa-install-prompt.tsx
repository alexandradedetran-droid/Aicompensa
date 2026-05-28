import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "pwa-prompt-dismissed-v1";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed recently or already a PWA
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    // Already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after a short delay so the user sees the app first
      setTimeout(() => setShow(true), 8000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setShow(false);
      setInstalled(true);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  if (installed) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-0 right-0 z-50 px-4 sm:bottom-6"
        >
          <div
            className="max-w-lg mx-auto rounded-2xl p-4 flex items-center gap-3 shadow-2xl border border-emerald-800/40"
            style={{
              background: "linear-gradient(135deg, #064e3b 0%, #065f46 60%, #059669 100%)",
            }}
          >
            {/* App icon */}
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-xl">
              🛒
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-sm leading-tight">Instalar o app</p>
              <p className="text-emerald-200 text-[11px] mt-0.5">
                Acesso rápido, sem precisar abrir o navegador
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 bg-white text-emerald-800 font-black text-xs px-3 py-2 rounded-xl active:scale-95 transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                Instalar
              </button>
              <button
                onClick={handleDismiss}
                className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
