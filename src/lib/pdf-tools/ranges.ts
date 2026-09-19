/** Page numbers throughout this module are 1-based, the way they are shown to the user. */
export type RangeResult =
  | { ok: true; pages: number[] }
  | { ok: false; message: string };

/** Every dash character that means "to", including the CJK forms. */
const DASHES = /[‐-―−﹘﹣－]/g;
/** People paste semicolons and full-width commas as separators too. */
const SEPARATORS = /[;，、；]/g;

function quoted(token: string): string {
  return `“${token}”`;
}

/** Forgiving: reversed ("9-4") and open-ended ("5-", "-4") ranges are accepted. */
export function parsePageRanges(input: string, pageCount: number): RangeResult {
  const text = input.replace(DASHES, '-').replace(SEPARATORS, ',').trim();
  if (text === '') return { ok: true, pages: [] };

  if (pageCount <= 0) {
    return { ok: false, message: 'Load a PDF before choosing pages.' };
  }

  const tokens = text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');

  if (tokens.length === 0) return { ok: true, pages: [] };

  const pages = new Set<number>();

  for (const token of tokens) {
    const rangeMatch = /^(\d*)\s*-\s*(\d*)$/.exec(token);

    if (rangeMatch) {
      const [, rawStart, rawEnd] = rangeMatch;
      if (rawStart === '' && rawEnd === '') {
        return {
          ok: false,
          message: `${quoted(token)} is missing its page numbers — try something like 1-3.`,
        };
      }
      const start = rawStart === '' ? 1 : Number(rawStart);
      const end = rawEnd === '' ? pageCount : Number(rawEnd);
      const bad = outOfBounds(start, pageCount) ?? outOfBounds(end, pageCount);
      if (bad) return { ok: false, message: bad };

      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let p = lo; p <= hi; p++) pages.add(p);
      continue;
    }

    if (/^\d+$/.test(token)) {
      const page = Number(token);
      const bad = outOfBounds(page, pageCount);
      if (bad) return { ok: false, message: bad };
      pages.add(page);
      continue;
    }

    return {
      ok: false,
      message: `Couldn’t read ${quoted(token)} — use page numbers like 1-3, 7, 9-12.`,
    };
  }

  return { ok: true, pages: [...pages].sort((a, b) => a - b) };
}

function outOfBounds(page: number, pageCount: number): string | null {
  if (!Number.isFinite(page)) {
    return `That page number is too large to make sense of.`;
  }
  if (page < 1) {
    return `Pages are numbered from 1, so ${quoted(String(page))} isn’t a page.`;
  }
  if (page > pageCount) {
    return `This PDF has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}, so page ${page} doesn’t exist.`;
  }
  return null;
}

/** The inverse of {@link parsePageRanges}: [1,2,3,7] -> "1-3, 7". */
export function formatPageRanges(pages: Iterable<number>): string {
  const sorted = [...new Set(pages)]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/** Short label for one output document, e.g. "pages 4-9" or "page 3". */
export function describeGroup(pages: number[]): string {
  if (pages.length === 0) return 'no pages';
  if (pages.length === 1) return `page ${pages[0]}`;
  return `pages ${formatPageRanges(pages)}`;
}

/** Splits 1..pageCount at each break page; page 1 always starts the first group. */
export function groupsFromBreaks(pageCount: number, breaks: Iterable<number>): number[][] {
  if (pageCount <= 0) return [];
  const starts = new Set<number>([1]);
  for (const b of breaks) {
    if (Number.isInteger(b) && b >= 2 && b <= pageCount) starts.add(b);
  }
  const ordered = [...starts].sort((a, b) => a - b);

  return ordered.map((start, index) => {
    const end = index + 1 < ordered.length ? ordered[index + 1] - 1 : pageCount;
    const group: number[] = [];
    for (let p = start; p <= end; p++) group.push(p);
    return group;
  });
}

export function groupsPerPage(pageCount: number): number[][] {
  const groups: number[][] = [];
  for (let p = 1; p <= pageCount; p++) groups.push([p]);
  return groups;
}
