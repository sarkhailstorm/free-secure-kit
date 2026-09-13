'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Combine,
  FilePlus,
  GripVertical,
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
import { downloadName, mergePdfs, readPdf, tick, type LoadedPdf } from '@/lib/pdf-tools/pdf';
import { ErrorNote, Note, Progress, SizeChange, Stat } from './shared';

interface MergeResult {
  name: string;
  size: number;
  pageCount: number;
  inputSize: number;
}

export function MergePanel() {
  const toast = useToast();
  const [items, setItems] = useState<LoadedPdf[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<MergeResult | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const totals = useMemo(
    () => ({
      pages: items.reduce((sum, item) => sum + item.pageCount, 0),
      size: items.reduce((sum, item) => sum + item.size, 0),
    }),
    [items],
  );

  const addFiles = useCallback(async (files: File[]) => {
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
      if (loaded.length > 0) setItems((previous) => [...previous, ...loaded]);
      setProblems(found);
    } finally {
      setReading(false);
    }
  }, []);

  const move = useCallback((from: number, to: number) => {
    setResult(null);
    setItems((previous) => {
      if (from === to || to < 0 || to >= previous.length) return previous;
      const next = previous.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setResult(null);
    setItems((previous) => previous.filter((item) => item.id !== id));
  }, []);

  function endDrag() {
    setDragId(null);
    setOverId(null);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return endDrag();
    const from = items.findIndex((item) => item.id === dragId);
    const to = items.findIndex((item) => item.id === targetId);
    if (from >= 0 && to >= 0) move(from, to);
    endDrag();
  }

  async function runMerge() {
    if (items.length < 2 || busy) return;
    setBusy(true);
    setProblems([]);
    setResult(null);
    setProgress({ done: 0, total: items.length });

    try {
      await tick();
      const bytes = await mergePdfs(items, (done, total) => setProgress({ done, total }));
      const name = downloadName(
        `${baseName(items[0].name)} + ${items.length - 1} more`,
        'pdf',
        'merged.pdf',
      );
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      setResult({
        name,
        size: bytes.byteLength,
        pageCount: totals.pages,
        inputSize: totals.size,
      });
      toast.celebrate(`Merged ${plural(items.length, 'PDF')} into ${name}`);
    } catch (err) {
      const message = describePdfError(err);
      setProblems([message]);
      toast.error('The merge failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Files to merge"
          description="Pages are joined in the order shown below. Add as many PDFs as you like."
          actions={
            items.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setItems([]);
                  setProblems([]);
                  setResult(null);
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
          Nothing queued yet. Once you add two or more PDFs you can drag them into order, or use
          the arrow buttons, and merge them into a single document.
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

              return (
                <li
                  key={item.id}
                  draggable={!busy}
                  onDragStart={(e) => {
                    // Let the arrow / remove buttons stay clickable. The test is
                    // against Element, not HTMLElement, because a drag that
                    // starts on a lucide icon targets an <svg>.
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
                      {plural(item.pageCount, 'page')} &middot; {formatBytes(item.size)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0"
                      aria-label={`Move ${item.name} up`}
                      disabled={index === 0 || busy}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0"
                      aria-label={`Move ${item.name} down`}
                      disabled={index === items.length - 1 || busy}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0 hover:text-danger"
                      aria-label={`Remove ${item.name}`}
                      disabled={busy}
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Files" value={items.length} />
              <Stat label="Combined pages" value={totals.pages} />
              <Stat label="Combined size" value={formatBytes(totals.size)} />
            </dl>

            {busy ? (
              <Progress
                label={`Merging file ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
                done={progress.done}
                total={progress.total}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => void runMerge()} disabled={items.length < 2 || busy}>
                <Combine className="h-4 w-4" aria-hidden />
                {busy ? 'Merging…' : `Merge ${plural(items.length, 'PDF')}`}
              </Button>
              {items.length < 2 ? (
                <p className="text-[13px] text-faint">Add at least one more PDF to merge.</p>
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
                  {plural(result.pageCount, 'page')} in one document.
                </p>
              </div>
            </div>
            <SizeChange before={result.inputSize} after={result.size} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
