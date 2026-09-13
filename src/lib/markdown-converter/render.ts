/**
 * Markdown -> HTML pipeline.
 *
 * Three stages, in this order, every time:
 *
 *   1. `marked` turns the source into HTML (GitHub-flavoured: tables, task
 *      lists, strikethrough, autolinks, fenced code with info strings).
 *   2. Fenced code is highlighted with highlight.js's *common* bundle, and a
 *      DOM pass tags task-list items and marks external links.
 *   3. DOMPurify sanitises the result — always last, immediately before the
 *      HTML is handed to the page or written into an exported file.
 *
 * Stage 3 is the one that matters. Markdown is allowed to contain raw HTML, so
 * a pasted README can absolutely contain `<script>`, `onerror=`, a
 * `javascript:` href or a `<style>` block that would rewrite this page. None of
 * it survives sanitisation, and nothing here is ever rendered unsanitised.
 *
 * Every library below is imported dynamically: marked, highlight.js and
 * DOMPurify together are far too big to sit in the initial bundle. Nothing in
 * this file touches the network.
 */

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

/** Escape text for safe interpolation into an HTML string. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Deliberately strict: DOMPurify's defaults already drop scripts and event
 * handlers, and these forbidden tags close the remaining ways a document could
 * reach outside itself — a `<style>` block restyling the whole app, a `<form>`
 * or `<base>` pointing somewhere, an `<iframe>`/`<object>` loading a remote
 * origin. `<input>` stays allowed because GFM task lists are made of them.
 *
 * `style` is forbidden as an *attribute* too, which the defaults do allow.
 * Without that, a pasted README can ship
 * `<div style="position:fixed;inset:0;z-index:2147483647">` and paint over the
 * whole application — no script needed — and the same markup rides along into
 * every export. GitHub strips inline styles from rendered READMEs for exactly
 * this reason. `background` is the legacy image-loading attribute and has no
 * business in a document either.
 */
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
  FORBID_ATTR: ['formaction', 'ping', 'srcdoc', 'style', 'background'],
  // `target` and `referrerpolicy` are both absent from DOMPurify's default
  // attribute allow-list; `decorate` below adds them and they must survive.
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
        // Info strings look like "ts", "ts title=x" or "".  Take the first
        // word, and fall back to plain text whenever highlight.js does not
        // know the language rather than throwing.
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
      // Let a later attempt retry: a failed chunk load should not permanently
      // brick the editor.
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

/**
 * Small DOM pass over the *unsanitised* output. Kept before sanitisation on
 * purpose so DOMPurify always gets the last word. `DOMParser` builds an inert
 * document: nothing executes and no resource is fetched.
 */
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

  // An image the author pointed at a remote host is still fetched by the
  // browser — that is what an image in a document does. It does not have to
  // announce *which* page embedded it, though, so no Referer goes out.
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

/**
 * Second sanitising pass, used on the way into an exported file. The HTML is
 * already clean; running it again costs nothing and means the export path
 * cannot be made unsafe by a future change upstream of it.
 */
export async function sanitizeForExport(html: string): Promise<string> {
  const engine = await getEngine();
  return engine.sanitize(html);
}
