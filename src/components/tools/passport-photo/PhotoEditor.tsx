'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Crop, Measurements } from '@/lib/passport-photo';

/**
 * The photo, with the three lines that decide the crop drawn over it.
 *
 * Automatic measuring is right most of the time and wrong often enough that it
 * cannot be the only way in. Long hair, a hat and a high collar all move the
 * top of the head, so every line here can be dragged.
 */

type Handle = 'crown' | 'chin' | 'centre';

const LINES: readonly { id: Handle; label: string; hint: string }[] = [
  { id: 'crown', label: 'Top of head', hint: 'Including hair' },
  { id: 'chin', label: 'Bottom of chin', hint: '' },
  { id: 'centre', label: 'Middle of face', hint: '' },
];

/** Keep the two horizontal lines this far apart, as a share of the photo height. */
const MIN_GAP = 0.02;

export function PhotoEditor({
  url,
  width,
  height,
  measurements,
  crop,
  eyeLocked,
  onChange,
  className,
}: {
  url: string;
  width: number;
  height: number;
  measurements: Measurements;
  crop: Crop;
  /** True when a face was found, so the eye line is measured rather than assumed. */
  eyeLocked: boolean;
  onChange: (next: Measurements) => void;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

  const move = useCallback(
    (handle: Handle, clientX: number, clientY: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;

      const x = ((clientX - box.left) / box.width) * width;
      const y = ((clientY - box.top) / box.height) * height;
      const gap = height * MIN_GAP;

      if (handle === 'centre') {
        onChange({ ...measurements, centreX: clamp(x, 0, width), origin: 'manual' });
        return;
      }

      if (handle === 'crown') {
        const crownY = clamp(y, 0, measurements.chinY - gap);
        onChange({
          ...measurements,
          crownY,
          eyeY: eyeLocked ? measurements.eyeY : eyeBetween(crownY, measurements.chinY),
          origin: 'manual',
        });
        return;
      }

      const chinY = clamp(y, measurements.crownY + gap, height);
      onChange({
        ...measurements,
        chinY,
        eyeY: eyeLocked ? measurements.eyeY : eyeBetween(measurements.crownY, chinY),
        origin: 'manual',
      });
    },
    [eyeLocked, height, measurements, onChange, width],
  );

  const nudge = useCallback(
    (handle: Handle, steps: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      const step = handle === 'centre' ? width / 200 : height / 200;
      if (handle === 'centre') {
        onChange({
          ...measurements,
          centreX: clamp(measurements.centreX + step * steps, 0, width),
          origin: 'manual',
        });
        return;
      }
      const gap = height * MIN_GAP;
      if (handle === 'crown') {
        const crownY = clamp(measurements.crownY + step * steps, 0, measurements.chinY - gap);
        onChange({
          ...measurements,
          crownY,
          eyeY: eyeLocked ? measurements.eyeY : eyeBetween(crownY, measurements.chinY),
          origin: 'manual',
        });
        return;
      }
      const chinY = clamp(measurements.chinY + step * steps, measurements.crownY + gap, height);
      onChange({
        ...measurements,
        chinY,
        eyeY: eyeLocked ? measurements.eyeY : eyeBetween(measurements.crownY, chinY),
        origin: 'manual',
      });
    },
    [eyeLocked, height, measurements, onChange, width],
  );

  const pct = {
    crown: (measurements.crownY / height) * 100,
    chin: (measurements.chinY / height) * 100,
    eye: (measurements.eyeY / height) * 100,
    centre: (measurements.centreX / width) * 100,
  };

  const box = {
    x: (crop.x / width) * 100,
    y: (crop.y / height) * 100,
    w: (crop.width / width) * 100,
    h: (crop.height / height) * 100,
  };

  return (
    <div className={cn('select-none', className)}>
      <div
        ref={frame}
        className="relative overflow-hidden rounded-xl border border-line bg-elevated"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="The photo you chose, with the crop marked on it"
          className="block h-full w-full object-contain"
          draggable={false}
        />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          <path
            d={`M0,0 H100 V100 H0 Z M${box.x},${box.y} H${box.x + box.w} V${box.y + box.h} H${box.x} Z`}
            fillRule="evenodd"
            className="fill-black/55"
          />
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            className="fill-none stroke-white/80"
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <Line kind="eye" top={pct.eye} label="Eyes" />

        {LINES.map((line) => (
          <Grip
            key={line.id}
            line={line}
            active={dragging === line.id}
            at={line.id === 'centre' ? pct.centre : line.id === 'crown' ? pct.crown : pct.chin}
            onStart={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(line.id);
              move(line.id, e.clientX, e.clientY);
            }}
            onMove={(e) => {
              if (dragging !== line.id) return;
              move(line.id, e.clientX, e.clientY);
            }}
            onEnd={() => setDragging(null)}
            onNudge={(steps) => nudge(line.id, steps)}
          />
        ))}
      </div>

      <p className="mt-2 text-xs text-faint">
        Drag a line if it is in the wrong place, or select one and use the arrow keys.
      </p>
    </div>
  );
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Eyes sit a little above halfway down a head. Only used when none were found. */
function eyeBetween(crownY: number, chinY: number): number {
  return crownY + (chinY - crownY) * 0.55;
}

/** The measured eye line, shown but not draggable. */
function Line({ kind, top, label }: { kind: 'eye'; top: number; label: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex items-center gap-1"
      style={{ top: `${top}%` }}
      aria-hidden
    >
      <div className={cn('h-px flex-1', kind === 'eye' && 'bg-sky-400/70')} />
      <span className="rounded bg-sky-500/85 px-1 py-px text-[10px] font-medium text-white">
        {label}
      </span>
    </div>
  );
}

function Grip({
  line,
  at,
  active,
  onStart,
  onMove,
  onEnd,
  onNudge,
}: {
  line: { id: Handle; label: string; hint: string };
  at: number;
  active: boolean;
  onStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onEnd: () => void;
  onNudge: (steps: number) => void;
}) {
  const vertical = line.id === 'centre';

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={line.label}
      aria-valuenow={Math.round(at)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${line.label}, ${Math.round(at)}% across the photo`}
      onPointerDown={onStart}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onKeyDown={(e) => {
        const back = vertical ? 'ArrowLeft' : 'ArrowUp';
        const on = vertical ? 'ArrowRight' : 'ArrowDown';
        if (e.key === back) onNudge(-1);
        else if (e.key === on) onNudge(1);
        else if (e.key === 'PageUp') onNudge(-5);
        else if (e.key === 'PageDown') onNudge(5);
        else return;
        e.preventDefault();
      }}
      className={cn(
        'absolute touch-none focus:outline-none',
        vertical
          ? 'top-0 h-full w-8 -translate-x-1/2 cursor-ew-resize'
          : 'inset-x-0 h-8 -translate-y-1/2 cursor-ns-resize',
      )}
      style={vertical ? { left: `${at}%` } : { top: `${at}%` }}
    >
      <div
        className={cn(
          'absolute bg-accent transition-colors',
          vertical ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px',
          active && 'bg-white',
        )}
      />
      <span
        className={cn(
          'absolute whitespace-nowrap rounded px-1 py-px text-[10px] font-medium text-accent-ink shadow-sm',
          'bg-accent',
          active && 'ring-2 ring-white',
          vertical ? 'left-1/2 top-1 -translate-x-1/2' : 'left-1 top-1/2 -translate-y-1/2',
        )}
      >
        {line.label}
        {line.hint ? <span className="ml-1 opacity-75">{line.hint}</span> : null}
      </span>
    </div>
  );
}
