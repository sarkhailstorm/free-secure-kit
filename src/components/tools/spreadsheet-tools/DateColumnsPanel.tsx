import { Check, CircleHelp } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { DateColumnAnalysis } from '@/lib/csv-cleaner/dates';
import type { ColumnDecision, DateOrder } from '@/lib/csv-cleaner/types';

function orderLabel(order: DateOrder): string {
  return order === 'dmy' ? 'DD/MM' : 'MM/DD';
}

function autoReason(column: DateColumnAnalysis): string {
  if (column.reason === 'unambiguous') {
    return 'Every value states its month plainly, so there was nothing to guess.';
  }
  if (column.reason === 'conflict') {
    return 'This column mixes day-first and month-first values, but each one has only a single reading that is a real date, so every value was resolved on its own.';
  }
  return column.order
    ? `Read as ${orderLabel(column.order)} — a value in this column has a day above 12, which settles the whole column.`
    : 'Read without guesswork.';
}

function AmbiguityPrompt({
  column,
  decision,
  onDecide,
}: {
  column: DateColumnAnalysis;
  decision: ColumnDecision | undefined;
  onDecide: (choice: ColumnDecision | undefined) => void;
}) {
  const answered = decision !== undefined;
  const promptId = `date-order-${column.index}`;
  const name = column.header || `column ${column.index + 1}`;

  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3.5',
        answered ? 'border-line bg-bg' : 'border-warn/30 bg-warn/10',
      )}
    >
      <div className="flex items-start gap-2.5">
        <CircleHelp
          className={cn('mt-0.5 h-4 w-4 shrink-0', answered ? 'text-muted' : 'text-warn')}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink" id={promptId}>
            Which way round are the dates in <span className="font-mono font-medium">{name}</span>?
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {column.reason === 'conflict'
              ? 'Some values in this column can only be day-first and others can only be month-first, so the column disagrees with itself.'
              : 'Every value here reads equally well as day-first or month-first, so there is nothing in the data to settle it.'}
          </p>

          {column.samples.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {column.samples.map((sample) => (
                <code
                  key={sample}
                  className="rounded-md bg-line/60 px-1.5 py-0.5 font-mono text-[12px] text-muted"
                >
                  {sample}
                </code>
              ))}
            </div>
          ) : null}

          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-labelledby={promptId}
          >
            {(
              [
                { id: 'dmy', label: 'These are DD/MM' },
                { id: 'mdy', label: 'These are MM/DD' },
                { id: 'skip', label: 'Leave this column alone' },
              ] as const
            ).map((choice) => {
              const active = decision === choice.id;
              return (
                <Button
                  key={choice.id}
                  size="md"
                  variant={active ? 'primary' : 'secondary'}
                  aria-pressed={active}
                  onClick={() => onDecide(active ? undefined : choice.id)}
                >
                  {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                  {choice.label}
                </Button>
              );
            })}
          </div>

          {!answered ? (
            <p className="mt-2 text-[12px] text-muted">
              Until you choose, this column is left exactly as it arrived.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResolvedRow({
  column,
  decision,
  onDecide,
}: {
  column: DateColumnAnalysis;
  decision: ColumnDecision | undefined;
  onDecide: (choice: ColumnDecision | undefined) => void;
}) {
  const skipped = decision === 'skip';
  const name = column.header || `column ${column.index + 1}`;
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 border-t border-line py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] text-ink">{name}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          {skipped ? 'Left untouched at your request.' : autoReason(column)}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-9"
        onClick={() => onDecide(skipped ? undefined : 'skip')}
        aria-label={
          skipped ? `Normalise dates in ${name} again` : `Leave the ${name} column untouched`
        }
      >
        {skipped ? 'Normalise it' : 'Leave alone'}
      </Button>
    </li>
  );
}

export interface DateColumnsPanelProps {
  columns: readonly DateColumnAnalysis[];
  /** `CleanOptions.columnDecisions`, keyed by ORIGINAL column index. */
  decisions: Record<number, ColumnDecision>;
  onDecide: (index: number, choice: ColumnDecision | undefined) => void;
  enabled: boolean;
}

export function DateColumnsPanel({
  columns,
  decisions,
  onDecide,
  enabled,
}: DateColumnsPanelProps) {
  if (!enabled || columns.length === 0) return null;

  const needAnswer = columns.filter((c) => c.status === 'undecidable');
  const resolved = columns.filter((c) => c.status === 'auto');
  const unanswered = needAnswer.filter((c) => decisions[c.index] === undefined).length;

  return (
    <Card>
      <CardHeader
        title="Date columns"
        description={
          unanswered > 0
            ? `${unanswered} column${unanswered === 1 ? ' needs' : 's need'} a decision before its dates are touched.`
            : 'Every date column has a reading we are confident about.'
        }
      />

      <div className="space-y-3 px-5 py-4">
        {needAnswer.map((column) => (
          <AmbiguityPrompt
            key={column.index}
            column={column}
            decision={decisions[column.index]}
            onDecide={(choice) => onDecide(column.index, choice)}
          />
        ))}

        {resolved.length > 0 ? (
          <ul className="rounded-xl border border-line bg-bg px-3.5 py-1">
            {resolved.map((column) => (
              <ResolvedRow
                key={column.index}
                column={column}
                decision={decisions[column.index]}
                onDecide={(choice) => onDecide(column.index, choice)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
