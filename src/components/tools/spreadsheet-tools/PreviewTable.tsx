'use client';

import { Table2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { cellChangeReasonLabels } from '@/lib/csv-cleaner/changes';
import type { CellChangeReason } from '@/lib/csv-cleaner/types';

/**
 * Only ever draws `limit` rows. A 50,000-row sheet is perfectly normal here and
 * building that many DOM nodes would lock the tab up. The filter is applied to
 * the whole sheet before the window is cut, so `total` is the honest count.
 */
const LIMIT = 100;

export interface PreviewCellChange {
  /** Position of the column in `header` — not the original column index. */
  column: number;
  before: string;
  reasons: readonly CellChangeReason[];
}

export interface PreviewRow {
  /** ORIGINAL row index; the row number shown is this plus one. */
  sourceIndex: number;
  cells: readonly string[];
  /** Cells this pass changed. Left out on the original view. */
  changes?: readonly PreviewCellChange[];
}

export type PreviewFilter = 'all' | 'changed';

/** Plain rows for the original view, where nothing has been changed. */
export function toPreviewRows(rows: readonly string[][], startIndex = 0): PreviewRow[] {
  return rows.map((cells, i) => ({ sourceIndex: startIndex + i, cells }));
}

function hoverText(cell: string, change: PreviewCellChange | undefined): string {
  if (!change) return cell;
  const why = change.reasons.map((reason) => cellChangeReasonLabels[reason]).join('. ');
  const before = change.before === '' ? 'Was empty.' : `Was: ${change.before}`;
  return `${cell}\n${why}\n${before}`;
}

export interface PreviewTableProps {
  header: readonly string[];
  /** One window of rows, already filtered; at most `limit` are drawn. */
  rows: readonly PreviewRow[];
  /** Rows the filter matched across the WHOLE sheet. */
  total: number;
  filter?: PreviewFilter;
  /** The filter control is hidden when this is absent. */
  onFilterChange?: (filter: PreviewFilter) => void;
  limit?: number;
}

export function PreviewTable({
  header,
  rows,
  total,
  filter = 'all',
  onFilterChange,
  limit = LIMIT,
}: PreviewTableProps) {
  if (header.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
        <Table2 className="h-5 w-5 text-faint" aria-hidden />
        <p className="text-[13px] text-muted">This sheet is empty — there is nothing to show.</p>
      </div>
    );
  }

  const visible = rows.slice(0, limit);
  const shaded = visible.some((row) => row.changes && row.changes.length > 0);

  return (
    <>
      {onFilterChange ? (
        <div className="border-b border-line px-5 py-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={filter === 'changed'}
              onChange={(e) => onFilterChange(e.target.checked ? 'changed' : 'all')}
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent"
            />
            Only rows that changed
          </label>
        </div>
      ) : null}

      <div className="max-h-[30rem] overflow-auto scroll-thin">
        <table className="w-full border-collapse text-left text-[13px]">
          <caption className="sr-only">
            {visible.length} of {plural(total, 'row')}
            {shaded ? ', with changed cells shaded' : ''}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                title="Row number in your file"
                className="sticky left-0 top-0 z-30 w-10 border-b border-line bg-elevated px-3 py-2 text-right font-mono text-[11px] font-normal text-faint"
              >
                #
              </th>
              {header.map((cell, i) => (
                <th
                  key={`${cell}-${i}`}
                  scope="col"
                  className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-elevated px-3 py-2 font-semibold text-ink"
                >
                  <span className="block max-w-[16rem] truncate" title={cell}>
                    {cell}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={header.length + 1}
                  className="px-5 py-12 text-center text-[13px] text-muted"
                >
                  {filter === 'changed'
                    ? 'Nothing in this sheet was changed.'
                    : 'Every row was removed by the current options. Turn one off to bring rows back.'}
                </td>
              </tr>
            ) : (
              visible.map((row, r) => {
                // The row-number cell is sticky, so its background has to be
                // painted per-cell rather than on the <tr>.
                const zebra = r % 2 === 1 ? 'bg-bg' : 'bg-surface';
                const changes = new Map((row.changes ?? []).map((c) => [c.column, c]));
                return (
                  <tr key={row.sourceIndex}>
                    <td
                      className={cn(
                        'sticky left-0 z-10 border-b border-line px-3 py-1.5 text-right font-mono text-[11px] tabular-nums text-faint',
                        zebra,
                      )}
                    >
                      {row.sourceIndex + 1}
                    </td>
                    {row.cells.map((cell, c) => {
                      const change = changes.get(c);
                      return (
                        <td
                          key={c}
                          className={cn(
                            'whitespace-nowrap border-b border-line px-3 py-1.5',
                            change ? 'bg-accent-soft text-ink' : cn(zebra, 'text-muted'),
                          )}
                        >
                          <span
                            className="block max-w-[16rem] truncate"
                            title={hoverText(cell, change)}
                          >
                            {cell}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-5 py-2.5 text-[12px] text-faint">
        {total > visible.length
          ? `Showing ${visible.length.toLocaleString()} of ${plural(total, filter === 'changed' ? 'changed row' : 'row')}. The download always contains everything.`
          : `Showing all ${plural(total, filter === 'changed' ? 'changed row' : 'row')}.`}
      </p>
    </>
  );
}
