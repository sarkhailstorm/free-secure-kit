'use client';

import { useEffect, useRef } from 'react';
import { Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { removalReasonLabels } from '@/lib/csv-cleaner/changes';
import type { RemovalReason } from '@/lib/csv-cleaner/types';

export interface RemovedRow {
  /** ORIGINAL row index. */
  index: number;
  reason: RemovalReason;
  cells: readonly string[];
  /** False for the heading row and anything above it — pick another heading row instead. */
  canKeep: boolean;
}

export interface RemovedRowsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: readonly RemovedRow[];
  /** Removed rows across the WHOLE sheet, however few are in `rows`. */
  total: number;
  /** Rows asked to be kept, by ORIGINAL row index — the `RescuePlan`. */
  kept: ReadonlySet<number>;
  onKeep: (index: number) => void;
  onDropAgain: (index: number) => void;
  onShowMore?: () => void;
  busy?: boolean;
}

export function RemovedRowsPanel({
  open,
  onOpenChange,
  rows,
  total,
  kept,
  onKeep,
  onDropAgain,
  onShowMore,
  busy = false,
}: RemovedRowsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onOpenChange]);

  if (total === 0) return null;

  const keptHere = rows.filter((row) => kept.has(row.index)).length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-elevated px-3.5 py-3 text-left transition-colors hover:border-faint/40"
      >
        <Trash2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">
          {plural(total, 'row was', 'rows were')} taken out.{' '}
          {kept.size > 0 ? `${plural(kept.size, 'row is', 'rows are')} being kept. ` : ''}
          <span className="font-medium text-ink">Look at them</span>
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rows that were taken out"
        className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-ink">Rows taken out</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              {plural(total, 'row')} in all. Keep any that should have stayed.
            </p>
          </div>
          <Button
            ref={closeRef}
            size="sm"
            variant="ghost"
            className="h-9 shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" aria-hidden />
            Close
          </Button>
        </div>

        <ul className="min-h-0 flex-1 overflow-auto px-5 scroll-thin">
          {rows.map((row) => {
            const keeping = kept.has(row.index);
            return (
              <li
                key={row.index}
                className={cn(
                  'flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0',
                  keeping && 'bg-ok/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12px] text-ink">
                    {row.cells.map((cell) => cell.trim()).filter(Boolean).join(' · ') ||
                      '(empty row)'}
                  </p>
                  <p className="mt-0.5 text-[12px] text-faint">
                    Row {row.index + 1} · {removalReasonLabels[row.reason]}
                  </p>
                </div>

                {row.canKeep ? (
                  <Button
                    size="sm"
                    variant={keeping ? 'ghost' : 'secondary'}
                    className="h-9 shrink-0"
                    disabled={busy}
                    onClick={() => (keeping ? onDropAgain(row.index) : onKeep(row.index))}
                  >
                    {keeping ? (
                      <>
                        <Undo2 className="h-3.5 w-3.5" aria-hidden />
                        Kept — undo
                      </>
                    ) : (
                      'Keep'
                    )}
                  </Button>
                ) : (
                  <span className="shrink-0 text-[12px] text-faint">
                    Pick another heading row to keep this
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[12px] text-muted">
            Showing {rows.length.toLocaleString()} of {plural(total, 'row')}
            {keptHere > 0 ? ` · ${keptHere.toLocaleString()} being kept` : ''}
          </p>
          {onShowMore && rows.length < total ? (
            <Button size="sm" variant="secondary" className="h-9" onClick={onShowMore}>
              Show more
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
