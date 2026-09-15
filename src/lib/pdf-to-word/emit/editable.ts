import type {
  FileChild,
  IBorderOptions,
  IRunOptions,
  ISectionOptions,
  ITableBordersOptions,
  Paragraph,
  ParagraphChild,
  TabStopDefinition,
  Table,
} from 'docx';
import type {
  Align,
  Block,
  DocModel,
  FontInfo,
  ImageBlock,
  ParaBlock,
  Pt,
  Section,
  TableBlock,
  TableCellBlock,
  WordOptions,
} from '../types';
import { borderFrom, pageSizeFor, runsFor, type EmittedRun } from './shared';
import { hex, hp, px96, tw } from './units';

type Docx = typeof import('docx');

interface Ctx {
  docx: Docx;
  fonts: ReadonlyMap<string, FontInfo>;
  bodyFamily: string;
  bodySizePt: Pt;
  totalPages: number;
}

/** Word's page-number field is the only place a header digit run may be rewritten. */
interface FieldState {
  current: boolean;
  total: boolean;
}

const ALIGN: Record<Align, 'left' | 'center' | 'right' | 'both'> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'both',
};

const HEADINGS = ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'] as const;

/** TableBlock carries no measured inset, so ruled tables get Word's own 0.08" default. */
const CELL_PAD_PT: Pt = 5.76;
/** Nor a rule colour or weight: Word's default grid line is a 0.5 pt black single. */
const GRID_LINE: IBorderOptions = { style: 'single', size: 4, color: '000000', space: 0 };
const NO_LINE: IBorderOptions = { style: 'none', size: 0, color: 'FFFFFF', space: 0 };

const GRID_BORDERS: ITableBordersOptions = {
  top: GRID_LINE,
  bottom: GRID_LINE,
  left: GRID_LINE,
  right: GRID_LINE,
  insideHorizontal: GRID_LINE,
  insideVertical: GRID_LINE,
};

const NO_BORDERS: ITableBordersOptions = {
  top: NO_LINE,
  bottom: NO_LINE,
  left: NO_LINE,
  right: NO_LINE,
  insideHorizontal: NO_LINE,
  insideVertical: NO_LINE,
};

function fieldSplit(
  options: IRunOptions,
  ctx: Ctx,
  state: FieldState,
): ParagraphChild[] | null {
  const text = typeof options.text === 'string' ? options.text : '';
  if (text === '' || (state.current && state.total)) return null;

  const { PageNumber, TextRun } = ctx.docx;
  const out: ParagraphChild[] = [];
  let last = 0;

  for (const match of text.matchAll(/\d+/g)) {
    let token: string | null = null;
    if (!state.current) {
      token = PageNumber.CURRENT;
      state.current = true;
    } else if (!state.total && Number(match[0]) === ctx.totalPages) {
      token = PageNumber.TOTAL_PAGES;
      state.total = true;
    }
    if (token === null) continue;

    const at = match.index ?? 0;
    if (at > last) out.push(new TextRun({ ...options, text: text.slice(last, at) }));
    // docx ignores `text` whenever `children` is present, so no copy has to be stripped.
    out.push(new TextRun({ ...options, children: [token] }));
    last = at + match[0].length;
  }

  if (out.length === 0) return null;
  if (last < text.length) out.push(new TextRun({ ...options, text: text.slice(last) }));
  return out;
}

function textRuns(
  run: EmittedRun,
  ctx: Ctx,
  field: FieldState | null,
  linked: boolean,
): ParagraphChild[] {
  const { Tab, TextRun } = ctx.docx;
  const options: IRunOptions = linked ? { ...run.options, style: 'Hyperlink' } : run.options;
  if (run.tab) return [new TextRun({ ...options, children: [new Tab()] })];
  return (field && fieldSplit(options, ctx, field)) ?? [new TextRun(options)];
}

function inlineChildren(
  runs: readonly EmittedRun[],
  ctx: Ctx,
  field: FieldState | null,
): ParagraphChild[] {
  const { ExternalHyperlink } = ctx.docx;
  const out: ParagraphChild[] = [];
  let i = 0;

  while (i < runs.length) {
    const href = runs[i].href;
    if (href === null) {
      out.push(...textRuns(runs[i], ctx, field, false));
      i += 1;
      continue;
    }
    // One relationship per contiguous stretch sharing a URL, not one per run.
    const group: ParagraphChild[] = [];
    while (i < runs.length && runs[i].href === href) {
      group.push(...textRuns(runs[i], ctx, field, true));
      i += 1;
    }
    out.push(new ExternalHyperlink({ link: href, children: group }));
  }
  return out;
}

function markerRun(block: ParaBlock, runs: readonly EmittedRun[], ctx: Ctx): ParagraphChild {
  const { Tab, TextRun } = ctx.docx;
  const lead = runs.find((r) => !r.tab);
  const font = typeof lead?.options.font === 'string' ? lead.options.font : ctx.bodyFamily;
  return new TextRun({
    children: [block.marker ?? '', new Tab()],
    font,
    size: lead?.options.size ?? hp(ctx.bodySizePt),
  });
}

function tabStopsFor(block: ParaBlock): TabStopDefinition[] {
  const stops: TabStopDefinition[] = block.tabStops.map((t) => ({
    type: t.type,
    position: tw(t.posPt),
  }));
  if (block.kind === 'listItem') {
    const at = tw(block.indentLeftPt);
    // The hanging marker needs a stop of its own to land on.
    if (!stops.some((s) => s.position === at)) stops.push({ type: 'left', position: at });
  }
  return stops.sort((a, b) => Number(a.position) - Number(b.position));
}

function paragraphFor(block: ParaBlock, ctx: Ctx, field: FieldState | null): Paragraph {
  const { Paragraph: Para } = ctx.docx;
  const runs = runsFor(block, ctx.fonts, { bodyFamily: ctx.bodyFamily });

  const children: ParagraphChild[] = [];
  if (block.kind === 'listItem' && block.marker) children.push(markerRun(block, runs, ctx));
  children.push(...inlineChildren(runs, ctx, field));

  const stops = tabStopsFor(block);
  const heading = block.kind === 'heading' ? HEADINGS[(block.level ?? 1) - 1] : undefined;

  return new Para({
    ...(heading && { heading }),
    ...(block.kind === 'paragraph' && { style: 'PdfBody' }),
    alignment: ALIGN[block.align],
    spacing: {
      before: tw(block.spaceBeforePt),
      after: 0,
      // AT_LEAST, never EXACT: a substituted face must be able to take the room it needs.
      ...(block.leadingPt > 0 && { line: tw(block.leadingPt), lineRule: 'atLeast' as const }),
    },
    indent: {
      left: tw(block.indentLeftPt),
      right: tw(block.indentRightPt),
      ...(block.firstLinePt > 0
        ? { firstLine: tw(block.firstLinePt) }
        : { hanging: tw(block.hangingPt) }),
    },
    ...(stops.length > 0 && { tabStops: stops }),
    ...(block.bottomBorder && { border: { bottom: borderFrom(block.bottomBorder) } }),
    ...(block.kind === 'listItem' && { contextualSpacing: true }),
    keepNext: block.kind === 'heading',
    children,
  });
}

function imageFor(block: ImageBlock, ctx: Ctx): Paragraph {
  const { ImageRun, Paragraph: Para } = ctx.docx;
  return new Para({
    alignment: ALIGN[block.align],
    spacing: { before: 0, after: 0 },
    children: [
      new ImageRun({
        type: block.type,
        data: block.data,
        transformation: { width: px96(block.widthPt), height: px96(block.heightPt) },
        ...(block.alt && {
          altText: { name: block.alt, title: block.alt, description: block.alt },
        }),
      }),
    ],
  });
}

function spanWidth(widths: readonly number[], col: number, span: number): number {
  let total = 0;
  for (let c = col; c < col + Math.max(1, span); c += 1) total += widths[c] ?? 0;
  return Math.max(1, total);
}

function tableFor(block: TableBlock, ctx: Ctx): Table | null {
  const { Paragraph: Para, Table: Tbl, TableCell, TableRow } = ctx.docx;
  const cols = block.gridPt.length - 1;
  if (cols < 1 || block.rows.length === 0) return null;

  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(1, tw(block.gridPt[c + 1] - block.gridPt[c])),
  );
  const pad = block.ruled ? tw(CELL_PAD_PT) : 0;

  const rows = block.rows.map((row, r) => {
    const cells: readonly TableCellBlock[] =
      row.cells.length > 0
        ? row.cells
        : [{ row: r, col: 0, rowSpan: 1, colSpan: cols, blocks: [], shade: null }];

    return new TableRow({
      ...(row.heightPt > 0 && {
        // ATLEAST, so editing the cell cannot clip its own text.
        height: { value: tw(row.heightPt), rule: 'atLeast' as const },
      }),
      tableHeader: r < block.headerRows,
      children: cells.map(
        (cell) =>
          new TableCell({
            width: { size: spanWidth(widths, cell.col, cell.colSpan), type: 'dxa' },
            ...(cell.colSpan > 1 && { columnSpan: cell.colSpan }),
            ...(cell.rowSpan > 1 && { rowSpan: cell.rowSpan }),
            ...(cell.shade && {
              shading: { type: 'clear' as const, fill: hex(cell.shade), color: 'auto' },
            }),
            verticalAlign: 'top',
            children:
              cell.blocks.length > 0
                ? cell.blocks.map((b) => paragraphFor(b, ctx, null))
                : [new Para({})],
          }),
      ),
    });
  });

  return new Tbl({
    // FIXED plus explicit widths, or Word autofits the measured grid away.
    layout: 'fixed',
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: 'dxa' },
    borders: block.ruled ? GRID_BORDERS : NO_BORDERS,
    margins: { marginUnitType: 'dxa', top: 0, bottom: 0, left: pad, right: pad },
    rows,
  });
}

function blockChildren(block: Block, ctx: Ctx): FileChild[] {
  switch (block.kind) {
    case 'pageBreak':
      return [new ctx.docx.Paragraph({ children: [new ctx.docx.PageBreak()] })];
    case 'table': {
      const table = tableFor(block, ctx);
      return table ? [table] : [];
    }
    case 'image':
      return [imageFor(block, ctx)];
    default:
      return [paragraphFor(block, ctx, null)];
  }
}

function sectionChildren(section: Section, ctx: Ctx): FileChild[] {
  const { Paragraph: Para } = ctx.docx;
  const out: FileChild[] = [];
  let lastWasTable = false;

  for (const block of section.blocks) {
    const emitted = blockChildren(block, ctx);
    if (emitted.length === 0) continue;
    // Word merges two adjacent <w:tbl> into one, and repairs a body that ends on one.
    if (lastWasTable && block.kind === 'table') out.push(new Para({}));
    out.push(...emitted);
    lastWasTable = block.kind === 'table';
  }

  if (out.length === 0 || lastWasTable) out.push(new Para({}));
  return out;
}

function runningPart(blocks: readonly ParaBlock[], hasField: boolean, ctx: Ctx): Paragraph[] {
  const state: FieldState | null = hasField ? { current: false, total: false } : null;
  return blocks.map((b) => paragraphFor(b, ctx, state));
}

export async function editableSections(
  model: DocModel,
  opts: WordOptions,
  fonts: ReadonlyMap<string, FontInfo> = new Map(),
): Promise<ISectionOptions[]> {
  const docx = await import('docx');
  const { Footer, Header } = docx;

  const ctx: Ctx = {
    docx,
    fonts,
    bodyFamily: model.body.family,
    bodySizePt: model.body.sizePt,
    totalPages: model.sections.reduce((n, s) => Math.max(n, s.lastPageIndex + 1), 0),
  };

  return model.sections.map((section, i) => {
    const previous = i > 0 ? model.sections[i - 1] : null;
    const continuesSamePage = previous !== null && section.firstPageIndex <= previous.lastPageIndex;
    const columns = opts.flattenColumns ? null : section.columns;
    const m = section.margins;

    return {
      properties: {
        page: {
          size: pageSizeFor(section),
          margin: {
            top: tw(m.top),
            right: tw(m.right),
            bottom: tw(m.bottom),
            left: tw(m.left),
            header: tw(m.header),
            footer: tw(m.footer),
          },
        },
        type: continuesSamePage ? ('continuous' as const) : ('nextPage' as const),
        ...(columns &&
          columns.count > 1 && {
            column: {
              count: columns.count,
              space: tw(columns.spacePt),
              equalWidth: true,
              separate: false,
            },
          }),
      },
      ...(section.header && {
        headers: {
          default: new Header({
            children: runningPart(section.header, section.headerHasPageField, ctx),
          }),
        },
      }),
      ...(section.footer && {
        footers: {
          default: new Footer({
            children: runningPart(section.footer, section.footerHasPageField, ctx),
          }),
        },
      }),
      children: sectionChildren(section, ctx),
    };
  });
}
