import { cn } from '@/lib/cn';

const STEAM = ['M6 2v2', 'M10 2v2', 'M14 2v2'] as const;

const DELAYS = ['', '[animation-delay:0.4s]', '[animation-delay:0.8s]'] as const;

const CUP = 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1';

export function CoffeeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-4 w-4 shrink-0', className)}
      aria-hidden
    >
      {STEAM.map((d, i) => (
        <path
          key={d}
          d={d}
          // fill-box so the stroke scales from its own foot, not the canvas corner.
          className={cn(
            'origin-bottom [transform-box:fill-box] animate-steam motion-reduce:animate-none',
            'group-hover:[animation-duration:1.6s] group-focus-visible:[animation-duration:1.6s]',
            DELAYS[i],
          )}
        />
      ))}
      <path d={CUP} />
    </svg>
  );
}
