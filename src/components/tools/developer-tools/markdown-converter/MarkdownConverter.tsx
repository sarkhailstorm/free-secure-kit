import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Clock,
  Eye,
  FileDown,
  Hash,
  LoaderCircle,
  Palette,
  Printer,
  SquarePen,
  Trash2,
  TriangleAlert,
  Type,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { useToast } from '@/components/ToastProvider';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { copyToClipboard, downloadText, safeFilename } from '@/lib/download';
import { renderMarkdown, sanitizeForExport } from '@/lib/markdown-converter/render';
import { analyse, buildStandaloneHtml, documentTitle } from '@/lib/markdown-converter/document';
import { SAMPLE_DOCUMENT } from '@/lib/markdown-converter/sample';
import {
  getDocTheme,
  isThemeId,
  previewStylesheet,
  themes,
  type ThemeId,
} from '@/lib/markdown-converter/themes';
import { EditorPane } from './EditorPane';
import { PreviewPane } from './PreviewPane';
import { PrintSurface } from './PrintSurface';

const DOC_KEY = 'securekit:markdown-converter:doc';
const THEME_KEY = 'securekit:markdown-converter:theme';

const RENDER_DEBOUNCE_MS = 150;
const LARGE_DOC_CHARS = 120_000;
const LARGE_DOC_DEBOUNCE_MS = 600;
const SAVE_DEBOUNCE_MS = 500;

const MIN_SPLIT = 25;
const MAX_SPLIT = 75;

type Pane = 'write' | 'preview';
type Busy = 'html' | 'copy' | 'print' | null;
type SaveState = 'idle' | 'saving' | 'saved' | 'blocked' | 'full';

const PANE_TABS: readonly TabItem<Pane>[] = [
  { id: 'write', label: 'Write', icon: <SquarePen className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'preview', label: 'Preview', icon: <Eye className="h-3.5 w-3.5" aria-hidden /> },
];

const PANE_HEIGHT = 'h-[58vh] min-h-[340px] lg:h-[66vh]';

function clampSplit(value: number): number {
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));
}

function messageOf(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  return raw.trim() ? raw : fallback;
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return true;
  }
  return err instanceof DOMException && err.code === 22;
}

export function MarkdownConverter({ active = true }: { active?: boolean }) {
  const toast = useToast();
  const themeSelectId = useId();

  const [source, setSource] = useState(SAMPLE_DOCUMENT);
  const [themeId, setThemeId] = useState<ThemeId>('minimal');
  const [pane, setPane] = useState<Pane>('write');
  const [split, setSplit] = useState(50);

  const [html, setHtml] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);

  const [busy, setBusy] = useState<Busy>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [restored, setRestored] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stats = useMemo(() => analyse(source), [source]);
  const theme = getDocTheme(themeId);
  const themeCss = useMemo(() => previewStylesheet(themeId), [themeId]);
  const hasSource = source.trim().length > 0;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DOC_KEY);
      if (saved !== null) setSource(saved);
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (isThemeId(savedTheme)) setThemeId(savedTheme);
    } catch {
      setSaveState('blocked');
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    setSaveState((state) => (state === 'blocked' ? state : 'saving'));
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DOC_KEY, source);
        setSaveState('saved');
      } catch (err) {
        setSaveState(isQuotaError(err) ? 'full' : 'blocked');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, restored]);

  useEffect(() => {
    if (!source.trim()) {
      setHtml('');
      setRenderError(null);
      return;
    }
    let cancelled = false;
    const delay = source.length > LARGE_DOC_CHARS ? LARGE_DOC_DEBOUNCE_MS : RENDER_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      void renderMarkdown(source)
        .then((result) => {
          if (cancelled) return;
          setRenderError(result.error);
          if (!result.error) setHtml(result.html);
        })
        .catch(() => {
          if (!cancelled) setRenderError('The Markdown renderer could not be loaded.');
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source]);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const changeTheme = useCallback((value: string) => {
    if (!isThemeId(value)) return;
    setThemeId(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      // Not being able to remember the choice is not worth interrupting for.
    }
  }, []);

  const loadSample = useCallback(() => {
    setSource(SAMPLE_DOCUMENT);
    setPane('write');
  }, []);

  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimer.current = setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setConfirmClear(false);
    setSource('');
    try {
      localStorage.removeItem(DOC_KEY);
    } catch {
      /* nothing to remove */
    }
    setPane('write');
    textareaRef.current?.focus();
    toast.info('Editor cleared.');
  }, [confirmClear, toast]);

  const freshHtml = useCallback(async (): Promise<string> => {
    const result = await renderMarkdown(source);
    if (result.error) throw new Error(result.error);
    return result.html;
  }, [source]);

  const handleDownloadHtml = useCallback(async () => {
    if (busy || !hasSource) return;
    setBusy('html');
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const rendered = await freshHtml();
      const safe = await sanitizeForExport(rendered);
      const title = documentTitle(source);
      const file = buildStandaloneHtml({ title, bodyHtml: safe, themeId });
      // Trim the stem first: safeFilename caps at 180 chars and would eat the ".html".
      const stem = safeFilename(title, 'document').slice(0, 120).trim().replace(/\.+$/, '');
      downloadText(file, `${stem || 'document'}.html`, 'text/html');
      toast.celebrate('Downloaded a self-contained HTML file.');
    } catch (err) {
      toast.error(messageOf(err, 'That document could not be exported.'));
    } finally {
      setBusy(null);
    }
  }, [busy, hasSource, freshHtml, source, themeId, toast]);

  const handleCopyHtml = useCallback(async () => {
    if (busy || !hasSource) return;
    setBusy('copy');
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const rendered = await freshHtml();
      const safe = await sanitizeForExport(rendered);
      const ok = await copyToClipboard(safe);
      if (!ok) throw new Error('Your browser blocked access to the clipboard.');
      toast.celebrate('Rendered HTML copied to the clipboard.');
    } catch (err) {
      toast.error(messageOf(err, 'That HTML could not be copied.'));
    } finally {
      setBusy(null);
    }
  }, [busy, hasSource, freshHtml, toast]);

  const handlePrint = useCallback(async () => {
    if (busy || !hasSource) return;
    setBusy('print');
    try {
      const rendered = await freshHtml();
      setHtml(rendered);
      setRenderError(null);
      // A frame for React to commit the print surface before the dialog freezes the page.
      await new Promise((resolve) => setTimeout(resolve, 60));
      window.print();
      toast.celebrate('Print dialog open — choose “Save as PDF” as the destination.');
    } catch (err) {
      toast.error(messageOf(err, 'The print dialog could not be opened.'));
    } finally {
      setBusy(null);
    }
  }, [busy, hasSource, freshHtml, toast]);

  const moveSplit = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplit(clampSplit(((clientX - rect.left) / rect.width) * 100));
  }, []);

  const onSeparatorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setSplit((s) => clampSplit(s - step));
    else if (e.key === 'ArrowRight') setSplit((s) => clampSplit(s + step));
    else if (e.key === 'Home') setSplit(MIN_SPLIT);
    else if (e.key === 'End') setSplit(MAX_SPLIT);
    else if (e.key === 'Enter' || e.key === ' ') setSplit(50);
    else return;
    e.preventDefault();
  }, []);

  const splitStyle = { '--md-split': `${split}%` } as React.CSSProperties;
  const working = busy !== null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />

      <div className="space-y-4">
        <Card className="no-print overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 lg:hidden">
            <Tabs tabs={PANE_TABS} active={pane} onChange={setPane} label="Editor and preview" />
          </div>

          <div ref={containerRef} style={splitStyle} className="flex flex-col lg:flex-row">
            <EditorPane
              ref={textareaRef}
              value={source}
              onChange={setSource}
              className={cn(
                PANE_HEIGHT,
                'w-full lg:w-[var(--md-split)] lg:shrink-0',
                pane === 'preview' && 'hidden lg:flex',
              )}
            />

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the editor and preview panes"
              aria-valuenow={Math.round(split)}
              aria-valuemin={MIN_SPLIT}
              aria-valuemax={MAX_SPLIT}
              tabIndex={0}
              onKeyDown={onSeparatorKeyDown}
              onDoubleClick={() => setSplit(50)}
              onPointerDown={(e) => {
                e.preventDefault();
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!dragging.current) return;
                // Pointer capture can be lost without a pointerup, leaving the flag set.
                if (e.buttons === 0) {
                  dragging.current = false;
                  return;
                }
                moveSplit(e.clientX);
              }}
              onPointerUp={(e) => {
                dragging.current = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
              onLostPointerCapture={() => {
                dragging.current = false;
              }}
              className="group hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center border-x border-line bg-bg transition-colors hover:bg-accent-soft lg:flex"
            >
              <span
                className="h-7 w-[3px] rounded-full bg-line transition-colors group-hover:bg-accent/60"
                aria-hidden
              />
            </div>

            <PreviewPane
              html={html}
              loading={!html && !renderError}
              error={renderError}
              themeName={theme.name}
              hasSource={hasSource}
              onLoadSample={loadSample}
              className={cn(
                PANE_HEIGHT,
                'w-full lg:w-auto lg:flex-1',
                pane === 'write' && 'hidden lg:flex',
              )}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[12px] text-faint">
            <span className="inline-flex items-center gap-1.5">
              <Type className="h-3 w-3 shrink-0" aria-hidden />
              {plural(stats.words, 'word')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Hash className="h-3 w-3 shrink-0" aria-hidden />
              {plural(stats.characters, 'character')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              {stats.readingMinutes > 0 ? `${stats.readingMinutes} min read` : 'No reading time yet'}
            </span>

            <span className="ml-auto inline-flex items-center gap-1.5">
              {saveState === 'blocked' ? (
                <>
                  <TriangleAlert className="h-3 w-3 shrink-0 text-warn" aria-hidden />
                  <span className="text-warn">Not saved — this browser blocks local storage</span>
                </>
              ) : saveState === 'full' ? (
                <>
                  <TriangleAlert className="h-3 w-3 shrink-0 text-warn" aria-hidden />
                  <span className="text-warn">
                    Not saved — too large for this browser’s storage. Export it instead.
                  </span>
                </>
              ) : saveState === 'saving' ? (
                <>
                  <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                  Saving draft…
                </>
              ) : saveState === 'saved' ? (
                <>
                  <Check className="h-3 w-3 shrink-0 text-ok" aria-hidden />
                  Draft saved in this browser
                </>
              ) : null}
            </span>
          </div>
        </Card>

        <Card className="no-print">
          <CardHeader
            title="Theme & export"
            description="The theme applies to the live preview and to every export. PDFs go through your browser’s own print dialog — pick “Save as PDF” as the destination for real, selectable text."
            actions={
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-faint" aria-hidden />
                <label htmlFor={themeSelectId} className="text-[13px] font-medium text-muted">
                  Theme
                </label>
                <select
                  id={themeSelectId}
                  value={themeId}
                  onChange={(e) => changeTheme(e.target.value)}
                  className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-elevated"
                >
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            }
          />

          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            <Button
              variant="primary"
              onClick={handleDownloadHtml}
              disabled={working || !hasSource}
              title="One self-contained .html file, styles included"
            >
              {busy === 'html' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden />
              )}
              Download .html
            </Button>

            <Button
              onClick={handlePrint}
              disabled={working || !hasSource}
              title="Opens your browser's print dialog"
            >
              {busy === 'print' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Printer className="h-4 w-4" aria-hidden />
              )}
              Print / PDF
            </Button>

            <Button
              onClick={handleCopyHtml}
              disabled={working || !hasSource}
              title="Copy the rendered HTML to the clipboard"
            >
              {busy === 'copy' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ClipboardCopy className="h-4 w-4" aria-hidden />
              )}
              Copy HTML
            </Button>

            <Button
              variant={confirmClear ? 'danger' : 'ghost'}
              onClick={handleClear}
              // Not `hasSource`: a whitespace-only draft still has to be clearable.
              disabled={working || source.length === 0}
              className="ml-auto"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {confirmClear ? 'Confirm clear' : 'Clear'}
            </Button>
          </div>

          <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-faint">
            {theme.blurb} Exports are always light — printed and shared documents usually are.
          </p>
        </Card>

        {active ? <PrintSurface html={html} themeId={themeId} /> : null}
      </div>
    </>
  );
}
