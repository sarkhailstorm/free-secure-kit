import Link from 'next/link';
import { support, donationsConfigured } from '@/config';
import { cn } from '@/lib/cn';
import { CoffeeIcon } from './CoffeeIcon';

export function SupportButton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!donationsConfigured) return null;

  return (
    <Link
      href={support.href}
      className={cn(
        'group inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent font-semibold text-accent-ink shadow-sm transition-all hover:brightness-110 active:brightness-95',
        size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        className,
      )}
    >
      <CoffeeIcon className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
      {support.label}
    </Link>
  );
}
