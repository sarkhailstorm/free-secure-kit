'use client';

import { Sparkles, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Note, SelectField } from '@/components/tools/pdf-tools/shared';
import { plural } from '@/lib/format';
import { delimiterLabel, encodeWindows1252 } from '@/lib/csv-cleaner/encoding';
import type {
  DecodeReport,
  DecodeSource,
  DelimiterReport,
  DelimiterSource,
  EncodingId,
} from '@/lib/csv-cleaner/types';

const TEXT_SOURCE: Record<DecodeSource, string> = {
  bom: 'Your file says itself how its text was saved.',
  detected: 'Nothing in the file said, so this is our best guess.',
  assumed: 'Nothing in the file said, so we went with the usual one.',
  chosen: 'You picked this one.',
};

const SEPARATOR_SOURCE: Record<DelimiterSource, string> = {
  declared: 'The first line of your file said which one to use.',
  detected: 'Worked out from the first few rows.',
  assumed: 'Nothing pointed either way, so we went with the usual one.',
  chosen: 'You picked this one.',
};

const SAMPLE_LIMIT = 200;

/** Empty when the sample cannot be re-read at any length. */
function sampleWithLettersBack(sample: string): string {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const head = sample.slice(0, SAMPLE_LIMIT + 4);
  // A sample cut mid-character fails the strict read, so try a few shorter endings.
  for (let end = head.length; end > head.length - 4 && end > 0; end -= 1) {
    try {
      return decoder.decode(encodeWindows1252(head.slice(0, end), true));
    } catch {
      // Not readable at this length; try one character shorter.
    }
  }
  return '';
}

function textWorthShowing(decode: DecodeReport | null): decode is DecodeReport {
  if (!decode) return false;
  return (
    decode.encoding !== 'utf-8' ||
    decode.source === 'chosen' ||
    decode.confidence !== 'high' ||
    decode.replacements > 0 ||
    decode.mojibake.available ||
    decode.mojibake.applied
  );
}

function separatorWorthShowing(delimiter: DelimiterReport | null): delimiter is DelimiterReport {
  if (!delimiter) return false;
  if (delimiter.sepLine !== null) return true;
  return (
    delimiter.source === 'chosen' ||
    delimiter.confidence !== 'high' ||
    delimiter.delimiter !== ','
  );
}

export interface ReadingPanelProps {
  /** `ParsedFile.decode`. Null for a workbook, which has no loose text to read. */
  decode: DecodeReport | null;
  /** `ParsedFile.delimiter`. Null for a workbook. */
  delimiter: DelimiterReport | null;
  onEncodingChange: (encoding: EncodingId) => void;
  onDelimiterChange: (delimiter: string) => void;
  onRepairMojibake: (repair: boolean) => void;
  busy?: boolean;
}

export function ReadingPanel({
  decode,
  delimiter,
  onEncodingChange,
  onDelimiterChange,
  onRepairMojibake,
  busy = false,
}: ReadingPanelProps) {
  const showText = textWorthShowing(decode);
  const showSeparator = separatorWorthShowing(delimiter);
  if (!showText && !showSeparator) return null;

  const asRead = showText
    ? decode.candidates.find((c) => c.id === decode.encoding)?.sample ?? ''
    : '';
  const lettersBack = showText && decode.mojibake.applied;
  const sample = lettersBack ? sampleWithLettersBack(asRead) : asRead;

  const separatorOptions = showSeparator
    ? delimiter.candidates.some((c) => c.delimiter === delimiter.delimiter)
      ? delimiter.candidates
      : [
          {
            delimiter: delimiter.delimiter,
            label: delimiterLabel(delimiter.delimiter),
            columns: 0,
            consistency: 0,
          },
          ...delimiter.candidates,
        ]
    : [];

  return (
    <Card>
      <CardHeader
        title="How your file was read"
        description="Some of this we had to work out. Change anything that looks wrong and the file is read again."
      />

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {showText ? (
            <SelectField<EncodingId>
              label="How the text was read"
              value={decode.encoding}
              disabled={busy}
              onChange={onEncodingChange}
              options={decode.candidates.map((candidate) => ({
                value: candidate.id,
                label: candidate.label,
              }))}
              hint={TEXT_SOURCE[decode.source]}
            />
          ) : null}

          {showSeparator ? (
            <SelectField<string>
              label="What separates the columns"
              value={delimiter.delimiter}
              disabled={busy}
              onChange={onDelimiterChange}
              options={separatorOptions.map((candidate) => ({
                value: candidate.delimiter,
                label: candidate.columns
                  ? `${candidate.label} — ${plural(candidate.columns, 'column')}`
                  : candidate.label,
              }))}
              hint={SEPARATOR_SOURCE[delimiter.source]}
            />
          ) : null}
        </div>

        {sample ? (
          <div>
            <p className="text-[12px] font-medium text-muted">
              {lettersBack ? 'The start of your file now reads:' : 'The start of your file reads:'}
            </p>
            <p className="mt-1 max-h-16 overflow-hidden whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-faint">
              {sample.slice(0, SAMPLE_LIMIT)}
            </p>
          </div>
        ) : null}

        {showText && decode.replacements > 0 ? (
          <Note>
            {plural(decode.replacements, 'character')} could not be read and came out as
            &ldquo;&#xFFFD;&rdquo;. If you know where the file came from, try another way of reading
            the text.
          </Note>
        ) : null}

        {showSeparator && delimiter.sepLine !== null ? (
          <Note>
            The first line of your file said which separator to use. It is not part of your data, so
            it has been left out.
          </Note>
        ) : null}

        {showText && decode.mojibake.available ? (
          <div
            className={
              lettersBack
                ? 'rounded-xl border border-line bg-elevated px-3.5 py-3'
                : 'rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3'
            }
          >
            <p className="text-[13px] font-semibold text-ink">
              {lettersBack
                ? 'Some letters had come out as symbols'
                : 'Some letters have come out as symbols'}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {lettersBack
                ? 'This happens when a file has been saved twice over. Here is what we put back:'
                : 'This happens when a file has been saved twice over. Here is what we would put back:'}
            </p>

            <ul className="mt-2 space-y-1">
              {decode.mojibake.examples.slice(0, 3).map((example) => (
                <li
                  key={example.before}
                  className="flex flex-wrap items-center gap-2 font-mono text-[12px]"
                >
                  <span className="text-muted line-through decoration-faint/60">
                    {example.before}
                  </span>
                  <span aria-hidden className="text-faint">
                    &rarr;
                  </span>
                  <span className="font-medium text-ink">{example.after}</span>
                </li>
              ))}
            </ul>

            {lettersBack ? (
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                disabled={busy}
                onClick={() => onRepairMojibake(false)}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                Leave them as they were
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                className="mt-3"
                disabled={busy}
                onClick={() => onRepairMojibake(true)}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Put the letters back
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
