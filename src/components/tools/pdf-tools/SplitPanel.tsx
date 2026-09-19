import { useCallback, useId, useMemo, useState } from 'react';
import {
  CircleCheckBig,
  Files,
  RotateCcw,
  Scissors,
  Split,
  SquareDashed,
  SquareCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { useToast } from '@/components/ToastProvider';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import { baseName, formatBytes, plural } from '@/lib/format';
import { describePdfError, looksLikePdf } from '@/lib/pdf-tools/errors';
import {
  downloadName,
  extractPages,
  groupLabel,
  readPdf,
  splitIntoFiles,
  tick,
  zipFiles,
  type LoadedPdf,
} from '@/lib/pdf-tools/pdf';
import {
  describeGroup,
  formatPageRanges,
  groupsFromBreaks,
  groupsPerPage,
  parsePageRanges,
} from '@/lib/pdf-tools/ranges';
import {
  DEFAULT_EXPORT_OPTIONS,
  IMAGE_FORMAT_LABELS,
  IMAGE_QUALITY_LABELS,
  imageExtension,
  pagesToImages,
  type ImageExportOptions,
  type ImageFormat,
  type ImageQualityId,
} from '@/lib/pdf-tools/rasterize';
import { PageGrid, type PageInteraction } from './PageGrid';
import { ErrorNote, FileLine, Note, Progress, SelectField, Stat } from './shared';
import { useThumbnails } from './useThumbnails';

type SplitMode = 'extract' | 'each' | 'breaks';

const MODES: readonly {
  id: SplitMode;
  title: string;
  blurb: string;
  icon: typeof Scissors;
}[] = [
  {
    id: 'extract',
    title: 'Extract pages',
    blurb: 'Pick pages, then save them as one PDF, separate PDFs, or pictures.',
    icon: Scissors,
  },
  {
    id: 'each',
    title: 'One file per page',
    blurb: 'Every page in the document becomes its own PDF, zipped up.',
    icon: Files,
  },
  {
    id: 'breaks',
    title: 'Split at break points',
    blurb: 'Mark where each new file should start.',
    icon: Split,
  },
];

type OutputMode = 'one' | 'separate' | 'images';

const OUTPUTS: readonly { id: OutputMode; title: string; blurb: string }[] = [
  {
    id: 'one',
    title: 'One combined PDF',
    blurb: 'The chosen pages, in order, as a single document.',
  },
  {
    id: 'separate',
    title: 'A separate PDF per page',
    blurb: 'Each chosen page as its own PDF, zipped up.',
  },
  {
    id: 'images',
    title: 'An image per page',
    blurb: 'Each chosen page as a picture you can drop into a slide or a chat.',
  },
];

const FORMAT_OPTIONS = (Object.keys(IMAGE_FORMAT_LABELS) as ImageFormat[]).map((value) => ({
  value,
  label: IMAGE_FORMAT_LABELS[value],
}));

const QUALITY_OPTIONS = (Object.keys(IMAGE_QUALITY_LABELS) as ImageQualityId[]).map((value) => ({
  value,
  label: IMAGE_QUALITY_LABELS[value],
}));

interface SplitResult {
  name: string;
  size: number;
  fileCount: number;
  pageCount: number;
  noun: string;
}

export function SplitPanel() {
  const toast = useToast();
  const rangeId = useId();

  const [file, setFile] = useState<LoadedPdf | null>(null);
  const [reading, setReading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<SplitMode>('extract');
  const [output, setOutput] = useState<OutputMode>('one');
  const [exportOptions, setExportOptions] = useState<ImageExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set<number>());
  const [rangeText, setRangeText] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [breaks, setBreaks] = useState<ReadonlySet<number>>(new Set<number>());

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ label: '', done: 0, total: 0 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<SplitResult | null>(null);

  const thumbs = useThumbnails(file);

  const selectedPages = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected],
  );

  const groups = useMemo<number[][]>(() => {
    if (!file) return [];
    if (mode === 'each') return groupsPerPage(file.pageCount);
    if (mode === 'breaks') return groupsFromBreaks(file.pageCount, breaks);
    if (selectedPages.length === 0) return [];
    return output === 'one' ? [selectedPages] : selectedPages.map((page) => [page]);
  }, [file, mode, breaks, selectedPages, output]);

  const outputPages = groups.reduce((sum, group) => sum + group.length, 0);
  const asImages = mode === 'extract' && output === 'images';
  const imageLabel = exportOptions.format === 'jpeg' ? 'JPEG' : 'PNG';

  const resetChoices = useCallback(() => {
    setSelected(new Set<number>());
    setBreaks(new Set<number>());
    setRangeText('');
    setRangeError(null);
    setActionError(null);
    setResult(null);
  }, []);

  const pick = useCallback(
    async (files: File[]) => {
      const candidate = files[0];
      if (!candidate) return;
      setLoadError(null);
      setResult(null);

      if (!looksLikePdf(candidate)) {
        setLoadError(`“${candidate.name}” isn’t a PDF. Pick a .pdf file to split.`);
        return;
      }

      setReading(true);
      try {
        await tick();
        const loaded = await readPdf(candidate);
        setFile(loaded);
        resetChoices();
      } catch (err) {
        setLoadError(describePdfError(err, candidate.name));
        setFile(null);
      } finally {
        setReading(false);
      }
    },
    [resetChoices],
  );

  const applySelection = useCallback((pages: number[]) => {
    setSelected(new Set(pages));
    setRangeText(formatPageRanges(pages));
    setRangeError(null);
    setResult(null);
  }, []);

  const onRangeInput = useCallback(
    (text: string) => {
      setRangeText(text);
      setResult(null);
      const parsed = parsePageRanges(text, file?.pageCount ?? 0);
      if (parsed.ok) {
        setSelected(new Set(parsed.pages));
        setRangeError(null);
      } else {
        setRangeError(parsed.message);
      }
    },
    [file],
  );

  const toggle = useCallback(
    (page: number) => {
      setResult(null);
      if (mode === 'breaks') {
        setBreaks((previous) => {
          const next = new Set(previous);
          if (next.has(page)) next.delete(page);
          else next.add(page);
          return next;
        });
        return;
      }
      const next = new Set(selected);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      applySelection([...next].sort((a, b) => a - b));
    },
    [mode, selected, applySelection],
  );

  async function run() {
    if (!file || busy) return;

    if (groups.length === 0) {
      setActionError(
        mode === 'extract'
          ? 'Choose at least one page to extract.'
          : 'There is nothing to split here.',
      );
      return;
    }

    setBusy(true);
    setActionError(null);
    setResult(null);
    setStatus({ label: 'Getting started…', done: 0, total: groups.length });

    try {
      await tick();

      if (asImages) {
        const built = await pagesToImages(file, selectedPages, exportOptions, (done, total) => {
          setStatus({
            label: `Turning page ${Math.min(done + 1, total)} of ${total} into a picture…`,
            done,
            total,
          });
        });
        const mime = exportOptions.format === 'jpeg' ? 'image/jpeg' : 'image/png';

        if (built.length === 1) {
          downloadBlob(new Blob([built[0].bytes], { type: mime }), built[0].name);
          setResult({
            name: built[0].name,
            size: built[0].bytes.byteLength,
            fileCount: 1,
            pageCount: 1,
            noun: imageLabel,
          });
          toast.celebrate(`Saved ${built[0].name}`);
          return;
        }

        setStatus({ label: 'Packing the ZIP…', done: 0, total: 100 });
        const bundle = await zipFiles(built, (done, total) => {
          setStatus({ label: 'Packing the ZIP…', done, total });
        });
        const zipName = downloadName(
          `${baseName(file.name)} - ${imageExtension(exportOptions.format)} pages`,
          'zip',
          'pages.zip',
        );
        downloadBlob(bundle, zipName);
        setResult({
          name: zipName,
          size: bundle.size,
          fileCount: built.length,
          pageCount: built.length,
          noun: imageLabel,
        });
        toast.celebrate(`Saved ${plural(built.length, 'picture')} as ${zipName}`);
        return;
      }

      if (groups.length === 1) {
        const pages = groups[0];
        setStatus({ label: 'Building your PDF…', done: 0, total: 0 });
        const bytes = await extractPages(file, pages);
        const name = downloadName(
          `${baseName(file.name)} - ${groupLabel(pages)}`,
          'pdf',
          'extracted.pdf',
        );
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
        setResult({ name, size: bytes.byteLength, fileCount: 1, pageCount: pages.length, noun: 'PDF' });
        toast.celebrate(`Saved ${name}`);
        return;
      }

      const built = await splitIntoFiles(file, groups, (done, total) => {
        setStatus({
          label: `Building file ${Math.min(done + 1, total)} of ${total}…`,
          done,
          total,
        });
      });

      setStatus({ label: 'Packing the ZIP…', done: 0, total: 100 });
      const blob = await zipFiles(built, (done, total) => {
        setStatus({ label: 'Packing the ZIP…', done, total });
      });

      const name = downloadName(`${baseName(file.name)} - split`, 'zip', 'split.zip');
      downloadBlob(blob, name);
      setResult({
        name,
        size: blob.size,
        fileCount: built.length,
        pageCount: outputPages,
        noun: 'PDF',
      });
      toast.celebrate(`Saved ${plural(built.length, 'PDF')} as ${name}`);
    } catch (err) {
      setActionError(describePdfError(err, file.name));
      toast.error('That split did not work.');
    } finally {
      setBusy(false);
    }
  }

  const interaction: PageInteraction =
    mode === 'extract' ? 'select' : mode === 'breaks' ? 'break' : 'none';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="PDF to split"
          description="One PDF at a time. Every page is previewed below."
          actions={
            file ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  resetChoices();
                  setLoadError(null);
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
              hint={'Nothing is uploaded — the file is read in this tab'}
              onFiles={(files) => {
                void pick(files);
              }}
            />
          )}

          {reading ? (
            <Progress className="mt-4" label={'Opening your PDF…'} done={0} total={0} />
          ) : null}

          {loadError ? <ErrorNote className="mt-4" message={loadError} /> : null}
        </div>
      </Card>

      {!file ? (
        <Note>
          Add a PDF and you can pull out just the pages you need, save each page as its own
          file or a picture, or cut the document wherever you like.
        </Note>
      ) : (
        <Card>
          <CardHeader
            title="How to split"
            description="Pick an approach, then choose the pages on the previews below."
          />

          <div className="flex flex-col gap-5 p-5">
            <fieldset disabled={busy}>
              <legend className="sr-only">How to split this PDF</legend>
              <div className="grid gap-2 sm:grid-cols-3">
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
                        name="pdf-split-mode"
                        value={option.id}
                        checked={active}
                        onChange={() => {
                          setMode(option.id);
                          setActionError(null);
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
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {mode === 'extract' ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor={rangeId} className="text-[13px] font-medium text-ink">
                    Pages to extract
                  </label>
                  <input
                    id={rangeId}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    value={rangeText}
                    onChange={(e) => onRangeInput(e.target.value)}
                    placeholder="e.g. 1-3, 7, 9-12"
                    aria-invalid={rangeError ? true : undefined}
                    aria-describedby={rangeError ? `${rangeId}-error` : undefined}
                    className={cn(
                      'mt-1.5 h-10 w-full rounded-xl border bg-surface px-3 font-mono text-sm text-ink',
                      'placeholder:font-sans placeholder:text-faint disabled:opacity-60',
                      rangeError ? 'border-danger' : 'border-line',
                    )}
                  />
                  {rangeError ? (
                    <p id={`${rangeId}-error`} role="alert" className="mt-1.5 text-[13px] text-danger">
                      {rangeError}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-faint">
                      Type a range or click the pages below &mdash; the two stay in step.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      applySelection(Array.from({ length: file.pageCount }, (_, i) => i + 1))
                    }
                  >
                    <SquareCheck className="h-3.5 w-3.5" aria-hidden />
                    Select all
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => applySelection([])}>
                    <SquareDashed className="h-3.5 w-3.5" aria-hidden />
                    Select none
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      applySelection(
                        Array.from({ length: file.pageCount }, (_, i) => i + 1).filter(
                          (page) => !selected.has(page),
                        ),
                      )
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Invert
                  </Button>
                </div>

                <fieldset disabled={busy} className="min-w-0">
                  <legend className="text-[13px] font-medium text-ink">What to save</legend>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                    {OUTPUTS.map((option) => {
                      const active = output === option.id;
                      return (
                        <label
                          key={option.id}
                          className={cn(
                            'flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors',
                            'focus-within:ring-2 focus-within:ring-accent',
                            active
                              ? 'border-accent bg-accent-soft'
                              : 'border-line bg-surface hover:bg-elevated',
                            busy && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          <input
                            type="radio"
                            name="pdf-extract-output"
                            checked={active}
                            onChange={() => {
                              setOutput(option.id);
                              setActionError(null);
                              setResult(null);
                            }}
                            className="sr-only"
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-ink">
                              {option.title}
                            </span>
                            <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                              {option.blurb}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {output === 'images' ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Picture format"
                        value={exportOptions.format}
                        options={FORMAT_OPTIONS}
                        onChange={(format) => {
                          setExportOptions((previous) => ({ ...previous, format }));
                          setResult(null);
                        }}
                      />
                      <SelectField
                        label="Detail"
                        value={exportOptions.quality}
                        options={QUALITY_OPTIONS}
                        onChange={(quality) => {
                          setExportOptions((previous) => ({ ...previous, quality }));
                          setResult(null);
                        }}
                        hint={
                          exportOptions.quality === 'print'
                            ? 'Large files — best for printing'
                            : exportOptions.quality === 'screen'
                              ? 'Small files — fine on a screen'
                              : 'A good balance for most uses'
                        }
                      />
                    </div>
                  ) : null}
                </fieldset>
              </div>
            ) : null}

            {mode === 'each' ? (
              <Note>
                Every one of this document&rsquo;s {file.pageCount} pages becomes a separate PDF,
                delivered as a single ZIP.
              </Note>
            ) : null}

            {mode === 'breaks' ? (
              <Note>
                Click a page to mark it as the <strong className="text-ink">first page</strong> of
                a new file. Page 1 always starts one.
              </Note>
            ) : null}

            <div className="flex flex-col gap-2">
              {thumbs.error ? (
                <ErrorNote
                  message={`${thumbs.error} Page previews are unavailable, but you can still pick pages by number below.`}
                />
              ) : null}
              <PageGrid
                pageCount={file.pageCount}
                thumbs={thumbs}
                interaction={interaction}
                selected={selected}
                breaks={breaks}
                onToggle={toggle}
              />
              {!thumbs.error && thumbs.outstanding > 0 ? (
                <p className="text-xs text-faint" aria-live="polite">
                  Rendering previews&hellip; {thumbs.outstanding} to go
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat label="Source" value={plural(file.pageCount, 'page')} />
                <Stat label="Pages kept" value={outputPages} />
                <Stat
                  label="Output"
                  value={
                    groups.length === 0
                      ? 'nothing yet'
                      : asImages
                        ? groups.length === 1
                          ? `1 ${imageLabel}`
                          : `${groups.length} ${imageLabel}s in a ZIP`
                        : groups.length === 1
                          ? '1 PDF'
                          : `${groups.length} PDFs in a ZIP`
                  }
                />
              </dl>

              {groups.length > 1 ? (
                <div className="flex flex-wrap gap-1.5">
                  {groups.slice(0, 12).map((group, index) => (
                    <span
                      key={`${index}-${group[0]}`}
                      className="rounded-md bg-line/60 px-1.5 py-0.5 text-[11px] font-medium text-muted"
                    >
                      {describeGroup(group)}
                    </span>
                  ))}
                  {groups.length > 12 ? (
                    <span className="rounded-md bg-line/60 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                      +{groups.length - 12} more
                    </span>
                  ) : null}
                </div>
              ) : null}

              {busy ? (
                <Progress label={status.label} done={status.done} total={status.total} />
              ) : null}

              {actionError ? <ErrorNote message={actionError} /> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  disabled={
                    busy || groups.length === 0 || (mode === 'extract' && Boolean(rangeError))
                  }
                  onClick={() => void run()}
                >
                  <Scissors className="h-4 w-4" aria-hidden />
                  {busy
                    ? 'Working…'
                    : asImages
                      ? `Save ${plural(groups.length, 'page')} as ${imageLabel}`
                      : mode === 'extract' && output === 'separate' && groups.length > 1
                        ? `Save ${plural(groups.length, 'page')} separately`
                        : groups.length > 1
                          ? `Split into ${groups.length} files`
                          : mode === 'extract'
                            ? 'Extract to a PDF'
                            : 'Save as one PDF'}
                </Button>
                {groups.length > 40 ? (
                  <p className="text-[13px] text-warn">
                    That is {groups.length} separate files &mdash; it may take a moment.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      )}

      {result ? (
        <Card className="border-ok/30 bg-ok/5">
          <div className="flex items-start gap-2.5 p-5">
            <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Downloaded {result.name}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {result.fileCount === 1
                  ? `${plural(result.pageCount, 'page')} · ${formatBytes(result.size)}`
                  : `${plural(result.fileCount, result.noun)} · ${formatBytes(result.size)}`}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}