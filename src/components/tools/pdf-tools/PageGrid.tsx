import { useEffect, useRef } from 'react';
import { Check, FileWarning, Scissors } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Thumbnails } from './useThumbnails';

export type PageInteraction = 'select' | 'break' | 'none';

export function PageGrid({
  pageCount,
  thumbs,
  interaction,
  selected,
  breaks,
  onToggle,
}: {
  pageCount: number;
  thumbs: Thumbnails;
  interaction: PageInteraction;
  selected: ReadonlySet<number>;
  breaks: ReadonlySet<number>;
  onToggle: (page: number) => void;
}) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="scroll-thin max-h-[30rem] overflow-y-auto overscroll-contain rounded-xl border border-line bg-bg p-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {pages.map((page) => (
          <PageTile
            key={page}
            page={page}
            url={thumbs.urls[page]}
            // A document-level failure means no preview is coming: settle every tile.
            failed={Boolean(thumbs.failed[page]) || thumbs.error !== null}
            isSelected={selected.has(page)}
            isBreak={page === 1 || breaks.has(page)}
            isForcedBreak={page === 1}
            interaction={interaction}
            onToggle={onToggle}
            onVisible={thumbs.request}
          />
        ))}
      </ul>
    </div>
  );
}

function PageTile({
  page,
  url,
  failed,
  isSelected,
  isBreak,
  isForcedBreak,
  interaction,
  onToggle,
  onVisible,
}: {
  page: number;
  url: string | undefined;
  failed: boolean;
  isSelected: boolean;
  isBreak: boolean;
  isForcedBreak: boolean;
  interaction: PageInteraction;
  onToggle: (page: number) => void;
  onVisible: (page: number) => void;
}) {
  const holder = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node || url || failed) return;

    if (typeof IntersectionObserver === 'undefined') {
      onVisible(page);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          onVisible(page);
        }
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [page, url, failed, onVisible]);

  const active = interaction === 'select' ? isSelected : interaction === 'break' ? isBreak : false;

  const label =
    interaction === 'select'
      ? `Page ${page}`
      : interaction === 'break'
        ? `Start a new file at page ${page}`
        : `Page ${page}`;

  const preview = (
    <>
      <span
        className={cn(
          'relative flex aspect-[1/1.414] w-full items-center justify-center overflow-hidden rounded-lg border bg-surface transition-colors',
          active ? 'border-accent' : 'border-line',
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

        {interaction === 'select' && isSelected ? (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-accent text-accent-ink">
            <Check className="h-3 w-3" aria-hidden />
          </span>
        ) : null}

        {interaction === 'break' && isBreak ? (
          <span
            className={cn(
              'absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md',
              isForcedBreak ? 'bg-line text-muted' : 'bg-accent text-accent-ink',
            )}
          >
            <Scissors className="h-3 w-3" aria-hidden />
          </span>
        ) : null}
      </span>

      <span
        className={cn(
          'mt-1.5 block text-center font-mono text-[11px] tabular-nums',
          active ? 'font-medium text-accent' : 'text-faint',
        )}
      >
        {page}
      </span>
    </>
  );

  if (interaction === 'none') {
    return (
      <li ref={holder} className="min-w-0">
        {preview}
        <span className="sr-only">Preview of page {page}</span>
      </li>
    );
  }

  return (
    <li ref={holder} className="min-w-0">
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        disabled={interaction === 'break' && isForcedBreak}
        onClick={() => onToggle(page)}
        className={cn(
          'block w-full rounded-lg text-left transition-transform',
          'disabled:cursor-not-allowed',
          !(interaction === 'break' && isForcedBreak) && 'hover:-translate-y-0.5',
        )}
      >
        {preview}
      </button>
    </li>
  );
}
