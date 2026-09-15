'use client';

import { useCallback, useRef, useState } from 'react';
import {
  FileType2,
  LayoutTemplate,
  RotateCcw,
  Square,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { useToast } from '@/components/ToastProvider';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import { baseName, formatBytes } from '@/lib/format';
import { describePdfError, looksLikePdf } from '@/lib/pdf-tools/errors';
import { downloadName, readPdf, tick, type LoadedPdf } from '@/lib/pdf-tools/pdf';
import {
  PAGE_WARN_THRESHOLD,
  pdfToWord,
  type WordMode,
  type WordProgress,
  type WordReport,
} from '@/lib/pdf-to-word';
import { ErrorNote, FileLine, Note, Progress, Stat } from './shared';

const MODES: readonly {
  id: WordMode;
  title: string;
  blurb: string;
  expect: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'editable',
    title: 'Easy to edit',
    blurb: 'Real paragraphs, lists and tables that move as you type. Best for letters, reports and CVs.',
    expect: 'Page breaks may land in slightly different places.',
    icon: TextCursorInput,
  },
  {
    id: 'exact',
    title: 'Exact layout',
    blurb:
      'Every line stays where it was, so it looks just like the PDF. Best for forms and flyers you only need to tweak.',
    expect: 'Every line sits in its own box, so it’s fiddly to edit.',
    icon: LayoutTemplate,
  },
];

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function progressLabel({ stage, done, total }: WordProgress): string {
  const page = Math.min(done + 1, total);
  if (stage === 'reading') return `Reading page ${page} of ${total}…`;
  if (stage === 'analysing') return 'Working out the layout…';
  return 'Writing your Word file…';
}

function Choice({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        '-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-line/30',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-snug text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{hint}</span>
      </span>
    </label>
  );
}

interface ConvertResult {
  name: string;
  size: number;
  report: WordReport;
}

export function WordPanel() {
  const toast = useToast();

  const [file, setFile] = useState<LoadedPdf | null>(null);
  const [reading, setReading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<WordMode>('editable');
  const [pagePictures, setPagePictures] = useState(true);
  const [straightDown, setStraightDown] = useState(false);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ label: '', done: 0, total: 0 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const stopper = useRef<AbortController | null>(null);

  const pick = useCallback(async (files: File[]) => {
    const candidate = files[0];
    if (!candidate) return;
    setLoadError(null);
    setActionError(null);
    setStopped(false);
    setResult(null);

    if (!looksLikePdf(candidate)) {
      setLoadError(`“${candidate.name}” isn’t a PDF. Pick a .pdf file to convert.`);
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
  }, []);

  async function run() {
    if (!file || busy) return;

    const controller = new AbortController();
    stopper.current = controller;
    setBusy(true);
    setActionError(null);
    setStopped(false);
    setResult(null);
    setStatus({ label: 'Getting started…', done: 0, total: file.pageCount });

    try {
      await tick();
      const { bytes, report } = await pdfToWord(
        file,
        {
          mode,
          imagesForScannedPages: pagePictures,
          flattenColumns: straightDown,
          signal: controller.signal,
        },
        (progress) => {
          setStatus({ label: progressLabel(progress), done: progress.done, total: progress.total });
        },
      );
      // Both modes from one PDF otherwise save as the same name, which tells the user nothing.
      const suffix = mode === 'exact' ? ' (exact layout)' : '';
      const name = downloadName(`${baseName(file.name)}${suffix}`, 'docx', 'document.docx');
      downloadBlob(new Blob([bytes], { type: DOCX_MIME }), name);
      setResult({ name, size: bytes.byteLength, report });
      toast.celebrate(`Saved ${name}`);
    } catch (err) {
      // Stopping is not a failure: no error card, no toast.
      if (controller.signal.aborted) setStopped(true);
      else {
        setActionError(describePdfError(err, file.name));
        toast.error('That conversion did not work.');
      }
    } finally {
      stopper.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="PDF to convert"
          description="One PDF at a time. You get a .docx file that opens in Word, Google Docs or LibreOffice."
          actions={
            file ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setLoadError(null);
                  setActionError(null);
                  setStopped(false);
                  setResult(null);
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
            title="How you want to edit it"
            description="Both keep the fonts, colours and page size."
          />

          <div className="flex flex-col gap-5 p-5">
            <fieldset disabled={busy}>
              <legend className="sr-only">Conversion style</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODES.map((option) => {
                  const Icon = option.icon;
                  const active = mode === option.id;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
                        'focus-within:ring-2 focus-within:ring-accent',
                        active
                          ? 'border-accent bg-accent-soft'
                          : 'border-line bg-surface hover:bg-elevated',
                        busy && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <input
                        type="radio"
                        name="pdf-to-word-mode"
                        value={option.id}
                        checked={active}
                        onChange={() => {
                          setMode(option.id);
                          setActionError(null);
                          setStopped(false);
                          setResult(null);
                        }}
                        className="sr-only"
                      />
                      <Icon
                        className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-accent' : 'text-muted')}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-ink">
                          {option.title}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                          {option.blurb}
                        </span>
                        <span className="mt-1 block text-[12px] leading-snug text-faint">
                          {option.expect}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset disabled={busy} className="border-t border-line pt-3">
              <legend className="sr-only">Conversion settings</legend>
              <Choice
                label="Include a picture of each scanned page"
                hint="A scanned page is a photo of text. Turn this off and those pages come out blank."
                checked={pagePictures}
                disabled={busy}
                onChange={(value) => {
                  setPagePictures(value);
                  setResult(null);
                }}
              />
              <Choice
                label="Ignore columns and read straight down"
                hint="Turn this on if a page with columns comes out jumbled."
                checked={straightDown}
                disabled={busy}
                onChange={(value) => {
                  setStraightDown(value);
                  setResult(null);
                }}
              />
            </fieldset>

            {file.pageCount > PAGE_WARN_THRESHOLD ? (
              <Note>
                This PDF has {file.pageCount} pages. That may take a while, or run out of memory.
                Try the Split tool first.
              </Note>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-line pt-4">
              {busy ? (
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

              {stopped ? <Note>Stopped. Nothing was saved, and your PDF is untouched.</Note> : null}

              {actionError ? <ErrorNote message={actionError} /> : null}

              <div>
                <Button variant="primary" disabled={busy} onClick={() => void run()}>
                  <FileType2 className="h-4 w-4" aria-hidden />
                  {busy ? 'Working…' : 'Convert to Word'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {result ? (
        <Card>
          <CardHeader title="Saved" description={result.name} />
          <div className="flex flex-col gap-4 p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Pages" value={result.report.pageCount} />
              {/* Exact mode builds boxes, not paragraphs and tables, so it counts what it made. */}
              {result.report.mode === 'exact' ? (
                <Stat label="Boxes" value={result.report.paragraphs} />
              ) : (
                <>
                  <Stat label="Paragraphs" value={result.report.paragraphs} />
                  <Stat label="Headings" value={result.report.headings} />
                </>
              )}
              <Stat label="Pictures" value={result.report.images} />
              {result.report.mode === 'exact' ? null : (
                <Stat label="Tables" value={result.report.tables} />
              )}
              <Stat label="Size" value={formatBytes(result.size)} />
            </dl>
            {result.report.notes.length > 0 ? (
              <Note>
                <ul className="flex flex-col gap-1">
                  {result.report.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </Note>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
