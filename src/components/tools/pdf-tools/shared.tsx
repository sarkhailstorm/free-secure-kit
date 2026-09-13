'use client';

import { Loader2, TriangleAlert, Info, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes, percentChange, plural } from '@/lib/format';

/** A short, dismissible failure message. Never a stack trace. */
export function ErrorNote({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <p className="min-w-0 text-[13px] leading-relaxed text-ink">{message}</p>
    </div>
  );
}

/** A neutral aside — context, not a warning. */
export function Note({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-line bg-elevated px-3.5 py-3',
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 text-[13px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

/**
 * Determinate progress for work that blocks the main thread between ticks.
 * Announced politely so it is not just a moving rectangle.
 */
export function Progress({
  label,
  done,
  total,
  className,
}: {
  label: string;
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted" aria-live="polite">
          {label}
        </p>
        {pct !== null ? (
          <span className="shrink-0 font-mono text-[13px] tabular-nums text-faint">{pct}%</span>
        ) : null}
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(pct !== null ? { 'aria-valuenow': pct } : {})}
      >
        <div
          className={cn(
            'h-full rounded-full bg-accent transition-[width] duration-200',
            pct === null && 'w-1/3 animate-pulse',
          )}
          style={pct !== null ? { width: `${pct}%` } : undefined}
        />
      </div>
    </div>
  );
}

/** One labelled number in a summary strip. */
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

/** "2.1 MB → 840 KB" with an honest, signed badge. */
export function SizeChange({ before, after }: { before: number; after: number }) {
  const delta = percentChange(before, after);
  const smaller = delta < 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-sm tabular-nums text-muted">{formatBytes(before)}</span>
      <span aria-hidden className="text-faint">
        &rarr;
      </span>
      <span className="font-mono text-sm font-medium tabular-nums text-ink">
        {formatBytes(after)}
      </span>
      <span
        className={cn(
          'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          smaller ? 'bg-ok/10 text-ok' : 'bg-line/70 text-muted',
        )}
      >
        {delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}%`}
      </span>
    </span>
  );
}

/** The filename + page count + size line shown above every result. */
export function FileLine({
  name,
  size,
  pageCount,
  className,
}: {
  name: string;
  size: number;
  pageCount: number;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <FileText className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink" title={name}>
          {name}
        </p>
        <p className="text-[13px] text-muted">
          {plural(pageCount, 'page')} &middot; {formatBytes(size)}
        </p>
      </div>
    </div>
  );
}
