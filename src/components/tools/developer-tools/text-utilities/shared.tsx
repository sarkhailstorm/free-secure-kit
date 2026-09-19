'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { copyToClipboard } from '@/lib/download';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { countText } from '@/lib/text-utilities/case';

export function Counts({ text, className }: { text: string; className?: string }) {
  const counts = useMemo(() => countText(text), [text]);
  return (
    <p className={cn('font-mono text-[11px] tabular-nums text-faint', className)}>
      {counts.characters.toLocaleString()} chars · {counts.words.toLocaleString()} words ·{' '}
      {counts.lines.toLocaleString()} lines
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  rows = 10,
  readOnly = false,
  actions,
  footer,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </div>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        rows={rows}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={cn(
          'scroll-thin w-full resize-y rounded-xl border border-line bg-bg px-3 py-2.5',
          'font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors',
          'placeholder:text-faint focus:border-accent/60',
          readOnly && 'bg-elevated/60',
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
        <Counts text={value} />
        {footer}
      </div>
    </div>
  );
}

export function CopyButton({
  text,
  label = 'Copy',
  successMessage = 'Copied to your clipboard.',
  disabled,
  variant = 'secondary',
  size = 'sm',
  className,
}: {
  text: string;
  label?: string;
  successMessage?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleCopy() {
    const ok = await copyToClipboard(text);
    if (!ok) {
      toast.error('Your browser blocked clipboard access — select the text and copy it manually.');
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
    toast.celebrate(successMessage);
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      disabled={disabled || text.length === 0}
      aria-label={`${label} — ${copied ? 'copied' : 'to clipboard'}`}
      className={className}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-ok" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function CheckboxRow({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex min-h-[36px] items-center gap-2.5 py-1',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent disabled:cursor-not-allowed"
      />
      <span className="min-w-0 text-[13px] leading-snug text-ink">
        {label}
        {hint ? <span className="mt-0.5 block text-[12px] text-faint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function WarnNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-line/50 text-faint">
        {icon}
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export function Working({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 px-6 py-10 text-[13px] text-muted"
      aria-live="polite"
    >
      <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden />
      {label}
    </div>
  );
}

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'danger' | 'accent' | 'warn';
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-line/60 text-muted',
    ok: 'bg-ok/15 text-ok',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-warn/15 text-warn',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1.5 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent/60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-[12px] text-faint">{hint}</p> : null}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
        className="mt-1.5 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] tabular-nums text-ink outline-none transition-colors focus:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {hint ? <p className="mt-1 text-[12px] text-faint">{hint}</p> : null}
    </div>
  );
}
