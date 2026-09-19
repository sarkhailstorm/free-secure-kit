'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CircleCheckBig,
  FileOutput,
  GripVertical,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { useToast } from '@/components/ToastProvider';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import { baseName, formatBytes, plural } from '@/lib/format';
import { describePdfError } from '@/lib/pdf-tools/errors';
import { downloadName } from '@/lib/pdf-tools/pdf';
import {
  DEFAULT_IMAGE_OPTIONS,
  MARGIN_LABELS,
  PAGE_SIZE_LABELS,
  QUALITY_LABELS,
  imagesToPdf,
  looksLikeImage,
  readImage,
  type ImageToPdfOptions,
  type LoadedImage,
  type MarginId,
  type OrientationId,
  type PageSizeId,
  type QualityId,
} from '@/lib/pdf-tools/images';
import { ErrorNote, Note, Progress, SelectField, Stat } from './shared';

interface ImagesResult {
  name: string;
  size: number;
  pageCount: number;
  skipped: { name: string; reason: string }[];
}

const PAGE_SIZE_OPTIONS = (Object.keys(PAGE_SIZE_LABELS) as PageSizeId[]).map((value) => ({
  value,
  label: PAGE_SIZE_LABELS[value],
}));

const MARGIN_OPTIONS = (Object.keys(MARGIN_LABELS) as MarginId[]).map((value) => ({
  value,
  label: MARGIN_LABELS[value],
}));

const QUALITY_OPTIONS = (Object.keys(QUALITY_LABELS) as QualityId[]).map((value) => ({
  value,
  label: QUALITY_LABELS[value],
}));

const ORIENTATION_OPTIONS: readonly { value: OrientationId; label: string }[] = [
  { value: 'auto', label: 'Match each image' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

export function ImagesPanel() {
  const toast = useToast();
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [options, setOptions] = useState<ImageToPdfOptions>(DEFAULT_IMAGE_OPTIONS);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImagesResult | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const live = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = live.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const release = useCallback((gone: readonly LoadedImage[]) => {
    for (const image of gone) {
      URL.revokeObjectURL(image.previewUrl);
      live.current.delete(image.previewUrl);
    }
  }, []);

  const totalSize = useMemo(
    () => images.reduce((sum, image) => sum + image.size, 0),
    [images],
  );

  const addFiles = useCallback(async (files: File[]) => {
    const pictures = files.filter(looksLikeImage);
    const found: string[] = [];
    const skipped = files.length - pictures.length;
    if (skipped > 0) {
      found.push(`${plural(skipped, 'file')} ignored — only images can be added.`);
    }

    setReading(true);
    setResult(null);
    try {
      const loaded: LoadedImage[] = [];
      for (const file of pictures) {
        try {
          const image = await readImage(file);
          live.current.add(image.previewUrl);
          loaded.push(image);
        } catch (err) {
          found.push(describePdfError(err, file.name));
        }
      }
      if (loaded.length > 0) setImages((previous) => [...previous, ...loaded]);
      setProblems(found);
    } finally {
      setReading(false);
    }
  }, []);

  const move = useCallback((from: number, to: number) => {
    setResult(null);
    setImages((previous) => {
      if (from === to || to < 0 || to >= previous.length) return previous;
      const next = previous.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const remove = useCallback(
    (id: string) => {
      setResult(null);
      setImages((previous) => {
        release(previous.filter((image) => image.id === id));
        return previous.filter((image) => image.id !== id);
      });
    },
    [release],
  );

  const clearAll = useCallback(() => {
    setImages((previous) => {
      release(previous);
      return [];
    });
    setProblems([]);
    setResult(null);
  }, [release]);

  function endDrag() {
    setDragId(null);
    setOverId(null);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return endDrag();
    const from = images.findIndex((image) => image.id === dragId);
    const to = images.findIndex((image) => image.id === targetId);
    if (from >= 0 && to >= 0) move(from, to);
    endDrag();
  }

  async function run() {
    if (images.length === 0 || busy) return;
    setBusy(true);
    setProblems([]);
    setResult(null);
    setProgress({ done: 0, total: images.length });

    try {
      const built = await imagesToPdf(images, options, (done, total) =>
        setProgress({ done, total }),
      );
      const name = downloadName(
        images.length > 1
          ? `${baseName(images[0].name)} + ${images.length - 1} more`
          : baseName(images[0].name),
        'pdf',
        'images.pdf',
      );
      downloadBlob(new Blob([built.bytes], { type: 'application/pdf' }), name);
      setResult({
        name,
        size: built.bytes.byteLength,
        pageCount: built.pageCount,
        skipped: built.skipped,
      });
      toast.celebrate(`Saved ${name}`);
    } catch (err) {
      setProblems([describePdfError(err)]);
      toast.error('That conversion did not work.');
    } finally {
      setBusy(false);
    }
  }

  const fitsImage = options.pageSize === 'fit';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Images to add"
          description="One page per picture, in the order below. JPEG, PNG, WebP, AVIF, GIF and BMP all work."
          actions={
            images.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearAll} disabled={busy}>
                Clear all
              </Button>
            ) : null
          }
        />

        <div className="p-5">
          <Dropzone
            multiple
            accept="image/*"
            compact={images.length > 0}
            disabled={busy || reading}
            icon={<ImagePlus className="h-4 w-4" aria-hidden />}
            title={images.length > 0 ? 'Add more images' : 'Drop your images here'}
            hint={
              images.length > 0
                ? 'New images are added to the end'
                : 'Photos, screenshots or scans — nothing is uploaded'
            }
            onFiles={(files) => {
              void addFiles(files);
            }}
          />

          {reading ? (
            <Progress className="mt-4" label="Reading your images…" done={0} total={0} />
          ) : null}

          {problems.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {problems.map((message, index) => (
                <ErrorNote key={`${index}-${message}`} message={message} />
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {images.length === 0 ? (
        <Note>
          No pictures yet. Drop some in and they become one PDF, a page each, without ever
          leaving your device.
        </Note>
      ) : (
        <Card>
          <CardHeader
            title="Page order"
            description={`${plural(images.length, 'image')} · ${formatBytes(totalSize)}`}
          />

          <ul className="flex flex-col divide-y divide-line">
            {images.map((image, index) => {
              const isDragging = dragId === image.id;
              const isOver = overId === image.id && dragId !== null && dragId !== image.id;

              return (
                <li
                  key={image.id}
                  draggable={!busy}
                  onDragStart={(e) => {
                    if (e.target instanceof Element && e.target.closest('button')) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', image.id);
                    setDragId(image.id);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overId !== image.id) setOverId(image.id);
                  }}
                  onDragLeave={() => {
                    if (overId === image.id) setOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDrop(image.id);
                  }}
                  onDragEnd={endDrag}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 transition-colors sm:px-5',
                    isDragging && 'opacity-40',
                    isOver && 'bg-accent-soft',
                  )}
                >
                  <span
                    className="hidden h-9 w-5 shrink-0 cursor-grab items-center justify-center text-faint active:cursor-grabbing sm:flex"
                    aria-hidden
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>

                  <span className="w-6 shrink-0 text-center font-mono text-[13px] tabular-nums text-faint">
                    {index + 1}
                  </span>

                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-elevated">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.previewUrl}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={image.name}>
                      {image.name}
                    </p>
                    <p className="text-[13px] text-muted">
                      {image.width > 0 ? `${image.width} × ${image.height} · ` : ''}
                      {formatBytes(image.size)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0"
                      aria-label={`Move ${image.name} up`}
                      disabled={index === 0 || busy}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0"
                      aria-label={`Move ${image.name} down`}
                      disabled={index === images.length - 1 || busy}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0 hover:text-danger"
                      aria-label={`Remove ${image.name}`}
                      disabled={busy}
                      onClick={() => remove(image.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
            <fieldset disabled={busy}>
              <legend className="sr-only">Page settings</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  label="Page size"
                  value={options.pageSize}
                  options={PAGE_SIZE_OPTIONS}
                  onChange={(pageSize) => {
                    setOptions((previous) => ({ ...previous, pageSize }));
                    setResult(null);
                  }}
                  hint={fitsImage ? 'Each page is exactly its image' : undefined}
                />
                <SelectField
                  label="Orientation"
                  value={options.orientation}
                  options={ORIENTATION_OPTIONS}
                  disabled={fitsImage}
                  onChange={(orientation) => {
                    setOptions((previous) => ({ ...previous, orientation }));
                    setResult(null);
                  }}
                  hint={fitsImage ? 'Set by the image' : undefined}
                />
                <SelectField
                  label="Margin"
                  value={options.margin}
                  options={MARGIN_OPTIONS}
                  onChange={(margin) => {
                    setOptions((previous) => ({ ...previous, margin }));
                    setResult(null);
                  }}
                />
                <SelectField
                  label="Quality"
                  value={options.quality}
                  options={QUALITY_OPTIONS}
                  onChange={(quality) => {
                    setOptions((previous) => ({ ...previous, quality }));
                    setResult(null);
                  }}
                  hint={
                    options.quality === 'original'
                      ? 'Every pixel kept'
                      : options.quality === 'balanced'
                        ? 'Sharp on screen and in print'
                        : 'Smallest file to email'
                  }
                />
              </div>
            </fieldset>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Images" value={images.length} />
              <Stat label="Pages out" value={images.length} />
              <Stat label="Source size" value={formatBytes(totalSize)} />
            </dl>

            {busy ? (
              <Progress
                label={`Adding image ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
                done={progress.done}
                total={progress.total}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => void run()} disabled={busy}>
                <FileOutput className="h-4 w-4" aria-hidden />
                {busy ? 'Converting…' : `Create a PDF from ${plural(images.length, 'image')}`}
              </Button>
              {options.quality === 'original' && totalSize > 100 * 1024 * 1024 ? (
                <p className="text-[13px] text-warn">
                  At Original quality this would build a PDF of roughly{' '}
                  {formatBytes(totalSize)} inside this tab. Switch Quality to Balanced for a much
                  smaller file that still looks the same on screen and in print.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      )}

      {result ? (
        <Card className="border-ok/30 bg-ok/5">
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-2.5">
              <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Downloaded {result.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {plural(result.pageCount, 'page')} &middot; {formatBytes(result.size)}
                </p>
              </div>
            </div>
            {result.skipped.length > 0 ? (
              <div className="flex flex-col gap-2">
                {result.skipped.map((item) => (
                  <ErrorNote key={item.name} message={item.reason} />
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
