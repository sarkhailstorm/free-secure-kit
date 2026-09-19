'use client';

import { useId, useRef, useState } from 'react';
import { FileSpreadsheet, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatBytes, plural } from '@/lib/format';

export interface FileBarProps {
  filename: string;
  /** Bytes of the file as it arrived. */
  size: number;
  rows: number;
  columns: number;
  onFile: (file: File) => void;
  onStartOver: () => void;
  accept?: string;
  busy?: boolean;
}

export function FileBar({
  filename,
  size,
  rows,
  columns,
  onFile,
  onStartOver,
  accept,
  busy = false,
}: FileBarProps) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

  return (
    <Card
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors',
        dragging && 'border-accent bg-accent-soft',
      )}
      // Without these, a file dropped here opens in the browser and every answer is lost.
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && !busy) onFile(file);
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink" title={filename}>
            {filename}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {formatBytes(size)} · {plural(rows, 'row')} · {plural(columns, 'column')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so picking the same file twice still fires onChange.
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-9"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Use a different file
        </Button>
        <Button variant="ghost" size="sm" className="h-9" disabled={busy} onClick={onStartOver}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </div>
    </Card>
  );
}
