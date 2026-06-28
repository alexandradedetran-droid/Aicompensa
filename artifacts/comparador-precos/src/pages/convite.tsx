import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Copy, Share2, Users, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { getCurrentUser } from "@/lib/current-user";
import { customFetch } from "@workspace/api-client-react";
import { LoginGate } from "@/lib/login-prompt";
import { useSeo } from "@/lib/seo";
import { toast } from "@/hooks/use-toast";

interface ConviteStats {
  codigo: string | null;
  link: string | null;
  totalConvidados: number;
  cadastrosConcluidos: number;
}

async function fetchConvite(): Promise<ConviteStats> {
  const r = await customFetch("/api/growth/convite");
  return (r as Response).json();
}

export default function Convite() {
  useSeo({ title: "Convidar Amigos", noIndex: true });
  const currentUser = getCurrentUser();

  const { data, isLoading } = useQuery<ConviteStats>({
    queryKey: ["growth-convite"],
    queryFn: fetchConvite,
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  if (!currentUser) return <LoginGate returnTo="/convite" />;

  function copyCode() {
    if (!data?.link) return;
    navigator.clipboard.writeText(data.link)
      .then(() => toast({ title: "Link copiado!", description: data.link! }))
      .catch(() => toast({ title: "Erro ao copiar", variant: "destructive" }));
  }

  function shareWhatsApp() {
    if (!data?.codigo) return;
    const url = data.link ?? `https://aicompensa.com.br/cadastro?ref=${data.codigo}`;
    const msg = encodeURIComponent(
      `Economize nas compras comigo no AíCompensa! Use meu código *${data.codigo}* ou acesse: ${url}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
  }

  const taxa = data && data.totalConvidados > 0
    ? Math.round((data.cadastrosConcluidos / data.totalConvidados) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#130926]"
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3">
        <Link href="/perfil">
          <button className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center">
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
        </Link>
        <div>
          <h1 className="text-white font-black text-xl leading-tight">Convidar Amigos</h1>
          <p className="text-slate-400 text-xs">Indique e ganhe pontos extras</p>
        </div>
      </div>

      {/* Hero */}
      <div className="mx-4 mb-5 rounded-3xl p-5 text-center"
           style={{ background: "linear-gradient(135deg,#1d0e36,#2d1060)" }}>
        <div className="text-4xl mb-3">🎁</div>
        <p className="text-white font-black text-lg mb-1">Ganhe 100 pontos por convite</p>
        <p className="text-slate-400 text-sm leading-relaxed">
          Compartilhe seu código. Cada amigo que se cadastrar te dá 100 pontos de bônus.
        </p>
      </div>

      {/* Code card */}
      <div className="mx-4 mb-5 bg-white rounded-3xl p-5" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.10)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Seu código de convite
        </p>

        {isLoading ? (
          <div className="h-14 rounded-2xl bg-slate-100 animate-pulse" />
        ) : data?.codigo ? (
          <>
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-5 py-4 mb-4 text-center">
              <span className="text-3xl font-black tracking-[0.2em] text-slate-900 select-all">
                {data.codigo}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyCode}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors active:scale-95"
              >
                <Copy className="h-4 w-4" /> Copiar link
              </button>
              <button
                onClick={shareWhatsApp}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors active:scale-95"
                style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", color: "#16a34a" }}
              >
                <Share2 className="h-4 w-4" /> WhatsApp
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 text-center py-3">Código sendo gerado...</p>
        )}
      </div>

      {/* Stats */}
      <div className="mx-4 mb-5 bg-white rounded-3xl p-5" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.10)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Seus resultados</p>
        <div className="grid grid-cols-2 gap-3">
          <StatBox value={data?.totalConvidados ?? 0}    label="Convidados"         emoji="📨" />
          <StatBox value={data?.cadastrosConcluidos ?? 0} label="Cadastros feitos"  emoji="✅" />
          <StatBox value={(data?.totalConvidados ?? 0) * 100} label="Pontos possíveis" emoji="⭐" format="pts" />
          <StatBox value={taxa} label="Taxa de conversão" emoji="📈" format="%" />
        </div>
      </div>

      {/* How it works */}
      <div className="mx-4 mb-6 bg-white rounded-3xl p-5" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.10)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Como funciona</p>
        <div className="space-y-4">
          {[
            { n: "1", text: "Compartilhe seu código ou link único com um amigo" },
            { n: "2", text: "Seu amigo se cadastra usando o código" },
            { n: "3", text: "Você recebe 100 pontos automaticamente" },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                {n}
              </span>
              <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function StatBox({
  value, label, emoji, format,
}: {
  value: number;
  label: string;
  emoji: string;
  format?: "pts" | "%";
}) {
  const display = format === "pts"
    ? `${value} pts`
    : format === "%"
      ? `${value}%`
      : String(value);

  return (
    <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 text-center">
      <div className="text-xl mb-1">{emoji}</div>
      <div className="text-xl font-black text-slate-900">{display}</div>
      <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{label}</div>
    </div>
  );
}
