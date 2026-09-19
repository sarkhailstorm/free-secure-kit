'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Dropzone({
  onFiles,
  accept,
  multiple = false,
  title = 'Drop a file here',
  hint,
  icon,
  className,
  compact = false,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const inputId = useId();

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [multiple, onFiles],
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (disabled) return;
        handle(e.dataTransfer.files);
      }}
      className={cn(
        'group relative rounded-2xl border-2 border-dashed text-center transition-colors',
        compact ? 'p-5' : 'p-10',
        disabled
          ? 'cursor-not-allowed border-line bg-surface/50 opacity-60'
          : dragging
            ? 'border-accent bg-accent-soft'
            : 'border-line bg-surface hover:border-accent/50 hover:bg-accent-soft/40',
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          handle(e.target.files);
          // Reset so picking the same file twice still fires onChange.
          e.target.value = '';
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            'flex items-center justify-center rounded-xl transition-colors',
            compact ? 'h-9 w-9' : 'h-12 w-12',
            dragging ? 'bg-accent text-accent-ink' : 'bg-line/50 text-muted',
          )}
        >
          {icon ?? <UploadCloud className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />}
        </div>
        <div>
          <label
            htmlFor={inputId}
            className={cn(
              'cursor-pointer font-medium text-ink',
              compact ? 'text-[13px]' : 'text-sm',
              disabled && 'cursor-not-allowed',
            )}
          >
            {title}{' '}
            <span className="text-accent underline decoration-accent/30 underline-offset-2">
              or browse
            </span>
          </label>
          {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
