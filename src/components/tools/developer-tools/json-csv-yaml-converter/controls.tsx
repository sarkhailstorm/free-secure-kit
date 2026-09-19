'use client';

import { useId } from 'react';
import { ScanSearch } from 'lucide-react';
import { cn } from '@/lib/cn';
import { FORMAT_LABEL, type Confidence, type DataFormat } from '@/lib/json-csv-yaml-converter/types';

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label htmlFor={id} className="shrink-0 text-[12px] font-medium text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 min-w-0 rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-ink transition-colors hover:border-faint/40 [color-scheme:light] dark:[color-scheme:dark]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ToggleControl({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-[36px] items-start gap-2.5 py-1">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent"
      />
      <label htmlFor={id} className="cursor-pointer text-[13px] leading-snug text-ink">
        {label}
        {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-faint">{hint}</span> : null}
      </label>
    </div>
  );
}

export function DetectBadge({
  format,
  confidence,
  overridden,
  idle,
  pending,
}: {
  format: DataFormat;
  confidence: Confidence;
  overridden: boolean;
  idle: boolean;
  /** Text is present but the detector has not reported back yet. */
  pending?: boolean;
}) {
  if (idle || pending) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] font-medium text-faint">
        <ScanSearch className="h-3.5 w-3.5" aria-hidden />
        {idle ? 'Waiting for input' : 'Checking the format…'}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium',
        overridden
          ? 'border-line bg-bg text-muted'
          : confidence === 'high'
            ? 'border-ok/30 bg-ok/10 text-ok'
            : 'border-warn/30 bg-warn/10 text-warn',
      )}
    >
      <ScanSearch className="h-3.5 w-3.5" aria-hidden />
      {overridden ? 'Reading as' : 'Detected'}: {FORMAT_LABEL[format]}
      {!overridden && confidence !== 'high' ? (
        <span className="font-normal opacity-80">· not certain</span>
      ) : null}
    </span>
  );
}
