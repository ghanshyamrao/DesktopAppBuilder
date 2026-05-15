import React from "react";
import { captureException } from "@/lib/analytics";

interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info);
    captureException(error, { component_stack: info.componentStack });
  }

  reset = (): void => this.setState({ error: null });

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="h-full flex items-center justify-center p-10">
        <div className="panel max-w-2xl w-full p-8">
          <h1 className="text-lg font-semibold text-accent-red mb-2">Something went wrong</h1>
          <p className="text-sm text-text-secondary mb-4">An error occurred while rendering this view.</p>
          <pre className="font-mono text-xs whitespace-pre-wrap break-words text-text-primary bg-bg-input border border-border rounded-lg p-4 max-h-72 overflow-auto">
            {error.message}
            {error.stack ? "\n\n" + error.stack : ""}
          </pre>
          <button onClick={this.reset} className="btn-secondary mt-5">
            Try again
          </button>
        </div>
      </div>
    );
  }
}
