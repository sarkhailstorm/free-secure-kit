import type { Pt } from './types';

/** Min observed body leading was 1.34 em, so this never merges two lines. */
export const LINE_TOL = (bodySize: Pt): Pt => Math.max(1.2, 0.3 * bodySize);
/** Word fragments runs at style boundaries with a p50 gap of 0.004 em. */
export const NO_SPACE_MAX = 0.25;
/** Largest genuine justified word gap 1.13 em; smallest genuine tab gap 2.79 em. */
export const WORD_GAP_MAX = 2.0;
/** Body leading 15.6 pt vs paragraph gaps 22.3 pt. */
export const PARA_GAP = 1.3;
export const SHORT_LINE = 0.85;
/** Word's smallest indent is 18 pt = 1.6 em. */
export const INDENT_STEP = 0.5;
/** Measured left edges cluster at 72/90 and 60/65/78/96, nothing between. */
export const INDENT_BUCKET: Pt = 3;
/** Real 2-column gutter measured 23.9 pt = 2.17 em. */
export const GUTTER_MIN = (bodySize: Pt): Pt => Math.max(10, 0.9 * bodySize);
/** A 2-run masthead would otherwise hide the gutter entirely. */
export const GUTTER_CROSS_BUDGET = (runCount: number): number => Math.ceil(0.06 * runCount);

export const RULE_THICK_MAX: Pt = 2.5;
export const RULE_MIN_LEN: Pt = 8;
/** Word emits per-cell edges 0.48 pt apart. */
export const SEG_TOL: Pt = 1.2;
/** word-report 1.00, invoice 0.90, forms-like's false lattice 0.33. */
export const GRID_CLOSED_MIN = 0.75;

/** Title measured 2.18–2.73, H1 1.82. */
export const HEAD_RATIO_1 = 1.7;
/** H2 measured 1.45. */
export const HEAD_RATIO_2 = 1.3;
/** resume section heads 1.132, forms-like 1.104. */
export const HEAD_RATIO_3 = 1.08;

/** Right-aligned numeric columns have sd 0.00–0.07 pt; ragged edges 9–33 pt. */
export const ALIGN_TOL: Pt = 1.5;
/** Well above the ±0.02 em intra-line baseline jitter. */
export const SUPER_OFFSET = 0.18;
export const SUPER_SIZE_MAX = 0.8;
export const ALIGN_RESYNC_WINDOW = 24;

/** The scan fixtures cover 1.000 of the page. */
export const FULLPAGE_IMAGE = 0.7;
export const SCAN_GLYPH_MAX = 20;
export const SCAN_COVERAGE_MIN = 0.9;
/** The worst corpus page leaves 0 paths unclassified after rules and boxes. */
export const VECTOR_ART_PATHS = 40;
export const VECTOR_ART_COVER = 0.15;
export const ROTATED_RUN_LIMIT = 0.1;

export const MAX_FRAMES_PER_PAGE = 1500;
export const MAX_RUNS_PER_PAGE = 20000;
export const PAGE_WARN_THRESHOLD = 200;

/** Never emit these as a run family: Word reinterprets the text through the font's own encoding. */
export const SYMBOLIC_RE =
  /^(Symbol|SymbolMT|ZapfDingbats|Dingbats|Wingdings\d?|Webdings|OpenSymbol|MTExtra|Marlett)$/i;

/** Private-use codepoints are producer-specific: Word gives U+2022 where LibreOffice gives U+F0B7. */
export const PUA_MAP: ReadonlyMap<number, number> = new Map([
  [0xf0a7, 0x25aa],
  [0xf0a8, 0x25a1],
  [0xf0b7, 0x2022],
  [0xf06c, 0x25cf],
  [0xf06e, 0x25a0],
  [0xf071, 0x2666],
  [0xf075, 0x25c6],
  [0xf0d8, 0x25ba],
  [0xf0e0, 0x2192],
  [0xf0e1, 0x2190],
  [0xf0e2, 0x2191],
  [0xf0e3, 0x2193],
  [0xf0fc, 0x2713],
  [0xf0fe, 0x2612],
  [0xf02d, 0x2013],
  [0xf0b0, 0x00b0],
  [0xf0b1, 0x00b1],
  [0xf0b4, 0x00d7],
  [0xf0b8, 0x00f7],
  [0xf0a3, 0x2264],
  [0xf0b3, 0x2265],
  [0xf0ae, 0x2192],
  [0xf0ac, 0x2190],
  [0xf0de, 0x21d2],
  [0xf0db, 0x21d4],
]);

export const LIGATURES: ReadonlyMap<string, string> = new Map([
  ['ﬀ', 'ff'],
  ['ﬁ', 'fi'],
  ['ﬂ', 'fl'],
  ['ﬃ', 'ffi'],
  ['ﬄ', 'ffl'],
  ['ﬆ', 'st'],
]);

/** Spelling must match Word's exactly: 'LiberationSerif' misses where 'Liberation Serif' is installed. */
export const FAMILY_MAP: ReadonlyMap<string, string> = new Map([
  ['arial', 'Arial'],
  ['arialmt', 'Arial'],
  ['helvetica', 'Arial'],
  ['liberationsans', 'Arial'],
  ['nimbussans', 'Arial'],
  ['albany', 'Arial'],
  ['arialblack', 'Arial Black'],
  ['times', 'Times New Roman'],
  ['timesnewroman', 'Times New Roman'],
  ['timesnewromanps', 'Times New Roman'],
  ['liberationserif', 'Times New Roman'],
  ['nimbusroman', 'Times New Roman'],
  ['thorndale', 'Times New Roman'],
  ['courier', 'Courier New'],
  ['couriernew', 'Courier New'],
  ['liberationmono', 'Courier New'],
  ['nimbusmono', 'Courier New'],
  ['cumberland', 'Courier New'],
  ['dejavusans', 'Verdana'],
  ['dejavuserif', 'Georgia'],
]);

/** Ships with Word 365, so it passes through unchanged. */
export const KNOWN_FAMILIES: ReadonlySet<string> = new Set([
  'Calibri',
  'Cambria',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Consolas',
  'Garamond',
  'Aptos',
  'Aptos Display',
  'Segoe UI',
  'Segoe UI Symbol',
]);

export const STYLE_WORDS = [
  'Bold',
  'Italic',
  'Oblique',
  'Black',
  'Heavy',
  'Light',
  'Semibold',
  'SemiBold',
  'Demi',
  'Medium',
  'Condensed',
  'Narrow',
  'Regular',
  'Roman',
  'Book',
];

export const A4: { widthPt: Pt; heightPt: Pt } = { widthPt: 595.276, heightPt: 841.89 };
export const LETTER: { widthPt: Pt; heightPt: Pt } = { widthPt: 612, heightPt: 792 };
/** pdf.js reports 0.75 when a font's real ascent is unavailable. */
export const DEFAULT_ASCENT = 0.75;
export const DEFAULT_DESCENT = -0.25;
