import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

export function SwUpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener("sw:update-available", handler);
    return () => window.removeEventListener("sw:update-available", handler);
  }, []);

  function handleReload() {
    setShow(false);
    window.location.reload();
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -72, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -72, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 340 }}
          className="fixed top-0 left-0 right-0 z-[300] flex justify-center px-4 pt-3 pointer-events-none"
        >
          <div
            className="pointer-events-auto max-w-sm w-full rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl"
            style={{
              background: "linear-gradient(135deg,#1d0e36,#2d1060)",
              border: "1px solid rgba(242,193,78,0.3)",
            }}
          >
            <div
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(242,193,78,0.15)" }}
            >
              <RefreshCw className="h-4 w-4 text-[#F2C14E]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight">Nova versão disponível</p>
              <p className="text-slate-400 text-[11px]">Atualize para obter as últimas melhorias</p>
            </div>
            <button
              onClick={handleReload}
              aria-label="Atualizar app para nova versão"
              className="shrink-0 font-black text-xs px-3 py-2 rounded-xl active:scale-95 transition-all text-black"
              style={{ background: "#F2C14E" }}
            >
              Atualizar
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
