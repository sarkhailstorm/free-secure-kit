'use client';

import { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';
import { cn } from '@/lib/cn';

// Chromium-only and not in lib.dom
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS predates display-mode and still reports this instead
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Chrome and Firefox on iOS cannot install either, and say CriOS/FxiOS
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallButton({
  compact = false,
  iosHint = true,
  className,
}: {
  /** Icon only until there is room for the label. For the header. */
  compact?: boolean;
  /** iPhones have no install API, so they get a sentence instead. No room for one in the header. */
  iosHint?: boolean;
  className?: string;
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [onIos, setOnIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (isIosSafari()) {
      setOnIos(true);
      return;
    }

    const onPrompt = (event: Event) => {
      // Stops Chrome's own strip so our button is the only ask
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (onIos) {
    if (!iosHint) return null;
    return (
      <p className={cn('inline-flex items-center gap-1.5 text-[13px] text-muted', className)}>
        <Share className="h-3.5 w-3.5 shrink-0" aria-hidden />
        To use this offline, tap Share then Add to Home Screen.
      </p>
    );
  }

  if (!prompt) return null;

  return (
    <button
      type="button"
      aria-label="Install this site as an app"
      title="Install this site as an app"
      onClick={async () => {
        // The event is single-use, so drop it either way
        setPrompt(null);
        try {
          await prompt.prompt();
          await prompt.userChoice;
        } catch {
          // Already used, or the browser dismissed it
        }
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-surface font-medium text-ink shadow-sm transition-colors hover:bg-elevated',
        compact ? 'h-9 w-9 text-[13px] sm:w-auto sm:px-3' : 'h-10 px-4 text-sm',
        className,
      )}
    >
      <Download className={compact ? 'h-4 w-4 shrink-0' : 'h-4 w-4 shrink-0'} aria-hidden />
      <span className={compact ? 'hidden sm:inline' : undefined}>Install{compact ? '' : ' app'}</span>
    </button>
  );
}
