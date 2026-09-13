import { buyMeACoffee, buyMeACoffeeUrl, donationsConfigured } from '@/config';
import { cn } from '@/lib/cn';

/**
 * Buy Me a Coffee link, styled in their brand yellow (#FFDD00 on near-black)
 * so it reads as the familiar donation button.
 *
 * This is a plain outbound link rather than their embeddable JS widget: the
 * widget injects a third-party script that loads on every page and can set
 * cookies, which would undercut the "nothing leaves your browser" promise this
 * site is built on. Payment processing still happens entirely on Buy Me a
 * Coffee's hosted page — this app never sees or handles money.
 */
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
