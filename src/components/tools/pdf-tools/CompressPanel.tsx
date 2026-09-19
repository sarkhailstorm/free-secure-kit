import { useCallback, useState } from 'react';
import { Download, Gauge, Minimize2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { Slider } from '@/components/ui/Slider';
import { useToast } from '@/components/ToastProvider';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import { baseName, formatBytes, plural } from '@/lib/format';
import { describePdfError, looksLikePdf } from '@/lib/pdf-tools/errors';
import {
  compressPdf,
  downloadName,
  readPdf,
  summariseCompression,
  tick,
  type CompressProgress,
  type CompressReport,
  type LoadedPdf,
} from '@/lib/pdf-tools/pdf';
import { ErrorNote, FileLine, Note, Progress, SizeChange, Stat } from './shared';

const STAGE_LABELS: Record<CompressProgress['stage'], string> = {
  reading: 'Reading the document…',
  images: 'Re-encoding images…',
  saving: 'Rebuilding the file…',
};

export function CompressPanel() {
  const toast = useToast();
  const [file, setFile] = useState<LoadedPdf | null>(null);
  const [reading, setReading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [quality, setQuality] = useState(70);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<CompressProgress>({
    stage: 'reading',
    done: 0,
    total: 0,
  });
  const [report, setReport] = useState<CompressReport | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pick = useCallback(async (files: File[]) => {
    const candidate = files[0];
    if (!candidate) return;
    setLoadError(null);
    setActionError(null);
    setReport(null);

    if (!looksLikePdf(candidate)) {
      setLoadError(`“${candidate.name}” isn’t a PDF. Pick a .pdf file to compress.`);
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
    setBusy(true);
    setReport(null);
    setActionError(null);
    setProgress({ stage: 'reading', done: 0, total: 0 });

    try {
      await tick();
      const outcome = await compressPdf(file, quality / 100, setProgress);
      setReport(outcome);
    } catch (err) {
      setActionError(describePdfError(err, file.name));
      toast.error('Compression failed.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!report || !file) return;
    const name = report.keptOriginal
      ? downloadName(baseName(file.name), 'pdf', 'document.pdf')
      : downloadName(`${baseName(file.name)} - compressed`, 'pdf', 'compressed.pdf');
    downloadBlob(new Blob([report.bytes], { type: 'application/pdf' }), name);
    toast.celebrate(`Saved ${name}`);
  }

  const summary = report ? summariseCompression(report) : null;

  const progressLabel =
    progress.stage === 'images' && progress.total > 0
      ? `Re-encoding image ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
      : STAGE_LABELS[progress.stage];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="PDF to compress"
          description="One document at a time. The file is opened here in your browser."
          actions={
            file ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setReport(null);
                  setActionError(null);
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
              hint={'Works best on PDFs full of photos or scanned pages'}
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

      <Note>
        <p>
          <strong className="font-medium text-ink">What this can actually do.</strong> It re-encodes
          the JPEG images inside a PDF at a lower quality and rebuilds the file more compactly. A
          PDF of scanned or photographic pages can shrink a lot. A PDF that is mostly text has
          almost nothing to squeeze, and will barely change &mdash; you will be told plainly which
          one yours is.
        </p>
      </Note>

      {file ? (
        <Card>
          <CardHeader
            title="Image quality"
            description="Lower quality means smaller images. Page text and vector artwork are never touched."
          />
          <div className="flex flex-col gap-5 p-5">
            <Slider
              label="JPEG quality"
              value={quality}
              onChange={(value) => {
                setQuality(value);
                setReport(null);
              }}
              min={20}
              max={95}
              step={5}
              suffix="%"
              disabled={busy}
              hint={
                quality >= 85
                  ? 'Near-original quality. Expect a modest saving.'
                  : quality >= 60
                    ? 'A good balance for scanned documents and photos.'
                    : 'Visibly softer images, but the biggest saving.'
              }
            />

            {busy ? (
              <Progress
                label={progressLabel}
                done={progress.stage === 'images' ? progress.done : 0}
                total={progress.stage === 'images' ? progress.total : 0}
              />
            ) : null}

            {actionError ? <ErrorNote message={actionError} /> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={busy} onClick={() => void run()}>
                <Minimize2 className="h-4 w-4" aria-hidden />
                {busy ? 'Compressing…' : report ? 'Compress again' : 'Compress PDF'}
              </Button>
              {report ? (
                <p className="text-[13px] text-faint">
                  Move the slider and run it again to compare.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {report && summary ? (
        <Card
          className={cn(
            summary.tone === 'good' ? 'border-ok/30 bg-ok/5' : 'border-line bg-elevated',
          )}
        >
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-2.5">
              <Gauge
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  summary.tone === 'good' ? 'text-ok' : 'text-muted',
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{summary.headline}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{summary.detail}</p>
              </div>
            </div>

            <SizeChange before={report.originalSize} after={report.bytes.byteLength} />

            <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <Stat label="Pages" value={report.pageCount} />
              <Stat label="Images found" value={report.imagesFound} />
              <Stat
                label="Re-encoded"
                value={`${report.imagesRewritten} of ${report.jpegImages} JPEG`}
              />
              <Stat
                label="Image data"
                value={
                  report.imagesRewritten > 0
                    ? `${formatBytes(report.imageBytesBefore)} → ${formatBytes(report.imageBytesAfter)}`
                    : 'unchanged'
                }
              />
            </dl>

            {report.imagesFound > report.jpegImages ? (
              <p className="text-[13px] leading-relaxed text-faint">
                {plural(report.imagesFound - report.jpegImages, 'image')} in this file
                {report.imagesFound - report.jpegImages === 1 ? ' is' : ' are'} stored in a format
                a browser cannot safely re-encode &mdash; masks, indexed colour or JPEG 2000 &mdash;
                so {report.imagesFound - report.jpegImages === 1 ? 'it was' : 'they were'} left
                exactly as {report.imagesFound - report.jpegImages === 1 ? 'it was' : 'they were'}.
              </p>
            ) : null}

            <div>
              <Button variant="primary" onClick={save}>
                <Download className="h-4 w-4" aria-hidden />
                {report.keptOriginal ? 'Download original' : 'Download compressed PDF'}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
