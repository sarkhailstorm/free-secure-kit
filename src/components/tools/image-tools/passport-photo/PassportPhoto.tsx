import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, ScanFace, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { Slider } from '@/components/ui/Slider';
import {
  analysePhoto,
  describePassportError,
  getSpec,
  isSupportedPhoto,
  planLayout,
  preferredHeadMm,
  release,
  runChecks,
  worstSeverity,
  type Analysis,
  type AnalysisProgress,
  type BackgroundChoice,
  type Measurements,
  type PhotoSpec,
  type SpecId,
} from '@/lib/passport-photo';
import { DEFAULT_SPEC } from '@/lib/passport-photo';
import { ErrorNote, Note, Progress } from '../../pdf-tools/shared';
import { ChecksPanel } from './ChecksPanel';
import { DEFAULT_CUSTOM, DocumentPicker, type CustomSize } from './DocumentPicker';
import { OutputPanel } from './OutputPanel';
import { PhotoEditor } from './PhotoEditor';
import { ResultPanel } from './ResultPanel';

interface Picked {
  file: File;
  url: string;
}

export function PassportPhoto() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [measurements, setMeasurements] = useState<Measurements | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [specId, setSpecId] = useState<SpecId>(DEFAULT_SPEC);
  const [custom, setCustom] = useState<CustomSize>(DEFAULT_CUSTOM);
  const [headMm, setHeadMm] = useState<number | null>(null);
  const [background, setBackground] = useState<BackgroundChoice>({ kind: 'keep' });

  const running = useRef<AbortController | null>(null);
  const held = useRef<{ url: string; bitmap: ImageBitmap | null }>({ url: '', bitmap: null });

  useEffect(() => {
    held.current.bitmap = analysis?.bitmap ?? null;
  }, [analysis]);

  useEffect(() => {
    held.current.url = picked?.url ?? '';
  }, [picked]);

  useEffect(
    () => () => {
      running.current?.abort();
      if (held.current.url) URL.revokeObjectURL(held.current.url);
      held.current.bitmap?.close();
      void release();
    },
    [],
  );

  const spec: PhotoSpec = useMemo(() => {
    const base = getSpec(specId);
    return specId === 'custom' ? { ...base, ...custom } : base;
  }, [custom, specId]);

  const reset = useCallback(() => {
    running.current?.abort();
    running.current = null;
    if (held.current.url) URL.revokeObjectURL(held.current.url);
    held.current.bitmap?.close();
    held.current = { url: '', bitmap: null };
    setPicked(null);
    setAnalysis(null);
    setMeasurements(null);
    setProgress(null);
    setError(null);
    setHeadMm(null);
    setBackground({ kind: 'keep' });
  }, []);

  const onFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (!isSupportedPhoto(file)) {
        setError('Choose a JPEG, PNG or WebP photo.');
        return;
      }

      reset();
      const url = URL.createObjectURL(file);
      held.current.url = url;
      setPicked({ file, url });
      setError(null);

      const controller = new AbortController();
      running.current = controller;
      try {
        const result = await analysePhoto(file, controller.signal, setProgress);
        if (controller.signal.aborted) {
          result.bitmap.close();
          return;
        }
        held.current.bitmap = result.bitmap;
        setAnalysis(result);
        setMeasurements(result.measurements);
      } catch (err) {
        if (!controller.signal.aborted) setError(describePassportError(err, file.name));
      } finally {
        if (running.current === controller) running.current = null;
        setProgress(null);
      }
    },
    [reset],
  );

  const layout = useMemo(
    () => (measurements ? planLayout(spec, measurements, { headMm: headMm ?? undefined }) : null),
    [headMm, measurements, spec],
  );

  const checks = useMemo(() => {
    if (!analysis || !measurements || !layout) return [];
    return runChecks({
      spec,
      layout,
      measurements,
      faces: analysis.faces,
      sourceWidth: analysis.bitmap.width,
      sourceHeight: analysis.bitmap.height,
      fileBytes: analysis.fileBytes,
      background: analysis.background,
    });
  }, [analysis, layout, measurements, spec]);

  const headValue = headMm ?? preferredHeadMm(spec);

  return (
    <div className="flex flex-col gap-5">
      {!picked ? (
        <>
          <Dropzone
            onFiles={onFiles}
            accept="image/jpeg,image/png,image/webp"
            title="Drop a photo of yourself here"
            hint="A clear photo taken straight on, against a plain wall. JPEG, PNG or WebP."
            icon={<ScanFace className="h-5 w-5" aria-hidden />}
          />
          <HowItWorks />
        </>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {progress ? (
        <Card className="px-5 py-4">
          <Progress label={progress.message} done={progress.ratio ?? 0} total={1} />
        </Card>
      ) : null}

      {picked && !analysis && !progress && !error ? (
        <Note>Reading your photo&hellip;</Note>
      ) : null}

      {picked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[13px] text-muted">
            <span className="font-medium text-ink">{picked.file.name}</span>
            {analysis?.resized ? ' — scaled down to something this browser can hold' : ''}
          </p>
          <Button size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Use a different photo
          </Button>
        </div>
      ) : null}

      <DocumentPicker
        specId={specId}
        onSpecId={setSpecId}
        custom={custom}
        onCustom={setCustom}
        spec={spec}
      />

      {analysis && measurements && layout && picked ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader
                title="Where your head is"
                description={
                  measurements.origin === 'detected'
                    ? 'Found automatically. Drag a line if it looks wrong.'
                    : measurements.origin === 'manual'
                      ? 'You set these by hand.'
                      : 'This is a guess, so check the lines before you save.'
                }
              />
              <div className="px-5 py-4">
                <PhotoEditor
                  url={picked.url}
                  width={analysis.bitmap.width}
                  height={analysis.bitmap.height}
                  measurements={measurements}
                  crop={layout.crop}
                  eyeLocked={analysis.faces.length > 0}
                  onChange={setMeasurements}
                />
                <Slider
                  className="mt-4"
                  label="Head size in the finished photo"
                  value={Math.round(headValue * 10) / 10}
                  min={spec.headMinMm}
                  max={spec.headMaxMm}
                  step={0.5}
                  suffix=" mm"
                  onChange={setHeadMm}
                  hint={`Anywhere from ${spec.headMinMm} to ${spec.headMaxMm} mm is allowed. The middle is the safest.`}
                />
              </div>
            </Card>

            <ResultPanel
              bitmap={analysis.bitmap}
              mask={analysis.mask}
              spec={spec}
              layout={layout}
              options={{ spec, layout, background, format: 'image/jpeg', quality: 0.94 }}
              showGuides
            />
          </div>

          <ChecksPanel checks={checks} />

          <OutputPanel
            bitmap={analysis.bitmap}
            mask={analysis.mask}
            spec={spec}
            layout={layout}
            background={background}
            onBackground={setBackground}
            blocked={worstSeverity(checks) === 'blocker'}
          />
        </>
      ) : null}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Take the photo',
      body: 'Stand about an arm and a half from the camera, facing a plain, light wall. Even light on your face, no hat, no smile, eyes open.',
    },
    {
      title: 'Drop it here',
      body: 'Your face is found and your head is measured on your own device. The photo is never uploaded, because there is nowhere to upload it to.',
    },
    {
      title: 'Print it anywhere',
      body: 'Save one photo for an online form, or save a sheet of copies and hand it to any shop that prints 6 × 4 photos.',
    },
  ];

  return (
    <Card>
      <CardHeader
        title="How this works"
        description={'A booth costs about £12. A print of six costs about 30p.'}
      />
      <ol className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-semibold text-accent">
              {i + 1}
            </span>
            <h3 className="mt-2.5 text-[13px] font-semibold text-ink">{step.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="border-t border-line px-5 py-4">
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />
          <span>
            This tool crops and sizes. It does not retouch your face or your background, because
            most passport offices refuse a photo that has been edited.
          </span>
        </p>
      </div>
    </Card>
  );
}
