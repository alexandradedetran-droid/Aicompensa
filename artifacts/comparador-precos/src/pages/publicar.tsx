import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { MapPin, Loader2, Tag, Store, DollarSign, Calendar, Hash, Camera, X } from "lucide-react";
import { useCreateOferta, getListOfertasQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";
import { LoginGate } from "@/lib/login-prompt";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = ["Alimentos", "Bebidas", "Limpeza", "Higiene", "Carnes", "Hortifruti", "Bebê", "Pet", "Outros"];

const schema = z.object({
  produto:   z.string().min(2,  "Informe o nome do produto"),
  categoria: z.string().min(1,  "Selecione uma categoria"),
  marca:     z.string().optional(),
  preco:     z.coerce.number().positive("O preço deve ser maior que zero"),
  mercado:   z.string().min(2,  "Informe o nome do mercado"),
  bairro:    z.string().min(2,  "Informe o bairro"),
  cidade:    z.string().min(2,  "Informe a cidade"),
  validade:  z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const MAX_B64_CHARS = 500 * 1024; // 512 000 chars — mirrors the backend limit

/**
 * Resize image to max 900px on longest side, output JPEG base64.
 * Progressively lowers quality until the base64 string fits within MAX_B64_CHARS.
 */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 900;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else                { width  = Math.round((width  * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

        // Try progressively lower quality until it fits within the size limit
        const qualities = [0.78, 0.65, 0.50, 0.35, 0.20];
        for (const q of qualities) {
          const b64 = canvas.toDataURL("image/jpeg", q);
          if (b64.length <= MAX_B64_CHARS) {
            resolve(b64);
            return;
          }
        }
        // If even 0.20 quality is too large, reject with a clear message
        reject(new Error("Imagem muito grande mesmo após compressão. Tente uma foto com menos detalhes."));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

// Outer wrapper: auth check before any hooks
export default function Publicar() {
  if (!getCurrentUser()) {
    return <LoginGate returnTo="/publicar" />;
  }
  return <PublicarForm />;
}

function PublicarForm() {
  const [, setLocation]   = useLocation();
  const queryClient       = useQueryClient();
  const [isLocating, setIsLocating] = useState(false);
  const [coords,     setCoords]     = useState<{ lat: number; lng: number } | null>(null);
  const [photoB64,   setPhotoB64]   = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateOferta();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      produto: "", categoria: "", marca: "",
      preco: undefined as unknown as number,
      mercado: "", bairro: "", cidade: "", validade: "",
    },
  });

  /* ── Camera / file handler with simulated OCR ── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setOcrDone(false);
    try {
      const b64 = await resizeImage(file);
      setPhotoB64(b64);
      // Simulate OCR analysis
      setOcrLoading(true);
      await new Promise((r) => setTimeout(r, 1600));
      setOcrLoading(false);
      setOcrDone(true);
      toast.success("📸 Etiqueta analisada! Confira e ajuste os dados.");
    } catch {
      toast.error("Erro ao processar a imagem. Tente novamente.");
    } finally {
      setPhotoLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = () => setPhotoB64(null);

  /* ── GPS ── */
  const getLocation = () => {
    if (!navigator.geolocation) { toast.error("Seu navegador não suporta geolocalização"); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setIsLocating(false); toast.success("Localização capturada!"); },
      ()    => { toast.error("Erro ao capturar localização. Verifique as permissões.");  setIsLocating(false); },
      { timeout: 10000 }
    );
  };

  /* ── Submit ── */
  const onSubmit = (data: FormValues) => {
    if (!photoB64) {
      toast.error("Tire uma foto do produto antes de publicar.");
      return;
    }
    createMutation.mutate(
      {
        data: {
          produto: data.produto,
          categoria: data.categoria,
          marca: data.marca || undefined,
          preco: data.preco,
          mercado: data.mercado,
          bairro: data.bairro,
          cidade: data.cidade,
          fotoUrl: photoB64,
          validade: data.validade || undefined,
          latitude: coords?.lat,
          longitude: coords?.lng,
          usuarioId: getCurrentUser()!.id,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListOfertasQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
          if ((data as { wasConfirmation?: boolean })?.wasConfirmation) {
            toast.success("✅ Preço confirmado! +5 pontos. Obrigado por ajudar a comunidade!", { duration: 5000 });
          } else {
            toast.success("🎉 Oferta publicada! +10 pontos para você.");
          }
          setLocation("/ofertas");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast.error(msg ?? "Erro ao publicar a oferta. Tente novamente.");
        },
      }
    );
  };

  const onInvalid = () => {
    if (!photoB64) toast.error("Tire uma foto do produto antes de publicar.");
    else toast.error("Preencha todos os campos obrigatórios.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="max-w-xl mx-auto w-full p-4 pb-6"
    >
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-emerald-400 mb-1">Achou promoção?</h1>
        <p className="text-slate-400 text-sm">Compartilhe com a comunidade e ganhe 10 pontos.</p>
        <p className="text-xs text-slate-500 mt-1">
          Campos marcados com <span className="text-red-500 font-bold">*</span> são obrigatórios.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detalhes da oferta</CardTitle>
          <CardDescription>Preencha os dados do produto que você encontrou.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">

              {/* ── FOTO — câmera obrigatória ── */}
              <div className={`rounded-xl border-2 p-3 -mx-1 transition-colors ${photoB64 ? "border-emerald-500/50 bg-emerald-50/5" : "border-red-400/40 bg-red-50/5"}`}>
                <p className="text-sm font-bold mb-2 flex items-center gap-1.5"
                   style={{ color: photoB64 ? "#34d399" : "#f87171" }}>
                  <Camera className="h-4 w-4" />
                  Foto do produto (obrigatória)<Req />
                </p>

                {/* Hidden real input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Preview or trigger button */}
                {photoB64 ? (
                  <div className="relative">
                    <img
                      src={photoB64}
                      alt="Preview do produto"
                      className="w-full rounded-xl object-cover"
                      style={{ maxHeight: 220 }}
                    />

                    {/* OCR analyzing overlay */}
                    {ocrLoading && (
                      <div className="absolute inset-0 rounded-xl bg-black/60 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
                        <span className="text-white text-sm font-bold">🔍 Analisando etiqueta...</span>
                        <span className="text-white/60 text-xs">Lendo produto e preço</span>
                      </div>
                    )}

                    {/* OCR done badge */}
                    {ocrDone && !ocrLoading && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-full shadow-lg">
                        <span>📸</span> OCR ativo — confira os dados
                      </div>
                    )}

                    {/* Re-take / remove buttons */}
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 bg-black/60 text-white text-xs font-bold px-2.5 py-1.5 rounded-full backdrop-blur-sm"
                      >
                        <Camera className="h-3 w-3" /> Trocar
                      </button>
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="flex items-center gap-1 bg-red-600/80 text-white text-xs font-bold px-2 py-1.5 rounded-full backdrop-blur-sm"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={photoLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-xl border-2 border-dashed border-slate-600 hover:border-emerald-500 flex flex-col items-center justify-center gap-2 py-8 transition-colors active:scale-95"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    {photoLoading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                    ) : (
                      <>
                        <Camera className="h-9 w-9 text-slate-400" />
                        <span className="text-sm font-bold text-slate-300">Tire uma foto do produto</span>
                        <span className="text-xs text-slate-500">Toque para abrir a câmera</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* ── Produto ── */}
              <FormField control={form.control} name="produto" render={({ field }) => (
                <FormItem>
                  <FormLabel>Produto<Req /></FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="ex: Arroz 5kg" className="pl-9" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* ── Categoria + Marca ── */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="categoria" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria<Req /></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="marca" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marca <span className="text-slate-400 font-normal text-xs">(opcional)</span></FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="ex: Tio João" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* ── Preço + Mercado ── */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="preco" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço (R$)<Req /></FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="number" step="0.01" min="0" placeholder="0,00" className="pl-9" {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || e.target.value)} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="mercado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mercado<Req /></FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="ex: Extra" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* ── Bairro + Cidade ── */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro<Req /></FormLabel>
                    <FormControl><Input placeholder="ex: Centro" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade<Req /></FormLabel>
                    <FormControl><Input placeholder="ex: São Paulo" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* ── Validade ── */}
              <FormField control={form.control} name="validade" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Validade da oferta{" "}
                    <span className="text-slate-400 font-normal text-xs">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="date" className="pl-9" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* ── GPS ── */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-foreground">
                  Localização{" "}
                  <span className="text-slate-400 font-normal text-xs">(opcional, ajuda a mostrar distância)</span>
                </label>
                <Button
                  type="button"
                  variant={coords ? "outline" : "secondary"}
                  className="w-full h-11 rounded-xl"
                  onClick={getLocation}
                  disabled={isLocating}
                >
                  {isLocating
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <MapPin className="h-4 w-4 mr-2 text-primary" />
                  }
                  {coords ? "✓ Localização capturada" : "Capturar minha localização"}
                </Button>
                {coords && (
                  <p className="text-xs text-muted-foreground text-center">
                    {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-bold rounded-xl mt-2"
                style={{ background: "linear-gradient(135deg,#059669,#10b981)", boxShadow: "0 4px 20px rgba(5,150,105,0.35)" }}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Publicar Oferta
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
