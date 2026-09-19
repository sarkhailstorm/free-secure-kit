import { support, donationsConfigured } from '@/config';
import { cn } from '@/lib/cn';

export function SupportButton({
  size = 'md',
  compact = false,
  className,
}: {
  size?: 'sm' | 'md';
  /** Drops to a shorter label on a narrow phone, where the full one will not fit. */
  compact?: boolean;
  className?: string;
}) {
  if (!donationsConfigured) return null;

  return (
    <a
      href={support.url}
      target="_blank"
      rel="noopener noreferrer"
      // The visible text shortens on a small screen, so the spoken name is
      // pinned to the full one either way.
      aria-label={support.label}
      className={cn(
        'inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent font-semibold text-accent-ink shadow-sm transition-all hover:brightness-110 active:brightness-95',
        size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        className,
      )}
    >
      <span aria-hidden>{support.emoji}</span>
      {compact ? (
        <>
          <span className="min-[430px]:hidden">{support.shortLabel}</span>
          <span className="hidden min-[430px]:inline">{support.label}</span>
        </>
      ) : (
        support.label
      )}
    </a>
  );
}
