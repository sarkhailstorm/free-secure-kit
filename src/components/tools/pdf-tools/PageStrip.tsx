import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronsLeft,
  ChevronsRight,
  FileWarning,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { planKey, type LoadedPdf, type PageRef } from '@/lib/pdf-tools/pdf';
import type { MergeThumbnails } from './useMergeThumbnails';
import { Note } from './shared';

interface Source {
  index: number;
  name: string;
}

export function PageStrip({
  items,
  plan,
  removed,
  thumbs,
  disabled,
  onMove,
  onRemove,
  onRestore,
  onRestoreAll,
}: {
  items: readonly LoadedPdf[];
  plan: readonly PageRef[];
  removed: readonly PageRef[];
  thumbs: MergeThumbnails;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onRestore: (ref: PageRef) => void;
  onRestoreAll: () => void;
}) {
  const helpId = useId();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [status, setStatus] = useState('');

  const gridRef = useRef<HTMLUListElement>(null);
  const tiles = useRef<Map<string, HTMLButtonElement>>(new Map());
  const refocus = useRef<string | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  const { urls, failed, broken, request } = thumbs;

  const sources = useMemo(
    () =>
      new Map<string, Source>(
        items.map((file, index) => [file.id, { index: index + 1, name: file.name }]),
      ),
    [items],
  );

  const describe = useCallback(
    (ref: PageRef) => {
      const source = sources.get(ref.fileId);
      return `page ${ref.page} of ${source ? source.name : 'a removed file'}`;
    },
    [sources],
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const fileId = el.dataset.file;
          const page = Number(el.dataset.page);
          if (fileId && Number.isInteger(page)) request(fileId, page);
          obs.unobserve(el);
        }
      },
      { rootMargin: '300px 0px' },
    );
    observer.current = obs;
    return () => {
      obs.disconnect();
      observer.current = null;
    };
  }, [request]);

  // One observer for the whole strip, not one per tile: a plan can run to hundreds of pages.
  useEffect(() => {
    const obs = observer.current;
    const root = gridRef.current?.parentElement;
    if (!obs || !root) {
      if (typeof IntersectionObserver === 'undefined') {
        for (const ref of plan) request(ref.fileId, ref.page);
      }
      return;
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-pending="1"]')) obs.observe(el);
  }, [plan, removed, urls, failed, request]);

  useEffect(() => {
    const key = refocus.current;
    if (!key) return;
    refocus.current = null;
    tiles.current.get(key)?.focus();
  });

  const indexOf = useCallback(
    (key: string | null) => (key === null ? -1 : plan.findIndex((ref) => planKey(ref) === key)),
    [plan],
  );

  const moveTo = useCallback(
    (from: number, to: number) => {
      const clamped = Math.max(0, Math.min(plan.length - 1, to));
      if (from < 0 || from === clamped) return;
      const ref = plan[from];
      refocus.current = planKey(ref);
      setFocusIndex(clamped);
      onMove(from, clamped);
      setStatus(`Moved ${describe(ref)} to position ${clamped + 1} of ${plan.length}.`);
    },
    [plan, onMove, describe],
  );

  const removeAt = useCallback(
    (index: number) => {
      const ref = plan[index];
      if (!ref) return;
      const next = Math.min(index, plan.length - 2);
      if (next >= 0) refocus.current = planKey(plan[index === plan.length - 1 ? index - 1 : index + 1]);
      setActiveKey((key) => (key === planKey(ref) ? null : key));
      setFocusIndex(Math.max(0, next));
      onRemove(index);
      setStatus(`Left out ${describe(ref)}. ${plural(plan.length - 1, 'page')} remaining.`);
    },
    [plan, onRemove, describe],
  );

  function columns(): number {
    const grid = gridRef.current;
    if (!grid) return 1;
    const template = getComputedStyle(grid).gridTemplateColumns;
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }

  /** Read focus from the DOM: the focusIndex state lags a programmatic focus. */
  function focusedIndex(): number {
    const el = document.activeElement;
    for (const [key, node] of tiles.current) {
      if (node === el) return indexOf(key);
    }
    return focusIndex;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (disabled || plan.length === 0) return;
    const lifted = activeKey !== null;
    const current = lifted ? indexOf(activeKey) : focusedIndex();
    if (current < 0) return;

    const step = (delta: number) => {
      e.preventDefault();
      const target = Math.max(0, Math.min(plan.length - 1, current + delta));
      if (lifted) {
        moveTo(current, target);
      } else {
        setFocusIndex(target);
        refocus.current = planKey(plan[target]);
      }
    };

    switch (e.key) {
      case 'ArrowLeft':
        return step(-1);
      case 'ArrowRight':
        return step(1);
      case 'ArrowUp':
        return step(-columns());
      case 'ArrowDown':
        return step(columns());
      case 'Home':
        e.preventDefault();
        return lifted ? moveTo(current, 0) : (setFocusIndex(0), void (refocus.current = planKey(plan[0])));
      case 'End':
        e.preventDefault();
        return lifted
          ? moveTo(current, plan.length - 1)
          : (setFocusIndex(plan.length - 1),
            void (refocus.current = planKey(plan[plan.length - 1])));
      case 'Enter':
      case ' ':
        e.preventDefault();
        return toggleLift(current);
      case 'Escape':
        if (lifted) {
          e.preventDefault();
          setActiveKey(null);
          setStatus('Put down.');
        }
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return removeAt(current);
      default:
    }
  }

  function toggleLift(index: number) {
    const ref = plan[index];
    if (!ref) return;
    const key = planKey(ref);
    if (activeKey === key) {
      setActiveKey(null);
      setStatus('Put down.');
      return;
    }
    if (activeKey !== null) {
      const from = indexOf(activeKey);
      if (from >= 0) {
        moveTo(from, index);
        setActiveKey(null);
        return;
      }
    }
    setActiveKey(key);
    setFocusIndex(index);
    setStatus(`Picked up ${describe(ref)}, position ${index + 1} of ${plan.length}.`);
  }

  function endDrag() {
    setDragKey(null);
    setOverKey(null);
  }

  const activeIndex = indexOf(activeKey);

  return (
    <div className="border-t border-line bg-bg">
      <p id={helpId} className="sr-only">
        Press Enter to pick up a page, then the arrow keys to move it. Press Escape to put it
        down, or Delete to leave it out of the merged file.
      </p>
      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {plan.length === 0 ? (
        <div className="p-3 sm:p-4">
          <Note>
            Every page has been left out. Put some back below, or reset to the file order.
          </Note>
        </div>
      ) : (
        <div className="scroll-thin max-h-[24rem] overflow-y-auto overscroll-contain p-2 sm:max-h-[30rem] sm:p-3">
          <ul
            ref={gridRef}
            role="group"
            aria-label="Pages in the merged file"
            aria-describedby={helpId}
            onKeyDown={onKeyDown}
            className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-8"
          >
            {plan.map((ref, index) => {
              const key = planKey(ref);
              const source = sources.get(ref.fileId);
              const isActive = activeKey === key;

              return (
                <li
                  key={key}
                  draggable={!disabled}
                  onDragStart={(e) => {
                    if (e.target instanceof Element && e.target.closest('[data-no-drag]')) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', key);
                    setDragKey(key);
                  }}
                  onDragOver={(e) => {
                    // Only claim the drop for our own tiles, so a PDF from the desktop still reaches the drop zone.
                    if (!dragKey) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overKey !== key) setOverKey(key);
                  }}
                  onDrop={(e) => {
                    if (!dragKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const from = indexOf(dragKey);
                    if (from >= 0 && from !== index) moveTo(from, index);
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                  className={cn(
                    'min-w-0 rounded-lg transition-colors',
                    dragKey === key && 'opacity-40',
                    overKey === key && dragKey !== key && 'bg-accent-soft',
                  )}
                >
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) tiles.current.set(key, el);
                      else tiles.current.delete(key);
                    }}
                    disabled={disabled}
                    aria-pressed={isActive}
                    aria-roledescription="Sortable page"
                    aria-label={`Position ${index + 1} of ${plan.length}, ${describe(ref)}`}
                    title={source?.name}
                    tabIndex={index === focusIndex ? 0 : -1}
                    onFocus={() => setFocusIndex(index)}
                    onClick={() => toggleLift(index)}
                    className="block w-full cursor-grab rounded-lg text-left transition-transform hover:-translate-y-0.5 active:cursor-grabbing disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    <Preview
                      fileId={ref.fileId}
                      page={ref.page}
                      url={urls[key]}
                      failed={Boolean(failed[key]) || Boolean(broken[ref.fileId])}
                      active={isActive}
                    />
                    <span className="mt-1 flex items-center justify-center gap-1 text-[11px]">
                      <span
                        className={cn(
                          'font-mono tabular-nums',
                          isActive ? 'font-medium text-accent' : 'text-ink',
                        )}
                      >
                        {index + 1}
                      </span>
                      {source ? (
                        <span className="rounded bg-line/70 px-1 font-mono text-[10px] text-faint">
                          {source.index}
                        </span>
                      ) : null}
                      <span className="text-faint">p{ref.page}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activeIndex >= 0 ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-2 py-2 sm:px-3">
          <span className="mr-auto min-w-0 truncate text-[13px] text-muted">
            Position {activeIndex + 1} of {plan.length}
          </span>
          <Button
            size="sm"
            className="h-9 w-9 px-0"
            aria-label="Move to the start"
            aria-disabled={activeIndex === 0}
            onClick={() => moveTo(activeIndex, 0)}
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            className="h-9 w-9 px-0"
            aria-label="Move earlier"
            aria-disabled={activeIndex === 0}
            onClick={() => moveTo(activeIndex, activeIndex - 1)}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            className="h-9 w-9 px-0"
            aria-label="Move later"
            aria-disabled={activeIndex === plan.length - 1}
            onClick={() => moveTo(activeIndex, activeIndex + 1)}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            className="h-9 w-9 px-0"
            aria-label="Move to the end"
            aria-disabled={activeIndex === plan.length - 1}
            onClick={() => moveTo(activeIndex, plan.length - 1)}
          >
            <ChevronsRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            className="h-9 hover:text-danger"
            onClick={() => removeAt(activeIndex)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Leave out
          </Button>
          <Button size="sm" className="h-9" onClick={() => setActiveKey(null)}>
            <Check className="h-4 w-4" aria-hidden />
            Done
          </Button>
        </div>
      ) : null}

      {removed.length > 0 ? (
        <div className="border-t border-line p-2 sm:p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-faint">
              Left out ({removed.length})
            </h3>
            <Button size="sm" onClick={onRestoreAll} disabled={disabled}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Put all back
            </Button>
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-8">
            {removed.map((ref) => {
              const key = planKey(ref);
              const source = sources.get(ref.fileId);
              return (
                <li key={key} className="min-w-0">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Put ${describe(ref)} back`}
                    title={source?.name}
                    onClick={() => {
                      onRestore(ref);
                      setStatus(`Put ${describe(ref)} back.`);
                    }}
                    className="group block w-full rounded-lg text-left opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed"
                  >
                    <span className="relative block">
                      <Preview
                        fileId={ref.fileId}
                        page={ref.page}
                        url={urls[key]}
                        failed={Boolean(failed[key]) || Boolean(broken[ref.fileId])}
                        active={false}
                      />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink/70 text-bg group-hover:bg-accent group-hover:text-accent-ink">
                          <X className="h-3.5 w-3.5 group-hover:hidden" aria-hidden />
                          <Undo2 className="hidden h-3.5 w-3.5 group-hover:block" aria-hidden />
                        </span>
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-center gap-1 text-[11px] text-faint">
                      {source ? (
                        <span className="rounded bg-line/70 px-1 font-mono text-[10px]">
                          {source.index}
                        </span>
                      ) : null}
                      <span>p{ref.page}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Preview({
  fileId,
  page,
  url,
  failed,
  active,
}: {
  fileId: string;
  page: number;
  url: string | undefined;
  failed: boolean;
  active: boolean;
}) {
  return (
    <span
      data-file={fileId}
      data-page={page}
      data-pending={!url && !failed ? '1' : '0'}
      className={cn(
        'relative flex aspect-[1/1.414] w-full items-center justify-center overflow-hidden rounded-lg border bg-surface transition-colors',
        active ? 'border-accent ring-2 ring-accent' : 'border-line',
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      ) : failed ? (
        <FileWarning className="h-4 w-4 text-faint" aria-hidden />
      ) : (
        <span className="h-full w-full animate-pulse bg-line/60" aria-hidden />
      )}
    </span>
  );
}
