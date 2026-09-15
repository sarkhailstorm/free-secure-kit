import { LIGATURES, PUA_MAP } from './constants';
import type { FontInfo, Pt, Span } from './types';

type Repair = NonNullable<Span['repaired']>;

const PUA_MIN = 0xe000;
const PUA_MAX = 0xf8ff;
const BULLET = '•';
const ASCII_ALNUM_RE = /^[0-9A-Za-z]+$/;

export const MARKER_RE =
  /^(?:[•▪●◦⁃·–−o*\-]|\(?\d{1,3}[.)\]]|\(?[a-zA-Z][.)\]]|\(?[ivxlcIVXLC]{1,6}[.)\]])$/;

/** Marker width ceiling from §4.5; the gap after it is the caller's test. */
const MARKER_WIDTH = 1.6;

const RANK: Record<Repair, number> = { ligature: 1, pua: 2, 'symbolic-dropped': 3 };

const worse = (a: Repair | undefined, b: Repair): Repair => (a && RANK[a] > RANK[b] ? a : b);

/**
 * isLeadingRun means the span starts its line, is narrower than 1.5 × its size and
 * has a gap after it — the three conditions that turn an unreadable glyph into a bullet.
 */
export function repairUnicode(
  text: string,
  font: FontInfo,
  isLeadingRun: boolean,
): { text: string; repaired?: Repair } {
  if (text.length === 0) return { text };

  // A symbolic face with no usable ToUnicode reads as plain digits or letters: ZapfDingbats '✓✔✕✖' arrives as '3456'.
  if (font.symbolic && ASCII_ALNUM_RE.test(text)) {
    return isLeadingRun
      ? { text: BULLET, repaired: 'pua' }
      : { text: '', repaired: 'symbolic-dropped' };
  }

  let out = '';
  let repaired: Repair | undefined;

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;

    if (cp >= PUA_MIN && cp <= PUA_MAX) {
      const mapped = PUA_MAP.get(cp);
      if (mapped !== undefined) {
        out += String.fromCodePoint(mapped);
        repaired = worse(repaired, 'pua');
      } else if (isLeadingRun && out.length === 0) {
        out += BULLET;
        repaired = worse(repaired, 'pua');
      } else {
        repaired = worse(repaired, 'symbolic-dropped');
      }
      continue;
    }

    const ligature = LIGATURES.get(ch);
    if (ligature !== undefined) {
      out += ligature;
      repaired = worse(repaired, 'ligature');
      continue;
    }

    if (cp === 0x00a0 || (cp >= 0x2000 && cp <= 0x200a)) {
      out += ' ';
      repaired = worse(repaired, 'ligature');
      continue;
    }

    out += ch;
  }

  return repaired ? { text: out, repaired } : { text: out };
}

export function isListMarker(text: string, widthPt: Pt, sizePt: Pt): boolean {
  const glyph = text.trim();
  return (
    glyph.length >= 1 &&
    glyph.length <= 3 &&
    widthPt <= MARKER_WIDTH * sizePt &&
    MARKER_RE.test(glyph)
  );
}
