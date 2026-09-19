import { useId, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { looksHeaderless } from '@/lib/csv-cleaner/structure';
import type { FooterReason, StructureReport } from '@/lib/csv-cleaner/types';
import { Toggle } from './Toggle';

const FOOTER_REASON: Record<FooterReason, string> = {
  'total-word': 'Says “total”',
  'mostly-blank': 'Nearly empty',
  'fewer-values': 'Adds up the rows above',
  'trailing-note': 'A note at the end',
};

const NO_HEADER = -1;

function previewText(cells: readonly string[]): string {
  const text = cells.map((cell) => cell.trim()).filter(Boolean).join(' · ');
  return text || '(empty row)';
}

export interface StructurePanelProps {
  structure: StructureReport;
  /** The row the column names are being taken from now; null means none. */
  headerRowIndex: number | null;
  onHeaderRowChange: (index: number | null) => void;
  dropFooterRows: boolean;
  /** Switching this on also raises `onFooterRowIndexesChange` with every row found. */
  onDropFooterRowsChange: (drop: boolean) => void;
  footerRowIndexes: readonly number[];
  onFooterRowIndexesChange: (indexes: readonly number[]) => void;
}

export function StructurePanel({
  structure,
  headerRowIndex,
  onHeaderRowChange,
  dropFooterRows,
  onDropFooterRowsChange,
  footerRowIndexes,
  onFooterRowIndexesChange,
}: StructurePanelProps) {
  const [picking, setPicking] = useState(false);
  const group = useId();
  if (structure.scores.length === 0) return null;

  const footers = structure.footerCandidates;
  const chosen = headerRowIndex === null ? NO_HEADER : headerRowIndex;
  const offerNone = looksHeaderless(structure) || headerRowIndex === null;
  const skipped = headerRowIndex === null ? 0 : headerRowIndex;

  return (
    <Card>
      <CardHeader
        title="Where the table starts"
        description={
          headerRowIndex === null
            ? 'This sheet is being read with no column names — every row counts as data.'
            : `Column names are being taken from row ${headerRowIndex + 1}.`
        }
        actions={
          <Button size="sm" variant="ghost" className="h-9" onClick={() => setPicking((v) => !v)}>
            {picking ? 'Done' : 'Pick another row'}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 px-5 py-4">
        {skipped > 0 ? (
          <p className="text-[12px] leading-relaxed text-muted">
            {plural(skipped, 'row')} above it {skipped === 1 ? 'is' : 'are'} left out of your data.
            Pick a row higher up to bring {skipped === 1 ? 'it' : 'them'} back.
          </p>
        ) : null}

        {picking ? (
          <fieldset className="max-h-72 overflow-auto rounded-xl border border-line bg-bg scroll-thin">
            <legend className="sr-only">Which row holds the column names</legend>

            {structure.scores.map((score) => {
              const active = chosen === score.index;
              const above = headerRowIndex !== null && score.index < headerRowIndex;
              return (
                <label
                  key={score.index}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 border-b border-line px-3.5 py-2.5 transition-colors last:border-b-0',
                    active ? 'bg-accent-soft' : 'hover:bg-line/30',
                  )}
                >
                  <input
                    type="radio"
                    name={group}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer border-line accent-accent"
                    checked={active}
                    onChange={() => onHeaderRowChange(score.index)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-ink">Row {score.index + 1}</span>
                      {structure.headerRowIndex === score.index ? (
                        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                          our pick
                        </span>
                      ) : null}
                      {above ? (
                        <span className="rounded-md bg-line/70 px-1.5 py-0.5 text-[11px] text-muted">
                          left out
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[12px] text-muted">
                      {previewText(score.preview)}
                    </span>
                  </span>
                </label>
              );
            })}

            {offerNone ? (
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 border-t border-line px-3.5 py-2.5 transition-colors',
                  chosen === NO_HEADER ? 'bg-accent-soft' : 'hover:bg-line/30',
                )}
              >
                <input
                  type="radio"
                  name={group}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer border-line accent-accent"
                  checked={chosen === NO_HEADER}
                  onChange={() => onHeaderRowChange(null)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">No column names</span>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    Every row is data. The columns are named Column 1, Column 2 and so on.
                  </span>
                </span>
              </label>
            ) : null}
          </fieldset>
        ) : null}

        {footers.length > 0 ? (
          <div className="border-t border-line pt-2">
            <Toggle
              label="Drop the total rows at the end"
              hint={`The last ${plural(footers.length, 'row')} of this sheet ${footers.length === 1 ? 'looks' : 'look'} like a total or a note rather than data. Off by default — dropping them loses what they say.`}
              checked={dropFooterRows}
              onChange={(next) => {
                onDropFooterRowsChange(next);
                if (next) onFooterRowIndexesChange(footers.map((row) => row.index));
              }}
            />

            {dropFooterRows ? (
              <ul className="ml-4 mt-1 border-l border-line pl-3">
                {footers.map((row) => {
                  const ticked = footerRowIndexes.includes(row.index);
                  return (
                    <li key={row.index}>
                      <label className="flex cursor-pointer items-start gap-3 py-1.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent"
                          checked={ticked}
                          onChange={(e) =>
                            onFooterRowIndexesChange(
                              e.target.checked
                                ? [...footerRowIndexes, row.index].sort((a, b) => a - b)
                                : footerRowIndexes.filter((index) => index !== row.index),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12px] text-ink">
                            {previewText(row.preview)}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-faint">
                            Row {row.index + 1} · {FOOTER_REASON[row.reason]}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
