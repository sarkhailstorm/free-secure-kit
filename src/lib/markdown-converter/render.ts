import type { Config as PurifyConfig } from 'dompurify';
import type { Marked, Tokens } from 'marked';

export interface RenderResult {
  /** Sanitised HTML, safe for `dangerouslySetInnerHTML`. Empty on failure. */
  html: string;
  /** Short, human explanation when rendering failed. */
  error: string | null;
}

interface Engine {
  marked: Marked;
  sanitize: (dirty: string) => string;
}

let enginePromise: Promise<Engine> | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SANITIZE_CONFIG: PurifyConfig = {
  FORBID_TAGS: [
    'style',
    'form',
    'base',
    'link',
    'meta',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'script',
    'noscript',
    'template',
    'portal',
  ],
  // `style` is forbidden beyond DOMPurify's defaults: inline styles can paint over the whole app.
  FORBID_ATTR: ['formaction', 'ping', 'srcdoc', 'style', 'background'],
  // Absent from DOMPurify's default allow-list, and `decorate` below adds them.
  ADD_ATTR: ['target', 'referrerpolicy'],
  ALLOW_DATA_ATTR: false,
};

async function loadEngine(): Promise<Engine> {
  const [markedMod, hljsMod, purifyMod] = await Promise.all([
    import('marked'),
    import('highlight.js/lib/common'),
    import('dompurify'),
  ]);

  const hljs = hljsMod.default;
  const purify = purifyMod.default;

  const instance = new markedMod.Marked({
    gfm: true,
    breaks: false,
    silent: false,
    renderer: {
      code({ text, lang }: Tokens.Code): string {
        // Info strings look like "ts", "ts title=x" or "" — take the first word.
        const info = (lang ?? '').trim().split(/\s+/)[0].toLowerCase();
        let body: string | null = null;
        if (info && hljs.getLanguage(info)) {
          try {
            body = hljs.highlight(text, { language: info, ignoreIllegals: true }).value;
          } catch {
            body = null;
          }
        }
        const language = body !== null ? ` language-${escapeHtml(info)}` : '';
        return `<pre><code class="hljs${language}">${body ?? escapeHtml(text)}</code></pre>\n`;
      },
    },
  });

  return {
    marked: instance,
    sanitize: (dirty: string) => purify.sanitize(dirty, SANITIZE_CONFIG),
  };
}

function getEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = loadEngine().catch((err: unknown) => {
      // Cleared so a failed chunk load can be retried.
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

// Runs on unsanitised HTML on purpose, so DOMPurify always gets the last word.
function decorate(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    const item = input.closest('li');
    if (!item) return;
    item.classList.add('task-list-item');
    item.parentElement?.classList.add('contains-task-list');
  });

  doc.querySelectorAll('a[href]').forEach((anchor) => {
    if (/^https?:/i.test(anchor.getAttribute('href') ?? '')) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });

  doc.querySelectorAll('img').forEach((img) => {
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  });

  return doc.body.innerHTML;
}

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = /line (\d+)/i.exec(raw)?.[1];
  if (line) return `That Markdown could not be rendered — line ${line}.`;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return trimmed
    ? `That Markdown could not be rendered — ${trimmed.slice(0, 140)}`
    : 'That Markdown could not be rendered.';
}

/** Render Markdown to sanitised HTML. Never throws. */
export async function renderMarkdown(source: string): Promise<RenderResult> {
  if (!source.trim()) return { html: '', error: null };
  try {
    const engine = await getEngine();
    const raw = engine.marked.parse(source, { async: false });
    return { html: engine.sanitize(decorate(raw)), error: null };
  } catch (err) {
    return { html: '', error: friendlyError(err) };
  }
}

export async function sanitizeForExport(html: string): Promise<string> {
  const engine = await getEngine();
  return engine.sanitize(html);
}
