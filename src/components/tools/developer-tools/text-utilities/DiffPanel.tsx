'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CircleCheck,
  Download,
  Ellipsis,
  GitCompare,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { downloadText } from '@/lib/download';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import {
  collapseUnchanged,
  computeDiff,
  diffSizeLimit,
  diffToText,
  summariseStats,
  unitForMode,
  type DiffMode,
  type DiffResult,
  type InlineSpan,
  type RenderRow,
} from '@/lib/text-utilities/diff';
import {
  CheckboxRow,
  CopyButton,
  EmptyState,
  ErrorNote,
  Pill,
  TextField,
  WarnNote,
  Working,
} from './shared';

const MODE_TABS: readonly TabItem<DiffMode>[] = [
  { id: 'lines', label: 'Lines' },
  { id: 'words', label: 'Words' },
  { id: 'chars', label: 'Characters' },
];

const CONTEXT_LINES = 3;

export function DiffPanel() {
  const toast = useToast();

  const [original, setOriginal] = useState('');
  const [changed, setChanged] = useState('');
  const [mode, setMode] = useState<DiffMode>('lines');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [collapse, setCollapse] = useState(true);
  const [force, setForce] = useState(false);

  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasInput = original.length > 0 || changed.length > 0;
  const overLimit = diffSizeLimit(original, changed, mode);
  const blocked = overLimit !== null && !force;

  const editOriginal = useCallback((value: string) => {
    setOriginal(value);
    setForce(false);
  }, []);
  const editChanged = useCallback((value: string) => {
    setChanged(value);
    setForce(false);
  }, []);
  const editMode = useCallback((next: DiffMode) => {
    setMode(next);
    setForce(false);
  }, []);

  useEffect(() => {
    if (!hasInput || blocked) {
      setResult(null);
      setError(null);
      setBusy(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      setBusy(true);
      setError(null);

      void (async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 0));
          const next = await computeDiff(original, changed, {
            mode,
            ignoreWhitespace,
            ignoreCase,
            allowOversize: force,
          });
          if (cancelled) return;
          setResult(next);
        } catch (err) {
          if (cancelled) return;
          setResult(null);
          setError(
            err instanceof Error ? err.message : 'Something went wrong comparing these two texts.',
          );
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [original, changed, mode, ignoreWhitespace, ignoreCase, hasInput, blocked, force]);

  const rows: RenderRow[] = useMemo(() => {
    if (!result || result.kind !== 'lines') return [];
    return collapse ? collapseUnchanged(result.rows, CONTEXT_LINES) : result.rows;
  }, [result, collapse]);

  const diffText = useMemo(() => (result ? diffToText(result) : ''), [result]);

  function swap() {
    setOriginal(changed);
    setChanged(original);
    setForce(false);
  }

  function clearAll() {
    setOriginal('');
    setChanged('');
    setForce(false);
    setResult(null);
    setError(null);
  }

  function download() {
    if (!diffText) return;
    downloadText(diffText, 'diff.txt', 'text/plain');
    toast.celebrate('Saved diff.txt to your downloads.');
  }

  const stats = result?.stats ?? null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Compare two texts"
          description="Nothing is sent anywhere — both sides are compared inside this tab."
          actions={
            <>
              <Button size="sm" onClick={swap} disabled={!hasInput}>
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                Swap sides
              </Button>
              <Button size="sm" variant="ghost" onClick={clearAll} disabled={!hasInput}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Clear
              </Button>
            </>
          }
        />

        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <TextField
            label="Original"
            value={original}
            onChange={editOriginal}
            rows={12}
            placeholder="Paste the original text here…"
          />
          <TextField
            label="Changed"
            value={changed}
            onChange={editChanged}
            rows={12}
            placeholder="…and the new version here."
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-[13px] font-medium text-ink">Compare by</span>
            <Tabs tabs={MODE_TABS} active={mode} onChange={editMode} label="Comparison level" />
          </div>

          <div className="flex flex-wrap items-center gap-x-5">
            <CheckboxRow
              label="Ignore leading/trailing whitespace"
              checked={ignoreWhitespace}
              onChange={setIgnoreWhitespace}
            />
            <CheckboxRow label="Ignore case" checked={ignoreCase} onChange={setIgnoreCase} />
            <CheckboxRow
              label="Hide unchanged lines"
              checked={collapse}
              onChange={setCollapse}
              disabled={mode !== 'lines'}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Differences"
          description={
            stats && !busy
              ? stats.identical
                ? 'No differences found.'
                : summariseStats(stats)
              : 'Type into both boxes to see what changed.'
          }
          actions={
            <>
              <CopyButton
                text={diffText}
                label="Copy diff"
                successMessage="Diff copied as text."
                disabled={!result || busy}
              />
              <Button size="sm" onClick={download} disabled={!diffText || busy}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </>
          }
        />

        <div className="p-5">
          {blocked && overLimit !== null ? (
            <WarnNote>
              <p>
                That is {(original.length + changed.length).toLocaleString()} characters across both
                sides. Above {overLimit.toLocaleString()} a{' '}
                {mode === 'chars' ? 'character' : mode === 'words' ? 'word' : 'line'}-level
                comparison can lock up the tab, so it has been held back.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setForce(true)}>
                  Compare anyway
                </Button>
                {mode !== 'lines' ? (
                  <Button size="sm" variant="ghost" onClick={() => editMode('lines')}>
                    Switch to line mode
                  </Button>
                ) : null}
              </div>
            </WarnNote>
          ) : error ? (
            <ErrorNote>{error}</ErrorNote>
          ) : !hasInput ? (
            <EmptyState
              icon={<GitCompare className="h-4 w-4" aria-hidden />}
              title="Nothing to compare yet"
              body="Paste the before and after versions above. Added lines are marked with +, removed lines with −, and the exact words that changed are highlighted."
            />
          ) : busy || !result ? (
            <Working label="Comparing…" />
          ) : result.stats.identical ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok/10 px-3.5 py-3">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">
                {describeIdentical(result.stats.exact, ignoreWhitespace, ignoreCase)}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Legend stats={result.stats} mode={mode} />

              {result.kind === 'lines' && result.inlineSkipped ? (
                <p className="text-[12px] text-faint">
                  Word-level highlighting was skipped on some lines to keep this responsive.
                </p>
              ) : null}

              <div className="scroll-thin max-h-[34rem] overflow-auto rounded-xl border border-line bg-bg">
                {result.kind === 'lines' ? (
                  <div className="min-w-[26rem] font-mono text-[12px] leading-[1.65]">
                    {rows.map((row, index) =>
                      row.kind === 'gap' ? (
                        <div
                          key={`gap-${index}`}
                          className="flex items-center gap-2 border-y border-line bg-elevated px-3 py-1 text-[11px] text-faint"
                        >
                          <Ellipsis className="h-3.5 w-3.5" aria-hidden />
                          {plural(row.count, 'unchanged line')} hidden
                        </div>
                      ) : (
                        <div
                          key={`row-${index}`}
                          className={cn(
                            'flex items-start',
                            row.kind === 'add' && 'bg-ok/10',
                            row.kind === 'del' && 'bg-danger/10',
                          )}
                        >
                          <span className="w-11 shrink-0 select-none border-r border-line px-2 py-0.5 text-right tabular-nums text-faint">
                            {row.oldNumber ?? ''}
                          </span>
                          <span className="w-11 shrink-0 select-none border-r border-line px-2 py-0.5 text-right tabular-nums text-faint">
                            {row.newNumber ?? ''}
                          </span>
                          <span
                            className={cn(
                              'w-6 shrink-0 select-none py-0.5 text-center font-semibold',
                              row.kind === 'add' && 'text-ok',
                              row.kind === 'del' && 'text-danger',
                              row.kind === 'same' && 'text-faint',
                            )}
                          >
                            <span className="sr-only">
                              {row.kind === 'add'
                                ? 'Added line: '
                                : row.kind === 'del'
                                  ? 'Removed line: '
                                  : 'Unchanged line: '}
                            </span>
                            <span aria-hidden>
                              {row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 pr-3 text-ink">
                            {row.spans ? <Spans spans={row.spans} /> : row.text}
                            {row.text.length === 0 ? ' ' : null}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words p-3.5 font-mono text-[12px] leading-relaxed text-ink">
                    <Spans spans={result.spans} />
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function describeIdentical(exact: boolean, whitespace: boolean, caseToo: boolean): string {
  if (exact) return 'These two texts are identical — every character matches.';
  if (whitespace && caseToo) {
    return 'These two texts are identical once capitalisation and leading/trailing whitespace are ignored.';
  }
  if (whitespace) {
    return 'These two texts are identical once leading and trailing whitespace is ignored.';
  }
  if (caseToo) return 'These two texts are identical once capitalisation is ignored.';
  return 'No differences were found, but the two are not byte-for-byte identical — the line endings or some spacing differ.';
}

function Spans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.kind === 'add') {
          return (
            <ins
              key={index}
              className="rounded-[3px] bg-ok/25 px-[1px] underline decoration-ok decoration-2 underline-offset-2"
            >
              {span.text}
            </ins>
          );
        }
        if (span.kind === 'del') {
          return (
            <del
              key={index}
              className="rounded-[3px] bg-danger/25 px-[1px] line-through decoration-danger decoration-2"
            >
              {span.text}
            </del>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

function Legend({
  stats,
  mode,
}: {
  stats: { added: number; removed: number; modified: number };
  mode: DiffMode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Pill tone="ok">+{stats.added.toLocaleString()} added</Pill>
      <Pill tone="danger">&minus;{stats.removed.toLocaleString()} removed</Pill>
      {mode === 'lines' ? (
        <Pill tone="accent">{stats.modified.toLocaleString()} modified</Pill>
      ) : null}
      <span className="text-[11px] leading-snug text-faint">
        Counted in {unitForMode(mode, 2)}. Underlined text was added, struck-through text was
        removed.
      </span>
    </div>
  );
}
