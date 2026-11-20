import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    const key = 'dip_chunk_reload_once';
    if (!window.sessionStorage.getItem(key)) {
      window.sessionStorage.setItem(key, '1');
      window.location.reload();
    }
  });

  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      const hadDevSw = regs.some((r) =>
        (r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '').includes('dev-sw')
      );
      if (hadDevSw) {
        Promise.all(regs.map((r) => r.unregister())).then(() => {
          if ('caches' in window) {
            caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).finally(() => {
              const reloadKey = 'dip_dev_sw_cleaned';
              if (!window.sessionStorage.getItem(reloadKey)) {
                window.sessionStorage.setItem(reloadKey, '1');
                window.location.reload();
              }
            });
          }
        });
      }
    }).catch(() => {});
  }
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center p-6 bg-[#F7F8FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3 shadow-sm">
            <div className="text-sm font-extrabold text-[#FF671F]">Digital India Project</div>
            <h1 className="text-lg font-black">View Refresh Needed</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A recent update or network interruption prevented this view from loading cleanly.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-[#FF671F] hover:bg-[#E55B1B] text-white text-xs font-bold cursor-pointer"
              >
                Reload Application
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
