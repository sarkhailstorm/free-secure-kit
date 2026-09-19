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
      // Never leave a rejected promise cached, or highlighting stays dead.
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

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function highlightCsv(text: string): string {
  const breakAt = text.indexOf('\n');
  if (breakAt < 0) return `<span class="hljs-attr">${escapeHtml(text)}</span>`;
  return (
    `<span class="hljs-attr">${escapeHtml(text.slice(0, breakAt))}</span>` +
    escapeHtml(text.slice(breakAt))
  );
}

/** Returns HTML that is already escaped and safe to drop into the DOM. */
export async function highlightToHtml(text: string, format: DataFormat): Promise<string> {
  if (format === 'csv') return highlightCsv(text);

  const hljs = await getHighlighter();
  try {
    return hljs.highlight(text, { language: format, ignoreIllegals: true }).value;
  } catch {
    return hljs.highlight(text, { language: 'plaintext', ignoreIllegals: true }).value;
  }
}

export const HIGHLIGHT_THEME_CSS = `
.securekit-hl .hljs-attr,.securekit-hl .hljs-attribute{color:rgb(var(--accent))}
.securekit-hl .hljs-string,.securekit-hl .hljs-quote{color:rgb(var(--ok))}
.securekit-hl .hljs-number,.securekit-hl .hljs-literal,.securekit-hl .hljs-keyword{color:rgb(var(--warn))}
.securekit-hl .hljs-bullet,.securekit-hl .hljs-meta,.securekit-hl .hljs-type,.securekit-hl .hljs-tag{color:rgb(var(--muted))}
.securekit-hl .hljs-comment{color:rgb(var(--faint));font-style:italic}
.securekit-hl .hljs-punctuation{color:rgb(var(--faint))}
`.trim();
