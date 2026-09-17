'use client';

import {
  ArrowUpToLine,
  CalendarClock,
  Columns3,
  Copy,
  Eraser,
  Ghost,
  Heading,
  Rows3,
  Sigma,
  Sparkles,
  SpellCheck,
  TriangleAlert,
  Undo2,
  WrapText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { plural } from '@/lib/format';
import type { InvisibleCharacterTally } from '@/lib/csv-cleaner/clean';
import { changedNothing, type CleanStats } from '@/lib/csv-cleaner/types';

function buildActions(s: CleanStats): Array<{ icon: LucideIcon; text: string }> {
  const out: Array<{ icon: LucideIcon; text: string }> = [];

  if (s.preambleRows > 0) {
    out.push({
      icon: ArrowUpToLine,
      text: `Left out ${plural(s.preambleRows, 'row')} above the heading row`,
    });
  }
  if (s.footerRows > 0) {
    out.push({ icon: Sigma, text: `Removed ${plural(s.footerRows, 'total row')} at the end` });
  }
  if (s.duplicateRows > 0) {
    out.push({ icon: Copy, text: `Removed ${plural(s.duplicateRows, 'duplicate row')}` });
  }
  if (s.blankRows > 0) {
    out.push({ icon: Rows3, text: `Removed ${plural(s.blankRows, 'blank row')}` });
  }
  if (s.indexOnlyRows > 0) {
    out.push({
      icon: Rows3,
      text: `Removed ${plural(s.indexOnlyRows, 'row')} holding nothing but a row number`,
    });
  }
  if (s.blankColumns > 0) {
    out.push({ icon: Columns3, text: `Removed ${plural(s.blankColumns, 'blank column')}` });
  }
  if (s.rescuedRows > 0) {
    out.push({ icon: Undo2, text: `Kept ${plural(s.rescuedRows, 'row')} you asked to keep` });
  }

  if (s.trimmedCells > 0) {
    out.push({ icon: Eraser, text: `Trimmed whitespace from ${plural(s.trimmedCells, 'cell')}` });
  }
  if (s.collapsedSpaceCells > 0) {
    out.push({
      icon: Eraser,
      text: `Squeezed repeated spaces in ${plural(s.collapsedSpaceCells, 'cell')}`,
    });
  }
  if (s.flattenedNewlineCells > 0) {
    out.push({
      icon: WrapText,
      text: `Put ${plural(s.flattenedNewlineCells, 'cell')} onto one line`,
    });
  }
  if (s.invisibleCharacterCells > 0) {
    out.push({
      icon: Ghost,
      text: `Took invisible characters out of ${plural(s.invisibleCharacterCells, 'cell')}`,
    });
  }
  if (s.sentinelCells > 0) {
    out.push({
      icon: Eraser,
      text: `Emptied ${plural(s.sentinelCells, 'cell')} that only said N/A or the like`,
    });
  }
  if (s.spellingMergedCells > 0) {
    out.push({
      icon: SpellCheck,
      text: `Matched spellings in ${plural(s.spellingMergedCells, 'cell')} across ${plural(s.spellingMergedColumns, 'column')}`,
    });
  }

  if (s.renamedHeaders > 0) {
    out.push({ icon: Heading, text: `Tidied ${plural(s.renamedHeaders, 'header')}` });
  }
  if (s.dedupedHeaders > 0) {
    out.push({
      icon: Heading,
      text: `Renamed ${plural(s.dedupedHeaders, 'duplicate header')} so no column was lost`,
    });
  }
  if (s.namedBlankHeaders > 0) {
    out.push({
      icon: Heading,
      text: `Named ${plural(s.namedBlankHeaders, 'column')} that had no heading`,
    });
  }
  if (s.datesNormalised > 0) {
    out.push({
      icon: CalendarClock,
      text: `Normalised ${plural(s.datesNormalised, 'date')} across ${plural(s.dateColumns, 'column')}`,
    });
  }
  return out;
}

function Stat({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before;
  return (
    <div className="rounded-xl border border-line bg-bg px-3.5 py-3">
      <p className="text-[12px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 font-mono text-sm tabular-nums text-ink">
        <span className={delta !== 0 ? 'text-muted line-through decoration-faint/60' : undefined}>
          {before.toLocaleString()}
        </span>
        <span aria-hidden className="text-faint">
          →
        </span>
        <span className="text-base font-semibold">{after.toLocaleString()}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-muted">
        {delta === 0
          ? 'unchanged'
          : delta < 0
            ? `${Math.abs(delta).toLocaleString()} removed`
            : `${delta.toLocaleString()} more`}
      </p>
    </div>
  );
}

export interface ChangeSummaryProps {
  stats: CleanStats;
  /** `CleanOutcome.invisibleCharacters` — names what was taken out. */
  invisibleCharacters?: readonly InvisibleCharacterTally[];
  /** `CleanOutcome.headersKeptDistinct`. */
  headersKeptDistinct?: number;
}

export function ChangeSummary({
  stats,
  invisibleCharacters,
  headersKeptDistinct = 0,
}: ChangeSummaryProps) {
  const actions = buildActions(stats);
  const nothing = changedNothing(stats);
  const characters = (invisibleCharacters ?? []).slice(0, 3);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Rows" before={stats.rowsBefore} after={stats.rowsAfter} />
        <Stat label="Columns" before={stats.columnsBefore} after={stats.columnsAfter} />
      </div>

      {nothing ? (
        <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
          <span>
            {stats.pendingDateColumns > 0
              ? // Calling the file "already clean" would contradict the warning
                // sitting directly underneath this line.
                'Nothing has been changed yet — the date question below is the only thing still waiting on you.'
              : 'This pass changed nothing — with the options as they stand, the file is already clean.'}
          </span>
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {actions.map((action) => (
            <li key={action.text} className="flex items-start gap-2.5 text-[13px] text-ink">
              <action.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              <span className="leading-relaxed">{action.text}</span>
            </li>
          ))}
        </ul>
      )}

      {characters.length > 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          The invisible characters were{' '}
          {characters
            .map((c) => `${c.name.toLowerCase()} (${c.count.toLocaleString()})`)
            .join(', ')}
          .
        </p>
      ) : null}

      {headersKeptDistinct > 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          {plural(headersKeptDistinct, 'heading was', 'headings were')} left alone, because tidying{' '}
          {headersKeptDistinct === 1 ? 'it' : 'them'} would have made two columns share a name.
        </p>
      ) : null}

      {stats.pendingDateColumns > 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
          <span>
            {plural(stats.pendingDateColumns, 'date column')} left untouched — answer the question
            under &ldquo;Date columns&rdquo; and they will be normalised too.
          </span>
        </p>
      ) : null}
    </div>
  );
}
