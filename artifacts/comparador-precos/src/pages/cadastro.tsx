import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useCreateUsuario } from "@workspace/api-client-react";
import { setCurrentUser } from "@/lib/current-user";

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO",
];

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

function validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

interface FormState {
  nome: string;
  telefone: string;
  cpf: string;
  cidade: string;
  estado: string;
}

interface FormErrors {
  nome?: string;
  telefone?: string;
  cpf?: string;
  cidade?: string;
  estado?: string;
}

export default function Cadastro() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<FormState>({ nome: "", telefone: "", cpf: "", cidade: "", estado: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState("");

  const { mutate: createUsuario, isPending } = useCreateUsuario();

  function validate(): boolean {
    const e: FormErrors = {};
    if (form.nome.trim().length < 5) e.nome = "Nome deve ter pelo menos 5 caracteres.";
    const telDigits = form.telefone.replace(/\D/g, "");
    if (telDigits.length !== 11) e.telefone = "Telefone deve ter 11 dígitos, incluindo DDD.";
    if (!validateCPF(form.cpf)) e.cpf = "CPF inválido. Verifique os dígitos.";
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
          telefone: form.telefone.replace(/\D/g, ""),
          cpf: form.cpf.replace(/\D/g, ""),
          cidade: form.cidade.trim(),
          estado: form.estado,
        },
      },
      {
        onSuccess: (user) => {
          setCurrentUser({
            id: user.id,
            nome: user.nome,
            telefone: user.telefone,
            cpf: user.cpf,
            cidade: user.cidade,
            estado: user.estado,
          });
          const returnTo = sessionStorage.getItem("loginReturnTo");
          sessionStorage.removeItem("loginReturnTo");
          setLocation(returnTo ?? "/");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          if (msg?.includes("CPF já cadastrado")) {
            setErrors((prev) => ({ ...prev, cpf: "CPF já cadastrado. Tente outro." }));
          } else if (msg?.includes("Telefone já cadastrado")) {
            setErrors((prev) => ({ ...prev, telefone: "Telefone já cadastrado. Tente outro." }));
          } else {
            setServerError(msg ?? "Erro ao criar conta. Tente novamente.");
          }
        },
      }
    );
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
          <p className="text-slate-400 text-sm mt-1">Crie sua conta para começar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1e293b] rounded-3xl p-6 space-y-4 shadow-xl">
          <h2 className="text-white font-bold text-lg mb-1">Criar conta</h2>

          {serverError && (
            <div className="bg-red-900/40 border border-red-500/40 text-red-300 text-sm rounded-xl p-3">
              {serverError}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Nome completo <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: João da Silva"
              value={form.nome}
              onChange={(e) => {
                setForm((f) => ({ ...f, nome: e.target.value }));
                if (errors.nome) setErrors((er) => ({ ...er, nome: undefined }));
              }}
              className={`w-full bg-[#0f172a] text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border ${errors.nome ? "border-red-500" : "border-[#334155] focus:border-emerald-500"} transition-colors`}
            />
            {errors.nome && <p className="text-red-400 text-xs mt-1">{errors.nome}</p>}
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Telefone (com DDD) <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="(11) 99999-9999"
              value={form.telefone}
              onChange={(e) => {
                setForm((f) => ({ ...f, telefone: maskTelefone(e.target.value) }));
                if (errors.telefone) setErrors((er) => ({ ...er, telefone: undefined }));
              }}
              className={`w-full bg-[#0f172a] text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border ${errors.telefone ? "border-red-500" : "border-[#334155] focus:border-emerald-500"} transition-colors`}
            />
            {errors.telefone && <p className="text-red-400 text-xs mt-1">{errors.telefone}</p>}
          </div>

          {/* CPF */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              CPF <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={(e) => {
                setForm((f) => ({ ...f, cpf: maskCPFInput(e.target.value) }));
                if (errors.cpf) setErrors((er) => ({ ...er, cpf: undefined }));
              }}
              className={`w-full bg-[#0f172a] text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border ${errors.cpf ? "border-red-500" : "border-[#334155] focus:border-emerald-500"} transition-colors`}
            />
            {errors.cpf && <p className="text-red-400 text-xs mt-1">{errors.cpf}</p>}
          </div>

          {/* Cidade */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Cidade <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: São Paulo"
              value={form.cidade}
              onChange={(e) => {
                setForm((f) => ({ ...f, cidade: e.target.value }));
                if (errors.cidade) setErrors((er) => ({ ...er, cidade: undefined }));
              }}
              className={`w-full bg-[#0f172a] text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none border ${errors.cidade ? "border-red-500" : "border-[#334155] focus:border-emerald-500"} transition-colors`}
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
              onChange={(e) => {
                setForm((f) => ({ ...f, estado: e.target.value }));
                if (errors.estado) setErrors((er) => ({ ...er, estado: undefined }));
              }}
              className={`w-full bg-[#0f172a] text-white rounded-xl px-4 py-3 text-sm outline-none border ${errors.estado ? "border-red-500" : "border-[#334155] focus:border-emerald-500"} transition-colors appearance-none`}
            >
              <option value="" className="text-slate-500">Selecione um estado</option>
              {ESTADOS.map((uf) => (
                <option key={uf} value={uf} className="text-white bg-[#1e293b]">{uf}</option>
              ))}
            </select>
            {errors.estado && <p className="text-red-400 text-xs mt-1">{errors.estado}</p>}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black rounded-2xl py-4 text-base transition-colors mt-2"
          >
            {isPending ? "Criando conta..." : "Cadastrar"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Seus dados ficam seguros e não são compartilhados.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
