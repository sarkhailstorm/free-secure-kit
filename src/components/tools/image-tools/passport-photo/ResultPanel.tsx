'use client';

import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import {
  drawPhoto,
  eyesInRange,
  guideOverlay,
  headInRange,
  type Layout,
  type MaskData,
  type PhotoSpec,
  type RenderOptions,
} from '@/lib/passport-photo';

export function ResultPanel({
  bitmap,
  mask,
  spec,
  layout,
  options,
  showGuides,
}: {
  bitmap: ImageBitmap;
  mask: MaskData | null;
  spec: PhotoSpec;
  layout: Layout;
  options: RenderOptions;
  showGuides: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const queued = useRef(0);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    cancelAnimationFrame(queued.current);
    queued.current = requestAnimationFrame(() => {
      try {
        drawPhoto(target, bitmap, options, mask);
      } catch {
        // A canvas the browser refuses to size leaves the last good frame up.
      }
    });
    return () => cancelAnimationFrame(queued.current);
  }, [bitmap, mask, options]);

  const guides = guideOverlay(layout, spec);
  const headOk = headInRange(spec, layout);
  const eyesOk = eyesInRange(spec, layout);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Your photo"
        description="This is exactly what gets saved, at the size the form asks for."
      />
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <div className="flex justify-center">
          <div
            className="relative max-h-[22rem] overflow-hidden rounded-lg border border-line shadow-card"
            style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}`, maxWidth: '100%' }}
          >
            <canvas ref={canvas} className="block h-full w-full" />

            {showGuides ? (
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <Guide at={guides.crownRatio} tone="accent" label="Top of head" />
                <Guide at={guides.chinRatio} tone="accent" label="Chin" />
                <Guide at={guides.eyeRatio} tone="sky" label="Eyes" />
              </div>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Reading
            label="Head height"
            value={`${layout.headMm.toFixed(1)} mm`}
            allowed={`${spec.headMinMm}–${spec.headMaxMm} mm`}
            ok={headOk}
          />
          {spec.eyeMinMm != null && spec.eyeMaxMm != null ? (
            <Reading
              label="Eyes from bottom"
              value={`${layout.eyeMm.toFixed(1)} mm`}
              allowed={`${spec.eyeMinMm}–${spec.eyeMaxMm} mm`}
              ok={eyesOk}
            />
          ) : null}
          <Reading
            label="Saved size"
            value={`${layout.outputWidth} × ${layout.outputHeight}`}
            allowed={`${spec.dpi} dpi`}
          />
        </dl>
      </div>
    </Card>
  );
}

function Guide({ at, tone, label }: { at: number; tone: 'accent' | 'sky'; label: string }) {
  if (!Number.isFinite(at) || at < 0 || at > 1) return null;
  return (
    <div className="absolute inset-x-0 flex items-center gap-1" style={{ top: `${at * 100}%` }}>
      <div
        className={cn('h-px flex-1', tone === 'sky' ? 'bg-sky-400/80' : 'bg-accent/80')}
      />
      <span
        className={cn(
          'rounded px-1 py-px text-[9px] font-medium text-white',
          tone === 'sky' ? 'bg-sky-500/85' : 'bg-accent/90',
        )}
      >
        {label}
      </span>
    </div>
  );
}

function Reading({
  label,
  value,
  allowed,
  ok,
}: {
  label: string;
  value: string;
  allowed: string;
  ok?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5">
        <span className="text-sm font-medium tabular-nums text-ink">{value}</span>
        {ok === true ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-ok" aria-label="Within the rules" />
        ) : ok === false ? (
          <X className="h-3.5 w-3.5 shrink-0 text-danger" aria-label="Outside the rules" />
        ) : null}
      </dd>
      <dd className="text-[11px] tabular-nums text-faint">{allowed}</dd>
    </div>
  );
}
