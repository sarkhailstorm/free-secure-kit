'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Eye,
  Images,
  RotateCcw,
  Scissors,
  Shapes,
  Square,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import {
  clearDownloads,
  DEFAULT_MODEL,
  describeBackgroundError,
  isModelReady,
  isSupportedPhoto,
  MODEL_CHOICES,
  releaseSession,
  removeBackground,
  type ModelChoice,
  type RemovalProgress,
  type RemovalResult,
} from '@/lib/background-remover';
import { cn } from '@/lib/cn';
import { downloadBlob, safeFilename } from '@/lib/download';
import { baseName, formatBytes } from '@/lib/format';
import { ErrorNote, Note, Progress, Stat } from '../pdf-tools/shared';

const CHOICES: readonly { id: ModelChoice; title: string; blurb: string; icon: LucideIcon }[] = [
  {
    id: 'person',
    title: 'A person',
    blurb: 'Portraits and full-length photos. Much kinder to hair and soft edges.',
    icon: UserRound,
  },
  {
    id: 'anything',
    title: 'Anything else',
    blurb: 'Products, pets, plants, furniture — anything that is not a person.',
    icon: Shapes,
  },
];

type Backdrop = 'none' | 'colour';

const BACKDROPS: readonly { id: Backdrop; label: string }[] = [
  { id: 'none', label: 'Transparent' },
  { id: 'colour', label: 'Solid colour' },
];

const SWATCHES: readonly { value: string; label: string }[] = [
  { value: '#ffffff', label: 'White' },
  { value: '#f4f4f5', label: 'Light grey' },
  { value: '#0f172a', label: 'Near black' },
  { value: '#dbeafe', label: 'Pale blue' },
  { value: '#dcfce7', label: 'Pale green' },
];

/** Grey squares, so a transparent cut-out reads as transparent in either theme. */
const CHECKS: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, rgb(127 127 127 / 0.22) 25%, transparent 25%), linear-gradient(-45deg, rgb(127 127 127 / 0.22) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(127 127 127 / 0.22) 75%), linear-gradient(-45deg, transparent 75%, rgb(127 127 127 / 0.22) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
};

interface Picked {
  file: File;
  url: string;
  width: number;
  height: number;
}

/** Paint the cut-out over a colour, so the saved PNG has nothing see-through. */
async function flatten(blob: Blob, colour: string): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser would not provide a 2D canvas.');
    context.fillStyle = colour;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!out) throw new Error('The picture could not be saved.');
    return out;
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function BackgroundRemoverPanel() {
  const toast = useToast();

  const [picked, setPicked] = useState<Picked | null>(null);
  const [choice, setChoice] = useState<ModelChoice>(DEFAULT_MODEL);
  const [stored, setStored] = useState<readonly ModelChoice[]>([]);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ label: '', done: 0, total: 0 });
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [result, setResult] = useState<RemovalResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [backdrop, setBackdrop] = useState<Backdrop>('none');
  const [colour, setColour] = useState('#ffffff');
  const [split, setSplit] = useState(50);
  const [showOriginal, setShowOriginal] = useState(false);
  const [saving, setSaving] = useState(false);

  const stopper = useRef<AbortController | null>(null);
  const urls = useRef<Set<string>>(new Set());
  const resultUrlRef = useRef<string | null>(null);
  const pickedUrlRef = useRef<string | null>(null);

  const keepUrl = useCallback((url: string) => {
    urls.current.add(url);
    return url;
  }, []);

  // Guarded by the set, so releasing the same URL twice is harmless.
  const releaseUrl = useCallback((url: string | null) => {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  const swapResultUrl = useCallback(
    (next: string | null) => {
      releaseUrl(resultUrlRef.current);
      resultUrlRef.current = next;
      setResultUrl(next);
    },
    [releaseUrl],
  );

  const swapPicked = useCallback(
    (next: Picked | null) => {
      releaseUrl(pickedUrlRef.current);
      pickedUrlRef.current = next?.url ?? null;
      setPicked(next);
    },
    [releaseUrl],
  );

  // Leaving the page: stop the work, hand back the several megabytes the
  // remover holds, and let go of every preview a full-size photo pins.
  useEffect(() => {
    const held = urls.current;
    return () => {
      stopper.current?.abort();
      void releaseSession();
      held.forEach((url) => URL.revokeObjectURL(url));
      held.clear();
    };
  }, []);

  const refreshStored = useCallback(async () => {
    const found: ModelChoice[] = [];
    for (const option of CHOICES) {
      try {
        if (await isModelReady(option.id)) found.push(option.id);
      } catch {
        // Storage is blocked or unavailable; treat it as a fresh download.
      }
    }
    return found;
  }, []);

  useEffect(() => {
    let live = true;
    void refreshStored().then((found) => {
      if (live) setStored(found);
    });
    return () => {
      live = false;
    };
  }, [refreshStored]);

  const clearResult = useCallback(() => {
    setResult(null);
    swapResultUrl(null);
    setError(null);
    setStopped(false);
  }, [swapResultUrl]);

  const pick = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      setLoadError(null);
      clearResult();

      if (!isSupportedPhoto(file)) {
        setLoadError(`“${file.name}” is not a JPEG, PNG or WebP. Pick one of those instead.`);
        return;
      }

      try {
        const bitmap = await createImageBitmap(file);
        swapPicked({
          file,
          url: keepUrl(URL.createObjectURL(file)),
          width: bitmap.width,
          height: bitmap.height,
        });
        bitmap.close();
      } catch {
        setLoadError(`“${file.name}” could not be opened. It may be damaged.`);
      }
    },
    [clearResult, keepUrl, swapPicked],
  );

  const startOver = useCallback(() => {
    stopper.current?.abort();
    clearResult();
    setLoadError(null);
    swapPicked(null);
  }, [clearResult, swapPicked]);

  async function run() {
    if (!picked || busy) return;

    const controller = new AbortController();
    stopper.current = controller;
    setBusy(true);
    setStopped(false);
    setError(null);
    setStatus({ label: 'Getting started…', done: 0, total: 0 });

    try {
      const outcome = await removeBackground(
        picked.file,
        { model: choice, signal: controller.signal },
        (progress: RemovalProgress) => {
          setStatus({
            label: progress.message,
            done: progress.ratio === null ? 0 : Math.round(progress.ratio * 100),
            total: progress.ratio === null ? 0 : 100,
          });
        },
      );

      // Stop can land after the last cancellation check, so say so here too.
      if (controller.signal.aborted) {
        setStopped(true);
        return;
      }

      setResult(outcome);
      swapResultUrl(keepUrl(URL.createObjectURL(outcome.blob)));
      setSplit(50);
      setShowOriginal(false);
      setStored(await refreshStored());
    } catch (err) {
      if (controller.signal.aborted) setStopped(true);
      else {
        setError(describeBackgroundError(err, picked.file.name));
        toast.error('That did not work.');
      }
    } finally {
      stopper.current = null;
      setBusy(false);
    }
  }

  async function save() {
    if (!result || !picked || saving) return;
    setSaving(true);
    try {
      const plain = backdrop === 'colour';
      const blob = plain ? await flatten(result.blob, colour) : result.blob;
      const name = plain
        ? safeFilename(`${baseName(picked.file.name)} - plain background.png`, 'cut-out.png')
        : result.filename;
      downloadBlob(blob, name);
      toast.celebrate(`Saved ${name}`);
    } catch (err) {
      setError(describeBackgroundError(err, picked.file.name));
      toast.error('That picture could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function forget() {
    await clearDownloads();
    setStored([]);
    toast.info('Removed. It will download again the next time you use this.');
  }

  const info = MODEL_CHOICES[choice];
  const ready = stored.includes(choice);
  // The engine is the bulk of it and both choices share it, so once either one
  // is here the other costs only its own file.
  const quoted = stored.length > 0 ? info.extraDownloadLabel : info.downloadLabel;
  const shown = showOriginal ? 100 : split;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Your photo"
          description="One photo at a time. It is opened on this device and never uploaded."
          actions={
            picked ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={startOver}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Start over
              </Button>
            ) : null
          }
        />
        <div className="p-5">
          {picked ? (
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line"
                style={CHECKS}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL; next/image can't serve it */}
                <img src={picked.url} alt="" className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink" title={picked.file.name}>
                  {picked.file.name}
                </p>
                <p className="text-[13px] text-muted">
                  {picked.width} &times; {picked.height} &middot; {formatBytes(picked.file.size)}
                </p>
              </div>
            </div>
          ) : (
            <Dropzone
              accept="image/jpeg,image/png,image/webp"
              icon={<Images className="h-5 w-5" aria-hidden />}
              title="Drop a photo here"
              hint="JPEG, PNG or WebP"
              onFiles={(files) => {
                void pick(files);
              }}
            />
          )}

          {loadError ? <ErrorNote className="mt-4" message={loadError} /> : null}
        </div>
      </Card>

      {!picked ? (
        <Note>Add a photo to get started.</Note>
      ) : (
        <Card>
          <CardHeader
            title="What is in the photo?"
            description="This changes how the edges are found, so it is worth getting right."
          />

          <div className="flex flex-col gap-5 p-5">
            <fieldset disabled={busy}>
              <legend className="sr-only">What is in the photo</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHOICES.map((option) => {
                  const Icon = option.icon;
                  const active = choice === option.id;
                  const have = stored.includes(option.id);
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
                        name="background-remover-choice"
                        value={option.id}
                        checked={active}
                        onChange={() => {
                          setChoice(option.id);
                          clearResult();
                        }}
                        className="sr-only"
                      />
                      <Icon
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          active ? 'text-accent' : 'text-muted',
                        )}
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
                          {have ? (
                            <span className="inline-flex items-center gap-1 text-ok">
                              <Check className="h-3 w-3" aria-hidden />
                              Already on this device
                            </span>
                          ) : (
                            `First use downloads ${
                              stored.length > 0
                                ? MODEL_CHOICES[option.id].extraDownloadLabel
                                : MODEL_CHOICES[option.id].downloadLabel
                            }`
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {ready ? (
              <p className="text-[12px] text-faint">
                Nothing left to download — this starts straight away.{' '}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void forget()}
                  className="underline decoration-line underline-offset-2 transition-colors hover:text-muted disabled:cursor-not-allowed"
                >
                  Remove it from this browser
                </button>
                .
              </p>
            ) : (
              <Note>
                The first time you press the button below, your browser downloads {quoted}. It is
                kept in your browser afterwards, so this only happens once and every photo after
                that starts straight away. Your photo itself never leaves this device.
              </Note>
            )}

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

              {stopped ? <Note>Stopped. Your photo is untouched.</Note> : null}

              {error ? <ErrorNote message={error} /> : null}

              <div>
                <Button variant="primary" disabled={busy} onClick={() => void run()}>
                  <Scissors className="h-4 w-4" aria-hidden />
                  {busy ? 'Working…' : 'Remove the background'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {result && resultUrl && picked ? (
        <Card>
          <CardHeader
            title="Before and after"
            description="Drag the slider across to see how much came away."
            actions={
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={showOriginal}
                onClick={() => setShowOriginal((on) => !on)}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {showOriginal ? 'Show the cut-out' : 'Show the original'}
              </Button>
            }
          />

          <div className="flex flex-col gap-5 p-4 sm:p-5">
            <div
              className="relative mx-auto select-none overflow-hidden rounded-xl border border-line"
              style={{
                aspectRatio: `${result.width} / ${result.height}`,
                // Keeps a tall photo from taking over the screen, without letterboxing it.
                width: `min(100%, calc(70vh * ${result.width} / ${result.height}))`,
                ...(backdrop === 'colour' ? { backgroundColor: colour } : CHECKS),
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL; next/image can't serve it */}
              <img
                src={resultUrl}
                alt="Your photo with the background removed"
                className="absolute inset-0 h-full w-full object-contain"
              />
              <div
                className="absolute inset-0 bg-surface"
                style={{ clipPath: `inset(0 ${100 - shown}% 0 0)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL; next/image can't serve it */}
                <img
                  src={picked.url}
                  alt="The original photo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div
                aria-hidden
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90 shadow-card"
                style={{ left: `${shown}%` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={split}
                aria-label="Compare the original with the cut-out"
                onChange={(e) => {
                  setSplit(Number(e.target.value));
                  setShowOriginal(false);
                }}
                className="absolute inset-x-0 top-1/2 h-10 w-full -translate-y-1/2 cursor-ew-resize appearance-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:w-8 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-10 [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-transparent"
              />
            </div>

            <fieldset>
              <legend className="text-[13px] font-medium text-ink">Background</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {BACKDROPS.map((option) => (
                  <label
                    key={option.id}
                    className={cn(
                      'cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
                      'focus-within:ring-2 focus-within:ring-accent',
                      backdrop === option.id
                        ? 'border-accent bg-accent-soft font-medium text-ink'
                        : 'border-line bg-surface text-muted hover:bg-elevated',
                    )}
                  >
                    <input
                      type="radio"
                      name="background-remover-backdrop"
                      value={option.id}
                      checked={backdrop === option.id}
                      onChange={() => setBackdrop(option.id)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>

              {backdrop === 'colour' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch.value}
                      type="button"
                      aria-label={swatch.label}
                      aria-pressed={colour.toLowerCase() === swatch.value}
                      onClick={() => setColour(swatch.value)}
                      style={{ backgroundColor: swatch.value }}
                      className={cn(
                        'h-8 w-8 rounded-lg border transition-transform hover:scale-105',
                        colour.toLowerCase() === swatch.value
                          ? 'border-accent ring-2 ring-accent'
                          : 'border-line',
                      )}
                    />
                  ))}
                  <label className="inline-flex items-center gap-2 text-[13px] text-muted">
                    <input
                      type="color"
                      value={colour}
                      onChange={(e) => setColour(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-lg border border-line bg-surface p-1"
                    />
                    Pick another
                  </label>
                </div>
              ) : null}

              <p className="mt-2 text-[12px] text-faint">
                {backdrop === 'colour'
                  ? 'Saved as a PNG on this colour — the usual choice for passport-style and marketplace photos.'
                  : 'Saved as a PNG with nothing behind the subject.'}
              </p>
            </fieldset>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Width" value={`${result.width} px`} />
              <Stat label="Height" value={`${result.height} px`} />
              <Stat label="Size" value={formatBytes(result.blob.size)} />
            </dl>

            {result.resized ? (
              <Note>
                That photo was bigger than this browser can hold, so it was scaled down to{' '}
                {result.width} &times; {result.height} first.
              </Note>
            ) : null}

            <div>
              <Button variant="primary" disabled={saving} onClick={() => void save()}>
                <Download className="h-4 w-4" aria-hidden />
                {saving ? 'Saving…' : 'Download PNG'}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
