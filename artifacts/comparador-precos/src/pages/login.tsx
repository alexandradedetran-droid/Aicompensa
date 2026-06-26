import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { setCurrentUser } from "@/lib/current-user";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function AiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <path d="M20 5L4 35" stroke="url(#loginLg)" strokeWidth="5.5" strokeLinecap="round"/>
      <path d="M20 5L36 35" stroke="url(#loginLg)" strokeWidth="5.5" strokeLinecap="round"/>
      <circle cx="20" cy="26" r="4" fill="#F2C14E"/>
      <defs>
        <linearGradient id="loginLg" x1="20" y1="5" x2="20" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD97A"/>
          <stop offset="1" stopColor="#D4A017"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Digite um e-mail válido.");
      return;
    }
    if (!senha) {
      setError("Digite sua senha.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/usuarios/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: cleanEmail, senha }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao entrar. Tente novamente.");
        return;
      }

      setCurrentUser({
        id: data.id,
        nome: data.nome,
        email: data.email,
        cidade: data.cidade,
        estado: data.estado,
        apiToken: data.apiToken ?? undefined,
        isAdmin: data.isAdmin ?? false,
      });
      const returnTo = sessionStorage.getItem("loginReturnTo");
      sessionStorage.removeItem("loginReturnTo");
      setLocation(returnTo ?? "/");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

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
          <p className="text-slate-400 text-sm mt-1">Descubra onde realmente compensa comprar</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl p-6 space-y-4 shadow-xl"
          style={{ background: "#1d0e36", border: "1px solid rgba(58,24,103,0.5)" }}
        >
          <h2 className="text-white font-bold text-lg">Entrar na sua conta</h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-900/40 border border-red-500/40 text-red-300 text-sm rounded-xl p-3"
            >
              {error}
            </motion.div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              className="w-full text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border transition-colors"
              style={{ background: "#130926", borderColor: "#3a1867" }}
              onFocus={(e) => e.target.style.borderColor = "#F2C14E"}
              onBlur={(e) => e.target.style.borderColor = "#3a1867"}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <div className="relative">
              <input
                type={showSenha ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => { setSenha(e.target.value); setError(""); }}
                className="w-full text-white placeholder-slate-600 rounded-xl px-4 py-3 pr-12 text-sm outline-none border transition-colors"
                style={{ background: "#130926", borderColor: "#3a1867" }}
                onFocus={(e) => e.target.style.borderColor = "#F2C14E"}
                onBlur={(e) => e.target.style.borderColor = "#3a1867"}
              />
              <button
                type="button"
                onClick={() => setShowSenha((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-lg"
                tabIndex={-1}
              >
                {showSenha ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full font-black rounded-2xl py-4 text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #F2C14E, #D4A017)", color: "#130926" }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setLocation("/cadastro")}
              className="text-sm font-semibold transition-colors"
              style={{ color: "#F2C14E" }}
            >
              Ainda não tenho conta →
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Acesso administrativo?{" "}
          <a href="/admin-login" className="text-slate-500 hover:text-slate-400 underline">
            Entrar como admin
          </a>
        </p>
      </motion.div>
    </div>
  );
}
