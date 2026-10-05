import { support } from '@/config';
import { cn } from '@/lib/cn';

// Don't sort: PayPal's merchant terms ask for placement at least equal to other methods
export function SupportRoutes({ className }: { className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {support.routes.map((route) => (
        <a
          key={route.id}
          href={route.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col rounded-xl border border-line bg-surface p-4 !no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lift"
        >
          <span className="text-sm font-semibold text-ink">{route.title}</span>
          <span className="mt-1 text-[13px] leading-relaxed text-muted">
            For {route.who}, on a page run by {route.provider}.
          </span>
        </a>
      ))}
    </div>
  );
}
