import { cn } from '@/lib/cn';

export interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  nested?: boolean;
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  nested = false,
}: ToggleProps) {
  return (
    <label
      className={cn(
        '-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-line/30',
        nested && 'ml-4 border-l border-line pl-3',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-snug text-ink">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
