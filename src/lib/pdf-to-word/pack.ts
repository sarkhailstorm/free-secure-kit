import type { IPropertiesOptions, ISectionOptions } from 'docx';
import { boxCount, type PageLayout } from './emit/exact';
import { hp, tw } from './emit/units';
import { describeNote } from './notes';
import type { Block, ConversionNote, DocModel, WordOptions, WordReport } from './types';

/** Past six, a list of caveats stops being read. */
const MAX_NOTES = 6;

/** Most important first: a page that never made it outranks any cosmetic caveat. */
const NOTE_ORDER: readonly ConversionNote['code'][] = [
  'scannedPages',
  'rasterPage',
  'pageFailed',
  'ocrLayerUsed',
  'missingFont',
  'tabColumns',
  'tableGuessed',
  'untagged',
  'columnsFlattened',
  'symbolicDropped',
  'rotatedText',
  'vectorDropped',
  'rtl',
  'imagesDropped',
  'imageDownscaled',
];

/** Exact mode reproduces the page as it looks, so none of these rebuilding caveats apply to it. */
const EDITABLE_ONLY: ReadonlySet<ConversionNote['code']> = new Set([
  'tabColumns',
  'tableGuessed',
  'columnsFlattened',
  'untagged',
]);

export interface ReportSource {
  layouts: readonly PageLayout[];
  model: DocModel;
  /** The PDF's own page count, which is larger than `layouts` when a page failed. */
  pageCount: number;
}

interface Counts {
  paragraphs: number;
  headings: number;
  lists: number;
  tables: number;
  images: number;
}

/** A built-in style id loses everything but colour and size, so the body style is our own. */
function stylesFor(model: DocModel): IPropertiesOptions['styles'] {
  const run = { font: model.body.family, size: hp(model.body.sizePt) };
  const spacing = { after: 0, line: tw(model.body.leadingPt), lineRule: 'atLeast' as const };
  return {
    default: { document: { run, paragraph: { spacing } } },
    paragraphStyles: [
      {
        id: 'PdfBody',
        name: 'PDF Body',
        basedOn: 'Normal',
        next: 'PdfBody',
        quickFormat: true,
        run,
        paragraph: { spacing },
      },
    ],
  };
}

export async function packDocument(
  sections: ISectionOptions[],
  model: DocModel,
): Promise<Blob> {
  const { Document, Packer } = await import('docx');
  return Packer.toBlob(
    new Document({ creator: 'FreeSecureKit', styles: stylesFor(model), sections }),
  );
}

function tally(blocks: readonly Block[], into: Counts): void {
  for (const block of blocks) {
    switch (block.kind) {
      case 'table':
        into.tables += 1;
        for (const row of block.rows) for (const cell of row.cells) tally(cell.blocks, into);
        break;
      case 'image':
        into.images += 1;
        break;
      case 'heading':
        into.headings += 1;
        break;
      case 'listItem':
        into.lists += 1;
        break;
      case 'paragraph':
      case 'caption':
        into.paragraphs += 1;
        break;
      default:
        break;
    }
  }
}

/** One note per subject: the same code raised twice is one sentence, not two. */
function mergeNotes(notes: readonly ConversionNote[]): ConversionNote[] {
  const byKey = new Map<string, ConversionNote>();

  for (const note of notes) {
    let key: string = note.code;
    if (note.code === 'missingFont') key = `missingFont:${note.psName}`;
    if (note.code === 'rasterPage') key = `rasterPage:${note.reason}:${note.pictured}`;
    if (note.code === 'scannedPages') key = `scannedPages:${note.pictured}`;

    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...note });
      continue;
    }
    if ('pages' in seen && 'pages' in note) {
      seen.pages = [...new Set([...seen.pages, ...note.pages])].sort((a, b) => a - b);
    }
    if ('count' in seen && 'count' in note) seen.count += note.count;
  }

  const rank = (note: ConversionNote): number => {
    const at = NOTE_ORDER.indexOf(note.code);
    return at === -1 ? NOTE_ORDER.length : at;
  };
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b));
}

export function buildReport(source: ReportSource, opts: WordOptions): WordReport {
  const { layouts, model, pageCount } = source;
  const exact = opts.mode === 'exact';
  const counts: Counts = { paragraphs: 0, headings: 0, lists: 0, tables: 0, images: 0 };
  for (const section of model.sections) tally(section.blocks, counts);

  let textCharacters = 0;
  let droppedGlyphs = 0;
  const rasterisedPages: number[] = [];
  let scannedPages = 0;
  let framedImages = 0;

  for (const layout of layouts) {
    const { facts } = layout;
    if (facts.cls === 'imageOnly' || facts.cls === 'searchableScan') scannedPages += 1;
    if (facts.raster) rasterisedPages.push(facts.pageNumber);
    framedImages += facts.raster ? 1 : layout.images.length;
    droppedGlyphs += facts.droppedGlyphs;
    for (const span of facts.spans) {
      textCharacters += span.text.replace(/\s/gu, '').length;
      if (span.repaired === 'symbolic-dropped') droppedGlyphs += 1;
    }
  }

  const noteCodes = mergeNotes(
    exact ? model.notes.filter((note) => !EDITABLE_ONLY.has(note.code)) : model.notes,
  );
  // Exact mode emits framed boxes and no tables, headings or lists, so these counts describe the analysis.
  const boxes = exact ? layouts.reduce((n, l) => n + boxCount(l.lines, l.fonts), 0) : 0;
  return {
    pageCount,
    scannedPages,
    images: exact ? framedImages : counts.images,
    tables: exact ? 0 : counts.tables,
    notes: noteCodes.slice(0, MAX_NOTES).map(describeNote),
    paragraphs: exact ? boxes : counts.paragraphs,
    headings: exact ? 0 : counts.headings,
    lists: exact ? 0 : counts.lists,
    rasterisedPages,
    textCharacters,
    droppedGlyphs,
    mode: opts.mode,
    noteCodes,
  };
}
