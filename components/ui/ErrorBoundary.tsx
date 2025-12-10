import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  appName?: string;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Kernel Error in module ${this.props.appName}:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-nd-black text-nd-gray p-8 text-center animate-in fade-in">
          <div className="w-16 h-16 border border-nd-red/50 bg-nd-red/5 flex items-center justify-center rounded-full mb-4 animate-pulse">
            <AlertTriangle size={32} className="text-nd-red" />
          </div>
          <h2 className="text-sm font-bold text-nd-white uppercase tracking-widest mb-2">Process Terminated</h2>
          <p className="font-mono text-xs mb-6 max-w-[200px] leading-relaxed opacity-70">
            The module <span className="text-nd-white">{this.props.appName}</span> encountered a critical exception.
          </p>
          <div className="bg-nd-gray/10 p-2 rounded border border-nd-gray/20 w-full max-w-sm mb-6 overflow-hidden">
             <pre className="text-[10px] text-nd-red font-mono text-left truncate">
                {this.state.error?.message || 'Unknown Error'}
             </pre>
          </div>
          <div className="flex gap-3">
              <button
                className="flex items-center gap-2 px-4 py-2 border border-nd-white text-nd-white text-xs font-bold uppercase hover:bg-nd-white hover:text-nd-black transition-colors"
                onClick={() => this.setState({ hasError: false })}
              >
                <RefreshCw size={12} /> Restart
              </button>
              {this.props.onClose && (
                  <button
                    className="flex items-center gap-2 px-4 py-2 border border-nd-red text-nd-red text-xs font-bold uppercase hover:bg-nd-red hover:text-white transition-colors"
                    onClick={this.props.onClose}
                  >
                    <XCircle size={12} /> Force Close
                  </button>
              )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}