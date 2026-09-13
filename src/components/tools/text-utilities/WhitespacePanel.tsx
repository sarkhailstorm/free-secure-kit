'use client';

import { useMemo, useState } from 'react';
import { Download, Eraser, RefreshCw, Trash2 } from 'lucide-react';
import { downloadText } from '@/lib/download';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import {
  DEFAULT_WHITESPACE_OPTIONS,
  cleanWhitespace,
  findInvisible,
  type LineEndingMode,
  type TabMode,
  type WhitespaceOptions,
} from '@/lib/text-utilities/whitespace';
import {
  CheckboxRow,
  CopyButton,
  EmptyState,
  NumberField,
  Pill,
  SelectField,
  TextField,
  WarnNote,
} from './shared';

/** Above this we stop recomputing on every keystroke. */
const LIVE_LIMIT = 1_000_000;

const TAB_OPTIONS: readonly { value: TabMode; label: string }[] = [
  { value: 'off', label: 'Leave tabs alone' },
  { value: 'tabs-to-spaces', label: 'Tabs → spaces' },
  { value: 'spaces-to-tabs', label: 'Leading spaces → tabs' },
];

const ENDING_OPTIONS: readonly { value: LineEndingMode; label: string }[] = [
  { value: 'off', label: 'Leave line endings alone' },
  { value: 'lf', label: 'Normalise to LF (Unix)' },
  { value: 'crlf', label: 'Normalise to CRLF (Windows)' },
];

export function WhitespacePanel() {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<WhitespaceOptions>(DEFAULT_WHITESPACE_OPTIONS);

  const tooBig = input.length > LIVE_LIMIT;

  const result = useMemo(
    () => (tooBig ? null : cleanWhitespace(input, options)),
    [input, options, tooBig],
  );

  const invisibleHits = useMemo(
    () => (tooBig || input.length === 0 ? [] : findInvisible(input, 8)),
    [input, tooBig],
  );

  function set<K extends keyof WhitespaceOptions>(key: K, value: WhitespaceOptions[K]) {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }

  const output = result?.output ?? '';
  const charsSaved = result ? result.before.characters - result.after.characters : 0;
  const linesSaved = result ? result.before.lines - result.after.lines : 0;

  function download() {
    if (!output) return;
    downloadText(output, 'cleaned.txt', 'text/plain');
    toast.celebrate('Saved cleaned.txt to your downloads.');
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Text to clean"
          description="Every option is applied live. Nothing is uploaded — the cleaning happens in this tab."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setInput('')} disabled={!input.length}>
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
            rows={9}
            placeholder="Paste messy text — trailing spaces, double blank lines, tabs, invisible characters from Word…"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Operations"
          description="Each one is independent; they are applied top to bottom."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setOptions(DEFAULT_WHITESPACE_OPTIONS)}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </Button>
          }
        />
        <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <fieldset className="min-w-0">
            <legend className="pb-1 text-[13px] font-semibold text-ink">Blank lines</legend>
            <CheckboxRow
              label="Collapse runs of blank lines"
              checked={options.collapseBlankLines}
              onChange={(v) => set('collapseBlankLines', v)}
              disabled={options.removeBlankLines}
            />
            <div className="max-w-[10rem] pb-1">
              <NumberField
                label="Keep at most"
                value={options.maxBlankLines}
                min={0}
                max={10}
                onChange={(v) => set('maxBlankLines', v)}
                disabled={options.removeBlankLines || !options.collapseBlankLines}
                hint="blank lines in a row"
              />
            </div>
            <CheckboxRow
              label="Remove all blank lines"
              checked={options.removeBlankLines}
              onChange={(v) => set('removeBlankLines', v)}
            />
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="pb-1 text-[13px] font-semibold text-ink">Spaces</legend>
            <CheckboxRow
              label="Trim trailing whitespace"
              checked={options.trimTrailing}
              onChange={(v) => set('trimTrailing', v)}
            />
            <CheckboxRow
              label="Trim leading whitespace"
              checked={options.trimLeading}
              onChange={(v) => set('trimLeading', v)}
            />
            <CheckboxRow
              label="Collapse repeated spaces"
              checked={options.collapseSpaces}
              onChange={(v) => set('collapseSpaces', v)}
              hint="Indentation is preserved"
            />
          </fieldset>

          <fieldset className="min-w-0 space-y-3">
            <legend className="pb-1 text-[13px] font-semibold text-ink">Tabs & endings</legend>
            <SelectField
              label="Tabs"
              value={options.tabs}
              onChange={(v) => set('tabs', v)}
              options={TAB_OPTIONS}
            />
            <div className="max-w-[10rem]">
              <NumberField
                label="Tab width"
                value={options.tabWidth}
                min={1}
                max={8}
                onChange={(v) => set('tabWidth', v)}
                disabled={options.tabs === 'off'}
                hint="spaces per tab stop"
              />
            </div>
            <SelectField
              label="Line endings"
              value={options.lineEndings}
              onChange={(v) => set('lineEndings', v)}
              options={ENDING_OPTIONS}
            />
          </fieldset>

          <fieldset className="min-w-0 sm:col-span-2 lg:col-span-3">
            <legend className="pb-1 text-[13px] font-semibold text-ink">Invisible characters</legend>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <CheckboxRow
                label="Strip zero-width and control characters"
                checked={options.stripInvisible}
                onChange={(v) => set('stripInvisible', v)}
                hint="Zero-width spaces, direction marks, soft hyphens, stray control codes"
              />
              <CheckboxRow
                label="Replace unusual spaces with a normal space"
                checked={options.normaliseSpaces}
                onChange={(v) => set('normaliseSpaces', v)}
                hint="Non-breaking, narrow and ideographic spaces"
              />
            </div>

            {invisibleHits.length > 0 ? (
              <div className="mt-2 rounded-xl border border-warn/25 bg-warn/10 px-3.5 py-3">
                <p className="text-[13px] font-medium text-ink">
                  Found invisible characters in your text
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {invisibleHits.map((hit, index) => (
                    <li key={`${hit.line}-${hit.column}-${index}`} className="text-[12px] text-muted">
                      <span className="font-mono text-faint">
                        line {hit.line}, col {hit.column}
                      </span>{' '}
                      — {hit.name} <span className="font-mono text-faint">{hit.code}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </fieldset>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Cleaned text"
          description={
            result && input.length > 0
              ? `${result.before.characters.toLocaleString()} → ${result.after.characters.toLocaleString()} characters, ${result.before.lines.toLocaleString()} → ${result.after.lines.toLocaleString()} lines`
              : 'The cleaned result appears here.'
          }
          actions={
            <>
              <CopyButton
                text={output}
                label="Copy"
                successMessage="Cleaned text copied."
                disabled={!output}
              />
              <Button size="sm" onClick={download} disabled={!output}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </>
          }
        />
        <div className="space-y-3 p-5">
          {tooBig ? (
            <WarnNote>
              That is {input.length.toLocaleString()} characters — above{' '}
              {LIVE_LIMIT.toLocaleString()} the live preview is turned off so typing stays smooth.
              Trim the text down and it will start again.
            </WarnNote>
          ) : input.length === 0 ? (
            <EmptyState
              icon={<Eraser className="h-4 w-4" aria-hidden />}
              title="Nothing to clean yet"
              body="Paste text above. The counts and the list of what was removed update as you type."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {/* Expanding tabs or switching to CRLF makes the text longer,
                    so this has to be able to count upwards as well. */}
                <Pill tone={charsSaved > 0 ? 'ok' : 'neutral'}>
                  {charsSaved > 0
                    ? `−${charsSaved.toLocaleString()} chars`
                    : charsSaved < 0
                      ? `+${Math.abs(charsSaved).toLocaleString()} chars`
                      : 'Same length'}
                </Pill>
                {linesSaved !== 0 ? (
                  <Pill tone={linesSaved > 0 ? 'ok' : 'neutral'}>
                    {linesSaved > 0
                      ? `−${linesSaved.toLocaleString()} lines`
                      : `+${Math.abs(linesSaved).toLocaleString()} lines`}
                  </Pill>
                ) : null}
                {result?.notes.length === 0 ? (
                  <span className="text-[12px] text-faint">
                    Nothing matched the operations you have switched on.
                  </span>
                ) : null}
              </div>

              {result && result.notes.length > 0 ? (
                <ul className="space-y-0.5">
                  {result.notes.map((note) => (
                    <li key={note.id} className="flex items-start gap-1.5 text-[12px] text-muted">
                      <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
                      {note.text}
                    </li>
                  ))}
                </ul>
              ) : null}

              <TextField label="Output" value={output} readOnly rows={9} />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
