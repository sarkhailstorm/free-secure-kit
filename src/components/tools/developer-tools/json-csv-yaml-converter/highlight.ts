/**
 * Syntax highlighting for the output panel.
 *
 * highlight.js is big, so the core and the three grammars we need are pulled
 * in lazily the first time something is highlighted, and cached afterwards.
 * Nothing here reaches the network — the grammars ship with the page bundle.
 */

import type { DataFormat } from '@/lib/json-csv-yaml-converter/types';

/** Above this many characters we show plain text instead, to stay responsive. */
export const HIGHLIGHT_LIMIT = 200_000;

async function loadCore() {
  return (await import('highlight.js/lib/core')).default;
}

type Hljs = Awaited<ReturnType<typeof loadCore>>;

let cached: Promise<Hljs> | null = null;

function getHighlighter(): Promise<Hljs> {
  if (!cached) {
    cached = (async () => {
      const [core, json, yaml, plaintext] = await Promise.all([
        loadCore(),
        import('highlight.js/lib/languages/json'),
        import('highlight.js/lib/languages/yaml'),
        import('highlight.js/lib/languages/plaintext'),
      ]);
      core.registerLanguage('json', json.default);
      core.registerLanguage('yaml', yaml.default);
      core.registerLanguage('plaintext', plaintext.default);
      return core;
    })().catch((error: unknown) => {
      // A chunk that failed to load once (a flaky first paint, say) must not
      // leave a rejected promise cached and highlighting dead for the session.
      cached = null;
      throw error;
    });
  }
  return cached;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape anything we assemble into HTML ourselves. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * CSV has no highlight.js grammar, and inventing one would be worse than
 * useless. Tint the header row so the columns are easy to read against, and
 * leave every data row alone.
 */
function highlightCsv(text: string): string {
  const breakAt = text.indexOf('\n');
  if (breakAt < 0) return `<span class="hljs-attr">${escapeHtml(text)}</span>`;
  return (
    `<span class="hljs-attr">${escapeHtml(text.slice(0, breakAt))}</span>` +
    escapeHtml(text.slice(breakAt))
  );
}

/**
 * Returns HTML safe to drop into the DOM: highlight.js escapes the source it
 * is given, and the CSV path escapes it here.
 */
export async function highlightToHtml(text: string, format: DataFormat): Promise<string> {
  if (format === 'csv') return highlightCsv(text);

  const hljs = await getHighlighter();
  try {
    return hljs.highlight(text, { language: format, ignoreIllegals: true }).value;
  } catch {
    // A grammar can still choke on pathological input; plain text always works.
    return hljs.highlight(text, { language: 'plaintext', ignoreIllegals: true }).value;
  }
}

/**
 * A small highlight.js theme built from the site's own CSS variables, so the
 * output panel follows light and dark mode like everything else. Importing one
 * of highlight.js's own stylesheets would hard-code a single palette.
 */
export const HIGHLIGHT_THEME_CSS = `
.securekit-hl .hljs-attr,.securekit-hl .hljs-attribute{color:rgb(var(--accent))}
.securekit-hl .hljs-string,.securekit-hl .hljs-quote{color:rgb(var(--ok))}
.securekit-hl .hljs-number,.securekit-hl .hljs-literal,.securekit-hl .hljs-keyword{color:rgb(var(--warn))}
.securekit-hl .hljs-bullet,.securekit-hl .hljs-meta,.securekit-hl .hljs-type,.securekit-hl .hljs-tag{color:rgb(var(--muted))}
.securekit-hl .hljs-comment{color:rgb(var(--faint));font-style:italic}
.securekit-hl .hljs-punctuation{color:rgb(var(--faint))}
`.trim();
