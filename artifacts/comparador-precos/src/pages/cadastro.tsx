import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useCreateUsuario } from "@workspace/api-client-react";
import { setCurrentUser } from "@/lib/current-user";

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO",
];

interface FormState {
  nome: string;
  email: string;
  senha: string;
  confirmarSenha: string;
  cidade: string;
  estado: string;
  codigoIndicacao: string;
}

interface FormErrors {
  nome?: string;
  email?: string;
  senha?: string;
  confirmarSenha?: string;
  cidade?: string;
  estado?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <path d="M20 5L4 35" stroke="url(#cadLg)" strokeWidth="5.5" strokeLinecap="round"/>
      <path d="M20 5L36 35" stroke="url(#cadLg)" strokeWidth="5.5" strokeLinecap="round"/>
      <circle cx="20" cy="26" r="4" fill="#F2C14E"/>
      <defs>
        <linearGradient id="cadLg" x1="20" y1="5" x2="20" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD97A"/>
          <stop offset="1" stopColor="#D4A017"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Cadastro() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<FormState>({
    nome: "", email: "", senha: "", confirmarSenha: "", cidade: "", estado: "", codigoIndicacao: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [showCodigoField, setShowCodigoField] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      setForm((f) => ({ ...f, codigoIndicacao: ref.trim().toUpperCase() }));
      setShowCodigoField(true);
    }
  }, []);

  const { mutate: createUsuario, isPending } = useCreateUsuario();

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setServerError("");
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (form.nome.trim().length < 3) e.nome = "Nome deve ter pelo menos 3 caracteres.";
    if (!EMAIL_RE.test(form.email.trim())) e.email = "Digite um e-mail válido.";
    if (form.senha.length < 6) e.senha = "Senha deve ter pelo menos 6 caracteres.";
    if (form.senha !== form.confirmarSenha) e.confirmarSenha = "As senhas não coincidem.";
    if (!form.cidade.trim()) e.cidade = "Cidade é obrigatória.";
    if (!form.estado) e.estado = "Estado é obrigatório.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    createUsuario(
      {
        data: {
          nome: form.nome.trim(),
          email: form.email.trim().toLowerCase(),
          senha: form.senha,
          cidade: form.cidade.trim(),
          estado: form.estado,
          ...(form.codigoIndicacao.trim() ? { codigoIndicacao: form.codigoIndicacao.trim().toUpperCase() } : {}),
        },
      },
      {
        onSuccess: (user) => {
          setCurrentUser({
            id: user.id,
            nome: user.nome,
            email: user.email,
            cidade: user.cidade,
            estado: user.estado,
            apiToken: user.apiToken ?? undefined,
            isAdmin: user.isAdmin ?? false,
          });
          const returnTo = sessionStorage.getItem("loginReturnTo");
          sessionStorage.removeItem("loginReturnTo");
          setLocation(returnTo ?? "/");
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          const msg = data?.error;
          if (msg?.includes("e-mail")) {
            setErrors((prev) => ({ ...prev, email: msg }));
          } else {
            setServerError(msg ?? "Erro ao criar conta. Tente novamente.");
          }
        },
      }
    );
  }

  const inputCls = (field: keyof FormErrors) =>
    `w-full text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border transition-colors ${
      errors[field] ? "border-red-500" : ""
    }`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
         style={{ background: "linear-gradient(160deg, #1a0933 0%, #130926 60%, #0d0620 100%)" }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl mb-4"
               style={{ background: "linear-gradient(135deg, #1e0d38, #2d1262)", boxShadow: "0 8px 32px rgba(242,193,78,0.2)" }}>
            <AiLogo className="h-12 w-12" />
          </div>
          <h1 className="text-2xl font-black">
            <span style={{ color: "#F2C14E" }}>ai</span><span className="text-white">compens</span><span style={{ color: "#F2C14E" }}>a</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Crie sua conta e comece a economizar</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl p-6 space-y-4 shadow-xl"
              style={{ background: "#1d0e36", border: "1px solid rgba(58,24,103,0.5)" }}>
          <h2 className="text-white font-bold text-lg mb-1">Criar conta</h2>

          {serverError && (
            <div className="bg-red-900/40 border border-red-500/40 text-red-300 text-sm rounded-xl p-3">
              {serverError}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Nome <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              autoComplete="name"
              placeholder="Ex: João Silva"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              className={inputCls("nome")}
              style={{ background: "#130926", borderColor: errors.nome ? undefined : "#3a1867" }}
            />
            {errors.nome && <p className="text-red-400 text-xs mt-1">{errors.nome}</p>}
          </div>

          {/* E-mail */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              E-mail <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputCls("email")}
              style={{ background: "#130926", borderColor: errors.email ? undefined : "#3a1867" }}
            />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Senha */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Senha <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showSenha ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                value={form.senha}
                onChange={(e) => set("senha", e.target.value)}
                className={inputCls("senha") + " pr-12"}
                style={{ background: "#130926", borderColor: errors.senha ? undefined : "#3a1867" }}
              />
              <button type="button" onClick={() => setShowSenha((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-lg"
                tabIndex={-1}>
                {showSenha ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.senha && <p className="text-red-400 text-xs mt-1">{errors.senha}</p>}
          </div>

          {/* Confirmar Senha */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Confirmar senha <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmar ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={form.confirmarSenha}
                onChange={(e) => set("confirmarSenha", e.target.value)}
                className={inputCls("confirmarSenha") + " pr-12"}
                style={{ background: "#130926", borderColor: errors.confirmarSenha ? undefined : "#3a1867" }}
              />
              <button type="button" onClick={() => setShowConfirmar((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-lg"
                tabIndex={-1}>
                {showConfirmar ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.confirmarSenha && <p className="text-red-400 text-xs mt-1">{errors.confirmarSenha}</p>}
          </div>

          {/* Cidade */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Cidade <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              autoComplete="address-level2"
              placeholder="Ex: São Paulo"
              value={form.cidade}
              onChange={(e) => set("cidade", e.target.value)}
              className={inputCls("cidade")}
              style={{ background: "#130926", borderColor: errors.cidade ? undefined : "#3a1867" }}
            />
            {errors.cidade && <p className="text-red-400 text-xs mt-1">{errors.cidade}</p>}
          </div>

          {/* Estado */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Estado <span className="text-red-400">*</span>
            </label>
            <select
              value={form.estado}
              onChange={(e) => set("estado", e.target.value)}
              className={inputCls("estado") + " appearance-none"}
              style={{ background: "#130926", borderColor: errors.estado ? undefined : "#3a1867" }}
            >
              <option value="">Selecione</option>
              {ESTADOS.map((uf) => (
                <option key={uf} value={uf} className="text-white bg-[#1d0e36]">{uf}</option>
              ))}
            </select>
            {errors.estado && <p className="text-red-400 text-xs mt-1">{errors.estado}</p>}
          </div>

          {/* Código de indicação */}
          {!showCodigoField ? (
            <button
              type="button"
              onClick={() => setShowCodigoField(true)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors w-full text-left"
            >
              🎁 Tenho um código de indicação
            </button>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Código de indicação <span className="text-slate-600 font-normal normal-case">(opcional)</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                placeholder="Ex: ABC123"
                value={form.codigoIndicacao}
                onChange={(e) => set("codigoIndicacao", e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border transition-colors tracking-widest font-bold"
                style={{ background: "#130926", borderColor: "#3a1867" }}
              />
              <p className="text-slate-600 text-[11px] mt-1">Quem te convidou recebe +100 pontos 🎉</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full font-black rounded-2xl py-4 text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            style={{ background: "linear-gradient(135deg, #F2C14E, #D4A017)", color: "#130926" }}
          >
            {isPending ? "Criando conta..." : "Criar conta"}
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="text-sm font-semibold transition-colors"
              style={{ color: "#F2C14E" }}
            >
              ← Já tenho conta
            </button>
          </div>

          <p className="text-center text-xs text-slate-500">
            Seus dados ficam seguros e não são compartilhados.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
