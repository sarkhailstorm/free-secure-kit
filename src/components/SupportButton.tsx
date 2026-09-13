import { support, donationsConfigured } from '@/config';
import { cn } from '@/lib/cn';

export function SupportButton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!donationsConfigured) return null;

  return (
    <a
      href={support.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex select-none items-center gap-1.5 rounded-xl bg-accent font-semibold text-accent-ink shadow-sm transition-all hover:brightness-110 active:brightness-95',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        className,
      )}
    >
      <span aria-hidden>{support.emoji}</span>
      {support.label}
    </a>
  );
}
