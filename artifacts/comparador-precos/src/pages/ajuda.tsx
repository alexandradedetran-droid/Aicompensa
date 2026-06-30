import { useState } from "react";
import { useSeo } from "@/lib/seo";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowLeft,
  MessageCircle,
  Mail,
  ChevronDown,
  MapPin,
  BarChart2,
  Plus,
  Trophy,
  CheckCircle,
  Navigation,
  Radar,
  HelpCircle,
  Search,
  Star,
  Flag,
  UserCog,
  LogIn,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface GuideItem {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  body: string;
}

interface FaqItem {
  icon: React.ElementType;
  q: string;
  a: string;
}

// ── Content ───────────────────────────────────────────────────────────────────

const GUIDES: GuideItem[] = [
  {
    icon: Search,
    iconColor: "#F2C14E",
    title: "Como encontrar ofertas",
    body: "Explore promoções reais compartilhadas pela comunidade perto de você. Use os filtros e o radar para descobrir onde realmente compensa comprar.",
  },
  {
    icon: BarChart2,
    iconColor: "#a78bfa",
    title: "Como comparar preços",
    body: "Compare rapidamente os preços entre mercados da sua região e descubra a melhor oferta disponível.",
  },
  {
    icon: Plus,
    iconColor: "#F2C14E",
    title: "Como publicar uma oferta",
    body: "Toque no botão central de publicar, envie uma foto, informe o preço e ajude outras pessoas a economizar.",
  },
  {
    icon: Trophy,
    iconColor: "#fbbf24",
    title: "Como funciona o ranking",
    body: "Ganhe pontos ao publicar ofertas, confirmar promoções e ajudar a comunidade. Quanto mais você participa, maior seu nível.",
  },
  {
    icon: CheckCircle,
    iconColor: "#34d399",
    title: "O que significa 'Ainda compensa?'",
    body: "Essa função permite que a comunidade confirme se a promoção ainda está válida em tempo real.",
  },
  {
    icon: Navigation,
    iconColor: "#60a5fa",
    title: "Como ativar a localização",
    body: "Ative sua localização para visualizar promoções próximas e descobrir ofertas em tempo real perto de você.",
  },
  {
    icon: Radar,
    iconColor: "#f472b6",
    title: "Radar de promoções",
    body: "O radar mostra as ofertas mais relevantes próximas da sua localização, ajudando você a economizar todos os dias.",
  },
];

const FAQS: FaqItem[] = [
  {
    icon: Plus,
    q: "Como publico uma oferta?",
    a: "Toque no botão + no centro da barra inferior, faça login se necessário, envie uma foto do produto, preencha o preço e o local, e toque em Publicar. Você ganha +10 pontos por oferta nova.",
  },
  {
    icon: LogIn,
    q: "Preciso estar logado?",
    a: "Você pode visualizar todas as ofertas sem login. Para publicar, validar, confirmar ou salvar favoritos, é necessário criar uma conta gratuita.",
  },
  {
    icon: Star,
    q: "Como ganho pontos?",
    a: "+10 pts ao publicar uma oferta nova, +5 pts ao confirmar uma oferta já existente, e +2 pts ao validar uma promoção. Pontos acumulam e sobem seu nível no ranking.",
  },
  {
    icon: CheckCircle,
    q: "Como confirmar uma promoção?",
    a: "Na página de uma oferta, toque em 'Ainda compensa?' para confirmar que o preço ainda está válido. Isso ajuda a comunidade e você ganha pontos.",
  },
  {
    icon: Flag,
    q: "Como denunciar uma oferta?",
    a: "Toque no ícone de bandeira na oferta e selecione 'Denunciar'. Nossa equipe analisa as denúncias e pode remover ofertas incorretas ou expiradas.",
  },
  {
    icon: UserCog,
    q: "Como alterar meus dados?",
    a: "Acesse a aba Perfil → seus dados pessoais ficam exibidos lá. Para alterações, entre em contato pelo WhatsApp ou e-mail de suporte.",
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
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.3)",
        marginBottom: 10,
        paddingLeft: 4,
      }}
    >
      {children}
    </p>
  );
}

function GuideCard({ item }: { item: GuideItem }) {
  const [open, setOpen] = useState(false);
  const Icon = item.icon;

  return (
    <div
      style={{
        background: open ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${open ? "rgba(190,242,100,0.18)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 16,
        overflow: "hidden",
        transition: "border-color 0.2s, background 0.2s",
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
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
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
            color: open ? "#f1f5f9" : "rgba(255,255,255,0.82)",
            lineHeight: 1.35,
          }}
        >
          {item.title}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22 }}
        >
          <ChevronDown size={16} color="rgba(255,255,255,0.3)" />
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
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.52)",
                lineHeight: 1.6,
                padding: "0 14px 14px 60px",
              }}
            >
              {item.body}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FaqCard({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const Icon = item.icon;

  return (
    <div
      style={{
        background: open ? "rgba(190,242,100,0.05)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${open ? "rgba(190,242,100,0.2)" : "rgba(255,255,255,0.07)"}`,
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
          gap: 11,
          padding: "13px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Icon
          size={14}
          color={open ? "#F2C14E" : "rgba(255,255,255,0.28)"}
          style={{ flexShrink: 0, transition: "color 0.2s" }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: open ? "#f1f5f9" : "rgba(255,255,255,0.75)",
            lineHeight: 1.4,
          }}
        >
          {item.q}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22 }}
        >
          <ChevronDown size={15} color="rgba(255,255,255,0.3)" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="ans"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <p
              style={{
                fontSize: 12.5,
                color: "rgba(255,255,255,0.5)",
                lineHeight: 1.6,
                padding: "0 14px 13px 39px",
              }}
            >
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Ajuda() {
  useSeo({
    title: "Ajuda e Suporte",
    description: "Tire suas dúvidas sobre o AíCompensa. Como publicar ofertas, ganhar pontos e usar o comparador de preços de supermercado.",
    url: "https://aicompensa.com.br/ajuda",
  });
  const waLink =
    "https://wa.me/5565996440389?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20A%C3%ADCompensa.";
  const emailLink =
    "mailto:suporte@aicompensa.com.br?subject=Suporte%20A%C3%ADCompensa";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      style={{ minHeight: "100%", paddingBottom: 24, background: "#130926" }}
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
            Central de
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
            Ajuda e Suporte
          </h1>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* ── Contact cards ── */}
        <SectionLabel>Falar com a gente</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>

          {/* WhatsApp */}
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            <motion.div
              whileTap={{ scale: 0.97 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "15px 16px",
                borderRadius: 18,
                background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                boxShadow: "0 4px 20px rgba(22,163,74,0.28)",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  background: "rgba(255,255,255,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <MessageCircle size={21} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: "#fff", fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>
                  Falar no WhatsApp
                </p>
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
                  +55 65 9 9644-0389 · Resposta rápida
                </p>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.8)",
                  background: "rgba(255,255,255,0.18)",
                  borderRadius: 20,
                  padding: "4px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                Abrir →
              </div>
            </motion.div>
          </a>

          {/* Email */}
          <a
            href={emailLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            <motion.div
              whileTap={{ scale: 0.97 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "15px 16px",
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  background: "rgba(167,139,250,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Mail size={20} color="#a78bfa" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                  Enviar e-mail
                </p>
                <p style={{ color: "rgba(255,255,255,0.42)", fontSize: 12, marginTop: 2 }}>
                  suporte@aicompensa.com.br
                </p>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(167,139,250,0.8)",
                  background: "rgba(167,139,250,0.12)",
                  borderRadius: 20,
                  padding: "4px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                Abrir →
              </div>
            </motion.div>
          </a>
        </div>

        {/* ── How to use ── */}
        <SectionLabel>Como usar o app</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {GUIDES.map((item) => (
            <GuideCard key={item.title} item={item} />
          ))}
        </div>

        {/* ── FAQ ── */}
        <SectionLabel>Perguntas frequentes</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {FAQS.map((item) => (
            <FaqCard key={item.q} item={item} />
          ))}
        </div>

        {/* ── Footer note ── */}
        <div
          style={{
            marginTop: 28,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <HelpCircle size={18} color="rgba(255,255,255,0.15)" />
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>
            Não encontrou o que procurava?<br />
            Fale diretamente com o nosso suporte.
          </p>
        </div>

        {/* ── Legal links ── */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "center",
            gap: 20,
          }}
        >
          <Link href="/termos">
            <span style={{ fontSize: 12, color: "rgba(167,139,250,0.55)", cursor: "pointer" }}>
              Termos de Uso
            </span>
          </Link>
          <Link href="/privacidade">
            <span style={{ fontSize: 12, color: "rgba(96,165,250,0.55)", cursor: "pointer" }}>
              Privacidade · LGPD
            </span>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
