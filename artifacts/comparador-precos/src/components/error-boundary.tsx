import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-xl font-bold text-white mb-2">Algo deu errado</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-xs">
            {this.state.error?.message ?? "Erro inesperado. Tente recarregar."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-semibold px-6 py-3 rounded-xl transition-all"
            >
              Tentar novamente
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-semibold px-6 py-3 rounded-xl transition-all"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
