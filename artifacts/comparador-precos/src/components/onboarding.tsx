import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, X } from "lucide-react";

const STORAGE_KEY = "aicompensa_ob_v1";
const SPOT_PAD = 10;
const BALLOON_H = 168; // approximate balloon height for safe positioning

interface StepDef {
  selector: string;
  fallbackSelector?: string;
  title: string;
  text: string;
  tooltipSide: "top" | "bottom";
}

const STEPS: StepDef[] = [
  {
    selector: '[data-onboarding="hero-card"]',
    fallbackSelector: '[data-onboarding="nav-ofertas"]',
    title: "Ofertas perto de você",
    text: "Veja as melhores promoções da sua região, confirmadas pela comunidade.",
    tooltipSide: "bottom",
  },
  {
    selector: '[data-onboarding="hero-compare"]',
    fallbackSelector: '[data-onboarding="nav-ofertas"]',
    title: "Compare preços",
    text: "Compare preços entre mercados e encontre sempre o mais barato.",
    tooltipSide: "top",
  },
  {
    selector: '[data-onboarding="nav-publicar"]',
    title: "Publique e ganhe pontos",
    text: "Encontrou uma promoção? Publique e acumule pontos no ranking.",
    tooltipSide: "top",
  },
  {
    selector: '[data-onboarding="nav-mapa"]',
    title: "Ative a localização",
    text: "Ative o GPS para ver promoções próximas e calcular distâncias.",
    tooltipSide: "top",
  },
];

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getSpotRect(step: StepDef): SpotRect | null {
  const el =
    document.querySelector(step.selector) ??
    (step.fallbackSelector ? document.querySelector(step.fallbackSelector) : null);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - SPOT_PAD,
    left: r.left - SPOT_PAD,
    width: r.width + SPOT_PAD * 2,
    height: r.height + SPOT_PAD * 2,
  };
}

function isDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {}
}

export function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<SpotRect | null>(null);

  const finish = useCallback(() => {
    markDone();
    setVisible(false);
  }, []);

  const advance = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }, [step, finish]);

  const readRect = useCallback(() => {
    setRect(getSpotRect(STEPS[step]));
  }, [step]);

  useEffect(() => {
    if (isDone()) return;
    const id = setTimeout(() => setVisible(true), 700);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!visible) return;
    readRect();
    window.addEventListener("resize", readRect);
    return () => window.removeEventListener("resize", readRect);
  }, [visible, readRect]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const tooltipAbove = currentStep.tooltipSide === "top";

  const ARROW_H = 7;
  const BALLOON_W = Math.min(268, vw - 28);

  /* Horizontal: center balloon on spotlight, clamp to viewport edges */
  const balloonLeft = rect
    ? Math.min(
        Math.max(rect.left + rect.width / 2 - BALLOON_W / 2, 10),
        vw - BALLOON_W - 10,
      )
    : (vw - BALLOON_W) / 2;

  /* Vertical: place balloon above or below spotlight, clamped to viewport */
  const rawBalloonTop = rect
    ? tooltipAbove
      ? rect.top - ARROW_H - BALLOON_H - 4
      : rect.top + rect.height + ARROW_H + 4
    : vh / 2 - BALLOON_H / 2;
  const balloonTop = Math.max(8, Math.min(rawBalloonTop, vh - BALLOON_H - 8));

  /* Arrow position: points from balloon toward spotlight */
  const arrowLeft = rect
    ? Math.min(
        Math.max(rect.left + rect.width / 2 - balloonLeft - ARROW_H, 14),
        BALLOON_W - 28,
      )
    : BALLOON_W / 2 - ARROW_H;

  return (
    <AnimatePresence>
      {visible && (
        /*
         * Root overlay: position:fixed inset-0.
         * IMPORTANT: spotlight and balloon use position:absolute (not fixed)
         * to avoid stacking-context issues from framer-motion's opacity transform.
         * Since this parent covers the full viewport, absolute coords = viewport coords.
         */
        <motion.div
          key="ob-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="fixed inset-0"
          style={{
            zIndex: 200,
            background: "rgba(5, 0, 12, 0.52)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
          }}
          onClick={advance}
        >
          {/* ── Spotlight ring ── */}
          {rect && (
            <motion.div
              key={`spot-${step}`}
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                borderRadius: 16,
                /*
                 * The large outer shadow re-creates the dark scrim outside the spotlight.
                 * The spotlight area itself has no background so the app shows through.
                 */
                boxShadow: [
                  "0 0 0 9999px rgba(5,0,12,0.48)",
                  "0 0 0 1.5px rgba(242,193,78,0.5)",
                  "0 0 0 4px rgba(242,193,78,0.07)",
                  "0 0 22px rgba(242,193,78,0.12)",
                ].join(", "),
                pointerEvents: "none",
              }}
            />
          )}

          {/* ── Balloon tooltip ── */}
          <motion.div
            key={`balloon-${step}`}
            initial={{ opacity: 0, y: tooltipAbove ? 6 : -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.07, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: balloonTop,
              left: balloonLeft,
              width: BALLOON_W,
              zIndex: 1,
            }}
          >
            {/* Arrow pointing UP (balloon is below spotlight) */}
            {!tooltipAbove && (
              <div
                style={{
                  position: "absolute",
                  top: -ARROW_H,
                  left: arrowLeft,
                  width: 0,
                  height: 0,
                  borderLeft: `${ARROW_H}px solid transparent`,
                  borderRight: `${ARROW_H}px solid transparent`,
                  borderBottom: `${ARROW_H}px solid rgba(22,10,42,0.97)`,
                }}
              />
            )}

            {/* Balloon body */}
            <div
              style={{
                background: "rgba(22, 10, 42, 0.97)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(242,193,78,0.16)",
                borderRadius: 20,
                padding: "14px 14px 13px",
                boxShadow: [
                  "0 8px 28px rgba(0,0,0,0.45)",
                  "0 2px 6px rgba(0,0,0,0.3)",
                  "inset 0 1px 0 rgba(255,255,255,0.04)",
                ].join(", "),
              }}
            >
              {/* Progress dots + Skip */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 11,
                }}
              >
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: i === step ? 20 : 6,
                        height: 6,
                        borderRadius: 3,
                        background:
                          i === step
                            ? "#F2C14E"
                            : i < step
                              ? "rgba(242,193,78,0.3)"
                              : "rgba(255,255,255,0.1)",
                        transition: "all 0.35s cubic-bezier(0.22,1,0.36,1)",
                        boxShadow: i === step ? "0 0 7px rgba(242,193,78,0.38)" : "none",
                      }}
                    />
                  ))}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    finish();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 20,
                    padding: "3px 9px 3px 7px",
                    color: "rgba(255,255,255,0.38)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                  }}
                >
                  <X size={9} strokeWidth={2.5} />
                  Pular
                </button>
              </div>

              {/* Title */}
              <p
                style={{
                  color: "#f1f5f9",
                  fontWeight: 700,
                  fontSize: 14,
                  marginBottom: 5,
                  lineHeight: 1.3,
                  letterSpacing: "-0.01em",
                }}
              >
                {currentStep.title}
              </p>

              {/* Body text */}
              <p
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  marginBottom: 13,
                }}
              >
                {currentStep.text}
              </p>

              {/* CTA */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={(e) => {
                  e.stopPropagation();
                  advance();
                }}
                style={{
                  width: "100%",
                  padding: "9px 14px",
                  background: "linear-gradient(135deg, #F2C14E 0%, #F2C14E 100%)",
                  border: "none",
                  borderRadius: 12,
                  color: "#0d1a00",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  letterSpacing: "0.01em",
                  boxShadow: "0 2px 10px rgba(242,193,78,0.25)",
                }}
              >
                {isLast ? "Entendi!" : "Próximo"}
                {!isLast && <ChevronRight size={13} strokeWidth={2.5} />}
              </motion.button>
            </div>

            {/* Arrow pointing DOWN (balloon is above spotlight) */}
            {tooltipAbove && (
              <div
                style={{
                  position: "absolute",
                  bottom: -ARROW_H,
                  left: arrowLeft,
                  width: 0,
                  height: 0,
                  borderLeft: `${ARROW_H}px solid transparent`,
                  borderRight: `${ARROW_H}px solid transparent`,
                  borderTop: `${ARROW_H}px solid rgba(22,10,42,0.97)`,
                }}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
