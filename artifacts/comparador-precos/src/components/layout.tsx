import { useLocation } from "wouter";
import { Home, Store, Plus, User, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";

interface LayoutProps {
  children: React.ReactNode;
}

/* Official AíCompensa logotype — SVG icon + wordmark */
function AiCompensaLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Official favicon: dark bg + lime-green A + dot */}
      <svg
        width="32"
        height="32"
        viewBox="0 0 180 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ borderRadius: 8, flexShrink: 0 }}
      >
        <rect width="180" height="180" rx="40" fill="#130926" />
        <path d="M90 30L34 148" stroke="url(#logoG1)" strokeWidth="18" strokeLinecap="round" />
        <path d="M90 30L146 148" stroke="url(#logoG1)" strokeWidth="18" strokeLinecap="round" />
        <circle cx="90" cy="118" r="12" fill="#bef264" />
        <defs>
          <linearGradient id="logoG1" x1="90" y1="30" x2="90" y2="148" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c8ff00" />
            <stop offset="1" stopColor="#84cc16" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "2px" }}>
          Aí
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#111827", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
          Compensa<span style={{ color: "#F2C14E" }}>.</span>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { openPrompt } = useLoginPrompt();

  function guardedNavigate(path: string, returnTo?: string) {
    if (getCurrentUser()) {
      setLocation(path);
    } else {
      openPrompt(returnTo ?? path);
    }
  }

  const navItems = [
    { href: "/",         label: "Home",    icon: Home,         guarded: false },
    { href: "/ofertas",  label: "Ofertas", icon: Store,        guarded: false },
    { href: "/publicar", label: "+",       icon: Plus,         guarded: true, isMain: true },
    { href: "/listas",   label: "Compras", icon: ShoppingCart, guarded: false },
    { href: "/perfil",   label: "Perfil",  icon: User,         guarded: true },
  ];

  function handleFab() {
    if (location === "/listas") {
      window.dispatchEvent(new CustomEvent("aicompensa:fab:nova-lista"));
    } else if (location.startsWith("/listas/")) {
      window.dispatchEvent(new CustomEvent("aicompensa:fab:add-item"));
    } else {
      guardedNavigate("/publicar");
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Desktop top nav — white, blur, shadow */}
      <header
        className="sticky top-0 z-50 w-full hidden sm:block"
        style={{
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #E5E7EB",
          boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
        }}
      >
        <div className="container flex h-14 items-center justify-between px-4 sm:px-6 max-w-lg mx-auto">
          <Link href="/">
            <AiCompensaLogo />
          </Link>
          <nav className="hidden sm:flex items-center gap-5 text-sm font-semibold">
            {navItems.filter(i => !i.isMain).map((item) =>
              item.guarded ? (
                <button
                  key={item.href}
                  onClick={() => guardedNavigate(item.href)}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors hover:text-primary bg-transparent border-none cursor-pointer",
                    location === item.href ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors hover:text-primary",
                    location === item.href ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col w-full max-w-lg mx-auto pb-[72px] sm:pb-6 relative overflow-x-hidden">
        {children}
      </main>

      {/* Mobile bottom nav — white, light border, gold active */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 sm:hidden"
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid #E5E7EB",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex justify-around items-center h-[60px] px-1 max-w-lg mx-auto relative">
          {navItems.map((item) => {
            const isActive = item.href === "/"
              ? location === "/"
              : location === item.href || location.startsWith(item.href + "/");

            if (item.isMain) {
              return (
                <div key={item.href} className="relative flex-1 flex justify-center">
                  {/* FAB: gold gradient, 50px, white border */}
                  <button
                    onClick={handleFab}
                    className="absolute -top-[18px] flex items-center justify-center rounded-full transition-all active:scale-90"
                    style={{
                      height: "50px",
                      width: "50px",
                      background: "linear-gradient(135deg, #F2C14E 0%, #E6A817 100%)",
                      boxShadow: "0 4px 16px rgba(242,193,78,0.50)",
                      border: "3px solid #fff",
                    }}
                    aria-label="Publicar oferta"
                  >
                    <Plus className="h-5 w-5 stroke-[2.5]" style={{ color: "#111827" }} />
                  </button>
                  <span className="h-[60px] w-[50px]" />
                </div>
              );
            }

            const content = (
              <>
                <item.icon
                  className="h-[22px] w-[22px] transition-all duration-200"
                  style={{
                    color: isActive ? "#F2C14E" : "#9CA3AF",
                    strokeWidth: isActive ? 2.5 : 1.75,
                  }}
                />
                <span
                  className="text-[10px] font-bold tracking-wide transition-all duration-200 leading-none"
                  style={{ color: isActive ? "#F2C14E" : "#9CA3AF" }}
                >
                  {item.label}
                </span>
              </>
            );

            const baseClass = cn(
              "relative flex-1 flex flex-col items-center justify-center gap-[3px] h-full transition-all duration-200",
              isActive ? "scale-105" : "hover:opacity-80"
            );

            if (item.guarded) {
              return (
                <button
                  key={item.href}
                  onClick={() => guardedNavigate(item.href)}
                  className={cn(baseClass, "bg-transparent border-none cursor-pointer")}
                >
                  {content}
                </button>
              );
            }

            return (
              <Link key={item.href} href={item.href} className={baseClass}>
                {content}
              </Link>
            );
          })}
        </div>
        {/* iOS safe area */}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </nav>
    </div>
  );
}
