'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';

export interface Choice<T extends string> {
  id: T;
  label: string;
  /** Optional tooltip / extra context. */
  detail?: string;
}

/**
 * A segmented single-choice control.
 *
 * Visually this is the same pill strip as the shared `Tabs`, but these options
 * do not reveal panels, so it is exposed as a radio group instead — arrow keys
 * move and select, matching the WAI-ARIA radio pattern.
 */
export function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  function move(nextIndex: number) {
    const next = choices[nextIndex];
    if (!next) return;
    onChange(next.id);
    const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    const i = choices.findIndex((c) => c.id === value);
    if (i < 0) return;
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % choices.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + choices.length) % choices.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = choices.length - 1;
    else return;
    e.preventDefault();
    move(next);
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1', className)}
    >
      {choices.map((choice) => {
        const selected = choice.id === value;
        return (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            title={choice.detail}
            onClick={() => onChange(choice.id)}
            className={cn(
              'inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-45',
              selected
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'text-muted hover:bg-line/50 hover:text-ink',
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
