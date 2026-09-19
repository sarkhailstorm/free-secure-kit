'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
import { support, donationsConfigured } from '@/config';
import { cn } from '@/lib/cn';
import { CoffeeIcon } from './CoffeeIcon';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;

  celebrate: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const NUDGE_KEY = 'securekit:support-nudge-seen';

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [nudge, setNudge] = useState(false);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, kind, message }]);
      const timer = setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const dismissNudge = useCallback(() => {
    setNudge(false);
    try {
      sessionStorage.setItem(NUDGE_KEY, '1');
    } catch {

    }
  }, []);

  const api = useMemo<ToastApi>(() => {
    const alreadySeen = () => {
      try {
        return sessionStorage.getItem(NUDGE_KEY) === '1';
      } catch {
        return false;
      }
    };

    return {
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
      celebrate: (m) => {
        push('success', m);
        if (!donationsConfigured || alreadySeen()) return;
        try {
          sessionStorage.setItem(NUDGE_KEY, '1');
        } catch {
        }
        setTimeout(() => setNudge(true), 700);
      },
    };
  }, [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-elevated px-3.5 py-3 shadow-lift animate-slide-up',
            )}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
            ) : t.kind === 'error' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
            )}
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-m-1 rounded p-1 text-faint transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}

        {nudge ? (
          <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-accent/25 bg-elevated px-3.5 py-3 shadow-lift animate-slide-up">
            <CoffeeIcon className="mt-0.5 h-4 w-4 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-ink">Glad that helped!</p>
              <a
                href={support.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block text-[13px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
              >
                {support.label}
              </a>
              <p className="mt-1 text-[11px] text-faint">Entirely optional — every tool stays free.</p>
            </div>
            <button
              type="button"
              onClick={dismissNudge}
              aria-label="Dismiss donation message"
              className="-m-1 rounded p-1 text-faint transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}