'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FileSpreadsheet, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ToastProvider';
import { downloadBlob } from '@/lib/download';
import { plural } from '@/lib/format';
import {
  RESCUABLE_REASONS,
  applyRescues,
  removalReasonOf,
  rowDiffs,
  selectRows,
} from '@/lib/csv-cleaner/changes';
import { runChecks } from '@/lib/csv-cleaner/checks';
import { cleanSheet } from '@/lib/csv-cleaner/clean';
import {
  assessColumns,
  buildMergePlan,
  clusterColumn,
  type AcceptedCluster,
} from '@/lib/csv-cleaner/cluster';
import { ACCEPT_ATTRIBUTE, ParseFailure, parseFile } from '@/lib/csv-cleaner/parse';
import {
  canWrite,
  countFormulaRisks,
  writeOutput,
  type WritableSheet,
} from '@/lib/csv-cleaner/serialize';
import { analyseStructure } from '@/lib/csv-cleaner/structure';
import {
  withDefaults,
  type CheckFinding,
  type CleanOptions,
  type ColumnDecision,
  type EncodingId,
  type MergePlan,
  type OutputFormat,
  type ParsedFile,
  type ParsedSheet,
  type ReadOptions,
  type StructureReport,
  type ValueCluster,
} from '@/lib/csv-cleaner/types';
import { ChangeSummary } from './ChangeSummary';
import { ChecksPanel } from './ChecksPanel';
import { DateColumnsPanel } from './DateColumnsPanel';
import { FileBar } from './FileBar';
import { OptionsPanel } from './OptionsPanel';
import { OutputPanel } from './OutputPanel';
import { PreviewTable, toPreviewRows, type PreviewFilter, type PreviewRow } from './PreviewTable';
import { ReadingPanel } from './ReadingPanel';
import { RemovedRowsPanel, type RemovedRow } from './RemovedRowsPanel';
import { SheetsPanel } from './SheetsPanel';
import { SpellingPanel, type SpellingColumn } from './SpellingPanel';
import { StructurePanel } from './StructurePanel';

type View = 'cleaned' | 'original';

const viewTabs = [
  { id: 'cleaned' as const, label: 'Cleaned' },
  { id: 'original' as const, label: 'Original' },
];

/** Rows drawn in the preview, and the size of one page of removed rows. */
const PAGE = 100;

interface SheetState {
  options: CleanOptions;
  accepted: Record<string, AcceptedCluster>;
  ignored: readonly string[];
  /** ORIGINAL row indexes the user asked to keep. */
  rescues: readonly number[];
  spellingColumn: number | null;
}

interface SheetSeed {
  structure: StructureReport;
  seed: SheetState;
}

const blankState: SheetState = {
  options: withDefaults(),
  accepted: {},
  ignored: [],
  rescues: [],
  spellingColumn: null,
};

function seedFor(sheet: ParsedSheet): SheetSeed {
  const structure = analyseStructure(sheet);
  return {
    structure,
    seed: { ...blankState, options: withDefaults({ headerRowIndex: structure.headerRowIndex }) },
  };
}

function carrySheet(
  state: SheetState,
  was: ParsedSheet,
  now: ParsedSheet,
): { state: SheetState; dropped: boolean } {
  const sameRows = was.rowCount === now.rowCount;
  const sameColumns = was.columnCount === now.columnCount;
  if (sameRows && sameColumns) return { state, dropped: false };

  const byRow = state.rescues.length + state.options.footerRowIndexes.length;
  const byColumn =
    Object.keys(state.options.columnDecisions).length +
    Object.keys(state.options.columnBlankSentinels).length +
    Object.keys(state.accepted).length +
    state.ignored.length;

  const fresh = seedFor(now).seed;
  return {
    state: {
      options: {
        ...state.options,
        headerRowIndex: sameRows ? state.options.headerRowIndex : fresh.options.headerRowIndex,
        dropFooterRows: sameRows && state.options.dropFooterRows,
        footerRowIndexes: sameRows ? state.options.footerRowIndexes : [],
        columnDecisions: sameColumns ? state.options.columnDecisions : {},
        columnBlankSentinels: sameColumns ? state.options.columnBlankSentinels : {},
      },
      accepted: sameColumns ? state.accepted : {},
      ignored: sameColumns ? state.ignored : [],
      rescues: sameRows ? state.rescues : [],
      spellingColumn: sameColumns ? state.spellingColumn : null,
    },
    dropped: (!sameRows && byRow > 0) || (!sameColumns && byColumn > 0),
  };
}

function carryAnswers(
  states: Record<number, SheetState>,
  before: ParsedFile,
  after: ParsedFile,
): { states: Record<number, SheetState>; dropped: boolean } {
  const next: Record<number, SheetState> = {};
  let dropped = false;
  for (const [key, state] of Object.entries(states)) {
    const index = Number(key);
    const was = before.sheets.find((each) => each.index === index);
    const now = after.sheets.find((each) => each.index === index);
    if (!was || !now) {
      dropped = true;
      continue;
    }
    const carried = carrySheet(state, was, now);
    next[index] = carried.state;
    if (carried.dropped) dropped = true;
  }
  return { states: next, dropped };
}

function Ask({
  title,
  children,
  goLabel,
  onGo,
  stayLabel,
  onStay,
}: {
  title: string;
  children: React.ReactNode;
  goLabel: string;
  onGo: () => void;
  stayLabel: string;
  onStay: () => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  const stay = useRef(onStay);
  useEffect(() => {
    stay.current = onStay;
  }, [onStay]);

  useEffect(() => {
    safe.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stay.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onStay} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-card"
      >
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        <div className="mt-2 text-[13px] leading-relaxed text-muted">{children}</div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-9" onClick={onGo}>
            {goLabel}
          </Button>
          <Button ref={safe} size="sm" variant="primary" className="h-9" onClick={onStay}>
            {stayLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function mergesOf(accepted: Record<string, AcceptedCluster>): Record<number, MergePlan> {
  const byColumn = new Map<number, AcceptedCluster[]>();
  for (const answer of Object.values(accepted)) {
    const list = byColumn.get(answer.cluster.columnIndex);
    if (list) list.push(answer);
    else byColumn.set(answer.cluster.columnIndex, [answer]);
  }
  const plans: Record<number, MergePlan> = {};
  for (const [column, list] of byColumn) plans[column] = buildMergePlan(list);
  return plans;
}

function optionsWithMerges(state: SheetState): CleanOptions {
  const merges = mergesOf(state.accepted);
  return Object.keys(merges).length === 0
    ? state.options
    : { ...state.options, spellingMerges: merges };
}

function originalHeader(sheet: ParsedSheet, headerRowIndex: number | null): string[] {
  const row = headerRowIndex === null ? undefined : sheet.rows[headerRowIndex];
  return Array.from(
    { length: sheet.columnCount },
    (_, c) => (row?.[c] ?? '').trim() || `Column ${c + 1}`,
  );
}

export function SpreadsheetTools() {
  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [readOptions, setReadOptions] = useState<ReadOptions>({});
  const [sheetIndex, setSheetIndex] = useState(0);
  const [states, setStates] = useState<Record<number, SheetState>>({});
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [visited, setVisited] = useState<ReadonlySet<number>>(new Set());

  const [view, setView] = useState<View>('cleaned');
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [removedOpen, setRemovedOpen] = useState(false);
  const [removedLimit, setRemovedLimit] = useState(PAGE);

  const [format, setFormat] = useState<OutputFormat>('csv');
  const [outputDelimiter, setOutputDelimiter] = useState(',');
  const [escapeFormulas, setEscapeFormulas] = useState(true);

  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // Read inside the async open(), which must not be rebuilt on every answer.
  const parsedRef = useRef<ParsedFile | null>(null);
  const statesRef = useRef<Record<number, SheetState>>({});
  const delimiterPicked = useRef(false);
  useEffect(() => {
    parsedRef.current = parsed;
    statesRef.current = states;
  }, [parsed, states]);

  // A file dropped anywhere else on the page would open in the browser and lose every answer.
  const loaded = parsed !== null;
  useEffect(() => {
    if (!loaded) return;
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      if ((e.dataTransfer?.files.length ?? 0) > 0) {
        toast.info('To swap the file, drop it on the bar at the top.');
      }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [loaded, toast]);

  // Nothing in here may depend on a cleaning option, or the picture would move under the user.
  const seeds = useMemo(() => {
    const map = new Map<number, SheetSeed>();
    if (parsed) for (const each of parsed.sheets) map.set(each.index, seedFor(each));
    return map;
  }, [parsed]);

  const sheet = parsed?.sheets.find((s) => s.index === sheetIndex) ?? null;
  const entry = seeds.get(sheetIndex) ?? null;
  const structure = entry?.structure ?? null;
  const state = states[sheetIndex] ?? entry?.seed ?? blankState;

  const context = useMemo(() => ({ indexColumn: structure?.indexColumn ?? null }), [structure]);
  const options = useMemo(() => optionsWithMerges(state), [state]);

  // Always from the ORIGINAL rows; `bare` is the same pass with no spelling merges.
  const bare = useMemo(
    () => (sheet ? cleanSheet(sheet, state.options, context) : null),
    [sheet, state.options, context],
  );
  const outcome = useMemo(() => {
    if (!sheet || !bare) return null;
    return options === state.options ? bare : cleanSheet(sheet, options, context);
  }, [sheet, bare, options, state.options, context]);

  const shown = useMemo(
    () => (outcome ? applyRescues(outcome, state.rescues) : null),
    [outcome, state.rescues],
  );

  const checkInput = useMemo(
    () =>
      sheet
        ? {
            sheet,
            headerRowIndex: state.options.headerRowIndex,
            indexColumn: structure?.indexColumn ?? null,
            fileIssues: parsed?.issues,
          }
        : null,
    [sheet, state.options.headerRowIndex, structure, parsed],
  );
  const deferredCheckInput = useDeferredValue(checkInput);
  const checks = useMemo(() => {
    if (!deferredCheckInput) return null;
    const report = runChecks(deferredCheckInput);
    // The checks stand their own scan down for a workbook, so error cells are carried over here.
    if (report.findings.some((finding) => finding.kind === 'excel-error-cells')) return report;
    const carried = deferredCheckInput.sheet.issues
      .filter((issue) => issue.kind === 'excel-error-cells' && issue.count > 0)
      .map<CheckFinding>((issue) => ({
        kind: 'excel-error-cells',
        severity: issue.severity,
        count: issue.count,
        rowIndexes: issue.rowIndexes,
        truncated: issue.count > issue.rowIndexes.length,
        samples: issue.samples,
      }));
    return carried.length === 0 ? report : { ...report, findings: [...carried, ...report.findings] };
  }, [deferredCheckInput]);

  const bareGrid = useMemo(
    () => (bare ? { header: bare.header, rows: bare.rows, columnSources: bare.columnSources } : null),
    [bare],
  );
  const deferredGrid = useDeferredValue(bareGrid);
  const spellingColumns = useMemo<SpellingColumn[]>(() => {
    if (!deferredGrid) return [];
    return assessColumns(deferredGrid, deferredGrid.columnSources)
      .filter((column) => column.suitable)
      .map((column) => ({
        columnIndex: column.columnIndex,
        columnName: column.columnName,
        report: clusterColumn(deferredGrid, column),
      }));
  }, [deferredGrid]);

  const acceptedKeeps = useMemo(() => {
    const keeps: Record<string, string> = {};
    for (const [id, answer] of Object.entries(state.accepted)) {
      keeps[id] = answer.keep ?? answer.cluster.suggested;
    }
    return keeps;
  }, [state.accepted]);
  const ignoredIds = useMemo(() => new Set(state.ignored), [state.ignored]);

  const preview = useMemo(() => {
    if (!shown) return { rows: [] as PreviewRow[], total: 0 };
    const changed = shown.changes.rowChanged;
    const positions: number[] = [];
    let total = 0;
    for (let at = 0; at < shown.rows.length; at += 1) {
      if (filter === 'changed' && changed[shown.rowSources[at]] !== 1) continue;
      total += 1;
      if (positions.length < PAGE) positions.push(at);
    }

    const diffs = rowDiffs(
      shown,
      positions.map((at) => shown.rowSources[at]),
    );
    const columnAt = new Map(shown.columnSources.map((source, at) => [source, at]));
    const rows = positions.map((at, n) => ({
      sourceIndex: shown.rowSources[at],
      cells: shown.rows[at],
      changes: diffs[n].cells.flatMap((cell) => {
        const column = columnAt.get(cell.column);
        return column === undefined ? [] : [{ column, before: cell.before, reasons: cell.reasons }];
      }),
    }));
    return { rows, total };
  }, [shown, filter]);

  const original = useMemo(() => {
    if (!sheet || !outcome) return { header: [] as string[], rows: [] as PreviewRow[], total: 0 };
    const start = outcome.plan.firstDataRow;
    return {
      header: originalHeader(sheet, state.options.headerRowIndex),
      rows: toPreviewRows(sheet.rows.slice(start, start + PAGE), start),
      total: Math.max(0, sheet.rows.length - start),
    };
  }, [sheet, outcome, state.options.headerRowIndex]);

  // From the pass itself, not the rescued result, so a row already kept still has its Undo.
  const removed = useMemo(() => {
    if (!sheet || !outcome) return { rows: [] as RemovedRow[], total: 0 };
    // One extra row is asked for so dropping the heading row still leaves a full page.
    const selection = selectRows(outcome, 'removed', 0, removedLimit + 1);
    const heading = state.options.headerRowIndex;
    const rows = selection.indexes
      .filter((index) => index !== heading)
      .slice(0, removedLimit)
      .map((index) => {
        const reason = removalReasonOf(outcome.changes.removed, index) ?? 'blank';
        return {
          index,
          reason,
          cells: sheet.rows[index] ?? [],
          canKeep: RESCUABLE_REASONS.has(reason),
        };
      });
    const headingCounted =
      heading !== null && removalReasonOf(outcome.changes.removed, heading) === 'header';
    return { rows, total: selection.total - (headingCounted ? 1 : 0) };
  }, [sheet, outcome, removedLimit, state.options.headerRowIndex]);

  const kept = useMemo(() => new Set(state.rescues), [state.rescues]);

  const prepared = useMemo<(WritableSheet & { losing: number })[]>(() => {
    if (!parsed || !sheet || !shown) return [];
    const out: (WritableSheet & { losing: number })[] = [];
    for (const each of parsed.sheets) {
      if (!selected.has(each.index)) continue;
      if (each.index === sheet.index) {
        out.push({
          index: each.index,
          name: each.name,
          grid: { header: shown.header, rows: shown.rows },
          losing: shown.stats.rowsBefore - shown.stats.rowsAfter,
        });
        continue;
      }
      const other = seeds.get(each.index);
      const theirs = states[each.index] ?? other?.seed ?? blankState;
      const done = applyRescues(
        cleanSheet(each, optionsWithMerges(theirs), {
          indexColumn: other?.structure.indexColumn ?? null,
        }),
        theirs.rescues,
      );
      out.push({
        index: each.index,
        name: each.name,
        grid: { header: done.header, rows: done.rows },
        losing: done.stats.rowsBefore - done.stats.rowsAfter,
      });
    }
    return out;
  }, [parsed, sheet, shown, selected, seeds, states]);

  const writable = useMemo<WritableSheet[]>(
    () => prepared.map(({ index, name, grid }) => ({ index, name, grid })),
    [prepared],
  );

  const unseen = useMemo(
    () => prepared.filter((each) => each.losing > 0 && !visited.has(each.index)),
    [prepared, visited],
  );

  const cleanedRowCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const each of writable) counts[each.index] = each.grid.rows.length;
    return counts;
  }, [writable]);

  const refusal = useMemo(
    () => (writable.length === 0 ? null : canWrite(writable, format).reason),
    [writable, format],
  );
  const formulaRisks = useMemo(() => countFormulaRisks(writable, format), [writable, format]);

  // Remembered because the date columns are only worked out while normalising is on.
  const dateCounts = useRef(new Map<number, number>());
  if (outcome && state.options.normaliseDates) {
    dateCounts.current.set(sheetIndex, outcome.dateColumns.length);
  }
  const dateColumnCount = dateCounts.current.get(sheetIndex) ?? 0;

  const open = useCallback(
    async (next: File, read: ReadOptions, again: boolean) => {
      const previous = parsedRef.current;
      setReading(true);
      if (!previous) setProblem(null);
      try {
        // Yield once so the reading state paints before the parse blocks.
        await new Promise((r) => setTimeout(r, 0));
        const result = await parseFile(next, read);

        setFile(next);
        setReadOptions(read);
        setParsed(result);

        if (again && previous) {
          // A re-read lands on one sheet, so the open and ticked sheets are left alone.
          const carried = carryAnswers(statesRef.current, previous, result);
          setStates(carried.states);
          if (carried.dropped) {
            toast.info(
              'Your file has been read again. A few of your answers were about rows or columns that have changed, so those have gone. The rest are as you left them.',
            );
          }
        } else {
          setStates({});
          setRemovedOpen(false);
          setRemovedLimit(PAGE);
          setFilter('all');
          setView('cleaned');
          delimiterPicked.current = false;

          const usable = result.sheets.filter((s) => s.visibility === 'visible' && s.rowCount > 0);
          const first = (usable[0] ?? result.sheets[0])?.index ?? 0;
          setSheetIndex(first);
          setVisited(new Set([first]));
          setSelected(new Set(usable.map((s) => s.index)));
        }

        if (!delimiterPicked.current) setOutputDelimiter(result.delimiter?.delimiter ?? ',');
      } catch (err) {
        const message =
          err instanceof ParseFailure
            ? err.message
            : 'That file could not be read. If it is a spreadsheet, try re-saving it as .csv or .xlsx.';
        if (previous) {
          toast.error(message);
        } else {
          setParsed(null);
          setFile(null);
          setProblem(message);
        }
      } finally {
        setReading(false);
      }
    },
    [toast],
  );

  const onFiles = useCallback(
    (files: File[]) => {
      if (files[0]) void open(files[0], {}, false);
    },
    [open],
  );
  const onFile = useCallback((next: File) => void open(next, {}, false), [open]);
  const reread = useCallback(
    (fields: ReadOptions) => {
      if (file) void open(file, { ...readOptions, ...fields }, true);
    },
    [file, readOptions, open],
  );
  const onOutputDelimiterChange = useCallback((value: string) => {
    delimiterPicked.current = true;
    setOutputDelimiter(value);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setReadOptions({});
    setStates({});
    setSelected(new Set());
    setVisited(new Set());
    setSheetIndex(0);
    setProblem(null);
    setView('cleaned');
    setFilter('all');
    setRemovedOpen(false);
    setRemovedLimit(PAGE);
  }, []);

  const update = useCallback(
    (change: (previous: SheetState) => SheetState) => {
      setStates((previous) => {
        const current = previous[sheetIndex] ?? seeds.get(sheetIndex)?.seed ?? blankState;
        return { ...previous, [sheetIndex]: change(current) };
      });
    },
    [sheetIndex, seeds],
  );

  const patch = useCallback(
    (fields: Partial<CleanOptions>) =>
      update((previous) => ({ ...previous, options: { ...previous.options, ...fields } })),
    [update],
  );

  const decide = useCallback(
    (column: number, choice: ColumnDecision | undefined) =>
      update((previous) => {
        const columnDecisions = { ...previous.options.columnDecisions };
        if (choice === undefined) delete columnDecisions[column];
        else columnDecisions[column] = choice;
        return { ...previous, options: { ...previous.options, columnDecisions } };
      }),
    [update],
  );

  const onAccept = useCallback(
    (cluster: ValueCluster, keep: string) =>
      update((previous) => ({
        ...previous,
        accepted: { ...previous.accepted, [cluster.id]: { cluster, keep } },
        ignored: previous.ignored.filter((id) => id !== cluster.id),
      })),
    [update],
  );

  const onIgnore = useCallback(
    (cluster: ValueCluster) =>
      update((previous) => {
        const accepted = { ...previous.accepted };
        delete accepted[cluster.id];
        return {
          ...previous,
          accepted,
          ignored: previous.ignored.includes(cluster.id)
            ? previous.ignored
            : [...previous.ignored, cluster.id],
        };
      }),
    [update],
  );

  const onUndoSpelling = useCallback(
    (cluster: ValueCluster) =>
      update((previous) => {
        const accepted = { ...previous.accepted };
        delete accepted[cluster.id];
        return { ...previous, accepted, ignored: previous.ignored.filter((id) => id !== cluster.id) };
      }),
    [update],
  );

  const onSpellingColumn = useCallback(
    (column: number | null) => update((previous) => ({ ...previous, spellingColumn: column })),
    [update],
  );

  const onKeepRow = useCallback(
    (index: number) =>
      update((previous) =>
        previous.rescues.includes(index)
          ? previous
          : { ...previous, rescues: [...previous.rescues, index].sort((a, b) => a - b) },
      ),
    [update],
  );

  const onDropRowAgain = useCallback(
    (index: number) =>
      update((previous) => ({
        ...previous,
        rescues: previous.rescues.filter((row) => row !== index),
      })),
    [update],
  );

  const onSheetChange = useCallback((index: number) => {
    setSheetIndex(index);
    setVisited((previous) => (previous.has(index) ? previous : new Set([...previous, index])));
    setRemovedOpen(false);
    setRemovedLimit(PAGE);
    setFilter('all');
    setView('cleaned');
  }, []);

  const onSave = useCallback(async () => {
    if (!parsed || writable.length === 0) return;
    setAsking(false);
    setWriting(true);
    try {
      await new Promise((r) => setTimeout(r, 0));
      const result = await writeOutput(
        writable,
        {
          format,
          delimiter: outputDelimiter,
          escapeFormulas,
          // Excel wrote this line itself; without it the file it made opens differently.
          declaredSeparator: parsed.delimiter?.sepLine != null,
          sheets: writable.map((each) => each.index),
        },
        parsed.filename,
      );
      downloadBlob(result.blob, result.filename);
      toast.celebrate(`${result.filename} saved to your downloads.`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : 'Something went wrong writing the file. Try the other format?',
      );
    } finally {
      setWriting(false);
    }
  }, [parsed, writable, format, outputDelimiter, escapeFormulas, toast]);

  const onSaveClick = useCallback(() => {
    if (unseen.length > 0) setAsking(true);
    else void onSave();
  }, [unseen, onSave]);

  if (!parsed || !sheet || !structure || !outcome || !shown) {
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
              'Finds where the table really starts, past any title rows',
              'Drops exact duplicate rows and rows that are entirely empty',
              'Drops columns where the heading and every cell are blank',
              'Trims stray spaces, and takes out characters you cannot see',
              'Tidies the heading row, keeping every column even when names collide',
              'Rewrites mixed date formats to one you pick, and asks when it cannot tell',
              'Offers to merge different spellings of the same thing, one group at a time',
              'Shows every row it took out, with a Keep button on each',
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

  const busy = reading || writing;

  return (
    <div className="animate-fade-in space-y-5">
      <FileBar
        filename={parsed.filename}
        size={file?.size ?? 0}
        rows={outcome.stats.rowsBefore}
        columns={sheet.columnCount}
        onFile={onFile}
        onStartOver={reset}
        accept={ACCEPT_ATTRIBUTE}
        busy={busy}
      />

      <ReadingPanel
        decode={parsed.decode}
        delimiter={parsed.delimiter}
        onEncodingChange={(encoding: EncodingId) => reread({ encoding })}
        onDelimiterChange={(delimiter) => reread({ delimiter })}
        onRepairMojibake={(repairMojibake) => reread({ repairMojibake })}
        busy={reading}
      />

      <ChecksPanel report={checks} />

      {/* `min-w-0`: a grid item's min-width:auto lets a wide row scroll the page sideways. */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="min-w-0 space-y-5 lg:col-span-5 xl:col-span-4">
          <SheetsPanel
            sheets={parsed.sheets}
            activeSheet={sheetIndex}
            onActiveSheetChange={onSheetChange}
            selected={selected}
            onSelectedChange={setSelected}
            cleanedRowCounts={cleanedRowCounts}
            busy={busy}
          />

          <StructurePanel
            structure={structure}
            headerRowIndex={state.options.headerRowIndex}
            onHeaderRowChange={(headerRowIndex) => patch({ headerRowIndex })}
            dropFooterRows={state.options.dropFooterRows}
            onDropFooterRowsChange={(dropFooterRows) => patch({ dropFooterRows })}
            footerRowIndexes={state.options.footerRowIndexes}
            onFooterRowIndexesChange={(footerRowIndexes) => patch({ footerRowIndexes })}
          />

          <OptionsPanel
            options={options}
            onChange={patch}
            dateColumnCount={dateColumnCount}
            hasIndexColumn={structure.indexColumn !== null}
          />

          {unseen.length > 0 ? (
            <Card className="border-warn/40">
              <CardHeader
                title="Sheets you have not opened"
                description="Cleaning takes rows out of these too. Open each one to see what goes and keep anything you still need."
              />
              <ul className="px-5 py-2">
                {unseen.map((each) => (
                  <li
                    key={each.index}
                    className="flex flex-wrap items-center gap-3 border-t border-line py-2.5 first:border-t-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{each.name}</p>
                      <p className="mt-0.5 text-[12px] text-faint">
                        {plural(each.losing, 'row')} would be taken out
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9 shrink-0"
                      onClick={() => onSheetChange(each.index)}
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <OutputPanel
            format={format}
            onFormatChange={setFormat}
            delimiter={outputDelimiter}
            onDelimiterChange={onOutputDelimiterChange}
            escapeFormulas={escapeFormulas}
            onEscapeFormulasChange={setEscapeFormulas}
            formulaRisks={formulaRisks}
            refusal={refusal}
            sheetCount={writable.length}
            onSave={onSaveClick}
            busy={writing}
          />
        </div>

        <div className="min-w-0 space-y-5 lg:col-span-7 xl:col-span-8">
          <Card>
            <CardHeader
              title="What changed"
              description="Before and after, counted from the original file."
            />
            <div className="px-5 py-4">
              <ChangeSummary
                stats={shown.stats}
                invisibleCharacters={shown.invisibleCharacters}
                headersKeptDistinct={shown.headersKeptDistinct}
              />
            </div>
          </Card>

          <DateColumnsPanel
            enabled={state.options.normaliseDates}
            columns={outcome.dateColumns}
            decisions={state.options.columnDecisions}
            onDecide={decide}
          />

          <SpellingPanel
            columns={spellingColumns}
            activeColumn={state.spellingColumn}
            onActiveColumnChange={onSpellingColumn}
            accepted={acceptedKeeps}
            ignored={ignoredIds}
            onAccept={onAccept}
            onIgnore={onIgnore}
            onUndo={onUndoSpelling}
            busy={deferredGrid !== bareGrid}
          />

          <RemovedRowsPanel
            open={removedOpen}
            onOpenChange={setRemovedOpen}
            rows={removed.rows}
            total={removed.total}
            kept={kept}
            onKeep={onKeepRow}
            onDropAgain={onDropRowAgain}
            onShowMore={
              removed.rows.length < removed.total
                ? () => setRemovedLimit((limit) => limit + PAGE)
                : undefined
            }
            busy={busy}
          />

          <Card>
            <CardHeader
              title="Preview"
              description={
                view === 'cleaned'
                  ? 'The data as it will be saved. Shaded cells were changed — hover one to see why.'
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
            {view === 'cleaned' ? (
              <PreviewTable
                header={shown.header}
                rows={preview.rows}
                total={preview.total}
                filter={filter}
                onFilterChange={setFilter}
                limit={PAGE}
              />
            ) : (
              <PreviewTable
                header={original.header}
                rows={original.rows}
                total={original.total}
                limit={PAGE}
              />
            )}
          </Card>

          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Your file is read in this tab and never sent anywhere. Values are saved as text, so
              leading zeros, long IDs and phone numbers survive the round trip instead of being
              turned into numbers by Excel.
            </span>
          </p>
        </div>
      </div>

      {asking && unseen.length > 0 ? (
        <Ask
          title="Save sheets you have not looked at?"
          goLabel="Save anyway"
          onGo={() => void onSave()}
          stayLabel="Let me look first"
          onStay={() => {
            setAsking(false);
            if (unseen[0]) onSheetChange(unseen[0].index);
          }}
        >
          <p>Rows will be taken out of these, and you have not seen them:</p>
          <ul className="mt-2 space-y-1">
            {unseen.map((each) => (
              <li key={each.index} className="text-ink">
                {each.name} &mdash; {plural(each.losing, 'row')}
              </li>
            ))}
          </ul>
          <p className="mt-2">Open a sheet to see what goes and keep anything you need.</p>
        </Ask>
      ) : null}
    </div>
  );
}
