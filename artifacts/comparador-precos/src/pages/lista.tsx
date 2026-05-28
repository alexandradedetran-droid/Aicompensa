import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Plus, Trash2, Search, CheckCircle, Store, TrendingDown, Loader2 } from "lucide-react";
import { useListOfertas, getListOfertasQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface ListaItem {
  id: string;
  nome: string;
  adicionadoEm: string;
}

/* ── localStorage helpers ──────────────────────────────────────────────────── */

const STORAGE_KEY = "comparador_lista_compras";

function loadLista(): ListaItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveLista(items: ListaItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/* ── Currency formatter ────────────────────────────────────────────────────── */

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function Lista() {
  const [items, setItems] = useState<ListaItem[]>(loadLista);
  const [input, setInput]   = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  /* Fetch offers to find best prices */
  const { data: ofertas = [], isLoading } = useListOfertas(
    {},
    { query: { queryKey: getListOfertasQueryKey() } }
  );

  /* For each list item, find the best offer matching that product name */
  const matches = useMemo(() => {
    return items.map((item) => {
      const keyword = item.nome.toLowerCase().trim();
      const found = ofertas
        .filter((o) => o.produto.toLowerCase().includes(keyword))
        .sort((a, b) => a.preco - b.preco);
      return { item, melhorOferta: found[0] ?? null, count: found.length };
    });
  }, [items, ofertas]);

  /* Total economy: sum of (max - min) for items that have matches */
  const economia = useMemo(() => {
    let total = 0;
    for (const { item, melhorOferta } of matches) {
      if (!melhorOferta) continue;
      const keyword = item.nome.toLowerCase().trim();
      const precos = ofertas
        .filter((o) => o.produto.toLowerCase().includes(keyword))
        .map((o) => o.preco);
      if (precos.length > 1) {
        total += Math.max(...precos) - Math.min(...precos);
      }
    }
    return total;
  }, [matches, ofertas]);

  /* Total if buying cheapest for each item */
  const totalMinimo = useMemo(() =>
    matches.reduce((s, { melhorOferta }) => s + (melhorOferta?.preco ?? 0), 0),
    [matches]
  );

  function addItem() {
    const nome = input.trim();
    if (!nome || nome.length < 2) {
      toast.error("Digite pelo menos 2 caracteres.");
      return;
    }
    if (items.some((i) => i.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error("Item já está na lista.");
      return;
    }
    const next = [
      ...items,
      { id: crypto.randomUUID(), nome, adicionadoEm: new Date().toISOString() },
    ];
    setItems(next);
    saveLista(next);
    setInput("");
    toast.success(`"${nome}" adicionado à lista!`);
  }

  function removeItem(id: string) {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    saveLista(next);
    setChecked((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  function toggleCheck(id: string) {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function clearChecked() {
    const next = items.filter((i) => !checked.has(i.id));
    setItems(next);
    saveLista(next);
    setChecked(new Set());
    toast.success("Itens comprados removidos!");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-gray-50 pb-6"
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-4 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-0.5">
          <button
            onClick={() => window.history.back()}
            className="p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Voltar"
          >
            ←
          </button>
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-black text-foreground">Minha Lista</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Adicione produtos e veja os melhores preços disponíveis
        </p>
      </div>

      {/* ── Economy strip (when items have matches) ───────────────────── */}
      {economia > 0.01 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3"
        >
          <TrendingDown className="h-8 w-8 text-emerald-600 shrink-0" />
          <div>
            <p className="font-black text-emerald-800 text-sm">
              💰 Economize até {R(economia)} na sua lista!
            </p>
            <p className="text-emerald-600 text-xs mt-0.5">
              Comprando no mercado mais barato para cada item.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Input ────────────────────────────────────────────────────── */}
      <div className="px-4 mt-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Adicionar produto (ex: arroz, leite...)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
              className="w-full pl-9 pr-4 h-11 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
          </div>
          <button
            onClick={addItem}
            className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-sm shadow-primary/20"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────────────────── */}
      <div className="px-4 mt-4 space-y-3 flex-1">

        {/* Summary row */}
        {items.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">
              {items.length} {items.length === 1 ? "item" : "itens"} na lista
              {isLoading && <Loader2 className="inline h-3 w-3 ml-1.5 animate-spin" />}
            </p>
            {checked.size > 0 && (
              <button
                onClick={clearChecked}
                className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
              >
                Remover {checked.size} comprado{checked.size > 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center py-20"
            >
              <div className="text-5xl mb-4">🛒</div>
              <h3 className="font-black text-lg text-foreground mb-1">Lista vazia</h3>
              <p className="text-sm text-muted-foreground">
                Adicione produtos para ver os melhores preços da comunidade.
              </p>
            </motion.div>
          ) : (
            matches.map(({ item, melhorOferta, count }) => {
              const isChecked = checked.has(item.id);
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isChecked ? "opacity-60 border-gray-200" : "border-border"}`}>
                    <div className="flex items-start gap-3 p-3.5">

                      {/* Check circle */}
                      <button
                        onClick={() => toggleCheck(item.id)}
                        className={`mt-0.5 h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                          isChecked
                            ? "bg-emerald-500 border-emerald-500"
                            : "border-gray-300 hover:border-emerald-400"
                        }`}
                      >
                        {isChecked && <CheckCircle className="h-4 w-4 text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm leading-snug ${isChecked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.nome}
                        </p>

                        {/* Best offer */}
                        {melhorOferta ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1.5 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-emerald-700 font-black text-base leading-none">
                                    {R(melhorOferta.preco)}
                                  </p>
                                  <p className="text-emerald-600 text-[10px] font-semibold mt-0.5 flex items-center gap-1">
                                    <Store className="h-3 w-3" />
                                    {melhorOferta.mercado}
                                    {melhorOferta.bairro && ` · ${melhorOferta.bairro}`}
                                  </p>
                                </div>
                                <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                                  {count} {count === 1 ? "oferta" : "ofertas"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            {isLoading
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Buscando preços...</>
                              : "⚠️ Nenhuma oferta encontrada ainda."
                            }
                          </p>
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors p-1 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>

        {/* Total footer */}
        {items.length > 0 && totalMinimo > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-border p-4 mt-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total mínimo estimado</p>
                <p className="font-black text-2xl text-primary leading-tight">{R(totalMinimo)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">comprando no</p>
                <p className="text-xs font-bold text-foreground">melhor preço</p>
              </div>
            </div>
            {economia > 0.01 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs font-bold text-emerald-600">
                  🎉 Você economizaria {R(economia)} comparado ao preço mais alto!
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
