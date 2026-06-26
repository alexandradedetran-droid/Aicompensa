import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PHRASES = [
  { main: "Analisando oferta...",    sub: "Processando imagem" },
  { main: "Identificando preço...",  sub: "Reconhecendo valores" },
  { main: "Organizando dados...",    sub: "Estruturando informações" },
  { main: "Finalizando...",          sub: "Quase pronto" },
];

const REVEAL_FIELDS = [
  { label: "Produto",   ms: 950 },
  { label: "Preço",     ms: 1900 },
  { label: "Mercado",   ms: 2850 },
  { label: "Categoria", ms: 3800 },
];

interface ScannerIAProps {
  isVisible: boolean;
  photoPreview?: string | null;
}

export function ScannerIA({ isVisible, photoPreview }: ScannerIAProps) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [revealed, setRevealed] = useState<string[]>([]);

  useEffect(() => {
    if (!isVisible) {
      setPhraseIdx(0);
      setRevealed([]);
      return;
    }

    const interval = setInterval(
      () => setPhraseIdx((i) => (i + 1) % PHRASES.length),
      1350
    );

    const timers = REVEAL_FIELDS.map(({ label, ms }) =>
      setTimeout(() => setRevealed((prev) => [...prev, label]), ms)
    );

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, [isVisible]);

  const phrase = PHRASES[phraseIdx];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden"
          style={{ background: "rgba(6, 0, 14, 0.96)" }}
        >
          {/* Blurred photo behind */}
          {photoPreview && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${photoPreview})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(24px) saturate(1.2)",
                opacity: 0.1,
              }}
            />
          )}

          {/* Violet ambient glow */}
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 360,
              height: 360,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -58%)",
              background: "radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)",
              filter: "blur(48px)",
            }}
          />
          {/* Lime accent glow */}
          <motion.div
            aria-hidden
            className="absolute pointer-events-none"
            animate={{ opacity: [0.06, 0.14, 0.06] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 220,
              height: 220,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -55%)",
              background: "radial-gradient(circle, rgba(242,193,78,1) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />

          {/* Scanner frame */}
          <div className="relative w-60 h-60 flex items-center justify-center">
            {/* Corner brackets */}
            <span
              className="absolute top-0 left-0 w-8 h-8"
              style={{ borderTop: "2.5px solid #8B5CF6", borderLeft: "2.5px solid #8B5CF6", borderRadius: "10px 0 0 0" }}
            />
            <span
              className="absolute top-0 right-0 w-8 h-8"
              style={{ borderTop: "2.5px solid #8B5CF6", borderRight: "2.5px solid #8B5CF6", borderRadius: "0 10px 0 0" }}
            />
            <span
              className="absolute bottom-0 left-0 w-8 h-8"
              style={{ borderBottom: "2.5px solid #BEF264", borderLeft: "2.5px solid #BEF264", borderRadius: "0 0 0 10px" }}
            />
            <span
              className="absolute bottom-0 right-0 w-8 h-8"
              style={{ borderBottom: "2.5px solid #BEF264", borderRight: "2.5px solid #BEF264", borderRadius: "0 0 10px 0" }}
            />

            {/* Scan line */}
            <motion.div
              className="absolute left-2 right-2 h-[1.5px] pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent, #8B5CF6 20%, #BEF264 50%, #8B5CF6 80%, transparent)",
                boxShadow:
                  "0 0 10px 2px rgba(139,92,246,0.65), 0 0 26px 5px rgba(242,193,78,0.18)",
              }}
              animate={{ top: ["5%", "95%", "5%"] }}
              transition={{ duration: 1.85, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Logo mark */}
            <motion.div
              animate={{ scale: [1, 1.07, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg viewBox="0 0 36 36" fill="none" className="h-11 w-11 drop-shadow-lg">
                <path d="M18 5L4 31" stroke="url(#sg)" strokeWidth="5" strokeLinecap="round" />
                <path d="M18 5L32 31" stroke="url(#sg)" strokeWidth="5" strokeLinecap="round" />
                <circle cx="18" cy="23" r="4" fill="#F2C14E" />
                <defs>
                  <linearGradient id="sg" x1="18" y1="5" x2="18" y2="31" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#F2C14E" />
                    <stop offset="1" stopColor="#F2C14E" />
                  </linearGradient>
                </defs>
              </svg>
            </motion.div>
          </div>

          {/* Text + chips section */}
          <div className="relative mt-8 flex flex-col items-center gap-1">
            {/* Rotating main phrase */}
            <AnimatePresence mode="wait">
              <motion.p
                key={phraseIdx}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -7 }}
                transition={{ duration: 0.28 }}
                className="text-[13px] font-black tracking-[0.14em] uppercase"
                style={{ color: "#BEF264" }}
              >
                {phrase.main}
              </motion.p>
            </AnimatePresence>

            {/* Rotating sub-phrase */}
            <AnimatePresence mode="wait">
              <motion.p
                key={`s${phraseIdx}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-[11px] tracking-wide"
                style={{ color: "#64748b" }}
              >
                {phrase.sub}
              </motion.p>
            </AnimatePresence>

            {/* Sequential identification chips */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-4 min-h-[28px] max-w-[260px]">
              <AnimatePresence>
                {revealed.map((field, i) => (
                  <motion.div
                    key={field}
                    initial={{ opacity: 0, scale: 0.65, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 520,
                      damping: 26,
                    }}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1"
                    style={{
                      background: "rgba(242,193,78,0.07)",
                      border: "1px solid rgba(242,193,78,0.22)",
                    }}
                  >
                    <motion.span
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.08, type: "spring", stiffness: 700, damping: 18 }}
                      className="text-[10px]"
                      style={{ color: "#F2C14E" }}
                    >
                      ✓
                    </motion.span>
                    <span className="text-[10px] font-bold" style={{ color: "rgba(242,193,78,0.85)" }}>
                      {field}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Pulsing dots */}
            <div className="flex items-center gap-1.5 mt-3">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "#8B5CF6" }}
                  animate={{ scale: [0.5, 1.35, 0.5], opacity: [0.25, 1, 0.25] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.22,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
