/* ---------- units ---------- */
export type Pt = number;
export type Twip = number;
export type HalfPt = number;
export type Px96 = number;
export type Emu = number;

/** Device space: x right, y down from the top-left, so /Rotate is already applied. */
export interface Rect {
  x: Pt;
  y: Pt;
  w: Pt;
  h: Pt;
}

/* ---------- fonts ---------- */
export type Generic = 'serif' | 'sans-serif' | 'monospace';

export interface FontInfo {
  /** pdf.js key, e.g. 'g_d0_f1'. Stable per document. */
  id: string;
  /** PostScript name, subset prefix stripped, '#20' decoded. */
  psName: string;
  /** Word family after mapping. Never a symbolic family — see fonts.ts. */
  family: string;
  bold: boolean;
  italic: boolean;
  /** Matched SYMBOLIC_RE, so its unicode is not trustworthy. */
  symbolic: boolean;
  generic: Generic;
  missingFile: boolean;
  /** em units from textContent.styles[id]. */
  ascent: number;
  descent: number;
}

/* ---------- text ---------- */
export type RenderMode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** One pdf.js text item after enrichment, or a colour-split piece of one. */
export interface Span {
  text: string;
  fontId: string;
  /** Rendered size = hypot(m[2], m[3]). Never m[0], never the Tf operand. */
  size: Pt;
  /** 'RRGGBB', no '#'. null when the aligner could not resolve it. */
  colour: string | null;
  mode: RenderMode;
  x: Pt;
  y: Pt;
  w: Pt;
  /** pdf.js invented this whitespace: str === ' ' && height === 0. */
  synthetic: boolean;
  eol: boolean;
  mcid: string | null;
  artifact: boolean;
  rotationDeg: number;
  repaired?: 'pua' | 'ligature' | 'symbolic-dropped';
}

/* ---------- graphics ---------- */
export interface RuleSeg {
  axis: 'h' | 'v';
  /** Centre line: y for 'h', x for 'v'. */
  at: Pt;
  from: Pt;
  to: Pt;
  thickness: Pt;
  colour: string | null;
}

export interface FillBox {
  rect: Rect;
  colour: string | null;
}

export interface ImagePlacement {
  objId: string | null;
  /** PDF object ref like '49R', for lifting original JPEG bytes. */
  ref: string | null;
  kind: 'xobject' | 'inline' | 'mask';
  rect: Rect;
  srcW: number;
  srcH: number;
  rotationDeg: number;
}

export interface LinkBox {
  rect: Rect;
  url: string;
}

/* ---------- struct tree ---------- */
export type StructRole = string;

export interface StructBlock {
  index: number;
  role: StructRole;
  /** Ancestor chain outermost first, e.g. ['Document','L','LI','LBody']. */
  path: StructRole[];
  producerTag: string | null;
  alt: string | null;
  tableIndex: number | null;
  row: number | null;
  col: number | null;
}

export interface StructTable {
  rows: number;
  cols: number;
  cellBlocks: number[][];
}

export interface StructIndex {
  present: boolean;
  blockOf: Map<string, number>;
  blocks: StructBlock[];
  tables: StructTable[];
}

/* ---------- page ---------- */
export type PageClass = 'text' | 'searchableScan' | 'imageOnly' | 'blank' | 'rasterFallback';

export type DegradeReason =
  | 'no-text'
  | 'invisible-text-only'
  | 'too-many-runs'
  | 'too-many-lines'
  | 'vector-art'
  | 'rotated-text'
  | 'columns-failed';

export interface PageFacts {
  index: number;
  pageNumber: number;
  cls: PageClass;
  degradeReason?: DegradeReason;
  width: Pt;
  height: Pt;
  rotate: 0 | 90 | 180 | 270;
  /** Upright only, in pdf.js emission order. */
  spans: Span[];
  rotatedSpanCount: number;
  /** Characters the PDF draws that never reached `spans` — clipped by pdf.js, or sideways. */
  droppedGlyphs: number;
  rules: RuleSeg[];
  fills: FillBox[];
  images: ImagePlacement[];
  links: LinkBox[];
  struct: StructIndex;
  /** Char-weighted modal font size. Drives every size-relative threshold. */
  bodySize: Pt;
  visibleGlyphs: number;
  invisibleGlyphs: number;
  imageCoverage: number;
  artPathCount: number;
  artCoverage: number;
  raster?: { bytes: Uint8Array; type: 'png' | 'jpg'; w: number; h: number };
}

/* ---------- layout ---------- */
export interface Fragment {
  x0: Pt;
  x1: Pt;
  spans: Span[];
  text: string;
}

export interface Line {
  /** Baseline. */
  y: Pt;
  x0: Pt;
  x1: Pt;
  size: Pt;
  spans: Span[];
  fragments: Fragment[];
  text: string;
  column: number;
}

export type Align = 'left' | 'center' | 'right' | 'justify';

export interface Run {
  text: string;
  fontId: string;
  size: Pt;
  bold: boolean;
  italic: boolean;
  colour: string;
  vertical: 'baseline' | 'super' | 'sub';
  href: string | null;
  /** Emit a Tab element instead of text. */
  tab?: boolean;
}

export interface ParaBlock {
  kind: 'paragraph' | 'heading' | 'listItem' | 'caption';
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  runs: Run[];
  align: Align;
  indentLeftPt: Pt;
  indentRightPt: Pt;
  firstLinePt: Pt;
  hangingPt: Pt;
  spaceBeforePt: Pt;
  leadingPt: Pt;
  tabStops: { type: 'left' | 'right' | 'center' | 'decimal'; posPt: Pt }[];
  marker?: string;
  listDepth?: number;
  bottomBorder?: { colour: string; thicknessPt: Pt };
  source: 'struct' | 'geometry';
}

export interface TableCellBlock {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  blocks: ParaBlock[];
  shade: string | null;
}

export interface TableBlock {
  kind: 'table';
  /** Column boundaries left to right; length = cols + 1. */
  gridPt: Pt[];
  rows: { cells: TableCellBlock[]; heightPt: Pt }[];
  ruled: boolean;
  headerRows: number;
  source: 'struct' | 'rules';
}

export interface ImageBlock {
  kind: 'image';
  placement: ImagePlacement;
  data: Uint8Array;
  type: 'png' | 'jpg';
  widthPt: Pt;
  heightPt: Pt;
  align: Align;
  alt: string | null;
}

export type Block = ParaBlock | TableBlock | ImageBlock | { kind: 'pageBreak' };

export interface Section {
  widthPt: Pt;
  heightPt: Pt;
  margins: { top: Pt; right: Pt; bottom: Pt; left: Pt; header: Pt; footer: Pt };
  columns: { count: number; spacePt: Pt } | null;
  header: ParaBlock[] | null;
  footer: ParaBlock[] | null;
  headerHasPageField: boolean;
  footerHasPageField: boolean;
  blocks: Block[];
  firstPageIndex: number;
  lastPageIndex: number;
}

export interface DocModel {
  sections: Section[];
  body: { family: string; sizePt: Pt; leadingPt: Pt };
  notes: ConversionNote[];
}

export type ConversionNote =
  | { code: 'scannedPages'; pages: number[]; pictured: boolean }
  | { code: 'ocrLayerUsed'; pages: number[] }
  | { code: 'symbolicDropped'; pages: number[] }
  | { code: 'missingFont'; psName: string; family: string }
  | { code: 'vectorDropped'; pages: number[]; count: number }
  | { code: 'rotatedText'; pages: number[] }
  | { code: 'columnsFlattened'; pages: number[] }
  | { code: 'tabColumns'; pages: number[] }
  | { code: 'tableGuessed'; pages: number[]; count: number }
  | { code: 'imageDownscaled'; count: number }
  | { code: 'imagesDropped'; count: number }
  | { code: 'rasterPage'; pages: number[]; reason: DegradeReason; pictured: boolean }
  | { code: 'pageFailed'; pages: number[] }
  | { code: 'untagged'; pages: number[] }
  | { code: 'rtl'; pages: number[] };

/* ---------- public surface ---------- */
export type WordMode = 'editable' | 'exact';

export interface WordOptions {
  mode: WordMode;
  /** Put a picture of the page in for pages with no text. Default true. */
  imagesForScannedPages?: boolean;
  /** Force one column and sequential reading order. Default false. */
  flattenColumns?: boolean;
  signal?: AbortSignal;
}

export type WordStage = 'reading' | 'analysing' | 'writing';

export interface WordProgress {
  stage: WordStage;
  done: number;
  total: number;
  page?: number;
}

export interface WordReport {
  pageCount: number;
  scannedPages: number;
  images: number;
  tables: number;
  notes: string[];
  paragraphs: number;
  headings: number;
  lists: number;
  rasterisedPages: number[];
  textCharacters: number;
  droppedGlyphs: number;
  mode: WordMode;
  noteCodes: ConversionNote[];
}

export interface WordResult {
  bytes: Uint8Array;
  report: WordReport;
}
