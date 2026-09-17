'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ToastProvider';
import { downloadBlob } from '@/lib/download';
import { formatBytes, plural } from '@/lib/format';
import { cleanGrid } from '@/lib/csv-cleaner/clean';
import { analyseDateColumns } from '@/lib/csv-cleaner/dates';
import { ACCEPT_ATTRIBUTE, ParseFailure, parseFile } from '@/lib/csv-cleaner/parse';
import { cleanedFilename, gridToCsvBlob, gridToXlsxBlob } from '@/lib/csv-cleaner/serialize';
import {
  defaultOptions,
  type CleanOptions,
  type ColumnDecision,
  type Grid,
  type ParsedFile,
} from '@/lib/csv-cleaner/types';
import { ChangeSummary } from './ChangeSummary';
import { DateColumnsPanel } from './DateColumnsPanel';
import { OptionsPanel } from './OptionsPanel';
import { PreviewTable } from './PreviewTable';

type View = 'cleaned' | 'original';

const viewTabs = [
  { id: 'cleaned' as const, label: 'Cleaned' },
  { id: 'original' as const, label: 'Original' },
];

const emptyGrid: Grid = { header: [], rows: [] };

function formatLabel(kind: 'csv' | 'xlsx'): string {
  return kind === 'csv' ? 'CSV' : 'Excel';
}

export function SpreadsheetTools() {
  const toast = useToast();

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [options, setOptions] = useState<CleanOptions>(() => ({
    ...defaultOptions,
    columnDecisions: {},
  }));
  const [view, setView] = useState<View>('cleaned');
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState<'csv' | 'xlsx' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const sheet = parsed?.sheets[sheetIndex];
  const original = sheet?.grid ?? emptyGrid;

  // Analysed once per sheet, never per toggle — the reading of a date column
  // must not wobble when an unrelated option changes.
  const dateColumns = useMemo(() => analyseDateColumns(original), [original]);

  // Always recomputed from `original`, never from a previous result, so
  // cleaning is idempotent no matter how many times options are flipped.
  const result = useMemo(
    () => cleanGrid(original, options, dateColumns),
    [original, options, dateColumns],
  );

  const cleanedGrid = useMemo<Grid>(
    () => ({ header: result.header, rows: result.rows }),
    [result],
  );

  const patchOptions = useCallback((patch: Partial<CleanOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }));
  }, []);

  const decide = useCallback((index: number, choice: ColumnDecision | undefined) => {
    setOptions((prev) => {
      const next = { ...prev.columnDecisions };
      if (choice === undefined) delete next[index];
      else next[index] = choice;
      return { ...prev, columnDecisions: next };
    });
  }, []);

  const reset = useCallback(() => {
    setParsed(null);
    setFileSize(0);
    setSheetIndex(0);
    setProblem(null);
    setView('cleaned');
    setOptions((prev) => ({ ...prev, columnDecisions: {} }));
  }, []);

  const onFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      setReading(true);
      setProblem(null);
      try {
        // Yield once so the reading state actually paints before the parse
        // blocks the main thread.
        await new Promise((r) => setTimeout(r, 0));
        const next = await parseFile(file);

        setParsed(next);
        setFileSize(file.size);
        // Land on the first sheet that has anything in it.
        const firstUseful = next.sheets.findIndex((s) => s.grid.header.length > 0);
        setSheetIndex(firstUseful < 0 ? 0 : firstUseful);
        setView('cleaned');
        // Decisions are keyed by column index, which means nothing for a new file.
        setOptions((prev) => ({ ...prev, columnDecisions: {} }));

        for (const note of next.notes) toast.info(note);
      } catch (err) {
        setParsed(null);
        setProblem(
          err instanceof ParseFailure
            ? err.message
            : 'That file could not be read. If it is a spreadsheet, try re-saving it as .csv or .xlsx.',
        );
      } finally {
        setReading(false);
      }
    },
    [toast],
  );

  const onSheetChange = useCallback((index: number) => {
    setSheetIndex(index);
    // Column indexes belong to a sheet, so old answers must not leak across.
    setOptions((prev) => ({ ...prev, columnDecisions: {} }));
  }, []);

  const download = useCallback(
    async (kind: 'csv' | 'xlsx') => {
      if (!parsed) return;
      setWriting(kind);
      try {
        await new Promise((r) => setTimeout(r, 0));
        const name = cleanedFilename(parsed.filename, kind);
        const blob =
          kind === 'csv'
            ? await gridToCsvBlob(cleanedGrid)
            : await gridToXlsxBlob(cleanedGrid, sheet?.name ?? 'Cleaned');
        // Start the download first, then celebrate — never the other way round.
        downloadBlob(blob, name);
        toast.celebrate(`${name} saved to your downloads.`);
      } catch {
        toast.error(`Something went wrong writing the ${formatLabel(kind)} file. Try the other format?`);
      } finally {
        setWriting(null);
      }
    },
    [cleanedGrid, parsed, sheet, toast],
  );

  // ── Empty state ───────────────────────────────────────────────────────
  if (!parsed) {
    return (
      <div className="animate-fade-in">
        <Dropzone
          onFiles={onFiles}
          accept={ACCEPT_ATTRIBUTE}
          disabled={reading}
          title={reading ? 'Reading your file…' : 'Drop a spreadsheet here'}
          hint="CSV, TSV, TXT or Excel · up to 60 MB · read in this tab, never uploaded"
          icon={
            reading ? (
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <FileSpreadsheet className="h-5 w-5" aria-hidden />
            )
          }
        />

        {problem ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] leading-relaxed text-ink"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            {problem}
          </p>
        ) : null}

        <Card className="mt-6">
          <CardHeader
            title="What a clean pass does"
            description="Every step is a checkbox once your file is open, so you decide what gets touched."
          />
          <ul className="grid gap-x-8 gap-y-2.5 px-5 py-4 text-[13px] leading-relaxed text-muted sm:grid-cols-2">
            {[
              'Drops exact duplicate rows and rows that are entirely empty',
              'Drops columns where the header and every cell are blank',
              'Trims stray whitespace from every cell',
              'Tidies the header row, keeping every column even when names collide',
              'Rewrites mixed date formats to one you pick',
              'Asks before guessing when a column could be DD/MM or MM/DD',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  // ── Loaded state ──────────────────────────────────────────────────────
  const shown = view === 'cleaned' ? cleanedGrid : original;
  const busy = writing !== null;

  return (
    <div className="animate-fade-in space-y-5">
      {/* File bar */}
      <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink" title={parsed.filename}>
              {parsed.filename}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              {formatBytes(fileSize)} · {plural(original.rows.length, 'row')} ·{' '}
              {plural(original.header.length, 'column')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {parsed.sheets.length > 1 ? (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <span className="shrink-0">Sheet</span>
              <select
                value={sheetIndex}
                onChange={(e) => onSheetChange(Number(e.target.value))}
                className="h-9 max-w-[12rem] truncate rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink transition-colors hover:bg-elevated"
              >
                {parsed.sheets.map((s, i) => (
                  <option key={`${s.name}-${i}`} value={i}>
                    {s.name}
                    {s.grid.header.length === 0 ? ' (empty)' : ` — ${s.grid.rows.length} rows`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <Button variant="secondary" size="sm" className="h-9" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Start over
          </Button>
        </div>
      </Card>

      {/* `min-w-0` on both columns matters: a grid item defaults to
          min-width:auto, so without it the widest unbreakable thing inside
          (a long option hint, a wide preview row) sets the column's floor and
          the whole page scrolls sideways on a phone. */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Options */}
        <div className="min-w-0 lg:col-span-5 xl:col-span-4">
          <OptionsPanel
            options={options}
            onChange={patchOptions}
            dateColumnCount={dateColumns.length}
          />
        </div>

        {/* Results */}
        <div className="min-w-0 space-y-5 lg:col-span-7 xl:col-span-8">
          <Card>
            <CardHeader
              title="What changed"
              description="Before and after, counted from the original file."
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={busy || cleanedGrid.header.length === 0}
                    onClick={() => void download('csv')}
                  >
                    {writing === 'csv' ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    )}
                    CSV
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={busy || cleanedGrid.header.length === 0}
                    onClick={() => void download('xlsx')}
                  >
                    {writing === 'xlsx' ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Excel
                  </Button>
                </div>
              }
            />
            <div className="px-5 py-4">
              <ChangeSummary stats={result.stats} />
            </div>
          </Card>

          <DateColumnsPanel
            enabled={options.normaliseDates}
            columns={dateColumns}
            decisions={options.columnDecisions}
            onDecide={decide}
          />

          <Card>
            <CardHeader
              title="Preview"
              description={
                view === 'cleaned'
                  ? 'The data as it will be downloaded.'
                  : 'The file exactly as it arrived, for comparison.'
              }
              actions={
                <Tabs<View>
                  label="Preview which version"
                  tabs={viewTabs}
                  active={view}
                  onChange={setView}
                />
              }
            />
            <PreviewTable grid={shown} />
          </Card>

          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Values are written out as text, so leading zeros, long IDs and phone numbers survive
              the round trip instead of being turned into numbers by Excel.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
