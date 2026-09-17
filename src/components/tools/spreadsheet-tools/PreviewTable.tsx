'use client';

import { Table2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import type { Grid } from '@/lib/csv-cleaner/types';

/**
 * Only ever renders `limit` rows. A 50,000-row sheet is perfectly normal here
 * and building that many DOM nodes would lock the tab up.
 */
const LIMIT = 100;

export function PreviewTable({ grid, limit = LIMIT }: { grid: Grid; limit?: number }) {
  if (grid.header.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
        <Table2 className="h-5 w-5 text-faint" aria-hidden />
        <p className="text-[13px] text-muted">This sheet is empty — there is nothing to show.</p>
      </div>
    );
  }

  const visible = grid.rows.slice(0, limit);
  const hidden = grid.rows.length - visible.length;

  return (
    <>
      <div className="max-h-[30rem] overflow-auto scroll-thin">
        <table className="w-full border-collapse text-left text-[13px]">
          <caption className="sr-only">
            Preview of the first {visible.length} of {plural(grid.rows.length, 'row')}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 w-10 border-b border-line bg-elevated px-3 py-2 text-right font-mono text-[11px] font-normal text-faint"
              >
                #
              </th>
              {grid.header.map((cell, i) => (
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
                  colSpan={grid.header.length + 1}
                  className="px-5 py-12 text-center text-[13px] text-muted"
                >
                  Every row was removed by the current options. Turn one off to bring rows back.
                </td>
              </tr>
            ) : (
              visible.map((row, r) => {
                // The row-number cell is sticky, so its background has to be
                // painted per-cell rather than on the <tr>.
                const zebra = r % 2 === 1 ? 'bg-bg' : 'bg-surface';
                return (
                  <tr key={r}>
                    <td
                      className={cn(
                        'sticky left-0 z-10 border-b border-line px-3 py-1.5 text-right font-mono text-[11px] tabular-nums text-faint',
                        zebra,
                      )}
                    >
                      {r + 1}
                    </td>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn(
                          'whitespace-nowrap border-b border-line px-3 py-1.5 text-muted',
                          zebra,
                        )}
                      >
                        <span className="block max-w-[16rem] truncate" title={cell}>
                          {cell}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-5 py-2.5 text-[12px] text-faint">
        {hidden > 0
          ? `Showing the first ${visible.length} rows — ${plural(hidden, 'more row')} not drawn. The download always contains everything.`
          : `Showing all ${plural(grid.rows.length, 'row')}.`}
      </p>
    </>
  );
}
