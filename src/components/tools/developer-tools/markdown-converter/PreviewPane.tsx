'use client';

import { Eye, FileText, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { PREVIEW_ROOT_CLASS } from '@/lib/markdown-converter/themes';

/**
 * The right-hand (or "Preview" tab) pane.
 *
 * `html` has already been through DOMPurify in `lib/markdown-converter/render`
 * — that is the only reason `dangerouslySetInnerHTML` is defensible here, and
 * the sanitiser must stay the last step before this prop is built.
 */
export function PreviewPane({
  html,
  loading,
  error,
  themeName,
  hasSource,
  onLoadSample,
  className,
}: {
  html: string;
  loading: boolean;
  error: string | null;
  themeName: string;
  hasSource: boolean;
  onLoadSample: () => void;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col', className)} aria-label="Rendered preview">
      <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-2 lg:flex">
        <span className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-faint" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Preview
          </span>
        </span>
        <span className="truncate text-[11px] text-faint">{themeName}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        {error ? (
          <div
            role="status"
            className="m-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{error}</p>
              {html ? (
                <p className="mt-0.5 text-[12px] text-muted">
                  Showing the last version that rendered.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {!hasSource ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-line/50 text-faint">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">Nothing to preview yet</p>
              <p className="mt-1 text-[13px] text-muted">
                Type some Markdown and it will appear here as you go.
              </p>
            </div>
            <Button size="sm" onClick={onLoadSample}>
              Load the example document
            </Button>
          </div>
        ) : loading && !html ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <LoaderCircle className="h-4 w-4 animate-spin text-muted" aria-hidden />
            <p className="text-[13px] text-muted">Rendering preview…</p>
          </div>
        ) : html ? (
          <div className={PREVIEW_ROOT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
        ) : null}
      </div>
    </section>
  );
}
