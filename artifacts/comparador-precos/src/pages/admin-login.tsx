import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { setAdminSession } from "@/lib/admin-auth";
import { setExtraHeaders } from "@workspace/api-client-react";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [usuario, setUsuario]   = useState("");
  const [senha, setSenha]       = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha }),
      });

      const data = (await res.json()) as { token?: string; error?: string };

      if (!res.ok || !data.token) {
        setError(data.error ?? "Usuário ou senha inválidos.");
        return;
      }

      setAdminSession(data.token);
      setExtraHeaders({ "x-admin-token": data.token });
      setLocation("/admin");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-4">
            <span className="text-3xl">🛡️</span>
          </div>
          <h1 className="text-2xl font-black text-white">Painel Admin</h1>
          <p className="text-sm text-gray-400 mt-1">Comparador de Preços</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Entrar</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Usuário
              </label>
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                required
                placeholder="admin"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-700">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Acesso restrito a administradores
          </p>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          <a href="/" className="hover:text-gray-300 transition-colors">← Voltar ao app</a>
        </p>
      </div>
    </div>
  );
}
