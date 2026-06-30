import { usePush } from "@/hooks/use-push";
import { toast } from "@/hooks/use-toast";

const isIOS = typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !("PushManager" in window);

export function PushPermissionCard({ onEnabled }: { onEnabled?: () => void }) {
  const { supported, permission, subscribed, loading, subscribe } = usePush();

  if (subscribed && permission === "granted") return null;

  if (isIOS) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <div className="flex gap-3">
          <span className="text-2xl leading-none">🍎</span>
          <div>
            <p className="font-bold text-amber-800 text-sm">Notificações no iPhone</p>
            <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
              Para receber notificações no iPhone, instale o AíCompensa na tela inicial e abra o app pelo ícone.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
        <p className="text-[11px] text-gray-500 text-center">
          Notificações push não são suportadas neste navegador.
        </p>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
        <div className="flex gap-3">
          <span className="text-2xl leading-none">🔕</span>
          <div>
            <p className="font-bold text-red-800 text-sm">Notificações bloqueadas</p>
            <p className="text-[11px] text-red-700 mt-1 leading-relaxed">
              Você bloqueou as notificações. Para ativar, acesse as configurações do navegador e permita notificações para este site.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleActivate = async () => {
    const result = await subscribe();
    if (result === "subscribed" || result === "already") {
      toast({ title: "🔔 Notificações ativadas com sucesso!" });
      onEnabled?.();
    } else if (result === "denied") {
      toast({
        title: "Permissão negada",
        description: "Ative nas configurações do navegador para receber alertas.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Não foi possível ativar as notificações.", variant: "destructive" });
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#130926] to-[#231042] text-white rounded-2xl p-5">
      <div className="flex gap-3 mb-4">
        <div className="w-10 h-10 bg-[#F2C14E]/20 rounded-xl flex items-center justify-center shrink-0">
          <span className="text-xl">🔔</span>
        </div>
        <div>
          <p className="font-black text-sm leading-tight">Receba alertas de economia</p>
          <p className="text-[11px] text-white/70 mt-1 leading-relaxed">
            Ative notificações para saber quando um produto da sua lista entrar em oferta
            ou quando alguém alterar uma lista compartilhada.
          </p>
        </div>
      </div>
      <button
        onClick={() => void handleActivate()}
        disabled={loading}
        className="w-full bg-[#F2C14E] text-[#130926] font-black text-sm py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-[#130926]/30 border-t-[#130926] rounded-full animate-spin" />
        ) : "🔔 Ativar notificações"}
      </button>
    </div>
  );
}
