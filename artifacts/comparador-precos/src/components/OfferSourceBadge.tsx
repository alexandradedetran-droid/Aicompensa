import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/get-initials";
import { resolveMarketBrandAsset } from "@/lib/market-brand-assets";

type OfferSourceBadgeProps = {
  mercadoNome?: string | null;
  mercadoLogoUrl?: string | null;
  usuarioNome?: string | null;
  size?: "sm" | "md";
  theme?: "light" | "dark";
  className?: string;
};

function getMarketInitial(nome?: string | null): string {
  const base = nome?.trim() ?? "";
  return getInitials(base).slice(0, 1) || "M";
}

export function OfferSourceBadge({
  mercadoNome,
  mercadoLogoUrl,
  usuarioNome,
  size = "sm",
  theme = "light",
  className,
}: OfferSourceBadgeProps) {
  const mercadoNomeLimpo = mercadoNome?.trim() ?? "";
  const usuarioNomeLimpo = usuarioNome?.trim() ?? "";
  const resolvedLogoUrl = mercadoNomeLimpo
    ? (mercadoLogoUrl ?? resolveMarketBrandAsset(mercadoNomeLimpo)?.logoUrl ?? null)
    : null;
  const hasMercado = mercadoNomeLimpo.length > 0;
  const hasUsuario = usuarioNomeLimpo.length > 0;

  const logoShellClass = size === "md"
    ? "h-8 w-[58px] rounded-xl px-2"
    : "h-7 w-[56px] rounded-xl px-2";
  const avatarShellClass = size === "md"
    ? "h-8 w-8 rounded-full text-xs"
    : "h-7 w-7 rounded-full text-[11px]";
  const shellThemeClass = theme === "dark"
    ? "border-white/10 bg-white/6 text-white/78"
    : "border-slate-200 bg-white text-slate-700";

  if (hasMercado && resolvedLogoUrl) {
    return (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden border shadow-sm",
          logoShellClass,
          theme === "dark" ? "bg-white/95" : "bg-white",
          theme === "dark" ? "border-white/10" : "border-slate-200",
          className,
        )}
        aria-label={`Mercado ${mercadoNomeLimpo}`}
        title={mercadoNomeLimpo}
      >
        <img
          src={resolvedLogoUrl}
          alt={`Logo do mercado ${mercadoNomeLimpo}`}
          className="max-h-[22px] max-w-[54px] object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  if (hasMercado) {
    return (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center border font-black tracking-wide shadow-sm",
          avatarShellClass,
          shellThemeClass,
          className,
        )}
        aria-label={`Mercado ${mercadoNomeLimpo}`}
        title={mercadoNomeLimpo}
      >
        {getMarketInitial(mercadoNomeLimpo)}
      </div>
    );
  }

  if (hasUsuario) {
    return (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center border font-black tracking-wide shadow-sm",
          avatarShellClass,
          shellThemeClass,
          className,
        )}
        aria-label={`Publicado por ${usuarioNomeLimpo}`}
        title={usuarioNomeLimpo}
      >
        {getInitials(usuarioNomeLimpo)}
      </div>
    );
  }

  return (
    <div
      className={cn("inline-flex shrink-0 items-center justify-center border shadow-sm", avatarShellClass, shellThemeClass, className)}
      aria-label="Origem da oferta indispon?vel"
      title="Origem da oferta indispon?vel"
    >
      <UserRound className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
    </div>
  );
}
