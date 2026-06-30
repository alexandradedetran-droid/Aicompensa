import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { useLocation } from "wouter";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";

/* Routes where the FAB should not appear */
const HIDDEN_ON = new Set(["/publicar", "/admin", "/admin-login"]);

export function PublicarFAB() {
  const [location, setLocation] = useLocation();
  const { openPrompt } = useLoginPrompt();

  if (HIDDEN_ON.has(location)) return null;

  function handlePress() {
    if (getCurrentUser()) {
      setLocation("/publicar");
    } else {
      openPrompt("/publicar");
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="publicar-fab"
        initial={{ opacity: 0, scale: 0.7, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, y: 12 }}
        transition={{ type: "spring", stiffness: 420, damping: 26, mass: 0.8 }}
        /* Sits above the nav (z-49) and clears the bottom bar + safe area */
        className="absolute right-3 z-[49] select-none"
        style={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 10px)" }}
      >
        {/* Ambient glow — pulsing behind the button */}
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(242,193,78,0.45) 0%, transparent 70%)",
            filter: "blur(10px)",
            transform: "scale(1.6)",
          }}
          animate={{ opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* The button itself */}
        <motion.button
          type="button"
          onClick={handlePress}
          aria-label="Publicar nova oferta"
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          className="relative flex items-center gap-2 rounded-full font-black text-sm leading-none outline-none"
          style={{
            paddingLeft: "18px",
            paddingRight: "20px",
            paddingTop: "13px",
            paddingBottom: "13px",
            background: "linear-gradient(135deg, #d4ff40 0%, #F2C14E 45%, #F2C14E 100%)",
            color: "#0d1f00",
            boxShadow:
              "0 4px 22px rgba(242,193,78,0.38), 0 1px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.28)",
            letterSpacing: "-0.01em",
          }}
        >
          {/* Inner highlight stripe */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[45%] rounded-t-full pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)",
            }}
          />

          {/* Plus icon in a dark circle */}
          <span
            className="relative flex items-center justify-center rounded-full shrink-0"
            style={{
              width: "22px",
              height: "22px",
              background: "rgba(0,0,0,0.18)",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
            }}
          >
            <Plus className="h-3.5 w-3.5 stroke-[3]" style={{ color: "#0d1f00" }} />
          </span>

          <span className="relative">Publicar</span>
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
