'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { dateFormatLabels } from '@/lib/csv-cleaner/dates';
import type { CleanOptions, DateFormat } from '@/lib/csv-cleaner/types';
import { Toggle } from './Toggle';

const formatTabs = (['iso', 'us', 'eu'] as const).map((id) => ({
  id,
  label: dateFormatLabels[id].label,
}));

export function OptionsPanel({
  options,
  onChange,
  dateColumnCount,
}: {
  options: CleanOptions;
  onChange: (patch: Partial<CleanOptions>) => void;
  dateColumnCount: number;
}) {
  return (
    <Card>
      <CardHeader
        title="Cleaning options"
        description="Every change recomputes from the original file, so nothing stacks up."
      />

      <div className="px-5 py-3">
        <fieldset>
          <legend className="sr-only">Row and column clean-up</legend>

          <Toggle
            label="Remove duplicate rows"
            hint="Drops a row when every one of its values already appeared above."
            checked={options.dedupeRows}
            onChange={(v) => onChange({ dedupeRows: v })}
          />
          <Toggle
            label="Remove blank rows"
            hint="Rows where every cell is empty."
            checked={options.removeBlankRows}
            onChange={(v) => onChange({ removeBlankRows: v })}
          />
          <Toggle
            label="Remove blank columns"
            hint="Only when the header and every cell in the column are empty."
            checked={options.removeBlankColumns}
            onChange={(v) => onChange({ removeBlankColumns: v })}
          />
        </fieldset>

        <hr className="my-2 border-line" />

        <fieldset>
          <legend className="sr-only">Whitespace</legend>

          <Toggle
            label="Trim whitespace"
            hint="Strips spaces and tabs from the start and end of every cell."
            checked={options.trimCells}
            onChange={(v) => onChange({ trimCells: v })}
          />
          <Toggle
            nested
            label="Collapse spaces inside cells"
            hint="Turns runs of spaces into one. Off by default — it rewrites deliberate formatting such as aligned text."
            checked={options.collapseWhitespace}
            onChange={(v) => onChange({ collapseWhitespace: v })}
          />
        </fieldset>

        <hr className="my-2 border-line" />

        <fieldset>
          <legend className="sr-only">Headers</legend>

          <Toggle
            label="Standardise the header row"
            hint="Trims, removes punctuation and collapses spaces. Colliding names get a _2 suffix so no column is lost."
            checked={options.standardiseHeaders}
            onChange={(v) => onChange({ standardiseHeaders: v })}
          />
          <Toggle
            nested
            label="lowercase headers"
            checked={options.lowercaseHeaders}
            disabled={options.snakeCaseHeaders}
            onChange={(v) => onChange({ lowercaseHeaders: v })}
            hint={options.snakeCaseHeaders ? 'Already implied by snake_case.' : undefined}
          />
          <Toggle
            nested
            label="snake_case headers"
            hint="First Name becomes first_name."
            checked={options.snakeCaseHeaders}
            onChange={(v) => onChange({ snakeCaseHeaders: v })}
          />
        </fieldset>

        <hr className="my-2 border-line" />

        <fieldset>
          <legend className="sr-only">Dates</legend>

          <Toggle
            label="Normalise date formats"
            hint={
              dateColumnCount === 0
                ? 'No date-like columns were found in this sheet.'
                : `${dateColumnCount} column${dateColumnCount === 1 ? '' : 's'} in this sheet look like dates.`
            }
            checked={options.normaliseDates}
            onChange={(v) => onChange({ normaliseDates: v })}
          />

          <div className="ml-4 mt-1 border-l border-line pl-3">
            <p className="text-[12px] font-medium text-muted">Write dates as</p>
            <Tabs<DateFormat>
              label="Date output format"
              className="mt-1.5"
              tabs={formatTabs}
              active={options.dateFormat}
              onChange={(id) => onChange({ dateFormat: id })}
            />
            <p className="mt-1.5 font-mono text-[12px] text-faint">
              {dateFormatLabels[options.dateFormat].example}
            </p>
          </div>
        </fieldset>
      </div>
    </Card>
  );
}
