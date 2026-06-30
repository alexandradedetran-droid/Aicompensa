import { useState } from "react";
import { useSeo } from "@/lib/seo";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Image,
  MousePointerClick,
  Database,
  ShieldCheck,
  Trash2,
  ChevronDown,
  Lock,
  Eye,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  content: Array<{ label?: string; text: string }>;
}

// ── Content ───────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    icon: Database,
    iconColor: "#F2C14E",
    title: "O que coletamos ao criar sua conta",
    content: [
      { label: "Nome", text: "Para identificar você no ranking e nas ofertas publicadas." },
      { label: "E-mail", text: "Para login e comunicação sobre sua conta." },
      { label: "Cidade e estado", text: "Para mostrar ofertas relevantes da sua região." },
    ],
  },
  {
    icon: MapPin,
    iconColor: "#60a5fa",
    title: "Localização",
    content: [
      {
        text: "Sua localização é usada exclusivamente para mostrar promoções próximas a você e melhorar a relevância do feed.",
      },
      {
        text: "Você controla quando ativar a localização. O app nunca acessa sua posição em segundo plano — só quando você está usando o app.",
      },
      {
        text: "Não compartilhamos coordenadas exatas com terceiros.",
      },
    ],
  },
  {
    icon: Image,
    iconColor: "#f472b6",
    title: "Fotos enviadas",
    content: [
      {
        text: "As fotos que você tira ao publicar uma oferta são armazenadas no nosso banco de dados para exibição pública na plataforma.",
      },
      {
        text: "As imagens ficam vinculadas ao produto publicado. Ao excluir uma oferta, a imagem é removida junto.",
      },
      {
        text: "Não usamos suas fotos para fins além da exibição da oferta na plataforma.",
      },
    ],
  },
  {
    icon: MousePointerClick,
    iconColor: "#fbbf24",
    title: "Interações e comportamento",
    content: [
      {
        text: "Registramos ações como curtidas, validações, confirmações e denúncias para calcular o score das ofertas e seu ranking de pontos.",
      },
      {
        text: "Essas interações são usadas para melhorar a qualidade do feed e proteger a comunidade contra informações enganosas.",
      },
    ],
  },
  {
    icon: Lock,
    iconColor: "#a78bfa",
    title: "Cookies e armazenamento local",
    content: [
      {
        label: "Sessão",
        text: "Usamos cookies de sessão para manter você logado com segurança.",
      },
      {
        label: "Preferências",
        text: "Salvamos localmente no seu dispositivo (localStorage) preferências como o onboarding já visto e filtros.",
      },
      {
        text: "Não usamos cookies de rastreamento ou publicidade.",
      },
    ],
  },
  {
    icon: ShieldCheck,
    iconColor: "#34d399",
    title: "Seus dados são seguros",
    content: [
      {
        text: "Não vendemos, alugamos ou compartilhamos seus dados pessoais com anunciantes ou terceiros.",
      },
      {
        text: "Seus dados são usados apenas para o funcionamento da plataforma e para melhorar sua experiência.",
      },
      {
        text: "Utilizamos práticas modernas de segurança: HTTPS, cookies HTTPOnly, rate limiting e proteção contra abusos.",
      },
    ],
  },
  {
    icon: Trash2,
    iconColor: "#fb7185",
    title: "Exclusão dos seus dados (LGPD)",
    content: [
      {
        text: "Você tem direito à exclusão dos seus dados pessoais conforme a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).",
      },
      {
        text: "Para solicitar a exclusão da sua conta e de todos os dados associados, entre em contato com nossa equipe pelo WhatsApp ou e-mail de suporte.",
      },
      {
        text: "Processamos as solicitações em até 15 dias úteis.",
      },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase" as const,
        color: "rgba(255,255,255,0.3)",
        marginBottom: 10,
        paddingLeft: 4,
      }}
    >
      {children}
    </p>
  );
}

function SectionCard({ item }: { item: Section }) {
  const [open, setOpen] = useState(false);
  const Icon = item.icon;

  return (
    <div
      style={{
        background: open ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${open ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 16,
        overflow: "hidden",
        transition: "all 0.2s",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "13px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left" as const,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={16} color={item.iconColor} />
        </div>
        <span
          style={{
            flex: 1,
            fontSize: 13.5,
            fontWeight: 600,
            color: open ? "#f1f5f9" : "rgba(255,255,255,0.78)",
            lineHeight: 1.35,
          }}
        >
          {item.title}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22 }}
        >
          <ChevronDown size={16} color="rgba(255,255,255,0.28)" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 14px 14px 60px", display: "flex", flexDirection: "column", gap: 9 }}>
              {item.content.map((c, i) => (
                <div key={i}>
                  {c.label && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.38)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        display: "block",
                        marginBottom: 2,
                      }}
                    >
                      {c.label}
                    </span>
                  )}
                  <p
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.52)",
                      lineHeight: 1.65,
                      margin: 0,
                    }}
                  >
                    {c.text}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Privacidade() {
  useSeo({
    title: "Política de Privacidade",
    description: "Política de privacidade do AíCompensa. Como coletamos, usamos e protegemos seus dados na nossa plataforma de comparação de preços.",
    url: "https://aicompensa.com.br/privacidade",
  });
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      style={{ minHeight: "100%", paddingBottom: 32 }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "20px 16px 4px",
        }}
      >
        <Link href="/perfil">
          <button
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Voltar"
          >
            <ArrowLeft size={17} color="rgba(255,255,255,0.75)" />
          </button>
        </Link>
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.3)",
              marginBottom: 1,
            }}
          >
            Legal
          </p>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#f1f5f9",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            Política de Privacidade
          </h1>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* ── LGPD notice banner ── */}
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "14px 16px",
            borderRadius: 18,
            background: "rgba(96,165,250,0.08)",
            border: "1px solid rgba(96,165,250,0.18)",
            marginBottom: 24,
          }}
        >
          <MapPin size={18} color="#60a5fa" style={{ flexShrink: 0, marginTop: 1 }} />
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.58)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Utilizamos sua localização para mostrar promoções próximas e melhorar sua experiência no app.
          </p>
        </div>

        {/* ── Commitment strip ── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 14,
            background: "rgba(52,211,153,0.06)",
            border: "1px solid rgba(52,211,153,0.14)",
            marginBottom: 24,
            alignItems: "center",
          }}
        >
          <Eye size={15} color="#34d399" style={{ flexShrink: 0 }} />
          <p
            style={{
              fontSize: 12.5,
              color: "rgba(52,211,153,0.8)",
              lineHeight: 1.5,
              margin: 0,
              fontWeight: 600,
            }}
          >
            Seus dados não são vendidos. Nunca. Ponto final.
          </p>
        </div>

        {/* ── Sections ── */}
        <SectionLabel>Como usamos seus dados</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {SECTIONS.map((item) => (
            <SectionCard key={item.title} item={item} />
          ))}
        </div>

        {/* ── LGPD badge ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 14,
            background: "rgba(167,139,250,0.06)",
            border: "1px solid rgba(167,139,250,0.14)",
            marginBottom: 20,
          }}
        >
          <ShieldCheck size={16} color="#a78bfa" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", margin: 0, lineHeight: 1.5 }}>
            Estamos em conformidade com a <strong style={{ color: "rgba(167,139,250,0.8)" }}>LGPD</strong> — Lei Geral de Proteção de Dados (Lei 13.709/2018).
          </p>
        </div>

        {/* ── Footer links ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 20,
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Link href="/termos">
            <span
              style={{
                fontSize: 12,
                color: "rgba(190,242,100,0.6)",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Termos de Uso
            </span>
          </Link>
          <Link href="/ajuda">
            <span
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.28)",
                cursor: "pointer",
              }}
            >
              Ajuda e Suporte
            </span>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
