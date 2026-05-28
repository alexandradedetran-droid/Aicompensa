import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { setCurrentUser } from "@/lib/current-user";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCPFInput(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanCPF = cpf.replace(/\D/g, "");
    const cleanTel = telefone.replace(/\D/g, "");

    if (cleanCPF.length !== 11) {
      setError("Digite o CPF completo (11 dígitos).");
      return;
    }
    if (cleanTel.length !== 11) {
      setError("Digite o telefone completo com DDD.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/usuarios/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCPF, telefone: cleanTel }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao entrar. Tente novamente.");
        return;
      }

      setCurrentUser({
        id: data.id,
        nome: data.nome,
        telefone: data.telefone,
        cpf: data.cpf,
        cidade: data.cidade,
        estado: data.estado,
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
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500 shadow-lg mb-4">
            <span className="text-3xl">🛒</span>
          </div>
          <h1 className="text-white text-2xl font-black">Comparador de Preços</h1>
          <p className="text-slate-400 text-sm mt-1">Encontre as melhores ofertas da sua cidade</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#1e293b] rounded-3xl p-6 space-y-4 shadow-xl"
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

          {/* CPF */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              CPF
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => {
                setCpf(maskCPFInput(e.target.value));
                setError("");
              }}
              className="w-full bg-[#0f172a] text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border border-[#334155] focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Telefone (com DDD)
            </label>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="(11) 99999-9999"
              value={telefone}
              onChange={(e) => {
                setTelefone(maskTelefone(e.target.value));
                setError("");
              }}
              className="w-full bg-[#0f172a] text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border border-[#334155] focus:border-emerald-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black rounded-2xl py-4 text-base transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setLocation("/cadastro")}
              className="text-emerald-400 hover:text-emerald-300 text-sm font-semibold transition-colors"
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
