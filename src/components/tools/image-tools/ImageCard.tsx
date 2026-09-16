'use client';

import { ArrowDown, Clock, Download, Equal, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatBytes, percentChange } from '@/lib/format';
import { formatLabel } from '@/lib/image-compressor/settings';
import type { ImageItem } from '@/lib/image-compressor/types';

/** Savings pill. Growth is reported plainly — PNGs really do get bigger. */
function SavingsBadge({ before, after }: { before: number; after: number }) {
  const delta = percentChange(before, after);

  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-warn/10 px-1.5 py-0.5 text-[11px] font-medium text-warn">
        <TriangleAlert className="h-3 w-3" aria-hidden />
        {delta}% larger
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-line/60 px-1.5 py-0.5 text-[11px] font-medium text-muted">
        <Equal className="h-3 w-3" aria-hidden />
        No change
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-ok/10 px-1.5 py-0.5 text-[11px] font-medium text-ok">
      <ArrowDown className="h-3 w-3" aria-hidden />
      {Math.abs(delta)}% smaller
    </span>
  );
}

function Placeholder({
  icon,
  text,
  tone = 'muted',
}: {
  icon: React.ReactNode;
  text: string;
  tone?: 'muted' | 'danger';
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center',
        tone === 'danger' ? 'text-danger' : 'text-faint',
      )}
    >
      {icon}
      <span className="text-[11px] font-medium leading-snug">{text}</span>
    </div>
  );
}

export function ImageCard({
  item,
  onRemove,
  onDownload,
}: {
  item: ImageItem;
  onRemove: (id: string) => void;
  onDownload: (id: string) => void;
}) {
  const { result, status } = item;
  const resized =
    result && item.source && (item.source.width !== result.width || item.source.height !== result.height);

  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-3 shadow-card animate-fade-in">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-elevated">
        {status === 'done' && result ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob URL; next/image can't serve it
          <img
            src={result.previewUrl}
            alt={`Compressed preview of ${item.file.name}`}
            className="h-full w-full object-contain"
          />
        ) : status === 'compressing' ? (
          <Placeholder
            icon={<LoaderCircle className="h-5 w-5 animate-spin text-accent" aria-hidden />}
            text="Compressing…"
          />
        ) : status === 'failed' ? (
          <Placeholder
            icon={<TriangleAlert className="h-5 w-5" aria-hidden />}
            text={item.error ?? 'Failed'}
            tone="danger"
          />
        ) : (
          <Placeholder icon={<Clock className="h-5 w-5" aria-hidden />} text="Queued" />
        )}
      </div>

      <div className="mt-3 min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink" title={item.file.name}>
          {item.file.name}
        </p>

        {status === 'done' && result ? (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {formatBytes(item.file.size)} → {formatBytes(result.size)}
              </span>
              <SavingsBadge before={item.file.size} after={result.size} />
            </div>
            <p className="mt-1 truncate font-mono text-[11px] tabular-nums text-faint">
              {resized && item.source ? `${item.source.width}×${item.source.height} → ` : ''}
              {result.width}×{result.height} px · {formatLabel(result.type)}
            </p>
          </>
        ) : status === 'failed' ? (
          <p className="mt-1.5 text-[11px] leading-snug text-danger">
            {item.error ?? 'Compression failed.'}
          </p>
        ) : (
          <p className="mt-1.5 font-mono text-[11px] tabular-nums text-faint">
            {formatBytes(item.file.size)} · {status === 'compressing' ? 'working…' : 'waiting'}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          className="h-9 min-w-0 flex-1"
          disabled={status !== 'done' || !result}
          aria-label={result ? `Download ${result.filename}` : `Download ${item.file.name}`}
          onClick={() => onDownload(item.id)}
        >
          <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">Download</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 px-0"
          aria-label={`Remove ${item.file.name}`}
          onClick={() => onRemove(item.id)}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
