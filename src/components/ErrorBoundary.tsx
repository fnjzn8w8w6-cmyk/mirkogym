import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Errore UI', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-bg text-danger">
          <AlertOctagon className="h-8 w-8" aria-hidden />
        </div>
        <h2 className="text-xl text-fg">Qualcosa è andato storto</h2>
        <p className="mt-2 max-w-sm text-base text-fg-2">
          I tuoi dati sono al sicuro su Firestore. Ricarica la pagina per continuare.
        </p>
        <pre className="mt-4 max-w-sm overflow-x-auto rounded-md bg-surface-2 p-3 text-left text-sm text-fg-3">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 h-11 rounded-md bg-accent-500 px-5 font-semibold text-onaccent"
        >
          Ricarica
        </button>
      </div>
    );
  }
}
