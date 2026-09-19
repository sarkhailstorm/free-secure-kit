import { EyeOff } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import type { ParsedSheet } from '@/lib/csv-cleaner/types';

function describe(sheet: ParsedSheet, cleanedRows: number | undefined): string {
  if (sheet.rowCount === 0) return 'Empty';
  const rows =
    cleanedRows === undefined || cleanedRows === sheet.rowCount
      ? plural(sheet.rowCount, 'row')
      : `${plural(cleanedRows, 'row')} after cleaning`;
  return `${rows} · ${plural(sheet.columnCount, 'column')}`;
}

export interface SheetsPanelProps {
  sheets: readonly ParsedSheet[];
  /** The sheet on screen, by `ParsedSheet.index`. */
  activeSheet: number;
  onActiveSheetChange: (index: number) => void;
  /** Sheets ticked to save, by `ParsedSheet.index`. */
  selected: ReadonlySet<number>;
  onSelectedChange: (selected: ReadonlySet<number>) => void;
  /** Rows each sheet keeps once cleaned, by `ParsedSheet.index`. */
  cleanedRowCounts?: Readonly<Record<number, number>>;
  busy?: boolean;
}

export function SheetsPanel({
  sheets,
  activeSheet,
  onActiveSheetChange,
  selected,
  onSelectedChange,
  cleanedRowCounts,
  busy = false,
}: SheetsPanelProps) {
  if (sheets.length < 2) return null;

  const hidden = sheets.filter((sheet) => sheet.visibility !== 'visible').length;

  return (
    <Card>
      <CardHeader
        title="Sheets in this file"
        description={
          hidden > 0
            ? `Tick the ones to save. ${plural(hidden, 'sheet was', 'sheets were')} hidden in the original, so ${hidden === 1 ? 'it is' : 'they are'} not ticked.`
            : 'Tick the ones to save. Your answers are kept for each sheet separately.'
        }
      />

      <ul className="px-5 py-2">
        {sheets.map((sheet) => {
          const ticked = selected.has(sheet.index);
          const isOpen = sheet.index === activeSheet;
          return (
            <li
              key={sheet.index}
              className="flex flex-wrap items-center gap-3 border-t border-line py-2.5 first:border-t-0"
            >
              <input
                type="checkbox"
                checked={ticked}
                disabled={busy}
                aria-label={`Save ${sheet.name}`}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(sheet.index);
                  else next.delete(sheet.index);
                  onSelectedChange(next);
                }}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent disabled:cursor-not-allowed"
              />

              <button
                type="button"
                onClick={() => onActiveSheetChange(sheet.index)}
                className="-my-1 min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition-colors hover:bg-line/30"
                aria-current={isOpen ? 'true' : undefined}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-[13px]',
                      isOpen ? 'font-semibold text-ink' : 'font-medium text-muted',
                    )}
                  >
                    {sheet.name}
                  </span>
                  {sheet.visibility !== 'visible' ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-line/70 px-1.5 py-0.5 text-[11px] text-muted">
                      <EyeOff className="h-3 w-3" aria-hidden />
                      hidden
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[12px] text-faint">
                  {describe(sheet, cleanedRowCounts?.[sheet.index])}
                  {isOpen ? ' · on screen' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
