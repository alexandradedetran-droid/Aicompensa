import { useState } from "react";
import { useSeo } from "@/lib/seo";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowLeft,
  Users,
  AlertTriangle,
  ShieldCheck,
  UserX,
  Flag,
  ChevronDown,
  FileText,
  Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  paragraphs: string[];
}

// ── Content ───────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    icon: Users,
    iconColor: "#F2C14E",
    title: "Plataforma colaborativa",
    paragraphs: [
      "O AíCompensa é uma plataforma colaborativa onde usuários reais compartilham preços e promoções de supermercados e estabelecimentos da sua região.",
      "As informações publicadas partem da comunidade — o app não tem vínculo direto com os estabelecimentos e não garante que os preços estejam atualizados no momento da sua visita.",
    ],
  },
  {
    icon: AlertTriangle,
    iconColor: "#fbbf24",
    title: "Preços e disponibilidade",
    paragraphs: [
      "Os preços podem variar sem aviso prévio. Promoções têm duração limitada e podem encerrar rapidamente ou sem aviso.",
      "O AíCompensa não garante disponibilidade de estoque, validade das promoções ou que o preço exibido será o mesmo encontrado no estabelecimento.",
      "Antes de se deslocar, recomendamos confirmar a oferta usando o botão 'Ainda compensa?' ou entrar em contato diretamente com o estabelecimento.",
    ],
  },
  {
    icon: ShieldCheck,
    iconColor: "#60a5fa",
    title: "Responsabilidade dos usuários",
    paragraphs: [
      "Ao publicar uma oferta, você declara que as informações são verdadeiras e que você as verificou pessoalmente.",
      "Publicar informações falsas, enganosas ou com intuito malicioso viola estes termos e pode resultar no bloqueio da sua conta.",
      "O AíCompensa se reserva o direito de remover qualquer oferta que viole estes termos ou que seja denunciada pela comunidade.",
    ],
  },
  {
    icon: Flag,
    iconColor: "#f472b6",
    title: "Denúncias e moderação",
    paragraphs: [
      "Qualquer usuário pode denunciar uma oferta incorreta ou enganosa. Ofertas com múltiplas denúncias são automaticamente revisadas.",
      "Nossa equipe pode remover ofertas sem aviso prévio caso identifique violações destes termos.",
      "Ao denunciar, você nos ajuda a manter a plataforma confiável para toda a comunidade.",
    ],
  },
  {
    icon: UserX,
    iconColor: "#fb7185",
    title: "Bloqueio de conta",
    paragraphs: [
      "Uso indevido da plataforma pode resultar no bloqueio temporário ou definitivo da sua conta.",
      "Consideram-se usos indevidos: publicar preços falsos, criar múltiplas contas para manipular o ranking, assediar outros usuários ou tentar burlar sistemas de segurança.",
    ],
  },
  {
    icon: Info,
    iconColor: "#a78bfa",
    title: "Alterações nestes termos",
    paragraphs: [
      "Podemos atualizar estes Termos de Uso a qualquer momento. Mudanças significativas serão comunicadas dentro do app.",
      "O uso continuado da plataforma após a publicação de atualizações implica na aceitação dos novos termos.",
      "Última atualização: maio de 2025.",
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
            <div style={{ padding: "0 14px 14px 60px", display: "flex", flexDirection: "column", gap: 8 }}>
              {item.paragraphs.map((p, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.52)",
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {p}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Termos() {
  useSeo({
    title: "Termos de Uso",
    description: "Termos e condições de uso do AíCompensa. Saiba como funciona nossa plataforma colaborativa de comparação de preços de supermercado.",
    url: "https://aicompensa.com.br/termos",
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
            Termos de Uso
          </h1>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* ── Intro card ── */}
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "14px 16px",
            borderRadius: 18,
            background: "rgba(190,242,100,0.06)",
            border: "1px solid rgba(190,242,100,0.14)",
            marginBottom: 24,
          }}
        >
          <FileText size={18} color="#F2C14E" style={{ flexShrink: 0, marginTop: 1 }} />
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.58)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Ao usar o AíCompensa, você concorda com as condições abaixo. Leia com atenção — é curto e escrito em português simples.
          </p>
        </div>

        {/* ── Sections ── */}
        <SectionLabel>O que você precisa saber</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {SECTIONS.map((item) => (
            <SectionCard key={item.title} item={item} />
          ))}
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
          <Link href="/privacidade">
            <span
              style={{
                fontSize: 12,
                color: "rgba(190,242,100,0.6)",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Política de Privacidade
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
