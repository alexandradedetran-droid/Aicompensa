import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { LoginPromptProvider } from "@/lib/login-prompt";
import { ErrorBoundary } from "@/components/error-boundary";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { analytics } from "@/lib/analytics";

// Eager: critical path (first load routes)
import Home from "@/pages/home";
import Ofertas from "@/pages/ofertas";

// Lazy: secondary routes (code-split into separate chunks)
const Publicar     = lazy(() => import("@/pages/publicar"));
const Ranking      = lazy(() => import("@/pages/ranking"));
const Perfil       = lazy(() => import("@/pages/perfil"));
const Mapa         = lazy(() => import("@/pages/mapa"));
const Alertas      = lazy(() => import("@/pages/alertas"));
const Lista        = lazy(() => import("@/pages/lista"));
const Listas       = lazy(() => import("@/pages/listas"));
const ListaDetalhe = lazy(() => import("@/pages/lista-detalhe"));
const NotFound     = lazy(() => import("@/pages/not-found"));

// Admin routes — fully lazy (separate chunk)
const Admin      = lazy(() => import("@/pages/admin"));
const AdminLogin = lazy(() => import("@/pages/admin-login"));
const Cadastro   = lazy(() => import("@/pages/cadastro"));
const Login      = lazy(() => import("@/pages/login"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-500">Carregando...</span>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function Router() {
  const [location] = useLocation();

  // Track page views on route change
  useEffect(() => {
    analytics.page(location);
  }, [location]);

  // Admin routes — fully separate, no user auth needed
  if (location === "/admin-login") return (
    <Suspense fallback={<PageLoader />}><AdminLogin /></Suspense>
  );
  if (location === "/admin") return (
    <Suspense fallback={<PageLoader />}><Admin /></Suspense>
  );

  // Auth routes — always accessible, no Layout wrapper
  if (location === "/login") return (
    <Suspense fallback={<PageLoader />}><Login /></Suspense>
  );
  if (location === "/cadastro") return (
    <Suspense fallback={<PageLoader />}><Cadastro /></Suspense>
  );

  return (
    <LoginPromptProvider>
      <Layout>
        <AnimatePresence mode="wait">
          <Suspense fallback={<PageLoader />}>
            <Switch location={location} key={location}>
              <Route path="/" component={Home} />
              <Route path="/ofertas" component={Ofertas} />
              <Route path="/publicar" component={Publicar} />
              <Route path="/ranking" component={Ranking} />
              <Route path="/perfil" component={Perfil} />
              <Route path="/mapa" component={Mapa} />
              <Route path="/alertas" component={Alertas} />
              <Route path="/listas" component={Listas} />
              <Route path="/listas/:id" component={ListaDetalhe} />
              {/* Legacy /lista → redirect to /listas */}
              <Route path="/lista">
                <Redirect to="/listas" />
              </Route>
              <Route path="/lista/:codigo" component={Lista} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </AnimatePresence>
      </Layout>
    </LoginPromptProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
            <PwaInstallPrompt />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
