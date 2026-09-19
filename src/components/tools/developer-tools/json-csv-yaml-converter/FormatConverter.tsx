import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { baseName, extension } from '@/lib/format';
import { copyToClipboard, downloadText, safeFilename } from '@/lib/download';
import { convertText } from '@/lib/json-csv-yaml-converter/convert';
import { EXAMPLES } from '@/lib/json-csv-yaml-converter/examples';
import {
  utf8Bytes,
  type ConvertOutcome,
  type CsvDelimiter,
  type DataFormat,
  type JsonIndent,
  type SourceChoice,
} from '@/lib/json-csv-yaml-converter/types';
import { HowItWorks } from './HowItWorks';
import { InputPane } from './InputPane';
import { OutputPane } from './OutputPane';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const DEBOUNCE_MS = 250;
const SLOW_DEBOUNCE_MS = 700;
const SLOW_INPUT_CHARS = 500_000;

function outputFileMeta(target: DataFormat, delimiter: CsvDelimiter): { ext: string; mime: string } {
  if (target === 'json') return { ext: 'json', mime: 'application/json' };
  if (target === 'yaml') return { ext: 'yaml', mime: 'application/yaml' };
  return delimiter === '\t'
    ? { ext: 'tsv', mime: 'text/tab-separated-values' }
    : { ext: 'csv', mime: 'text/csv' };
}

function countLines(text: string): number {
  if (text === '') return 0;
  let count = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) count += 1;
  }
  return count;
}

export function FormatConverter() {
  const toast = useToast();

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>(undefined);

  const [source, setSource] = useState<SourceChoice>('auto');
  const [target, setTarget] = useState<DataFormat>('csv');
  const [jsonIndent, setJsonIndent] = useState<JsonIndent>('2');
  const [yamlIndent, setYamlIndent] = useState<'2' | '4'>('2');
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>(',');
  const [coerceTypes, setCoerceTypes] = useState(true);
  const [wrap, setWrap] = useState(false);

  const [outcome, setOutcome] = useState<ConvertOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputBytes = useMemo(() => utf8Bytes(text), [text]);
  const lines = useMemo(() => countLines(text), [text]);

  useEffect(() => {
    if (text.trim() === '') {
      setOutcome(null);
      setBusy(false);
      return;
    }

    let cancelled = false;
    const delay = text.length > SLOW_INPUT_CHARS ? SLOW_DEBOUNCE_MS : DEBOUNCE_MS;

    const timer = setTimeout(() => {
      setBusy(true);
      void (async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });

        try {
          const next = await convertText({
            text,
            source,
            target,
            jsonIndent,
            yamlIndent: Number(yamlIndent),
            csvDelimiter,
            coerceTypes,
            hint,
          });
          if (!cancelled) setOutcome(next);
        } catch (error) {
          if (!cancelled) {
            setOutcome({
              status: 'error',
              detected: source === 'auto' ? 'json' : source,
              confidence: 'low',
              overridden: source !== 'auto',
              output: '',
              records: 0,
              columns: 0,
              outputBytes: 0,
              notes: [],
              error: {
                message:
                  error instanceof Error && error.message
                    ? error.message
                    : 'Something went wrong while converting',
                line: null,
                column: null,
                kind: 'internal',
              },
            });
          }
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, source, target, jsonIndent, yamlIndent, csvDelimiter, coerceTypes, hint]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    setFileName(null);
    setHint(undefined);
  }, []);

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;

      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is too big to open here — try 25 MB or less.`);
        return;
      }

      void (async () => {
        try {
          const contents = await file.text();
          setText(contents);
          setFileName(file.name);
          setHint(extension(file.name) || undefined);
          setSource('auto');
        } catch {
          toast.error(`Could not read ${file.name}. Is it a plain text file?`);
        }
      })();
    },
    [toast],
  );

  const handleLoadExample = useCallback((format: DataFormat) => {
    setText(EXAMPLES[format]);
    setFileName(null);
    setHint(undefined);
    setSource('auto');
  }, []);

  const handleClear = useCallback(() => {
    setText('');
    setFileName(null);
    setHint(undefined);
    setOutcome(null);
  }, []);

  const output = outcome?.status === 'ok' ? outcome.output : '';
  const { ext, mime } = outputFileMeta(target, csvDelimiter);

  const handleCopy = useCallback(() => {
    if (output === '') return;
    void (async () => {
      const ok = await copyToClipboard(output);
      if (!ok) {
        toast.error('Your browser blocked the clipboard — select the output and copy it by hand.');
        return;
      }
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
      toast.celebrate('Copied to your clipboard.');
    })();
  }, [output, toast]);

  const handleDownload = useCallback(() => {
    if (output === '') return;
    const stem = safeFilename(baseName(fileName ?? 'converted'), 'converted');
    const name = `${stem}.${ext}`;
    downloadText(output, name, mime);
    toast.celebrate(`Saved ${name}`);
  }, [output, fileName, ext, mime, toast]);

  const isEmpty = text.trim() === '';
  const overridden = source !== 'auto';
  const badgeFormat: DataFormat = overridden ? source : (outcome?.detected ?? 'json');
  const badgeConfidence = overridden ? 'high' : (outcome?.confidence ?? 'low');
  const detectPending =
    !overridden &&
    !isEmpty &&
    (outcome === null || (outcome.status === 'error' && outcome.error?.kind === 'internal'));

  const effectiveSource: DataFormat | null = overridden
    ? source
    : outcome && outcome.status !== 'empty'
      ? outcome.detected
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <InputPane
          text={text}
          onTextChange={handleTextChange}
          source={source}
          onSourceChange={setSource}
          detected={badgeFormat}
          confidence={badgeConfidence}
          overridden={overridden}
          pending={detectPending}
          bytes={inputBytes}
          lines={lines}
          fileName={fileName}
          onFiles={handleFiles}
          onLoadExample={handleLoadExample}
          onClear={handleClear}
          showCoerce={effectiveSource === 'csv' && !isEmpty}
          coerceTypes={coerceTypes}
          onCoerceChange={setCoerceTypes}
        />

        <OutputPane
          target={target}
          onTargetChange={setTarget}
          outcome={outcome}
          busy={busy}
          inputBytes={inputBytes}
          jsonIndent={jsonIndent}
          onJsonIndentChange={setJsonIndent}
          yamlIndent={yamlIndent}
          onYamlIndentChange={setYamlIndent}
          csvDelimiter={csvDelimiter}
          onCsvDelimiterChange={setCsvDelimiter}
          wrap={wrap}
          onWrapChange={setWrap}
          extension={ext}
          copied={copied}
          onCopy={handleCopy}
          onDownload={handleDownload}
        />
      </div>

      <HowItWorks />
    </div>
  );
}
