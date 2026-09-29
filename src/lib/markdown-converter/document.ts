import { exportStylesheet, type ThemeId } from './themes';

export interface DocStats {
  words: number;
  characters: number;
  /** Whole minutes at 225 wpm; 0 for an empty document. */
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 225;

export function analyse(source: string): DocStats {
  const trimmed = source.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    words,
    characters: source.length,
    readingMinutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0,
  };
}

function plainText(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first H1 — ATX or setext — ignoring anything inside a fenced code block. */
export function documentTitle(source: string, fallback = 'Document'): string {
  const lines = source.split(/\r?\n/);
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const atx = /^\s{0,3}#\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) {
      const title = plainText(atx[1]);
      if (title) return title;
    }

    const next = lines[i + 1];
    if (next !== undefined && line.trim() && /^\s{0,3}={2,}\s*$/.test(next)) {
      const title = plainText(line);
      if (title) return title;
    }
  }

  return fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildStandaloneHtml({
  title,
  bodyHtml,
  themeId,
}: {
  title: string;
  /** Already-sanitised document HTML. */
  bodyHtml: string;
  themeId: ThemeId;
}): string {
  const root = 'md-doc';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="FreeSecureKit Markdown Converter">
<title>${escapeHtml(title)}</title>
<style>${exportStylesheet(themeId, `.${root}`)}</style>
</head>
<body>
<article class="${root}">
${bodyHtml}
</article>
</body>
</html>
`;
}
