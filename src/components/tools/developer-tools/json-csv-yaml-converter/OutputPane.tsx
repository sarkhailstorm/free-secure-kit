'use client';

import { useEffect, useState } from 'react';
import {
  Braces,
  Check,
  Copy,
  Download,
  Info,
  ListTree,
  LoaderCircle,
  Table,
  TriangleAlert,
  WrapText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { formatBytes, percentChange, plural } from '@/lib/format';
import { formatPosition } from '@/lib/json-csv-yaml-converter/errors';
import {
  DELIMITER_LABEL,
  FORMAT_LABEL,
  type ConvertOutcome,
  type CsvDelimiter,
  type DataFormat,
  type JsonIndent,
} from '@/lib/json-csv-yaml-converter/types';
import { SelectControl, type Option } from './controls';
import { HIGHLIGHT_LIMIT, HIGHLIGHT_THEME_CSS, highlightToHtml } from './highlight';

const TARGET_TABS: readonly TabItem<DataFormat>[] = [
  { id: 'json', label: 'JSON', icon: <Braces className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'csv', label: 'CSV', icon: <Table className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'yaml', label: 'YAML', icon: <ListTree className="h-3.5 w-3.5" aria-hidden /> },
];

const JSON_INDENT_OPTIONS: readonly Option<JsonIndent>[] = [
  { value: '2', label: '2 spaces' },
  { value: '4', label: '4 spaces' },
  { value: 'tab', label: 'Tabs' },
  { value: 'min', label: 'Minified' },
];

const YAML_INDENT_OPTIONS: readonly Option<'2' | '4'>[] = [
  { value: '2', label: '2 spaces' },
  { value: '4', label: '4 spaces' },
];

const DELIMITER_OPTIONS: readonly Option<CsvDelimiter>[] = (
  [',', '\t', ';', '|'] as const
).map((value) => ({ value, label: DELIMITER_LABEL[value] }));

export function OutputPane({
  target,
  onTargetChange,
  outcome,
  busy,
  inputBytes,
  jsonIndent,
  onJsonIndentChange,
  yamlIndent,
  onYamlIndentChange,
  csvDelimiter,
  onCsvDelimiterChange,
  wrap,
  onWrapChange,
  extension,
  copied,
  onCopy,
  onDownload,
}: {
  target: DataFormat;
  onTargetChange: (value: DataFormat) => void;
  outcome: ConvertOutcome | null;
  busy: boolean;
  inputBytes: number;
  jsonIndent: JsonIndent;
  onJsonIndentChange: (value: JsonIndent) => void;
  yamlIndent: '2' | '4';
  onYamlIndentChange: (value: '2' | '4') => void;
  csvDelimiter: CsvDelimiter;
  onCsvDelimiterChange: (value: CsvDelimiter) => void;
  wrap: boolean;
  onWrapChange: (value: boolean) => void;
  extension: string;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const output = outcome?.status === 'ok' ? outcome.output : '';
  const tooBigToHighlight = output.length > HIGHLIGHT_LIMIT;
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setHtml(null);
    if (output === '' || output.length > HIGHLIGHT_LIMIT) return;

    let cancelled = false;
    highlightToHtml(output, target)
      .then((markup) => {
        if (!cancelled) setHtml(markup);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });

    return () => {
      cancelled = true;
    };
  }, [output, target]);

  const canAct = !busy && outcome?.status === 'ok' && output !== '';

  let description: string;
  if (!outcome || outcome.status === 'empty') {
    description = 'Your converted data will appear here';
  } else if (outcome.status === 'error') {
    description =
      outcome.error?.kind === 'internal'
        ? 'The conversion could not be completed'
        : `Could not read the input as ${FORMAT_LABEL[outcome.detected]}`;
  } else {
    const flow =
      outcome.detected === target
        ? `${FORMAT_LABEL[target]} re-formatted`
        : `${FORMAT_LABEL[outcome.detected]} → ${FORMAT_LABEL[target]}`;
    const parts = [flow, plural(outcome.records, 'record')];
    if (target === 'csv' && outcome.columns > 0) parts.push(plural(outcome.columns, 'column'));
    const change = inputBytes > 0 ? percentChange(inputBytes, outcome.outputBytes) : 0;
    const delta = inputBytes > 0 && change !== 0 ? ` (${change > 0 ? '+' : ''}${change}%)` : '';
    parts.push(`${formatBytes(outcome.outputBytes)}${delta}`);
    description = parts.join(' · ');
  }

  return (
    <Card className="flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: HIGHLIGHT_THEME_CSS }} />

      <CardHeader
        title="Output"
        description={description}
        actions={
          <Tabs
            tabs={TARGET_TABS}
            active={target}
            onChange={onTargetChange}
            label="Convert to which format"
          />
        }
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {target === 'json' ? (
            <SelectControl
              label="Indent"
              value={jsonIndent}
              options={JSON_INDENT_OPTIONS}
              onChange={onJsonIndentChange}
            />
          ) : null}
          {target === 'yaml' ? (
            <SelectControl
              label="Indent"
              value={yamlIndent}
              options={YAML_INDENT_OPTIONS}
              onChange={onYamlIndentChange}
            />
          ) : null}
          {target === 'csv' ? (
            <SelectControl
              label="Delimiter"
              value={csvDelimiter}
              options={DELIMITER_OPTIONS}
              onChange={onCsvDelimiterChange}
            />
          ) : null}

          <Button
            size="sm"
            variant={wrap ? 'primary' : 'secondary'}
            aria-pressed={wrap}
            onClick={() => onWrapChange(!wrap)}
            className="ml-auto"
          >
            <WrapText className="h-3.5 w-3.5" aria-hidden />
            {wrap ? 'Wrapping' : 'Wrap lines'}
          </Button>
        </div>

        <OutputSurface
          outcome={outcome}
          busy={busy}
          output={output}
          html={html}
          wrap={wrap}
          tooBigToHighlight={tooBigToHighlight}
        />

        {outcome && outcome.notes.length > 0 ? (
          <ul className="space-y-1.5">
            {outcome.notes.map((note) => (
              <li key={note} className="flex items-start gap-2 text-[12px] leading-snug text-muted">
                <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" onClick={onDownload} disabled={!canAct}>
          <Download className="h-4 w-4" aria-hidden />
          Download .{extension}
        </Button>
        <Button variant="secondary" onClick={onCopy} disabled={!canAct}>
          {copied ? (
            <Check className="h-4 w-4 text-ok" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <p className="ml-auto text-[12px] text-faint">Saved straight from this tab</p>
      </div>
    </Card>
  );
}

function OutputSurface({
  outcome,
  busy,
  output,
  html,
  wrap,
  tooBigToHighlight,
}: {
  outcome: ConvertOutcome | null;
  busy: boolean;
  output: string;
  html: string | null;
  wrap: boolean;
  tooBigToHighlight: boolean;
}) {
  const shell =
    'relative flex min-h-[260px] flex-1 flex-col rounded-xl border border-line bg-bg sm:min-h-[340px] lg:min-h-[400px]';

  if (!busy && (!outcome || outcome.status === 'empty')) {
    return (
      <div className={cn(shell, 'items-center justify-center gap-2 px-6 text-center')}>
        <Braces className="h-5 w-5 text-faint" aria-hidden />
        <p className="text-[13px] font-medium text-muted">Nothing to show yet</p>
        <p className="max-w-xs text-[12px] leading-relaxed text-faint">
          Paste something on the left, drop a file, or load one of the examples.
        </p>
      </div>
    );
  }

  if (!busy && outcome?.status === 'error') {
    const error = outcome.error ?? {
      message: 'The input could not be read',
      line: null,
      column: null,
    };
    const position = formatPosition(error);
    return (
      <div className={cn(shell, 'items-center justify-center gap-2.5 px-6 text-center')}>
        <div
          role="alert"
          className="flex max-w-sm flex-col items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-5 py-4"
        >
          <TriangleAlert className="h-5 w-5 text-danger" aria-hidden />
          <p className="text-[13px] font-medium leading-snug text-ink">{error.message}</p>
          {position ? (
            <p className="rounded-md bg-danger/10 px-2 py-0.5 font-mono text-[12px] text-danger">
              {position}
            </p>
          ) : null}
        </div>
        {error.kind === 'internal' ? null : (
          <p className="max-w-xs text-[12px] leading-relaxed text-faint">
            Read as{' '}
            <strong className="font-medium text-muted">{FORMAT_LABEL[outcome.detected]}</strong>. If
            that is wrong, change &ldquo;Read as&rdquo; above the input.
          </p>
        )}
      </div>
    );
  }

  if (busy && output === '') {
    return (
      <div className={cn(shell, 'items-center justify-center gap-2')}>
        <LoaderCircle className="h-5 w-5 animate-spin text-accent" aria-hidden />
        <p className="text-[13px] text-muted">Converting…</p>
      </div>
    );
  }

  if (!busy && output === '') {
    return (
      <div className={cn(shell, 'items-center justify-center px-6 text-center')}>
        <p className="max-w-xs text-[13px] leading-relaxed text-muted">
          The input parsed cleanly but held no records, so there is nothing to write.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(shell, 'overflow-hidden')} aria-busy={busy}>
      {busy ? (
        <span className="absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated px-2.5 py-1 text-[12px] font-medium text-muted shadow-card">
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
          Converting…
        </span>
      ) : null}

      <pre
        className={cn(
          'scroll-thin securekit-hl m-0 min-h-0 flex-1 overflow-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink transition-opacity',
          wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
          busy && 'opacity-40',
        )}
      >
        {html !== null ? (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code>{output}</code>
        )}
      </pre>

      {tooBigToHighlight ? (
        <p className="border-t border-line px-3 py-1.5 text-[12px] text-faint">
          Syntax highlighting is off above {HIGHLIGHT_LIMIT.toLocaleString()} characters, so the
          page stays quick. The text itself is complete.
        </p>
      ) : null}
    </div>
  );
}
