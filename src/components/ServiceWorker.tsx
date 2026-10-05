'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // updateViaCache: 'none' so the browser revalidates sw.js rather than
    // serving a cached copy and never noticing a new build.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        // Already superseded when the page loaded.
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            // A controller means this is an update, not the first install.
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(next);
            }
          });
        });
      })
      .catch(() => {
        // Unsupported, blocked, or a private window. The site works regardless.
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-elevated px-3.5 py-2.5 shadow-lift animate-slide-up">
        <p className="text-[13px] text-ink">A new version is ready.</p>
        <button
          type="button"
          onClick={() => waiting.postMessage('SKIP_WAITING')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-[13px] font-medium text-accent-ink transition-all hover:brightness-110"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Reload
        </button>
      </div>
    </div>
  );
}
