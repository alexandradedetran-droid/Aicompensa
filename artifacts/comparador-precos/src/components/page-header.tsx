import { Bell, ShieldCheck, Search } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useLayout } from "@/components/layout-context";

interface PageHeaderProps {
  /**
   * "light" — white bg, for feed pages (Ofertas, Busca, Listas).
   * "dark"  — glass bg, for dark-shell pages (Home, Perfil).
   */
  theme?: "light" | "dark";
  /** Render the search input in the main row */
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  /**
   * Extra node placed between the search input and the bell icon.
   * Use for context-specific buttons like the location pin.
   */
  searchRight?: React.ReactNode;
  /**
   * Filter rows, category chips, etc. rendered below the main row.
   * The parent is responsible for its own horizontal padding/scrolling.
   */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  theme = "light",
  showSearch = false,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Buscar produto...",
  searchRight,
  children,
  className,
}: PageHeaderProps) {
  const { notifOpen, setNotifOpen, notifCount, isAdmin } = useLayout();
  const isLight = theme === "light";

  return (
    <div
      className={cn("sticky top-0 z-40 flex flex-col", className)}
      style={{
        background: isLight ? "#ffffff" : "rgba(12, 4, 24, 0.97)",
        borderBottom: isLight
          ? "1px solid #e5e7eb"
          : "1px solid rgba(58, 24, 103, 0.35)",
        boxShadow: isLight
          ? "0 1px 8px rgba(0,0,0,0.07)"
          : "0 1px 12px rgba(0,0,0,0.35)",
        backdropFilter: isLight ? undefined : "blur(12px)",
        WebkitBackdropFilter: isLight ? undefined : "blur(12px)",
      }}
    >
      {/* ── Row 1 — search / title · searchRight · bell · admin ── */}
      <div
        className="flex items-center gap-2"
        style={{
          minHeight: "60px",
          padding: "8px 16px",
          paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
          paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
        }}
      >
        {/* Search input — grows to fill the row */}
        {showSearch && (
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
              style={{ color: "#9ca3af" }}
            />
            <input
              type="search"
              autoComplete="off"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#F2C14E";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px rgba(242,193,78,0.2)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.boxShadow = "none";
              }}
              style={{
                display: "block",
                width: "100%",
                height: "44px",
                paddingLeft: "36px",
                paddingRight: "16px",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#111827",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            />
          </div>
        )}

        {/* Caller-supplied right slot (e.g. location button) */}
        {searchRight && <div className="shrink-0">{searchRight}</div>}

        {/* Bell — always 44 × 44 touch target */}
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          className="relative flex items-center justify-center rounded-xl transition-all active:scale-90 shrink-0"
          style={{
            minHeight: "44px",
            minWidth: "44px",
            background: isLight ? "#f3f4f6" : "#1e0d3a",
            border: `1px solid ${isLight ? "#e5e7eb" : "rgba(100,50,180,0.5)"}`,
          }}
          aria-label="Notificações"
        >
          <Bell
            className={cn(
              "h-[18px] w-[18px] transition-colors",
              notifCount > 0
                ? "text-[#D4A017]"
                : isLight
                  ? "text-gray-500"
                  : "text-slate-400",
            )}
          />
          {notifCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </button>

        {/* Admin shield icon — compact, text-free on mobile */}
        {isAdmin && (
          <Link href="/admin">
            <button
              className="flex items-center justify-center rounded-xl transition-all active:scale-90 shrink-0"
              style={{
                minHeight: "44px",
                minWidth: "44px",
                background: isLight
                  ? "rgba(242,193,78,0.08)"
                  : "linear-gradient(135deg, #1e1b4b, #312e81)",
                border: "1px solid rgba(242,193,78,0.4)",
                boxShadow: "0 0 8px rgba(242,193,78,0.08)",
              }}
              aria-label="Painel Admin"
              title="Acessar Painel Admin"
            >
              <ShieldCheck
                className="h-[18px] w-[18px]"
                style={{ color: "#F2C14E" }}
              />
            </button>
          </Link>
        )}
      </div>

      {/* ── Row 2+ — filter chips, category tabs, etc. ── */}
      {children}
    </div>
  );
}
