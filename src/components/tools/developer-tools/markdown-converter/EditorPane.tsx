import { forwardRef } from 'react';
import { SquarePen } from 'lucide-react';
import { cn } from '@/lib/cn';

export const EditorPane = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}>(function EditorPane({ value, onChange, className }, ref) {
  return (
    <section className={cn('flex min-w-0 flex-col', className)} aria-label="Markdown source">
      <div className="hidden shrink-0 items-center gap-1.5 border-b border-line px-4 py-2 lg:flex">
        <SquarePen className="h-3.5 w-3.5 text-faint" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
          Markdown
        </span>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Markdown source"
        spellCheck
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={'# Start with a heading\n\nThen write anything…'}
        className={cn(
          'min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3.5',
          'font-mono text-[13px] leading-relaxed text-ink scroll-thin',
          'placeholder:text-faint focus-visible:[outline-offset:-2px]',
        )}
      />
    </section>
  );
});
