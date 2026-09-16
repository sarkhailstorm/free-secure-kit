import type { Pt } from '@/lib/pdf-to-word/types';
import {
  FURNITURE_MIN_HITS,
  FURNITURE_MIN_PAGES,
  FURNITURE_SHARE,
  FURNITURE_Y_SD,
} from '../constants';
import type { PageRead } from '../extract/read';

/** Digits normalised so "Page 2 of 3" and "Page 3 of 3" are the same line. */
export const lineShape = (text: string): string =>
  text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

function deviation(values: readonly Pt[]): Pt {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

/**
 * Lines repeated at the same height on most pages: the running head and foot.
 *
 * Both guards are load-bearing. Without the page-count floor a 2-page statement kept 2 of its 41
 * lines, and without the height test "TESCO STORES" on every page of a real statement is deleted.
 */
export function pageFurniture(pages: readonly PageRead[]): ReadonlySet<string> {
  if (pages.length < FURNITURE_MIN_PAGES) return new Set<string>();

  const seen = new Map<string, { pages: number; ys: Pt[] }>();
  for (const page of pages) {
    const firstY = new Map<string, Pt>();
    for (const line of page.lines) {
      const shape = lineShape(line.text);
      if (!firstY.has(shape)) firstY.set(shape, line.y);
    }
    for (const [shape, y] of firstY) {
      const record = seen.get(shape) ?? { pages: 0, ys: [] };
      record.pages += 1;
      record.ys.push(y);
      seen.set(shape, record);
    }
  }

  const furniture = new Set<string>();
  for (const [shape, record] of seen) {
    if (shape === '') continue;
    if (record.pages < FURNITURE_MIN_HITS || record.pages < FURNITURE_SHARE * pages.length) continue;
    if (deviation(record.ys) <= FURNITURE_Y_SD) furniture.add(shape);
  }
  return furniture;
}
