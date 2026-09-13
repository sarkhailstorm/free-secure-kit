import { buyMeACoffee, buyMeACoffeeUrl, donationsConfigured } from '@/config';
import { cn } from '@/lib/cn';

export function BuyMeACoffeeButton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!donationsConfigured) return null;

  return (
    <a
      href={buyMeACoffeeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex select-none items-center gap-1.5 rounded-xl bg-[#FFDD00] font-semibold text-[#0D0C0C] shadow-sm transition-all hover:brightness-105 active:brightness-95',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        className,
      )}
    >
      <span aria-hidden>{buyMeACoffee.emoji}</span>
      {buyMeACoffee.label}
    </a>
  );
}
