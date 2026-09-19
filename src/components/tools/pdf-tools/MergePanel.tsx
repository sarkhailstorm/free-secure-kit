import { useCallback, useId, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Combine,
  FilePlus,
  GripVertical,
  RotateCcw,
  Trash2,
  CircleCheckBig,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { useToast } from '@/components/ToastProvider';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import { baseName, formatBytes, plural } from '@/lib/format';
import { describePdfError, looksLikePdf } from '@/lib/pdf-tools/errors';
import {
  allPages,
  downloadName,
  mergePdfPages,
  planKey,
  readPdf,
  tick,
  type LoadedPdf,
  type PageRef,
} from '@/lib/pdf-tools/pdf';
import { PageStrip } from './PageStrip';
import { ErrorNote, Note, Progress, SizeChange, Stat } from './shared';
import { useMergeThumbnails } from './useMergeThumbnails';

interface MergeResult {
  name: string;
  size: number;
  pageCount: number;
  inputPages: number;
  inputSize: number;
  fileCount: number;
}

interface Queue {
  items: LoadedPdf[];
  plan: PageRef[] | null;
}

function samePlan(a: readonly PageRef[], b: readonly PageRef[]): boolean {
  return a.length === b.length && a.every((ref, i) => ref.fileId === b[i].fileId && ref.page === b[i].page);
}

function regroup(plan: readonly PageRef[], items: readonly LoadedPdf[]): PageRef[] {
  return items.flatMap((file) => plan.filter((ref) => ref.fileId === file.id));
}

/** Put pages back where they belong relative to the ones still in the plan. */
function restorePages(
  plan: readonly PageRef[],
  canonical: readonly PageRef[],
  restoring: readonly PageRef[],
): PageRef[] {
  const rank = new Map(canonical.map((ref, i) => [planKey(ref), i]));
  const at = (ref: PageRef) => rank.get(planKey(ref)) ?? Number.MAX_SAFE_INTEGER;
  const waiting = [...restoring].sort((a, b) => at(a) - at(b));
  const out: PageRef[] = [];
  let next = 0;

  for (const ref of plan) {
    while (next < waiting.length && at(waiting[next]) < at(ref)) out.push(waiting[next++]);
    out.push(ref);
  }
  while (next < waiting.length) out.push(waiting[next++]);
  return out;
}

export function MergePanel({ active }: { active: boolean }) {
  const toast = useToast();
  const pagesId = useId();

  const [{ items, plan }, setQueue] = useState<Queue>({ items: [], plan: null });
  const [pagesOpen, setPagesOpen] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<MergeResult | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const thumbs = useMergeThumbnails(items, active && pagesOpen);

  const totals = useMemo(
    () => ({
      pages: items.reduce((sum, item) => sum + item.pageCount, 0),
      size: items.reduce((sum, item) => sum + item.size, 0),
    }),
    [items],
  );

  const canonical = useMemo(() => allPages(items), [items]);
  const effectivePlan = plan ?? canonical;
  const isCustom = plan !== null;

  const removedPages = useMemo(() => {
    if (plan === null) return [];
    const kept = new Set(plan.map(planKey));
    return canonical.filter((ref) => !kept.has(planKey(ref)));
  }, [plan, canonical]);

  const contributing = useMemo(() => {
    const ids = new Set(effectivePlan.map((ref) => ref.fileId));
    return items.filter((file) => ids.has(file.id));
  }, [effectivePlan, items]);

  const mutate = useCallback((fn: (queue: Queue) => Queue) => {
    setResult(null);
    setQueue((previous) => {
      const next = fn(previous);
      if (next.plan !== null && samePlan(next.plan, allPages(next.items))) {
        return { items: next.items, plan: null };
      }
      return next;
    });
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter(looksLikePdf);
      const found: string[] = [];
      const skipped = files.length - pdfs.length;
      if (skipped > 0) {
        found.push(`${plural(skipped, 'file')} ignored — only PDFs can be merged.`);
      }

      setReading(true);
      setResult(null);
      try {
        await tick();
        const loaded: LoadedPdf[] = [];
        for (const file of pdfs) {
          try {
            loaded.push(await readPdf(file));
          } catch (err) {
            found.push(describePdfError(err, file.name));
          }
        }
        if (loaded.length > 0) {
          mutate((queue) => ({
            items: [...queue.items, ...loaded],
            plan: queue.plan === null ? null : [...queue.plan, ...allPages(loaded)],
          }));
        }
        setProblems(found);
      } finally {
        setReading(false);
      }
    },
    [mutate],
  );

  const moveFile = useCallback(
    (from: number, to: number) => {
      mutate((queue) => {
        if (from === to || to < 0 || to >= queue.items.length) return queue;
        const items = queue.items.slice();
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        return { items, plan: queue.plan === null ? null : regroup(queue.plan, items) };
      });
    },
    [mutate],
  );

  const removeFile = useCallback(
    (id: string) => {
      mutate((queue) => ({
        items: queue.items.filter((item) => item.id !== id),
        plan: queue.plan === null ? null : queue.plan.filter((ref) => ref.fileId !== id),
      }));
    },
    [mutate],
  );

  const movePage = useCallback(
    (from: number, to: number) => {
      mutate((queue) => {
        const base = queue.plan ?? allPages(queue.items);
        if (from === to || from < 0 || to < 0 || to >= base.length) return queue;
        const next = base.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { items: queue.items, plan: next };
      });
    },
    [mutate],
  );

  const removePage = useCallback(
    (index: number) => {
      mutate((queue) => ({
        items: queue.items,
        plan: (queue.plan ?? allPages(queue.items)).filter((_, i) => i !== index),
      }));
    },
    [mutate],
  );

  const restore = useCallback(
    (refs: readonly PageRef[]) => {
      mutate((queue) => {
        const all = allPages(queue.items);
        return { items: queue.items, plan: restorePages(queue.plan ?? all, all, refs) };
      });
    },
    [mutate],
  );

  function endDrag() {
    setDragId(null);
    setOverId(null);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return endDrag();
    const from = items.findIndex((item) => item.id === dragId);
    const to = items.findIndex((item) => item.id === targetId);
    if (from >= 0 && to >= 0) moveFile(from, to);
    endDrag();
  }

  const canMerge = effectivePlan.length > 0 && (items.length > 1 || isCustom);

  async function runMerge() {
    if (!canMerge || busy) return;
    setBusy(true);
    setProblems([]);
    setResult(null);
    setProgress({ done: 0, total: contributing.length });

    try {
      await tick();
      const bytes = await mergePdfPages(items, effectivePlan, (done, total) =>
        setProgress({ done, total }),
      );
      const first = contributing[0];
      const name = downloadName(
        contributing.length > 1
          ? `${baseName(first.name)} + ${contributing.length - 1} more`
          : baseName(first.name),
        'pdf',
        'merged.pdf',
      );
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      setResult({
        name,
        size: bytes.byteLength,
        pageCount: effectivePlan.length,
        inputPages: canonical.length,
        inputSize: totals.size,
        fileCount: contributing.length,
      });
      toast.celebrate(
        contributing.length > 1
          ? `Merged ${plural(contributing.length, 'PDF')} into ${name}`
          : `Saved ${name}`,
      );
    } catch (err) {
      setProblems([describePdfError(err)]);
      toast.error('The merge failed.');
    } finally {
      setBusy(false);
    }
  }

  const brokenPreviews = items.filter((file) => thumbs.broken[file.id]);

  const summary = isCustom
    ? `${plural(effectivePlan.length, 'page')} from ${plural(contributing.length, 'file')}` +
      (removedPages.length > 0 ? ` · ${removedPages.length} left out` : ' · custom order')
    : `All ${plural(totals.pages, 'page')}, in file order`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Files to merge"
          description={
            isCustom
              ? 'The page order below has been customised — open Page order to see or change it.'
              : 'Pages are joined in the order shown below. Add as many PDFs as you like.'
          }
          actions={
            items.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQueue({ items: [], plan: null });
                  setProblems([]);
                  setResult(null);
                  setPagesOpen(false);
                }}
                disabled={busy}
              >
                Clear all
              </Button>
            ) : null
          }
        />

        <div className="p-5">
          <Dropzone
            multiple
            accept=".pdf,application/pdf"
            compact={items.length > 0}
            disabled={busy || reading}
            icon={<FilePlus className="h-4 w-4" aria-hidden />}
            title={items.length > 0 ? 'Add more PDFs' : 'Drop your PDFs here'}
            hint={
              items.length > 0
                ? 'New files are appended to the end of the list'
                : 'Select several at once — nothing is uploaded'
            }
            onFiles={(files) => {
              void addFiles(files);
            }}
          />

          {reading ? (
            <Progress className="mt-4" label={'Reading your PDFs…'} done={0} total={0} />
          ) : null}

          {problems.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {problems.map((message, index) => (
                <ErrorNote key={`${index}-${message}`} message={message} />
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {items.length === 0 ? (
        <Note>
          No PDFs yet. Add a few and you can drag them into order, rearrange or drop individual
          pages, then save the lot as one document.
        </Note>
      ) : (
        <Card>
          <CardHeader
            title="Merge order"
            description={`${plural(items.length, 'file')} · ${plural(totals.pages, 'page')} in total`}
          />

          <ul className="flex flex-col divide-y divide-line">
            {items.map((item, index) => {
              const isDragging = dragId === item.id;
              const isOver = overId === item.id && dragId !== null && dragId !== item.id;
              const kept = isCustom
                ? effectivePlan.filter((ref) => ref.fileId === item.id).length
                : item.pageCount;

              return (
                <li
                  key={item.id}
                  draggable={!busy}
                  onDragStart={(e) => {
                    if (e.target instanceof Element && e.target.closest('button')) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item.id);
                    setDragId(item.id);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overId !== item.id) setOverId(item.id);
                  }}
                  onDragLeave={() => {
                    if (overId === item.id) setOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDrop(item.id);
                  }}
                  onDragEnd={endDrag}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 transition-colors sm:px-5',
                    isDragging && 'opacity-40',
                    isOver && 'bg-accent-soft',
                  )}
                >
                  <span
                    className="hidden h-9 w-5 shrink-0 cursor-grab items-center justify-center text-faint active:cursor-grabbing sm:flex"
                    aria-hidden
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>

                  <span className="w-6 shrink-0 text-center font-mono text-[13px] tabular-nums text-faint">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-[13px] text-muted">
                      {isCustom && kept !== item.pageCount ? (
                        <span className={cn(kept === 0 && 'text-warn')}>
                          {kept === 0
                            ? 'no pages in the output'
                            : `${kept} of ${plural(item.pageCount, 'page')}`}
                        </span>
                      ) : (
                        plural(item.pageCount, 'page')
                      )}
                      {' · '}
                      {formatBytes(item.size)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0"
                      aria-label={`Move ${item.name} up`}
                      disabled={index === 0 || busy}
                      onClick={() => moveFile(index, index - 1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0"
                      aria-label={`Move ${item.name} down`}
                      disabled={index === items.length - 1 || busy}
                      onClick={() => moveFile(index, index + 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0 hover:text-danger"
                      aria-label={`Remove ${item.name}`}
                      disabled={busy}
                      onClick={() => removeFile(item.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            aria-expanded={pagesOpen}
            aria-controls={pagesId}
            onClick={() => setPagesOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 border-t border-line px-3 py-3 text-left transition-colors hover:bg-elevated sm:px-5"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">Page order</span>
              <span className="mt-0.5 block truncate text-[13px] text-muted">{summary}</span>
            </span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-faint transition-transform', pagesOpen && 'rotate-180')}
              aria-hidden
            />
          </button>

          <div id={pagesId} hidden={!pagesOpen}>
            {pagesOpen ? (
              <>
                {brokenPreviews.length > 0 ? (
                  <div className="border-t border-line p-3 sm:p-4">
                    <Note>
                      Previews aren&rsquo;t available for{' '}
                      {brokenPreviews
                        .slice(0, 2)
                        .map((file) => `“${file.name}”`)
                        .join(' and ')}
                      {brokenPreviews.length > 2 ? ` and ${brokenPreviews.length - 2} more` : ''}, but
                      their pages can still be reordered and merged.
                    </Note>
                  </div>
                ) : null}

                <PageStrip
                  items={items}
                  plan={effectivePlan}
                  removed={removedPages}
                  thumbs={thumbs}
                  disabled={busy}
                  onMove={movePage}
                  onRemove={removePage}
                  onRestore={(ref) => restore([ref])}
                  onRestoreAll={() => restore(removedPages)}
                />

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3 py-3 sm:px-5">
                  <p className="mr-auto text-[12px] text-faint">
                    Moving a file up or down keeps its pages together.
                  </p>
                  {thumbs.outstanding > 0 ? (
                    <p className="text-xs text-faint" aria-live="polite">
                      Rendering previews… {thumbs.outstanding} to go
                    </p>
                  ) : null}
                  {isCustom ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => mutate((queue) => ({ items: queue.items, plan: null }))}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Reset to file order
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Files" value={isCustom ? contributing.length : items.length} />
              <Stat label="Pages out" value={effectivePlan.length} />
              <Stat label="Source size" value={formatBytes(totals.size)} />
              {removedPages.length > 0 ? (
                <Stat label="Left out" value={plural(removedPages.length, 'page')} />
              ) : null}
            </dl>

            {busy ? (
              <Progress
                label={`Merging file ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
                done={progress.done}
                total={progress.total}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => void runMerge()} disabled={!canMerge || busy}>
                <Combine className="h-4 w-4" aria-hidden />
                {busy
                  ? 'Merging…'
                  : effectivePlan.length === 0
                    ? 'Nothing to merge'
                    : contributing.length > 1
                      ? `Merge ${plural(contributing.length, 'PDF')}`
                      : `Save ${plural(effectivePlan.length, 'page')} as a PDF`}
              </Button>
              {effectivePlan.length === 0 ? (
                <p className="text-[13px] text-faint">
                  Every page has been left out — put at least one back.
                </p>
              ) : items.length < 2 && !isCustom ? (
                <p className="text-[13px] text-faint">Add at least one more PDF to merge.</p>
              ) : null}
              {effectivePlan.length > 400 ? (
                <p className="text-[13px] text-warn">
                  That is {effectivePlan.length} pages — the previews may take a moment.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      )}

      {result ? (
        <Card className="border-ok/30 bg-ok/5">
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-2.5">
              <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Downloaded {result.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {plural(result.pageCount, 'page')} in one document
                  {result.pageCount !== result.inputPages
                    ? `, ${result.inputPages - result.pageCount} left out`
                    : ''}
                  {' · '}
                  {formatBytes(result.size)}
                </p>
              </div>
            </div>

            {result.pageCount === result.inputPages ? (
              <SizeChange before={result.inputSize} after={result.size} />
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
