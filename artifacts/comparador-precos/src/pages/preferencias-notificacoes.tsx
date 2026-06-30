import { useState, useRef } from "react";
import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { customFetch } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { LoginGate } from "@/lib/login-prompt";
import { getCurrentUser } from "@/lib/current-user";
import { useSeo } from "@/lib/seo";
import { usePush } from "@/hooks/use-push";
import { PushPermissionCard } from "@/components/push-permission-card";

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES: { key: string; emoji: string }[] = [
  { key: "Açougue",    emoji: "🥩" },
  { key: "Hortifruti", emoji: "🥦" },
  { key: "Bebidas",    emoji: "🥤" },
  { key: "Limpeza",    emoji: "🧹" },
  { key: "Mercearia",  emoji: "🛒" },
  { key: "Padaria",    emoji: "🍞" },
  { key: "Laticínios", emoji: "🥛" },
  { key: "Higiene",    emoji: "🧴" },
  { key: "Bebê",       emoji: "👶" },
  { key: "Pet",        emoji: "🐾" },
  { key: "Congelados", emoji: "❄️" },
  { key: "Outros",     emoji: "📦" },
];

/** Known supermarket chains — used as primary checkbox options. */
const MERCADOS_CONHECIDOS = [
  "Comper", "Atacadão", "Pague Menos", "Fort", "Assaí",
  "Carrefour", "Extra", "Pão de Açúcar", "Dia", "Sam's Club",
  "Hortifruti Natural", "Mercadinho", "Outros",
];

const SUGESTOES_PRODUTO: { slug: string; nome: string; emoji: string }[] = [
  { slug: "carne",            nome: "Carne",            emoji: "🥩" },
  { slug: "cafe",             nome: "Café",             emoji: "☕" },
  { slug: "leite",            nome: "Leite",            emoji: "🥛" },
  { slug: "cerveja",          nome: "Cerveja",          emoji: "🍺" },
  { slug: "fralda",           nome: "Fralda",           emoji: "👶" },
  { slug: "arroz",            nome: "Arroz",            emoji: "🍚" },
  { slug: "ovos",             nome: "Ovos",             emoji: "🥚" },
  { slug: "frango",           nome: "Frango",           emoji: "🍗" },
  { slug: "sabao",            nome: "Sabão",            emoji: "🧼" },
  { slug: "papel higienico",  nome: "Papel higiênico",  emoji: "🧻" },
];

const DISTANCIA_OPTIONS = [
  { km: 1,    label: "1 km" },
  { km: 3,    label: "3 km" },
  { km: 5,    label: "5 km" },
  { km: 10,   label: "10 km" },
  { km: 25,   label: "25 km" },
  { km: null, label: "Qualquer" },
];

const FREQ_OPTIONS: {
  value: "imediata" | "diario" | "semanal" | "desligado";
  label: string; desc: string; color: string;
}[] = [
  { value: "imediata",  label: "⚡ Imediata",        desc: "Receba assim que surgir",          color: "border-[#F2C14E] bg-[#F2C14E]/10 text-[#D4A017]"     },
  { value: "diario",    label: "📅 Resumo diário",   desc: "Receba uma vez por dia",           color: "border-blue-400 bg-blue-50 text-blue-800"     },
  { value: "semanal",   label: "📆 Resumo semanal",  desc: "Receba uma vez por semana",        color: "border-purple-400 bg-purple-50 text-purple-800"},
  { value: "desligado", label: "🔕 Desligado",       desc: "Não receber notificações",         color: "border-red-300 bg-red-50 text-red-700"        },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ── Normalization helper (mirrors backend) ────────────────────────────────────

function normalizeKw(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ");
}

function getDisplayNome(slug: string): string {
  const found = SUGESTOES_PRODUTO.find(s => s.slug === slug);
  return found ? `${found.emoji} ${found.nome}` : slug;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifToggles {
  ofertasLista:       boolean;
  listaCompartilhada: boolean;
  mercadosFavoritos:  boolean;
  quedaPreco:         boolean;
  resumoSemanal:      boolean;
  novidades:          boolean;
  marketing:          boolean;
  pushEnabled:        boolean;
}

const DEFAULT_TOGGLES: NotifToggles = {
  ofertasLista: true, listaCompartilhada: true, mercadosFavoritos: true,
  quedaPreco: true, resumoSemanal: true, novidades: true,
  marketing: false, pushEnabled: false,
};

const TOGGLE_LABELS: { key: keyof NotifToggles; emoji: string; label: string; desc: string }[] = [
  { key: "ofertasLista",       emoji: "🛒", label: "Ofertas na lista",        desc: "Quando um produto da sua lista aparecer em oferta"  },
  { key: "listaCompartilhada", emoji: "👥", label: "Lista compartilhada",      desc: "Quando alguém editar ou marcar item na lista"       },
  { key: "mercadosFavoritos",  emoji: "🏪", label: "Mercados favoritos",       desc: "Novidades nos mercados que você acompanha"          },
  { key: "quedaPreco",         emoji: "📉", label: "Queda de preço",           desc: "Quando o preço de um produto favorito cair"         },
  { key: "resumoSemanal",      emoji: "📊", label: "Resumo semanal",           desc: "Resumo de economia e atividade da semana"           },
  { key: "novidades",          emoji: "✨", label: "Novidades do app",         desc: "Novas funcionalidades e melhorias"                  },
  { key: "marketing",          emoji: "🎁", label: "Promoções e ofertas",      desc: "Comunicações de marketing e campanhas especiais"    },
  { key: "pushEnabled",        emoji: "🔔", label: "Notificações push",        desc: "Receber avisos mesmo com o app fechado"             },
];

interface Prefs {
  categorias:              string[];
  distanciaMaxKm:          number | null;
  latitude:                string | null;
  longitude:               string | null;
  mercadosFavoritos:       string[];
  palavrasChave:           string[];
  frequencia:              "imediata" | "diario" | "semanal" | "desligado";
  horarioSilenciosoInicio: number;
  horarioSilenciosoFim:    number;
}

// ── MercadoSelector ───────────────────────────────────────────────────────────

function MercadoSelector({
  values,
  onChange,
  dbMercados,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  dbMercados: string[];
}) {
  const [search, setSearch] = useState("");

  // Merge known list + DB extras (case-insensitive dedup)
  const allMercados = [...MERCADOS_CONHECIDOS];
  for (const m of dbMercados) {
    if (!allMercados.some(k => k.toLowerCase() === m.toLowerCase())) {
      allMercados.push(m);
    }
  }

  const filtered = allMercados.filter(m =>
    !search || m.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (m: string) => {
    if (values.includes(m)) {
      onChange(values.filter(v => v !== m));
    } else {
      onChange([...values, m]);
    }
  };

  return (
    <div>
      {/* Selected chips */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {values.map(v => (
            <span key={v} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">
              🏪 {v}
              <button
                onClick={() => toggle(v)}
                className="text-blue-400 hover:text-red-500 transition-colors ml-0.5"
              >✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Pesquisar mercado..."
          className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
          >✕</button>
        )}
      </div>

      {/* Checkbox list */}
      <div className="rounded-xl border border-gray-200 overflow-hidden max-h-52 overflow-y-auto">
        {filtered.map((m, idx) => {
          const selected = values.includes(m);
          return (
            <label
              key={m}
              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
                ${idx > 0 ? "border-t border-gray-100" : ""}
                ${selected ? "bg-blue-50" : "hover:bg-gray-50"}`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(m)}
                className="w-4 h-4 accent-blue-500 rounded shrink-0"
              />
              <span className={`text-sm font-medium flex-1 ${selected ? "text-blue-800" : "text-gray-700"}`}>
                {m}
              </span>
              {selected && <span className="text-blue-400 text-xs shrink-0">✓</span>}
            </label>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-5">Nenhum mercado encontrado</p>
        )}
      </div>
    </div>
  );
}

// ── ProdutoSelector ───────────────────────────────────────────────────────────

function ProdutoSelector({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addKeyword = (raw: string) => {
    const slug = normalizeKw(raw);
    if (!slug || values.includes(slug)) { setInput(""); return; }
    onChange([...values, slug]);
    setInput("");
  };

  const remove = (v: string) => onChange(values.filter(x => x !== v));

  const toggleSugestao = (slug: string) => {
    if (values.includes(slug)) remove(slug);
    else onChange([...values, slug]);
  };

  // Custom keywords (not in sugestoes list)
  const customValues = values.filter(v => !SUGESTOES_PRODUTO.some(s => s.slug === v));

  return (
    <div>
      {/* Quick suggestion chips */}
      <p className="text-[11px] font-bold text-gray-500 mb-2">Sugestões rápidas — toque para selecionar:</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {SUGESTOES_PRODUTO.map(s => {
          const selected = values.includes(s.slug);
          return (
            <button
              key={s.slug}
              onClick={() => toggleSugestao(s.slug)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all
                ${selected
                  ? "border-[#F2C14E] bg-[#F2C14E]/15 text-[#D4A017]"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
            >
              <span>{s.emoji}</span>
              <span>{s.nome}</span>
            </button>
          );
        })}
      </div>

      {/* Custom added chips */}
      {customValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {customValues.map(v => (
            <span key={v} className="flex items-center gap-1 bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1.5 rounded-full">
              🔍 {v}
              <button onClick={() => remove(v)} className="text-purple-400 hover:text-red-500 transition-colors ml-0.5">✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Add custom interest */}
      {adding ? (
        <div className="flex gap-2 mt-1">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && input.trim()) { e.preventDefault(); addKeyword(input); }
              if (e.key === "Escape") { setAdding(false); setInput(""); }
            }}
            autoFocus
            placeholder="Ex: coca-cola, detergente..."
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F2C14E]"
          />
          <button
            onClick={() => { if (input.trim()) { addKeyword(input); } else { setAdding(false); } }}
            className="shrink-0 bg-[#F2C14E] text-[#130926] font-bold text-sm px-3 py-2 rounded-xl whitespace-nowrap"
          >
            {input.trim() ? "Adicionar" : "Cancelar"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-sm text-[#D4A017] font-bold hover:text-[#B8900E] transition-colors mt-1"
        >
          <span className="text-base leading-none">➕</span>
          Adicionar interesse
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function PreferenciasContent() {
  useSeo({ title: "Preferências de Notificação · AíCompensa" });

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dbMercados, setDbMercados] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const [toggles, setToggles]   = useState<NotifToggles>(DEFAULT_TOGGLES);
  const { supported, permission, subscribed, loading: pushLoading, subscribe, unsubscribe } = usePush();

  const [prefs, setPrefs] = useState<Prefs>({
    categorias: [], distanciaMaxKm: 5, latitude: null, longitude: null,
    mercadosFavoritos: [], palavrasChave: [],
    frequencia: "imediata", horarioSilenciosoInicio: 22, horarioSilenciosoFim: 7,
  });

  useEffect(() => {
    Promise.all([
      customFetch<Prefs>("/api/notificacoes/preferencias"),
      customFetch<string[]>("/api/notificacoes/mercados-sugeridos"),
      customFetch<NotifToggles>("/api/notificacoes/preferences").catch(() => DEFAULT_TOGGLES),
    ])
      .then(([p, m, t]) => {
        setPrefs({
          ...p,
          distanciaMaxKm: p.distanciaMaxKm ?? 5,
          frequencia: p.frequencia as Prefs["frequencia"],
        });
        setDbMercados(m);
        setToggles({ ...DEFAULT_TOGGLES, ...t });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleCategoria = (key: string) => {
    setPrefs(p => ({
      ...p,
      categorias: p.categorias.includes(key)
        ? p.categorias.filter(c => c !== key)
        : [...p.categorias, key],
    }));
  };

  const allCategorias = prefs.categorias.length === 0;

  const getLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS não disponível neste dispositivo." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPrefs(p => ({ ...p, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) }));
        setLocating(false);
        toast({ title: "📍 Localização salva!" });
      },
      () => {
        setLocating(false);
        toast({ title: "Não foi possível obter a localização.", variant: "destructive" });
      },
      { timeout: 10000 },
    );
  };

  const handlePushToggle = async () => {
    if (toggles.pushEnabled) {
      await unsubscribe();
      setToggles(t => ({ ...t, pushEnabled: false }));
      return;
    }
    if (!supported) {
      toast({ title: "Notificações push não são suportadas neste navegador." });
      return;
    }
    const result = await subscribe();
    if (result === "subscribed" || result === "already") {
      setToggles(t => ({ ...t, pushEnabled: true }));
      toast({ title: "🔔 Notificações ativadas!" });
    } else if (result === "denied") {
      toast({
        title: "Permissão negada",
        description: "Ative nas configurações do navegador.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Não foi possível ativar as notificações.", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        customFetch("/api/notificacoes/preferencias", {
          method: "PUT",
          body: JSON.stringify({
            ...prefs,
            latitude:  prefs.latitude  != null ? Number(prefs.latitude)  : null,
            longitude: prefs.longitude != null ? Number(prefs.longitude) : null,
          }),
        }),
        customFetch("/api/notificacoes/preferences", {
          method: "PATCH",
          body: JSON.stringify(toggles),
        }),
      ]);
      toast({ title: "✅ Preferências atualizadas com sucesso!" });
    } catch {
      toast({ title: "Erro ao salvar preferências.", variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#F2C14E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pb-8 space-y-5">

      {/* ── 1. Categorias ──────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-black text-gray-800 text-sm">📂 Categorias</h2>
          <button
            onClick={() => setPrefs(p => ({ ...p, categorias: [] }))}
            className="text-[11px] font-bold text-[#D4A017] hover:text-amber-800"
          >
            {allCategorias ? "✅ Todas ativas" : "Ativar todas"}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          {allCategorias
            ? "Recebendo alertas de todas as categorias."
            : `Filtrando ${prefs.categorias.length} categoria(s) selecionada(s).`}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map(c => {
            const active = allCategorias || prefs.categorias.includes(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggleCategoria(c.key)}
                className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all text-center
                  ${active
                    ? "border-[#F2C14E] bg-[#F2C14E]/10 text-[#D4A017]"
                    : "border-gray-200 bg-gray-50 text-gray-400"}`}
              >
                <span className="text-xl">{c.emoji}</span>
                <span className="text-[10px] font-bold leading-tight">{c.key}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 2. Distância máxima ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-black text-gray-800 text-sm mb-1">📍 Distância máxima</h2>
        <p className="text-[11px] text-gray-400 mb-3">
          Maior distância = mais notificações.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {DISTANCIA_OPTIONS.map(opt => (
            <button
              key={String(opt.km)}
              onClick={() => setPrefs(p => ({ ...p, distanciaMaxKm: opt.km }))}
              className={`py-2 rounded-xl border-2 text-sm font-bold transition-all
                ${prefs.distanciaMaxKm === opt.km
                  ? "border-blue-400 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-gray-50 text-gray-500"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {prefs.distanciaMaxKm !== null && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            {prefs.latitude && prefs.longitude ? (
              <div className="flex-1 text-[11px] text-gray-500">
                📍 Localização: {Number(prefs.latitude).toFixed(4)}, {Number(prefs.longitude).toFixed(4)}
              </div>
            ) : (
              <div className="flex-1 text-[11px] text-amber-600 font-medium">
                ⚠️ Informe sua localização para filtrar por distância
              </div>
            )}
            <button
              onClick={getLocation}
              disabled={locating}
              className="shrink-0 bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-all"
            >
              {locating ? "⏳" : "📡 GPS"}
            </button>
          </div>
        )}
      </section>

      {/* ── 3. Mercados favoritos ──────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-black text-gray-800 text-sm mb-1">🏪 Mercados favoritos</h2>
        <p className="text-[11px] text-gray-400 mb-3">
          {prefs.mercadosFavoritos.length === 0
            ? "Nenhum selecionado — recebendo de qualquer mercado."
            : `${prefs.mercadosFavoritos.length} mercado(s) selecionado(s).`}
        </p>
        <MercadoSelector
          values={prefs.mercadosFavoritos}
          onChange={v => setPrefs(p => ({ ...p, mercadosFavoritos: v }))}
          dbMercados={dbMercados}
        />
      </section>

      {/* ── 4. Produtos de interesse ───────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-black text-gray-800 text-sm mb-1">🔍 Produtos de interesse</h2>
        <p className="text-[11px] text-gray-400 mb-3">
          {prefs.palavrasChave.length === 0
            ? "Nenhum selecionado — recebendo alertas de todos os produtos."
            : `${prefs.palavrasChave.length} produto(s) de interesse.`}
        </p>
        <ProdutoSelector
          values={prefs.palavrasChave}
          onChange={v => setPrefs(p => ({ ...p, palavrasChave: v }))}
        />
      </section>

      {/* ── 5. Frequência ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-black text-gray-800 text-sm mb-3">⏱️ Frequência</h2>
        <div className="space-y-2">
          {FREQ_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPrefs(p => ({ ...p, frequencia: opt.value }))}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                ${prefs.frequencia === opt.value ? opt.color : "border-gray-200 bg-gray-50 text-gray-600"}`}
            >
              <div className="flex-1">
                <p className="font-bold text-sm">{opt.label}</p>
                <p className="text-[11px] opacity-70 mt-0.5">{opt.desc}</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                ${prefs.frequencia === opt.value ? "border-current" : "border-gray-300"}`}>
                {prefs.frequencia === opt.value && (
                  <div className="w-2 h-2 rounded-full bg-current" />
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── 6. Horário silencioso ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-black text-gray-800 text-sm mb-1">🌙 Horário silencioso</h2>
        <p className="text-[11px] text-gray-400 mb-4">
          Não enviar notificações neste intervalo (horário de Brasília).
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-gray-500 mb-1">Das</label>
            <select
              value={prefs.horarioSilenciosoInicio}
              onChange={e => setPrefs(p => ({ ...p, horarioSilenciosoInicio: Number(e.target.value) }))}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F2C14E]"
            >
              {HOURS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
          <div className="text-gray-400 font-bold mt-4">→</div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-gray-500 mb-1">Até</label>
            <select
              value={prefs.horarioSilenciosoFim}
              onChange={e => setPrefs(p => ({ ...p, horarioSilenciosoFim: Number(e.target.value) }))}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F2C14E]"
            >
              {HOURS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 text-center">
          {prefs.horarioSilenciosoInicio === prefs.horarioSilenciosoFim
            ? "⚠️ Início igual ao fim — horário silencioso desativado"
            : prefs.horarioSilenciosoInicio > prefs.horarioSilenciosoFim
              ? `🌙 Silêncio das ${String(prefs.horarioSilenciosoInicio).padStart(2, "0")}h às ${String(prefs.horarioSilenciosoFim).padStart(2, "0")}h (período noturno)`
              : `🌙 Silêncio das ${String(prefs.horarioSilenciosoInicio).padStart(2, "0")}h às ${String(prefs.horarioSilenciosoFim).padStart(2, "0")}h`}
        </p>
      </section>

      {/* ── 7. Tipos de notificação ───────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-black text-gray-800 text-sm mb-1">🔔 O que você quer receber</h2>
        <p className="text-[11px] text-gray-400 mb-3">Escolha quais tipos de notificação te interessam.</p>

        {/* Push permission card — só aparece quando não tem permissão */}
        {!subscribed && permission !== "granted" && (
          <div className="mb-4">
            <PushPermissionCard
              onEnabled={() => setToggles(t => ({ ...t, pushEnabled: true }))}
            />
          </div>
        )}

        <div className="space-y-1">
          {TOGGLE_LABELS.map((item, idx) => {
            const active = toggles[item.key];
            const isPush = item.key === "pushEnabled";
            return (
              <label
                key={item.key}
                className={`flex items-center gap-3 py-3 px-1 cursor-pointer transition-colors ${idx > 0 ? "border-t border-gray-100" : ""}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{item.emoji}</span>
                    <span className={`text-sm font-bold ${active ? "text-gray-800" : "text-gray-400"}`}>{item.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 ml-6">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  disabled={isPush && pushLoading}
                  onClick={() => isPush ? void handlePushToggle() : setToggles(t => ({ ...t, [item.key]: !t[item.key] }))}
                  className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${active ? "bg-[#F2C14E]" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${active ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </label>
            );
          })}
        </div>
      </section>

      {/* ── Save ─────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 pt-2 pb-1 bg-gray-50">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full bg-[#F2C14E] text-[#130926] font-black text-base py-4 rounded-2xl shadow-md disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="w-5 h-5 border-2 border-[#B8900E] border-t-transparent rounded-full animate-spin" />
              Salvando...
            </>
          ) : "✅ Salvar preferências"}
        </button>
      </div>
    </motion.div>
  );
}

// ── Page wrapper ─────────────────────────────────────────────────────────────

export default function PreferenciasNotificacoes() {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return <LoginGate returnTo="/preferencias-notificacoes" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link href="/perfil">
          <button className="text-gray-400 hover:text-gray-700 transition-colors p-1 -ml-1">
            ← Voltar
          </button>
        </Link>
        <div>
          <h1 className="font-black text-gray-800 text-base leading-tight">🔔 Preferências de Notificação</h1>
          <p className="text-[11px] text-gray-400">Controle o que você recebe</p>
        </div>
      </div>

      <div className="px-4 pt-4">
        <PreferenciasContent />
      </div>
    </div>
  );
}
