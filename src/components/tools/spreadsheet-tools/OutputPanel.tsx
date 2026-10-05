import { Download, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { ErrorNote, Note, SelectField } from '@/components/tools/pdf-tools/shared';
import { plural } from '@/lib/format';
import { delimiterLabel } from '@/lib/csv-cleaner/encoding';
import type { OutputFormat } from '@/lib/csv-cleaner/types';

const formatTabs = [
  { id: 'csv' as const, label: 'CSV' },
  { id: 'xlsx' as const, label: 'Excel' },
];

const SEPARATORS = [',', ';', '\t', '|'];

/** Must match `needsFormulaEscape`. */
function formulaHint(format: OutputFormat, risks: number): string {
  if (format === 'xlsx') {
    return 'An Excel file keeps every value as text, so nothing in it is run as a sum and nothing is changed.';
  }
  if (risks === 0) {
    return 'Nothing in this file needs it, so nothing will be changed.';
  }
  return (
    `${plural(risks, 'value')} here could be read as a sum: those starting with = or @, and those ` +
    'starting with + or - followed by something other than a number. An apostrophe goes in front of ' +
    'each one, and in a CSV that apostrophe is real text — you will see it in the file. Plain ' +
    'numbers such as -42 are left alone.'
  );
}

export interface OutputPanelProps {
  format: OutputFormat;
  onFormatChange: (format: OutputFormat) => void;
  delimiter: string;
  onDelimiterChange: (delimiter: string) => void;
  escapeFormulas: boolean;
  onEscapeFormulasChange: (escape: boolean) => void;
  formulaRisks: number;
  /** `canWrite(sheets, format).reason` — shown instead of letting them save. */
  refusal?: string | null;
  /** Sheets ticked to save, not the number in the file. */
  sheetCount: number;
  onSave: () => void;
  busy?: boolean;
}

export function OutputPanel({
  format,
  onFormatChange,
  delimiter,
  onDelimiterChange,
  escapeFormulas,
  onEscapeFormulasChange,
  formulaRisks,
  refusal = null,
  sheetCount,
  onSave,
  busy = false,
}: OutputPanelProps) {
  const separators = SEPARATORS.includes(delimiter) ? SEPARATORS : [delimiter, ...SEPARATORS];

  return (
    <Card>
      <CardHeader
        title="Save your file"
        description="Built here in this tab and saved straight to your downloads."
        actions={
          <Tabs<OutputFormat>
            label="Save as"
            tabs={formatTabs}
            active={format}
            onChange={onFormatChange}
          />
        }
      />

      <div className="flex flex-col gap-4 px-5 py-4">
        {format === 'csv' ? (
          <div className="sm:max-w-xs">
            <SelectField<string>
              label="What separates the columns"
              value={delimiter}
              disabled={busy}
              onChange={onDelimiterChange}
              options={separators.map((value) => ({ value, label: delimiterLabel(value) }))}
              hint="The same one your file came with, unless you change it."
            />
          </div>
        ) : null}

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={escapeFormulas}
            disabled={busy}
            onChange={(e) => onEscapeFormulasChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent disabled:cursor-not-allowed"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium leading-snug text-ink">
              Stop spreadsheets running values as sums
            </span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">
              {formulaHint(format, formulaRisks)}
            </span>
          </span>
        </label>

        {format === 'csv' && sheetCount > 1 ? (
          <Note>
            A CSV holds one sheet, so your {sheetCount} sheets are saved as one file each, together
            in a zip.
          </Note>
        ) : null}

        {sheetCount === 0 ? <Note>Tick at least one sheet to save.</Note> : null}

        {refusal ? <ErrorNote message={refusal} /> : null}

        <div>
          <Button
            variant="primary"
            disabled={busy || sheetCount === 0 || refusal !== null}
            onClick={onSave}
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            {busy ? 'Saving…' : format === 'csv' ? 'Save as CSV' : 'Save as Excel'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
