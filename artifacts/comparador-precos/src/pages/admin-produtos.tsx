import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getAdminToken } from "@/lib/admin-auth";
import { toast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminProduto {
  id: string;
  nome: string;
  marca: string | null;
  categoria: string | null;
  subcategoria: string | null;
  unidade: string | null;
  quantidade: string | null;
  codigoBarras: string | null;
  imagemPremiumUrl: string | null;
  imagemOriginalUrl: string | null;
  statusImagem: string;
  totalOfertas: number;
  criadoEm: string | null;
  atualizadoEm: string | null;
}

interface ProdutosPage {
  items: AdminProduto[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  pendente: { label: "Pendente", cls: "bg-yellow-100 text-yellow-700 border-yellow-200",  dot: "🟡" },
  gerando:  { label: "Gerando",  cls: "bg-blue-100 text-blue-700 border-blue-200",        dot: "🔵" },
  pronta:   { label: "Pronta",   cls: "bg-green-100 text-green-700 border-green-200",     dot: "🟢" },
  erro:     { label: "Erro",     cls: "bg-red-100 text-red-700 border-red-200",           dot: "🔴" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200", dot: "⚪" };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", cfg.cls)}>
      {cfg.dot} {cfg.label}
    </span>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["pendente", "gerando", "pronta", "erro"];

function EditModal({
  produto,
  onClose,
  onSave,
  saving,
}: {
  produto: AdminProduto;
  onClose: () => void;
  onSave: (id: string, data: Partial<AdminProduto>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    nome:         produto.nome         ?? "",
    marca:        produto.marca        ?? "",
    categoria:    produto.categoria    ?? "",
    subcategoria: produto.subcategoria ?? "",
    unidade:      produto.unidade      ?? "",
    quantidade:   produto.quantidade   ?? "",
    codigoBarras: produto.codigoBarras ?? "",
    statusImagem: produto.statusImagem ?? "pendente",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const payload: Partial<AdminProduto> = {};
    if (form.nome         !== (produto.nome         ?? "")) payload.nome         = form.nome         || null as any;
    if (form.marca        !== (produto.marca        ?? "")) payload.marca        = form.marca        || null as any;
    if (form.categoria    !== (produto.categoria    ?? "")) payload.categoria    = form.categoria    || null as any;
    if (form.subcategoria !== (produto.subcategoria ?? "")) payload.subcategoria = form.subcategoria || null as any;
    if (form.unidade      !== (produto.unidade      ?? "")) payload.unidade      = form.unidade      || null as any;
    if (form.quantidade   !== (produto.quantidade   ?? "")) payload.quantidade   = form.quantidade   || null as any;
    if (form.codigoBarras !== (produto.codigoBarras ?? "")) payload.codigoBarras = form.codigoBarras || null as any;
    if (form.statusImagem !== produto.statusImagem)         payload.statusImagem = form.statusImagem;
    onSave(produto.id, payload);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-base">📦</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-gray-900 text-sm truncate">{produto.nome}</h3>
            <p className="text-[10px] text-gray-400">{produto.id.slice(0, 8)}…</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {([
            { key: "nome",         label: "Nome",          type: "text" },
            { key: "marca",        label: "Marca",         type: "text" },
            { key: "categoria",    label: "Categoria",     type: "text" },
            { key: "subcategoria", label: "Subcategoria",  type: "text" },
            { key: "unidade",      label: "Unidade",       type: "text" },
            { key: "quantidade",   label: "Quantidade",    type: "text" },
            { key: "codigoBarras", label: "Código de barras", type: "text" },
          ] as { key: keyof typeof form; label: string; type: string }[]).map(({ key, label, type }) => (
            <div key={key}>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          ))}

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Status Imagem</label>
            <select
              value={form.statusImagem}
              onChange={(e) => set("statusImagem", e.target.value)}
              className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none bg-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.dot} {STATUS_CONFIG[s]?.label ?? s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black transition-colors disabled:opacity-50"
            style={{ background: "#1e1b4b" }}
          >
            {saving ? "Salvando…" : "✅ Salvar"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main tab component ────────────────────────────────────────────────────────

export default function AdminProdutosTab() {
  const [items, setItems]   = useState<AdminProduto[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pages, setPages]   = useState(1);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca]   = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [editTarget, setEditTarget] = useState<AdminProduto | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());

  const token = getAdminToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-admin-token"] = token;

  const fetchItems = useCallback(async (p: number, b: string, s: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "30" });
      if (b) params.set("busca", b);
      if (s) params.set("statusImagem", s);
      const res = await fetch(`/api/admin/produtos?${params}`, { headers, credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      const data: ProdutosPage = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch {
      toast({ title: "Erro ao carregar produtos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchItems(1, busca, statusFiltro); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchItems(1, busca, statusFiltro);
  };

  const handleStatusFilter = (s: string) => {
    setStatusFiltro(s);
    setPage(1);
    void fetchItems(1, busca, s);
  };

  const handlePage = (p: number) => {
    setPage(p);
    void fetchItems(p, busca, statusFiltro);
  };

  const handleRegenerar = async (id: string) => {
    setRegenerating((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/produtos/${id}/regenerar-imagem`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error("failed");
      toast({ title: "🎨 Regeneração iniciada!" });
      void fetchItems(page, busca, statusFiltro);
    } catch {
      toast({ title: "Erro ao regenerar imagem", variant: "destructive" });
    } finally {
      setRegenerating((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleSave = async (id: string, data: Partial<AdminProduto>) => {
    if (Object.keys(data).length === 0) { setEditTarget(null); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/produtos/${id}`, {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("failed");
      toast({ title: "✅ Produto atualizado!" });
      setEditTarget(null);
      void fetchItems(page, busca, statusFiltro);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Status counts for the header
  const counts = items.reduce<Record<string, number>>((acc, p) => {
    acc[p.statusImagem] = (acc[p.statusImagem] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <motion.div key="produtos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

      {/* ── Header ── */}
      <div
        className="rounded-2xl p-4 text-white"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #312e81 100%)" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📦</span>
              <h2 className="text-base font-black text-white">Catálogo de Produtos</h2>
            </div>
            <p className="text-slate-400 text-xs">Produtos identificados pela comunidade · imagens geradas por IA</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded-full">{total} total</span>
              {Object.entries(STATUS_CONFIG).map(([s, cfg]) =>
                counts[s] ? (
                  <span key={s} className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", cfg.cls)}>
                    {cfg.dot} {counts[s]} {cfg.label.toLowerCase()}
                  </span>
                ) : null
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar por nome…"
          className="flex-1 min-w-[180px] h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white text-gray-700"
        />
        <select
          value={statusFiltro}
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none bg-white text-gray-700"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
            <option key={s} value={s}>{cfg.dot} {cfg.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-xl text-sm font-bold text-white transition-colors"
          style={{ background: "#1e1b4b" }}
        >
          Buscar
        </button>
      </form>

      {/* ── Table ── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-4xl mb-3">📦</span>
          <p className="text-gray-500 text-sm font-medium">Nenhum produto encontrado.</p>
          <p className="text-gray-400 text-xs mt-1">Os produtos são criados automaticamente ao publicar ofertas.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 text-gray-500 text-[11px] font-semibold uppercase tracking-wide border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 text-left w-14">Img</th>
                <th className="px-3 py-2.5 text-left">Produto</th>
                <th className="px-3 py-2.5 text-left">Categoria</th>
                <th className="px-2 py-2.5 text-center">Ofertas</th>
                <th className="px-3 py-2.5 text-center">Imagem</th>
                <th className="px-3 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                  {/* Thumbnail */}
                  <td className="px-3 py-2.5">
                    {p.imagemPremiumUrl ? (
                      <a href={p.imagemPremiumUrl} target="_blank" rel="noreferrer">
                        <img
                          src={p.imagemPremiumUrl}
                          alt={p.nome}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 hover:scale-110 transition-transform"
                        />
                      </a>
                    ) : p.imagemOriginalUrl ? (
                      <a href={p.imagemOriginalUrl} target="_blank" rel="noreferrer">
                        <img
                          src={p.imagemOriginalUrl}
                          alt={p.nome}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 opacity-60 hover:opacity-100 transition-opacity"
                        />
                      </a>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg">📦</div>
                    )}
                  </td>

                  {/* Name + brand */}
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-gray-900 leading-tight line-clamp-1">{p.nome}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      {[p.marca, p.unidade && p.quantidade ? `${p.quantidade} ${p.unidade}` : (p.unidade ?? p.quantidade)].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </td>

                  {/* Category */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-600">{p.categoria ?? "—"}</span>
                    {p.subcategoria && (
                      <span className="block text-[10px] text-gray-400">{p.subcategoria}</span>
                    )}
                  </td>

                  {/* Total offers */}
                  <td className="px-2 py-2.5 text-center">
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {p.totalOfertas}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={p.statusImagem} />
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 justify-center">
                      <button
                        onClick={() => setEditTarget(p)}
                        className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 transition-colors"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => void handleRegenerar(p.id)}
                        disabled={regenerating.has(p.id) || p.statusImagem === "gerando"}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Regenerar imagem"
                      >
                        {regenerating.has(p.id) ? "…" : "🎨"}
                      </button>
                      {p.imagemPremiumUrl && (
                        <a
                          href={p.imagemPremiumUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100 transition-colors"
                          title="Ver imagem premium"
                        >
                          🖼️
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div className="flex justify-center gap-1.5 flex-wrap">
          {Array.from({ length: pages }, (_, i) => i + 1)
            .slice(Math.max(0, page - 3), page + 3)
            .map((p) => (
              <button
                key={p}
                onClick={() => handlePage(p)}
                className={cn(
                  "w-8 h-8 rounded-lg text-sm font-bold transition-colors",
                  p === page ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                )}
                style={p === page ? { background: "#1e1b4b" } : {}}
              >
                {p}
              </button>
            ))}
        </div>
      )}

      {/* ── Edit modal ── */}
      <AnimatePresence>
        {editTarget && (
          <EditModal
            produto={editTarget}
            onClose={() => setEditTarget(null)}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
