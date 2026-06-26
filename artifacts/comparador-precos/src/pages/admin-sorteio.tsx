import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { customFetch } from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Regra = "manual" | "cupom_publicacao" | "cupom_validacao" | "cupom_pontos" | "cupom_saldo" | "minimo_pontos" | "todos_ativos";

const REGRA_OPTIONS: { value: Regra; label: string; needsValor?: boolean; valorLabel?: string; desc?: string }[] = [
  { value: "manual",           label: "Participação manual",         desc: "Usuário entra pelo app — importe manualmente abaixo." },
  { value: "cupom_saldo",      label: "Saldo de cupons acumulados",  desc: "Tickets proporcionais aos cupons ganhos na plataforma." },
  { value: "cupom_publicacao", label: "1 cupom por oferta publicada", desc: "Contagem de ofertas publicadas como tickets." },
  { value: "cupom_validacao",  label: "1 cupom por confirmação feita", desc: "Contagem de confirmações de preço como tickets." },
  { value: "cupom_pontos",     label: "1 cupom a cada X pontos",     desc: "Saldo de pontos convertido em tickets.", needsValor: true, valorLabel: "Pontos por cupom (X)" },
  { value: "minimo_pontos",    label: "Mínimo de pontos",            desc: "1 ticket por usuário acima do mínimo.", needsValor: true, valorLabel: "Pontos mínimos" },
  { value: "todos_ativos",     label: "Todos os usuários ativos",    desc: "1 ticket para cada usuário não bloqueado." },
];

const STATUS_BADGE: Record<string, string> = {
  ativo:     "bg-lime-100 text-lime-700",
  encerrado: "bg-gray-100 text-gray-600",
  cancelado: "bg-red-100 text-red-600",
};
const STATUS_LABEL: Record<string, string> = {
  ativo:     "✅ Ativo",
  encerrado: "🏁 Encerrado",
  cancelado: "❌ Cancelado",
};

interface SorteioItem {
  id: number;
  nome: string;
  premio: string;
  descricao: string | null;
  imagemUrl: string | null;
  dataFim: string;
  regra: Regra;
  regraValor: number | null;
  status: "ativo" | "encerrado" | "cancelado";
  ativo: boolean;
  criadoEm: string;
  totalParticipantes: number;
  totalCupons: number;
  ganhador: { nomeUsuario: string; premio: string; dataSorteio: string } | null;
}

interface Participante {
  usuarioId: number;
  nome: string;
  pontos: number;
  cupons: number;
  nivel: string;
  probabilidade: string;
}

interface DrawResult {
  ganhador: {
    usuarioId: number;
    nome: string;
    pontos: number;
    nivel: string;
    cupons: number;
    probabilidade: string;
  };
  premio: string;
  dataSorteio: string;
  totalParticipantes: number;
  totalCupons: number;
  roll: number;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SorteioAdminTab() {
  const [sorteios, setSorteios]           = useState<SorteioItem[]>([]);
  const [loading, setLoading]             = useState(true);
  const [view, setView]                   = useState<"list" | "create" | "detail">("list");
  const [selected, setSelected]           = useState<SorteioItem | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [totalCupons, setTotalCupons]     = useState(0);
  const [partsLoading, setPartsLoading]   = useState(false);
  const [drawResult, setDrawResult]       = useState<DrawResult | null>(null);
  const [drawing, setDrawing]             = useState(false);
  const [confirmDraw, setConfirmDraw]     = useState(false);
  const [cancelling, setCancelling]       = useState(false);

  // Import participants state
  const [importing, setImporting]         = useState(false);
  const [importMsg, setImportMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  // Change regra state
  const [editRegra, setEditRegra]         = useState(false);
  const [newRegra, setNewRegra]           = useState<Regra>("cupom_saldo");
  const [newRegraValor, setNewRegraValor] = useState("100");
  const [savingRegra, setSavingRegra]     = useState(false);

  // Create form state
  const [nome, setNome]           = useState("");
  const [premio, setPremio]       = useState("");
  const [descricao, setDescricao] = useState("");
  const [imagemUrl, setImagemUrl] = useState("");
  const [dataFim, setDataFim]     = useState("");
  const [regra, setRegra]         = useState<Regra>("cupom_saldo");
  const [regraValor, setRegraValor] = useState<string>("100");
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  const regraOpt = REGRA_OPTIONS.find(o => o.value === regra);

  const loadSorteios = useCallback(async () => {
    setLoading(true);
    try {
      const data = await customFetch<SorteioItem[]>("/api/admin/sorteios");
      setSorteios(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void loadSorteios(); }, [loadSorteios]);

  const loadParticipantes = useCallback(async (id: number) => {
    setPartsLoading(true);
    try {
      const data = await customFetch<{ participantes: Participante[]; totalParticipantes: number; totalCupons: number }>(
        `/api/admin/sorteios/${id}/participantes`,
      );
      setParticipantes(data.participantes);
      setTotalCupons(data.totalCupons);
    } catch { /* ignore */ }
    setPartsLoading(false);
  }, []);

  const openDetail = async (s: SorteioItem) => {
    setSelected(s);
    setDrawResult(null);
    setConfirmDraw(false);
    setImportMsg(null);
    setEditRegra(false);
    setNewRegra(s.regra);
    setNewRegraValor(String(s.regraValor ?? 100));
    setView("detail");
    await loadParticipantes(s.id);
  };

  const handleCreate = async () => {
    setFormError("");
    if (!nome || !premio || !dataFim) { setFormError("Preencha nome, prêmio e data/hora."); return; }
    setSaving(true);
    try {
      await customFetch("/api/admin/sorteios", {
        method: "POST",
        body: JSON.stringify({
          nome, premio,
          descricao: descricao || undefined,
          imagemUrl: imagemUrl || undefined,
          dataFim: new Date(dataFim).toISOString(),
          regra,
          regraValor: regraOpt?.needsValor ? parseInt(regraValor) : undefined,
        }),
      });
      setNome(""); setPremio(""); setDescricao(""); setImagemUrl(""); setDataFim("");
      setRegra("cupom_saldo"); setRegraValor("100");
      setView("list");
      await loadSorteios();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar sorteio.");
    }
    setSaving(false);
  };

  const handleImportParticipantes = async () => {
    if (!selected) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const data = await customFetch<{ importados: number; mensagem: string }>(
        `/api/admin/sorteios/${selected.id}/importar-participantes`,
        { method: "POST" },
      );
      setImportMsg({ ok: data.importados > 0, text: data.mensagem });
      if (data.importados > 0) {
        await loadParticipantes(selected.id);
        await loadSorteios();
      }
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao importar." });
    }
    setImporting(false);
  };

  const handleChangeRegra = async () => {
    if (!selected) return;
    setSavingRegra(true);
    const newRegraOpt = REGRA_OPTIONS.find(o => o.value === newRegra);
    try {
      await customFetch(`/api/admin/sorteios/${selected.id}/regra`, {
        method: "PATCH",
        body: JSON.stringify({
          regra: newRegra,
          regraValor: newRegraOpt?.needsValor ? parseInt(newRegraValor) : null,
        }),
      });
      setSelected(s => s ? {
        ...s,
        regra: newRegra,
        regraValor: newRegraOpt?.needsValor ? parseInt(newRegraValor) : null,
      } : s);
      setEditRegra(false);
      setImportMsg(null);
      await loadParticipantes(selected.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao alterar regra.");
    }
    setSavingRegra(false);
  };

  const handleDraw = async () => {
    if (!selected) return;
    setDrawing(true);
    setConfirmDraw(false);
    try {
      const data = await customFetch<DrawResult>(`/api/admin/sorteios/${selected.id}/sortear`, { method: "POST" });
      setDrawResult(data);
      await loadSorteios();
      await loadParticipantes(selected.id);
      setSelected(s => s ? { ...s, status: "encerrado", ativo: false } : s);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao realizar sorteio.");
    }
    setDrawing(false);
  };

  const handleCancel = async () => {
    if (!selected) return;
    if (!window.confirm(`Cancelar o sorteio "${selected.nome}"? Esta ação não pode ser desfeita.`)) return;
    setCancelling(true);
    try {
      await customFetch(`/api/admin/sorteios/${selected.id}/cancelar`, { method: "POST" });
      setSelected(s => s ? { ...s, status: "cancelado", ativo: false } : s);
      await loadSorteios();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao cancelar.");
    }
    setCancelling(false);
  };

  // ── Views ──────────────────────────────────────────────────────────────────

  if (view === "create") {
    const createRegraOpt = REGRA_OPTIONS.find(o => o.value === regra);
    return (
      <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 p-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setView("list")} className="text-gray-400 hover:text-gray-600 text-sm">← Voltar</button>
          <h2 className="font-black text-gray-800 text-base">Novo Sorteio</h2>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nome do sorteio *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={100}
              placeholder="Ex: Sorteio Semana Santa"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-lime-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Prêmio *</label>
            <input value={premio} onChange={e => setPremio(e.target.value)} maxLength={200}
              placeholder="Ex: R$50 em supermercado"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-lime-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Descrição <span className="font-normal text-gray-400">(opcional)</span></label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={500} rows={2}
              placeholder="Detalhes adicionais sobre o sorteio..."
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-lime-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Imagem <span className="font-normal text-gray-400">(URL, opcional)</span></label>
            <input value={imagemUrl} onChange={e => setImagemUrl(e.target.value)}
              placeholder="https://..."
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-lime-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Data/hora do sorteio *</label>
            <input type="datetime-local" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-lime-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Regra de participação</label>
            <select value={regra} onChange={e => setRegra(e.target.value as Regra)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-lime-400">
              {REGRA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {createRegraOpt?.desc && (
              <p className="text-[11px] text-gray-400 mt-1 px-1">{createRegraOpt.desc}</p>
            )}
          </div>

          {createRegraOpt?.needsValor && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{createRegraOpt.valorLabel}</label>
              <input type="number" min={1} value={regraValor} onChange={e => setRegraValor(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-lime-400" />
            </div>
          )}

          {formError && (
            <p className="text-xs text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button onClick={() => void handleCreate()} disabled={saving}
            className="w-full bg-lime-400 text-lime-900 font-black text-sm py-3 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all">
            {saving ? "⏳ Criando..." : "🎲 Criar sorteio"}
          </button>
        </div>
      </motion.div>
    );
  }

  if (view === "detail" && selected) {
    const isEncerrado = selected.status === "encerrado";
    const isCancelado = selected.status === "cancelado";
    const canDraw     = selected.status === "ativo" && participantes.length > 0 && !partsLoading;
    const regraDef    = REGRA_OPTIONS.find(o => o.value === selected.regra);
    const newRegraOpt = REGRA_OPTIONS.find(o => o.value === newRegra);
    const zeroroParts = !partsLoading && participantes.length === 0;

    return (
      <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 p-4">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => { setView("list"); setDrawResult(null); }} className="text-gray-400 hover:text-gray-600 text-sm">← Voltar</button>
          <h2 className="font-black text-gray-800 text-base truncate">{selected.nome}</h2>
          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[selected.status]}`}>
            {STATUS_LABEL[selected.status]}
          </span>
        </div>

        {/* Info card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          {selected.imagemUrl && (
            <img src={selected.imagemUrl} alt={selected.nome}
              className="w-full h-32 object-cover rounded-xl mb-3" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-black text-gray-800 text-base">🎁 {selected.premio}</p>
              {selected.descricao && <p className="text-xs text-gray-500 mt-0.5">{selected.descricao}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-base font-black text-lime-600">{participantes.length}</p>
              <p className="text-[10px] text-gray-500">Participantes</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-base font-black text-lime-600">{totalCupons}</p>
              <p className="text-[10px] text-gray-500">Cupons totais</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-base font-black text-gray-700 text-[11px] leading-tight mt-1">
                {new Date(selected.dataFim).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-[10px] text-gray-500">Data sorteio</p>
            </div>
          </div>

          {/* Regra row with edit toggle */}
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-gray-400">
              📋 {regraDef?.label ?? selected.regra}
              {selected.regraValor ? ` (${selected.regraValor})` : ""}
            </p>
            {!isEncerrado && !isCancelado && (
              <button onClick={() => setEditRegra(v => !v)}
                className="text-[11px] text-blue-500 font-bold hover:text-blue-700 transition-colors">
                {editRegra ? "Fechar ✕" : "Alterar regra ✏️"}
              </button>
            )}
          </div>

          {/* Change regra panel */}
          <AnimatePresence>
            {editRegra && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                  <label className="block text-xs font-bold text-gray-600">Nova regra</label>
                  <select value={newRegra} onChange={e => setNewRegra(e.target.value as Regra)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {REGRA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {newRegraOpt?.desc && (
                    <p className="text-[11px] text-gray-400 px-1">{newRegraOpt.desc}</p>
                  )}
                  {newRegraOpt?.needsValor && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">{newRegraOpt.valorLabel}</label>
                      <input type="number" min={1} value={newRegraValor}
                        onChange={e => setNewRegraValor(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                  )}
                  <button onClick={() => void handleChangeRegra()} disabled={savingRegra}
                    className="w-full bg-blue-500 text-white font-bold text-xs py-2.5 rounded-xl disabled:opacity-40 transition-all">
                    {savingRegra ? "Salvando..." : "✔ Salvar nova regra"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Winner banner */}
        <AnimatePresence>
          {(drawResult ?? (isEncerrado && selected.ganhador)) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-br from-yellow-400 to-orange-400 rounded-2xl p-5 shadow-md text-white"
            >
              <p className="font-black text-xl text-center mb-3">🏆 Vencedor!</p>
              <div className="bg-white/20 rounded-xl p-4 text-center space-y-1">
                <p className="text-2xl font-black">
                  {drawResult?.ganhador.nome ?? selected.ganhador?.nomeUsuario}
                </p>
                {drawResult && <p className="text-sm opacity-90">{drawResult.ganhador.nivel} · {drawResult.ganhador.pontos} pts</p>}
                {drawResult && <p className="text-xs opacity-80">{drawResult.ganhador.cupons} cupons · {drawResult.ganhador.probabilidade}% de chance</p>}
                <p className="font-bold text-base mt-2">🎁 {drawResult?.premio ?? selected.ganhador?.premio}</p>
                <p className="text-xs opacity-70">
                  {new Date(drawResult?.dataSorteio ?? selected.ganhador?.dataSorteio ?? "").toLocaleString("pt-BR")}
                </p>
                {drawResult && (
                  <p className="text-xs opacity-70 mt-1">
                    {drawResult.totalParticipantes} participantes · {drawResult.totalCupons} cupons · 🎰 rolou {drawResult.roll}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Import / refresh participants */}
        {!isEncerrado && !isCancelado && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-gray-800">🔄 Atualizar participantes</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {selected.regra === "manual"
                    ? "Importa usuários com saldo de cupons para este sorteio."
                    : "Recalcula a lista com base na regra atual."}
                </p>
              </div>
              <button
                onClick={() => void handleImportParticipantes()}
                disabled={importing}
                className="shrink-0 bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl disabled:opacity-40 active:scale-95 transition-all"
              >
                {importing ? "⏳ Importando..." : "🔄 Atualizar"}
              </button>
            </div>

            <AnimatePresence>
              {importMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`text-xs font-medium px-3 py-2 rounded-lg ${importMsg.ok ? "bg-lime-50 text-lime-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {importMsg.ok ? "✅" : "⚠️"} {importMsg.text}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Draw / Cancel actions */}
        {!isEncerrado && !isCancelado && (
          <div className="space-y-2">
            {zeroroParts && !confirmDraw && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-amber-700 text-center mb-1">
                  ⚠️ Nenhum participante elegível
                </p>
                <p className="text-[11px] text-amber-600 text-center leading-relaxed">
                  Clique em <strong>🔄 Atualizar</strong> acima para importar usuários,
                  ou altere a regra para <strong>"Todos os usuários ativos"</strong>.
                </p>
              </div>
            )}

            {!confirmDraw ? (
              <button
                onClick={() => setConfirmDraw(true)}
                disabled={!canDraw || drawing}
                title={zeroroParts ? "Adicione participantes antes de sortear" : ""}
                className="w-full bg-orange-500 text-white font-black text-sm py-3.5 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {drawing ? "⏳ Sorteando..." : "🎲 Sortear agora"}
                {canDraw && !drawing && <span className="text-xs opacity-80">({participantes.length} participantes)</span>}
              </button>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-bold text-orange-800 text-center">
                  ⚠️ Confirmar sorteio?
                </p>
                <p className="text-xs text-orange-600 text-center">
                  {participantes.length} participantes · {totalCupons} cupons no total.<br/>
                  O sorteio será encerrado e o vencedor notificado.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDraw(false)} className="flex-1 bg-gray-200 text-gray-700 font-bold text-sm py-2.5 rounded-xl">
                    Cancelar
                  </button>
                  <button onClick={() => void handleDraw()} disabled={drawing}
                    className="flex-1 bg-orange-500 text-white font-black text-sm py-2.5 rounded-xl disabled:opacity-50">
                    {drawing ? "Sorteando..." : "🎲 Confirmar"}
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => void handleCancel()} disabled={cancelling}
              className="w-full border border-red-200 text-red-500 font-bold text-xs py-2 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-40">
              {cancelling ? "Cancelando..." : "❌ Cancelar sorteio"}
            </button>
          </div>
        )}

        {/* Participants table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-black text-gray-800 text-sm">👥 Participantes</h3>
            <span className="text-xs text-gray-400">{participantes.length} usuários · {totalCupons} cupons</span>
          </div>

          {partsLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm animate-pulse">Calculando participantes...</div>
          ) : participantes.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-3xl mb-2">👥</p>
              <p className="text-sm font-bold">Sem participantes</p>
              <p className="text-xs mt-1 text-gray-400 leading-relaxed">
                {selected.regra === "manual"
                  ? 'Use "🔄 Atualizar" para importar usuários com cupons.'
                  : "Não há usuários elegíveis para a regra atual."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 text-gray-500 font-bold">#</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-bold">Nome</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-bold">Pts</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-bold">Cupons</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-bold">Chance</th>
                  </tr>
                </thead>
                <tbody>
                  {participantes.map((p, i) => (
                    <tr key={p.usuarioId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-gray-800">{p.nome}</p>
                        <p className="text-[10px] text-gray-400">{p.nivel}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{p.pontos.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-lime-600">{p.cupons}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{p.probabilidade}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-gray-800 text-base">🎲 Sorteios</h2>
        <button onClick={() => setView("create")}
          className="bg-lime-400 text-lime-900 font-black text-xs px-4 py-2 rounded-xl active:scale-95 transition-all">
          + Novo sorteio
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : sorteios.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🎲</p>
          <p className="font-bold">Nenhum sorteio criado ainda</p>
          <p className="text-sm mt-1">Crie o primeiro sorteio para a comunidade!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorteios.map(s => (
            <button key={s.id} onClick={() => void openDetail(s)} className="w-full text-left">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:scale-[0.99] transition-all">
                <div className="flex items-start gap-3">
                  {s.imagemUrl ? (
                    <img src={s.imagemUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center text-xl shrink-0">🎁</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-black text-gray-800 text-sm truncate">{s.nome}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[s.status]}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">🎁 {s.premio}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span>👥 {s.totalParticipantes}</span>
                      <span>🎫 {s.totalCupons} cupons</span>
                      <span>📅 {new Date(s.dataFim).toLocaleDateString("pt-BR")}</span>
                    </div>
                    {s.ganhador && (
                      <p className="text-[11px] text-orange-600 font-bold mt-1">🏆 {s.ganhador.nomeUsuario}</p>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
