import { useId } from 'react';
import { Eraser, FileInput } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { formatBytes, plural } from '@/lib/format';
import {
  FORMAT_LABEL,
  type Confidence,
  type DataFormat,
  type SourceChoice,
} from '@/lib/json-csv-yaml-converter/types';
import { DetectBadge, SelectControl, ToggleControl, type Option } from './controls';

const SOURCE_OPTIONS: readonly Option<SourceChoice>[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV / TSV' },
  { value: 'yaml', label: 'YAML' },
];

const EXAMPLE_FORMATS: readonly DataFormat[] = ['json', 'csv', 'yaml'];

export const ACCEPTED_FILES = '.json,.csv,.tsv,.yaml,.yml,.txt';

export function InputPane({
  text,
  onTextChange,
  source,
  onSourceChange,
  detected,
  confidence,
  overridden,
  pending,
  bytes,
  lines,
  fileName,
  onFiles,
  onLoadExample,
  onClear,
  showCoerce,
  coerceTypes,
  onCoerceChange,
}: {
  text: string;
  onTextChange: (value: string) => void;
  source: SourceChoice;
  onSourceChange: (value: SourceChoice) => void;
  detected: DataFormat;
  confidence: Confidence;
  overridden: boolean;
  pending: boolean;
  bytes: number;
  lines: number;
  fileName: string | null;
  onFiles: (files: File[]) => void;
  onLoadExample: (format: DataFormat) => void;
  onClear: () => void;
  showCoerce: boolean;
  coerceTypes: boolean;
  onCoerceChange: (value: boolean) => void;
}) {
  const textareaId = useId();
  const isEmpty = text.trim() === '';

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Input"
        description={
          fileName ? `Read from ${fileName}` : 'Paste data, drop a file, or load an example'
        }
        actions={
          <SelectControl
            label="Read as"
            value={source}
            options={SOURCE_OPTIONS}
            onChange={onSourceChange}
          />
        }
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DetectBadge
            format={detected}
            confidence={confidence}
            overridden={overridden}
            idle={isEmpty}
            pending={pending}
          />
          <div className="flex items-center gap-0.5">
            <span className="mr-1 text-[12px] text-faint">Example</span>
            {EXAMPLE_FORMATS.map((format) => (
              <Button
                key={format}
                size="sm"
                variant="ghost"
                onClick={() => onLoadExample(format)}
                aria-label={`Load the ${FORMAT_LABEL[format]} example`}
                title={`Load a short ${FORMAT_LABEL[format]} example`}
              >
                {FORMAT_LABEL[format]}
              </Button>
            ))}
          </div>
        </div>

        <label htmlFor={textareaId} className="sr-only">
          Data to convert
        </label>
        <textarea
          id={textareaId}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          placeholder="Paste JSON, CSV or YAML here — it converts as you type."
          className="scroll-thin min-h-[260px] w-full flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint/70 focus:border-accent/50 sm:min-h-[340px] lg:min-h-[400px]"
        />

        {showCoerce ? (
          <div className="rounded-xl border border-line bg-bg px-3 py-1.5">
            <ToggleControl
              label="Read cell text as real types"
              hint="42 becomes a number, true a boolean, null an empty value. Turn this off to keep every cell as text."
              checked={coerceTypes}
              onChange={onCoerceChange}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-faint">
            {isEmpty ? 'Nothing loaded yet' : `${formatBytes(bytes)} · ${plural(lines, 'line')}`}
          </p>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={text === ''}>
            <Eraser className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        </div>

        <Dropzone
          compact
          onFiles={onFiles}
          accept={ACCEPTED_FILES}
          title="Drop a data file"
          hint=".json · .csv · .tsv · .yaml · .yml · .txt — opened in this tab, never uploaded"
          icon={<FileInput className="h-4 w-4" aria-hidden />}
        />
      </div>
    </Card>
  );
}
