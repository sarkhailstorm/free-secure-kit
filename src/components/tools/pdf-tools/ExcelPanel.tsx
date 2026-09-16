'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, RotateCcw, Square, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { useToast } from '@/components/ToastProvider';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import { baseName, formatBytes, plural } from '@/lib/format';
import { describePdfError, looksLikePdf } from '@/lib/pdf-tools/errors';
import { downloadName, readPdf, tick, type LoadedPdf } from '@/lib/pdf-tools/pdf';
import {
  PAGE_WARN_THRESHOLD,
  findTables,
  writeTables,
  type ExcelFormat,
  type ExcelProgress,
  type ExcelWorkbook,
  type Sheet,
  type SheetNote,
} from '@/lib/pdf-to-excel';
import { ErrorNote, FileLine, Note, Progress, SelectField, Stat } from './shared';
import { TablePreview } from './TablePreview';

const FORMATS: readonly { value: ExcelFormat; label: string }[] = [
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV (.csv)' },
];

function progressLabel({ stage, done, total, page }: ExcelProgress): string {
  if (stage === 'reading') {
    return `Reading page ${page ?? Math.min(done + 1, total)} of ${total}…`;
  }
  if (stage === 'finding') return 'Finding the tables…';
  if (stage === 'checking') return 'Checking the numbers…';
  return 'Writing your spreadsheet…';
}

/** "4", "4 and 7", "1, 3 and 5" */
function listOf(numbers: readonly number[]): string {
  if (numbers.length <= 1) return numbers.map(String).join('');
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

function pagesLabel(pages: readonly number[]): string {
  if (pages.length === 0) return 'no pages';
  if (pages.length === 1) return `page ${pages[0]}`;
  const contiguous = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  return contiguous
    ? `pages ${pages[0]}–${pages[pages.length - 1]}`
    : `pages ${listOf(pages)}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function noteText(note: SheetNote): string {
  const count = note.count ?? 0;
  const pages = note.pages ?? [];
  switch (note.code) {
    case 'headerRepeated':
      return 'The header row repeats on every page. It’s in the spreadsheet once.';
    case 'rowsMissing':
      return `There may be ${plural(count, 'more row')} here than we could separate.`;
    case 'ambiguousDates':
      return note.detail ?? 'Dates here were read as day, month, year.';
    case 'balanceUnchecked':
      return 'No running balance to check on this table.';
    case 'balanceBreaks':
      return count === 1
        ? '1 row doesn’t add up. It’s marked below.'
        : `${plural(count, 'row')} don’t add up. They’re marked below.`;
    case 'pageNotRead':
      return `${sentenceCase(pagesLabel(pages))} didn’t match the rest of the table, so ${pages.length === 1 ? 'it isn’t' : 'they aren’t'} included.`;
    default:
      return '';
  }
}

function flaggedRows(sheet: Sheet): number {
  return sheet.rows.filter((row) => !row.ok).length;
}

/** The one line that says how much of this table to trust. */
function Honesty({ sheet }: { sheet: Sheet }) {
  const flagged = flaggedRows(sheet);
  const checked = sheet.columns.some((column) => column.balance);

  if (flagged > 0) {
    return (
      <p className="text-[13px] font-medium text-warn">
        {flagged === 1 ? '1 row needs checking' : `${flagged} rows need checking`}
      </p>
    );
  }
  if (checked) {
    return <p className="text-[13px] font-medium text-ok">Every row adds up</p>;
  }
  return <p className="text-[13px] text-faint">No running balance to check</p>;
}

interface SaveResult {
  name: string;
  size: number;
  sheets: number;
  rows: number;
  flagged: number;
}

export function ExcelPanel() {
  const toast = useToast();

  const [file, setFile] = useState<LoadedPdf | null>(null);
  const [reading, setReading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState<'finding' | 'writing' | null>(null);
  const [status, setStatus] = useState({ label: '', done: 0, total: 0 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);

  const [workbook, setWorkbook] = useState<ExcelWorkbook | null>(null);
  const [include, setInclude] = useState<ReadonlySet<string>>(new Set<string>());
  const [format, setFormat] = useState<ExcelFormat>('xlsx');
  const [result, setResult] = useState<SaveResult | null>(null);
  const stopper = useRef<AbortController | null>(null);

  const chosen = useMemo(
    () => (workbook?.sheets ?? []).filter((sheet) => include.has(sheet.id)),
    [workbook, include],
  );

  const clearRun = useCallback(() => {
    setActionError(null);
    setStopped(false);
    setResult(null);
  }, []);

  const pick = useCallback(
    async (files: File[]) => {
      const candidate = files[0];
      if (!candidate) return;
      setLoadError(null);
      clearRun();
      setWorkbook(null);
      setInclude(new Set<string>());

      if (!looksLikePdf(candidate)) {
        setLoadError(`“${candidate.name}” isn’t a PDF. Pick a .pdf file to read.`);
        return;
      }

      setReading(true);
      try {
        await tick();
        setFile(await readPdf(candidate));
      } catch (err) {
        setLoadError(describePdfError(err, candidate.name));
        setFile(null);
      } finally {
        setReading(false);
      }
    },
    [clearRun],
  );

  async function find() {
    if (!file || busy) return;

    const controller = new AbortController();
    stopper.current = controller;
    setBusy('finding');
    clearRun();
    setWorkbook(null);
    setStatus({ label: 'Getting started…', done: 0, total: file.pageCount });

    try {
      await tick();
      const found = await findTables(file, { format, signal: controller.signal }, (progress) => {
        setStatus({
          label: progressLabel(progress),
          done: progress.done,
          total: progress.total,
        });
      });
      setWorkbook(found);
      setInclude(new Set(found.sheets.map((sheet) => sheet.id)));
    } catch (err) {
      // Stopping is not a failure: no error card, no toast.
      if (controller.signal.aborted) setStopped(true);
      else {
        setActionError(describePdfError(err, file.name));
        toast.error('We couldn’t read that PDF.');
      }
    } finally {
      stopper.current = null;
      setBusy(null);
    }
  }

  async function save() {
    if (!file || !workbook || busy) return;
    // One CSV file holds one table, so CSV saves the first one ticked.
    const sheets = format === 'csv' ? chosen.slice(0, 1) : chosen;
    if (sheets.length === 0) return;

    const controller = new AbortController();
    stopper.current = controller;
    setBusy('writing');
    clearRun();
    setStatus({ label: 'Writing your spreadsheet…', done: 0, total: 0 });

    try {
      await tick();
      const written = await writeTables(
        workbook,
        { include: sheets.map((sheet) => sheet.id), format, signal: controller.signal },
        (progress) => {
          setStatus({
            label: progressLabel(progress),
            done: progress.done,
            total: progress.total,
          });
        },
      );
      const name = downloadName(baseName(file.name), format, `table.${format}`);
      downloadBlob(new Blob([written.bytes], { type: written.mime }), name);
      setResult({
        name,
        size: written.bytes.byteLength,
        sheets: written.written.length || sheets.length,
        rows: sheets.reduce((total, sheet) => total + sheet.rows.length, 0),
        flagged: sheets.reduce((total, sheet) => total + flaggedRows(sheet), 0),
      });
      toast.celebrate(`Saved ${name}`);
    } catch (err) {
      if (controller.signal.aborted) setStopped(true);
      else {
        setActionError(describePdfError(err, file.name));
        toast.error('That spreadsheet did not get written.');
      }
    } finally {
      stopper.current = null;
      setBusy(null);
    }
  }

  const allPictures =
    workbook !== null &&
    workbook.sheets.length === 0 &&
    workbook.pageCount > 0 &&
    workbook.imagePages.length === workbook.pageCount;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="PDF to read"
          description="One PDF at a time. Bank statements, invoices, reports — anything with a table in it."
          actions={
            file ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setFile(null);
                  setLoadError(null);
                  setWorkbook(null);
                  setInclude(new Set<string>());
                  clearRun();
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Start over
              </Button>
            ) : null
          }
        />
        <div className="p-5">
          {file ? (
            <FileLine name={file.name} size={file.size} pageCount={file.pageCount} />
          ) : (
            <Dropzone
              accept=".pdf,application/pdf"
              disabled={reading}
              title="Drop a PDF here"
              hint="Up to about 200 pages"
              onFiles={(files) => {
                void pick(files);
              }}
            />
          )}

          {reading ? (
            <Progress className="mt-4" label="Opening your PDF…" done={0} total={0} />
          ) : null}

          {loadError ? <ErrorNote className="mt-4" message={loadError} /> : null}
        </div>
      </Card>

      {!file ? (
        <Note>Add a PDF to get started.</Note>
      ) : (
        <Card>
          <CardHeader
            title="Tables in this PDF"
            description="Nothing is saved until you have looked at what we found."
          />
          <div className="flex flex-col gap-3 p-5">
            {file.pageCount > PAGE_WARN_THRESHOLD ? (
              <Note>
                This PDF has {file.pageCount} pages. That may take a while, or run out of memory.
                Try the Split tool first.
              </Note>
            ) : null}

            {busy === 'finding' ? (
              <div className="flex items-center gap-3">
                <Progress
                  className="min-w-0 flex-1"
                  label={status.label}
                  done={status.done}
                  total={status.total}
                />
                <Button size="sm" onClick={() => stopper.current?.abort()}>
                  <Square className="h-3.5 w-3.5" aria-hidden />
                  Stop
                </Button>
              </div>
            ) : null}

            {stopped && !workbook ? (
              <Note>Stopped. Nothing was saved, and your PDF is untouched.</Note>
            ) : null}

            {actionError && !workbook ? <ErrorNote message={actionError} /> : null}

            <div>
              <Button variant="primary" disabled={busy !== null} onClick={() => void find()}>
                <Table2 className="h-4 w-4" aria-hidden />
                {busy === 'finding' ? 'Looking…' : 'Find tables'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {allPictures ? (
        <Note>
          This PDF is a picture of a page, not text. There’s nothing here we can turn into a
          spreadsheet — you’d need software that reads text from pictures, and this tool doesn’t do
          that.
        </Note>
      ) : null}

      {workbook && !allPictures && workbook.sheets.length === 0 ? (
        <Note>
          We couldn’t find a table in this PDF. If you can see one, it may be a picture rather than
          text.
        </Note>
      ) : null}

      {workbook && workbook.sheets.length > 0 ? (
        <>
          <Note>
            <span className="font-medium text-ink">Check this before you save it.</span> Everything
            below came from your PDF — nothing was sent anywhere.
          </Note>

          {workbook.imagePages.length > 0 ? (
            <Note>
              {sentenceCase(pagesLabel(workbook.imagePages))}{' '}
              {workbook.imagePages.length === 1 ? 'is a picture' : 'are pictures'}, so nothing from{' '}
              {workbook.imagePages.length === 1 ? 'it' : 'them'} is in the spreadsheet.
            </Note>
          ) : null}

          {workbook.failedPages.length > 0 ? (
            <Note>
              {sentenceCase(pagesLabel(workbook.failedPages))} couldn’t be read, so nothing from{' '}
              {workbook.failedPages.length === 1 ? 'it' : 'them'} is in the spreadsheet.
            </Note>
          ) : null}

          {workbook.sheets.map((sheet) => {
            const ticked = include.has(sheet.id);
            return (
              <Card key={sheet.id}>
                <CardHeader
                  title={
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={ticked}
                        disabled={busy !== null}
                        onChange={(e) => {
                          const next = new Set(include);
                          if (e.target.checked) next.add(sheet.id);
                          else next.delete(sheet.id);
                          setInclude(next);
                          setResult(null);
                        }}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent disabled:cursor-not-allowed"
                        aria-label={`Include ${sheet.title}`}
                      />
                      <span className={cn('truncate', !ticked && 'text-muted')}>{sheet.title}</span>
                    </label>
                  }
                  description={`${plural(sheet.rows.length, 'row')} · ${plural(sheet.columns.length, 'column')} · ${pagesLabel(sheet.pages)}`}
                  actions={<Honesty sheet={sheet} />}
                />
                <div className="flex flex-col gap-3 p-5">
                  {sheet.notes.length > 0 ? (
                    <Note>
                      <ul className="flex flex-col gap-1">
                        {sheet.notes.map((note, i) => (
                          <li key={`${note.code}-${i}`}>{noteText(note)}</li>
                        ))}
                      </ul>
                    </Note>
                  ) : null}
                  <TablePreview sheet={sheet} />
                </div>
              </Card>
            );
          })}

          <Card>
            <CardHeader
              title="Save it"
              description="Your spreadsheet is built here in this tab and saved straight to your downloads."
            />
            <div className="flex flex-col gap-4 p-5">
              <div className="sm:max-w-xs">
                <SelectField
                  label="Format"
                  value={format}
                  onChange={(value) => {
                    setFormat(value);
                    setResult(null);
                  }}
                  options={FORMATS}
                  disabled={busy !== null}
                  hint={format === 'csv' ? 'CSV holds one table. Pick which one above.' : undefined}
                />
              </div>

              {chosen.length === 0 ? <Note>Tick at least one table to save.</Note> : null}

              {format === 'csv' && chosen.length > 1 ? (
                <Note>
                  Saving as CSV writes only “{chosen[0].title}”. Tick just that one, or choose Excel
                  to keep them all.
                </Note>
              ) : null}

              {busy === 'writing' ? (
                <div className="flex items-center gap-3">
                  <Progress
                    className="min-w-0 flex-1"
                    label={status.label}
                    done={status.done}
                    total={status.total}
                  />
                  <Button size="sm" onClick={() => stopper.current?.abort()}>
                    <Square className="h-3.5 w-3.5" aria-hidden />
                    Stop
                  </Button>
                </div>
              ) : null}

              {stopped ? (
                <Note>Stopped. Nothing was saved, and your PDF is untouched.</Note>
              ) : null}

              {actionError ? <ErrorNote message={actionError} /> : null}

              <div>
                <Button
                  variant="primary"
                  disabled={busy !== null || chosen.length === 0}
                  onClick={() => void save()}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {busy === 'writing' ? 'Saving…' : 'Save spreadsheet'}
                </Button>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {result ? (
        <Card>
          <CardHeader title="Saved" description={result.name} />
          <div className="flex flex-col gap-4 p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Tables" value={result.sheets} />
              <Stat label="Rows" value={result.rows.toLocaleString()} />
              <Stat label="Need checking" value={result.flagged} />
              <Stat label="Size" value={formatBytes(result.size)} />
            </dl>
            {result.flagged > 0 ? (
              <Note>
                The rows that need checking are marked in a Check column in the file, in the same
                order you saw them here.
              </Note>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
