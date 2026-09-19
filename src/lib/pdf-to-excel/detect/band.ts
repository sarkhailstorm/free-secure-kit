import type { Line, Pt } from '@/lib/pdf-to-word/types';
import { parseAmount } from '../cells';
import { BAND_HEADER_FILL, BAND_HEADER_LOOKUP, BAND_TAIL_GAP } from '../constants';
import type { PageRead } from '../extract/read';
import type { BandLine } from '../rows';
import { cellsOfLine, rightColumns, type ColumnProfile } from './columns';

const hasAmount = (cells: readonly string[]): boolean =>
  cells.some((cell) => cell !== '' && parseAmount(cell) !== null);

const filled = (cells: readonly string[]): number => cells.filter((cell) => cell !== '').length;

/** First to last line holding an amount in a right-aligned column, plus a header row and wrapped tails. */
export function tableBand(
  profile: ColumnProfile,
  pages: readonly PageRead[],
  keptOf: (page: PageRead) => Line[],
  bodySize: Pt,
): BandLine[] {
  const right = rightColumns(profile);
  const need = Math.ceil(BAND_HEADER_FILL * profile.cols.length);
  const out: BandLine[] = [];

  for (const page of pages) {
    const lines = keptOf(page);
    const cells = lines.map((line) => cellsOfLine(profile, line, bodySize));
    const money = cells.map((row) =>
      right.some((c) => (row[c] ?? '') !== '' && parseAmount(row[c]) !== null),
    );
    const first = money.indexOf(true);
    if (first < 0) continue;
    const last = money.lastIndexOf(true);

    let start = first;
    for (let i = first - 1; i >= 0 && i >= first - BAND_HEADER_LOOKUP; i--) {
      if (!hasAmount(cells[i]) && filled(cells[i]) >= need) {
        start = i;
        break;
      }
    }

    let end = last;
    while (end + 1 < lines.length) {
      const row = cells[end + 1];
      const anchored = (row[0] ?? '') !== '' || right.some((c) => (row[c] ?? '') !== '');
      const gap = lines[end + 1].y - lines[end].y;
      if (anchored || gap > BAND_TAIL_GAP * (lines[end].size || bodySize)) break;
      end += 1;
    }

    for (const line of lines.slice(start, end + 1)) out.push({ line, page: page.pageNumber });
  }

  return out;
}
