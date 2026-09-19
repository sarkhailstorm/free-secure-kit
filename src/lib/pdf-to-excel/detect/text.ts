import { LINE_TOL, NO_SPACE_MAX } from '@/lib/pdf-to-word/constants';
import { classifyGap } from '@/lib/pdf-to-word/layout/lines';
import type { Pt, Span } from '@/lib/pdf-to-word/types';

const isInk = (span: Span): boolean =>
  !span.synthetic && !span.artifact && span.text.trim().length > 0;

function joinOne(spans: readonly Span[], bodySize: Pt): string {
  let text = '';
  for (let i = 0; i < spans.length; i++) {
    if (i > 0) {
      const previous = spans[i - 1];
      const sized = Math.max(previous.size, spans[i].size) > 0;
      const gap = sized
        ? classifyGap(previous, spans[i], false) === 'none'
        : spans[i].x - (previous.x + previous.w) < NO_SPACE_MAX * bodySize;
      text += gap ? '' : ' ';
    }
    text += spans[i].text;
  }
  return text;
}

/** One cell's text, grouped into visual lines first so a wrapped line does not fuse onto the one above. */
export function cellText(spans: readonly Span[], bodySize: Pt): string {
  const ink = [...spans].filter(isInk);
  if (ink.length === 0) return '';

  const tol = LINE_TOL(bodySize);
  const rows: Span[][] = [];
  for (const span of [...ink].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(span.y - last[0].y) <= tol) last.push(span);
    else rows.push([span]);
  }

  return rows
    .map((row) => joinOne([...row].sort((a, b) => a.x - b.x), bodySize))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
