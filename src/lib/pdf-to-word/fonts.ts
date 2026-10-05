import {
  DEFAULT_ASCENT,
  DEFAULT_DESCENT,
  FAMILY_MAP,
  KNOWN_FAMILIES,
  STYLE_WORDS,
  SYMBOLIC_RE,
} from './constants';
import type { FontInfo, Generic } from './types';

const SUBSET_RE = /^[A-Z]{6}\+/;
const PS_SUFFIX_RE = /(PSMT|PS|MT)$/;
const BOLD_RE = /bold|black|heavy|semibold|demi/i;
const ITALIC_RE = /italic|oblique/i;
const TRAILING_SEP_RE = /[-_ ]+$/;
const MAX_PEELS = 8;

/** Longest first, or 'SemiBold' peels as 'Bold' and leaves a 'Semi' stem behind. */
const PEELABLE = [...STYLE_WORDS].sort((a, b) => b.length - a.length);

const norm = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const KNOWN_BY_KEY: ReadonlyMap<string, string> = new Map(
  [...KNOWN_FAMILIES].map((family) => [norm(family), family]),
);

/** Peeling stops at a table name, so 'TimesNewRoman' keeps its 'Roman' and 'ArialBlack' its 'Black'. */
const ANCHORS: ReadonlySet<string> = new Set([
  ...[...FAMILY_MAP.keys()].map(norm),
  ...KNOWN_BY_KEY.keys(),
]);

const CLASS_FAMILY: Record<Generic, string> = {
  serif: 'Times New Roman',
  monospace: 'Courier New',
  'sans-serif': 'Arial',
};

/** A symbolic face keeps its repaired unicode in a plain family — never its own. */
const SYMBOLIC_HOST = 'Arial';

const clean = (raw: string): string => raw.replace(SUBSET_RE, '').replace(/#20/g, ' ').trim();

function deCamel(stem: string): string {
  return stem
    .replace(/_+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function peelStyleWord(base: string): { rest: string; word: string } | null {
  for (const word of PEELABLE) {
    const at = base.length - word.length;
    if (at <= 0) continue;
    const seg = base.slice(at);
    if (seg.toLowerCase() !== word.toLowerCase()) continue;
    const prev = base[at - 1];
    const separated = prev === '-' || prev === '_' || prev === ' ';
    const camel = /[a-z0-9]/.test(prev) && seg[0] !== seg[0].toLowerCase();
    if (!separated && !camel) continue;
    return { rest: base.slice(0, separated ? at - 1 : at).replace(TRAILING_SEP_RE, ''), word: seg };
  }
  return null;
}

export function parsePsName(raw: string): { base: string; bold: boolean; italic: boolean } {
  const name = clean(raw);
  const comma = name.indexOf(',');
  let base = (comma === -1 ? name : name.slice(0, comma)).trim();
  let styleTail = comma === -1 ? '' : name.slice(comma + 1);

  for (let i = 0; i < MAX_PEELS && base.length > 0 && !ANCHORS.has(norm(base)); i++) {
    const suffix = PS_SUFFIX_RE.exec(base);
    if (suffix && base.length > suffix[0].length) {
      base = base.slice(0, base.length - suffix[0].length).replace(TRAILING_SEP_RE, '');
      continue;
    }
    const peeled = peelStyleWord(base);
    if (!peeled) break;
    base = peeled.rest;
    styleTail += ` ${peeled.word}`;
  }

  return { base, bold: BOLD_RE.test(styleTail), italic: ITALIC_RE.test(styleTail) };
}

function tableFamily(base: string): string | null {
  const key = norm(base);
  return FAMILY_MAP.get(key) ?? KNOWN_BY_KEY.get(key) ?? null;
}

export function isSymbolicName(psName: string): boolean {
  return SYMBOLIC_RE.test(clean(psName)) || SYMBOLIC_RE.test(parsePsName(psName).base);
}

/** The face was never embedded and no mapping matched, so the family is a guess. */
export function isSubstituted(font: FontInfo): boolean {
  if (!font.missingFile || font.symbolic) return false;
  const { base } = parsePsName(font.psName);
  return tableFamily(base) === null;
}

/** id, ascent and descent are the caller's to fill from textContent.styles. */
export function mapFont(raw: string, generic: Generic, missingFile: boolean): FontInfo {
  const psName = clean(raw);
  const { base, bold, italic } = parsePsName(raw);
  const symbolic = isSymbolicName(raw);
  const mapped = tableFamily(base);
  const family = symbolic
    ? SYMBOLIC_HOST
    : (mapped ?? (missingFile ? CLASS_FAMILY[generic] : deCamel(base) || CLASS_FAMILY[generic]));

  return {
    id: '',
    psName,
    family,
    bold,
    italic,
    symbolic,
    generic,
    missingFile,
    ascent: DEFAULT_ASCENT,
    descent: DEFAULT_DESCENT,
  };
}

export function resolveFamily(font: FontInfo, blockFamily: string): string {
  return font.symbolic ? blockFamily || font.family : font.family;
}
