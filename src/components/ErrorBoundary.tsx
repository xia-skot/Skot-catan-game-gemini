import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-[9999] bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700/80 rounded-2xl p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ⚠️
            </div>
            <h2 className="text-lg font-black tracking-wide text-slate-100 mb-2">
              应用渲染出现异常
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              游戏状态或移动端渲染遇到了意外错误。请点击下方按钮重新加载界面。
            </p>
            {this.state.error && (
              <div className="bg-slate-950/80 rounded-xl p-3 text-[10px] font-mono text-red-300 text-left overflow-x-auto mb-6 max-h-28 border border-red-900/40">
                {this.state.error.toString()}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30"
              >
                重新加载应用
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
