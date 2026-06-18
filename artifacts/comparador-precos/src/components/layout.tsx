import { useLocation } from "wouter";
import { Home, Store, Plus, User, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";

interface LayoutProps {
  children: React.ReactNode;
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
    { href: "/",        label: "Home",    icon: Home,         guarded: false },
    { href: "/ofertas", label: "Ofertas", icon: Store,        guarded: false },
    { href: "/publicar",label: "+",       icon: Plus,         guarded: true, isMain: true },
    { href: "/listas",  label: "Compras", icon: ShoppingCart, guarded: false },
    { href: "/perfil",  label: "Perfil",  icon: User,         guarded: true },
  ];

  // Contextual FAB: adapts action based on current route
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
    <div className="flex flex-col min-h-screen bg-[#0f172a]">
      {/* Desktop top nav */}
      <header className="sticky top-0 z-50 w-full border-b border-[#1e293b] bg-[#0f172a]/95 backdrop-blur shadow-sm hidden sm:block">
        <div className="container flex h-14 items-center justify-between px-4 sm:px-6 max-w-lg mx-auto">
          <Link href="/" className="flex items-center gap-2 font-black text-lg tracking-tight">
            <span className="text-emerald-400">🛒</span>
            <span className="text-white">AíCompensa</span>
            <span className="text-slate-500 text-xs font-bold bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded-full">Beta</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-5 text-sm font-medium">
            {navItems.filter(i => !i.isMain).map((item) =>
              item.guarded ? (
                <button
                  key={item.href}
                  onClick={() => guardedNavigate(item.href)}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors hover:text-emerald-400 bg-transparent border-none cursor-pointer",
                    location === item.href ? "text-emerald-400" : "text-slate-400"
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
                    "flex items-center gap-1.5 transition-colors hover:text-emerald-400",
                    location === item.href ? "text-emerald-400" : "text-slate-400"
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

      {/* Mobile bottom nav — premium version */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 sm:hidden"
        style={{
          background: "rgba(10, 15, 28, 0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(51,65,85,0.6)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
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
                  {/* The FAB sits centered, lifted above the nav */}
                  <button
                    onClick={handleFab}
                    className="absolute -top-5 flex items-center justify-center rounded-full transition-all active:scale-90"
                    style={{
                      height: "52px",
                      width: "52px",
                      background: "linear-gradient(135deg, #059669, #10b981)",
                      boxShadow: "0 0 0 4px rgba(10,15,28,0.97), 0 4px 24px rgba(16,185,129,0.55)",
                    }}
                  >
                    <Plus className="h-6 w-6 text-white stroke-[2.5]" />
                  </button>
                  {/* placeholder to keep layout spacing */}
                  <span className="h-[60px] w-[52px]" />
                </div>
              );
            }

            const content = (
              <>
                {/* Active indicator dot */}
                <span
                  className={cn(
                    "absolute top-1 w-1 h-1 rounded-full transition-all duration-300",
                    isActive ? "bg-emerald-400 opacity-100 scale-100" : "opacity-0 scale-0"
                  )}
                />
                <item.icon
                  className={cn(
                    "h-[22px] w-[22px] transition-all duration-200",
                    isActive ? "stroke-[2.5] text-emerald-400" : "stroke-[1.75] text-slate-500"
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] font-bold tracking-wide transition-all duration-200 leading-none",
                    isActive ? "text-emerald-400" : "text-slate-500"
                  )}
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
        {/* iOS home indicator safe area */}
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </nav>
    </div>
  );
}
