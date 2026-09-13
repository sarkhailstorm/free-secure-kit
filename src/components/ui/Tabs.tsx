'use client';

import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

/**
 * Accessible tab strip. Arrow keys move between tabs, matching the WAI-ARIA
 * tabs pattern; the parent owns the active-tab state.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  label = 'Sections',
}: {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  label?: string;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === active);
    if (i < 0) return;
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              selected
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'text-muted hover:bg-line/50 hover:text-ink',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
