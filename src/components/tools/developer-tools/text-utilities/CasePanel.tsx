import { useMemo, useState } from 'react';
import { CaseSensitive, CornerDownLeft, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { CASES, convertCase, type CaseId } from '@/lib/text-utilities/case';
import { CopyButton, EmptyState, TextField } from './shared';

export function CasePanel() {
  const [input, setInput] = useState('');
  const [active, setActive] = useState<CaseId | null>(null);

  const output = useMemo(
    () => (active ? convertCase(input, active) : ''),
    [input, active],
  );

  const activeLabel = CASES.find((c) => c.id === active)?.label ?? null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Text to convert"
          description="Identifiers are understood too — camelCase, snake_case, kebab-case and CONSTANT_CASE all round-trip. Each line is treated on its own."
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setInput('');
                setActive(null);
              }}
              disabled={input.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear
            </Button>
          }
        />
        <div className="p-5">
          <TextField
            label="Input"
            value={input}
            onChange={setInput}
            rows={7}
            placeholder="Paste or type text here — one line or many."
          />
        </div>

        <div className="border-t border-line px-5 py-4">
          <p className="text-[13px] font-medium text-ink">Convert to</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {CASES.map((option) => {
              const selected = option.id === active;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActive(option.id)}
                  className={cn(
                    'flex min-h-[52px] flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left transition-all',
                    selected
                      ? 'border-accent/50 bg-accent-soft shadow-sm'
                      : 'border-line bg-surface hover:border-accent/40 hover:bg-accent-soft/40',
                  )}
                >
                  <span
                    className={cn(
                      'w-full truncate text-[13px] font-medium',
                      selected ? 'text-accent' : 'text-ink',
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="w-full truncate font-mono text-[11px] text-faint">
                    {option.example}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Result"
          description={
            activeLabel ? `Converted to ${activeLabel}.` : 'Pick a case above to see the result.'
          }
          actions={
            <>
              <Button
                size="sm"
                onClick={() => setInput(output)}
                disabled={output.length === 0}
                title="Replace the input with this result so you can convert again"
              >
                <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Use as input</span>
              </Button>
              <CopyButton
                text={output}
                label="Copy"
                successMessage="Converted text copied."
                disabled={output.length === 0}
              />
            </>
          }
        />
        <div className="p-5">
          {!active ? (
            <EmptyState
              icon={<CaseSensitive className="h-4 w-4" aria-hidden />}
              title="No case selected"
              body="Choose one of the ten cases above. Title Case keeps short joining words like “of” and “the” lowercase, except at the start or end."
            />
          ) : input.length === 0 ? (
            <EmptyState
              icon={<CaseSensitive className="h-4 w-4" aria-hidden />}
              title="Nothing to convert"
              body="Add some text in the box above and the result will appear here as you type."
            />
          ) : (
            <TextField label="Output" value={output} readOnly rows={7} />
          )}
        </div>
      </Card>
    </div>
  );
}
