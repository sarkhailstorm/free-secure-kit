import type { IFrameOptions, ISectionOptions, Paragraph, ParagraphChild } from 'docx';
import { MAX_FRAMES_PER_PAGE, SUPER_OFFSET, SUPER_SIZE_MAX } from '../constants';
import { fragmentRunTexts } from '../layout/lines';
import { placeholderLine } from '../notes';
import type {
  FillBox,
  FontInfo,
  Fragment,
  Line,
  LinkBox,
  PageFacts,
  Pt,
  Rect,
  Run,
  RuleSeg,
  Span,
  WordOptions,
} from '../types';
import { pageSizeFor, runsFor } from './shared';
import { emu, hex, px96, tw } from './units';

type Docx = typeof import('docx');

/** Frame top → first baseline under lineRule EXACT: 12 probes gave 0.7967–0.8032. */
const BASELINE_RATIO = 0.8;
/** A substituted font sets wider than the PDF measured, and a narrow frame wraps rather than overflows. */
const FRAME_SLACK = 1.25;
const FRAME_PAD: Pt = 8;
/** Enough flow content to hold the section open, too little to spill onto a second page. */
const FLOW_LINE: Pt = 1;
/** Below this both renderers snap to their own hairline, so a thinner box gains nothing. */
const MIN_RULE: Pt = 0.25;
/** A frame re-sets every gap as one space, so a wider measured gap walks the rest of the line. */
const DRIFT_BUDGET: Pt = 2;
/** Space advance of the base-14 families the mapping targets; Courier is the monospace outlier. */
const SPACE_EM = 0.25;
const MONO_SPACE_EM = 0.6;

export interface ExactImage {
  rect: Rect;
  data: Uint8Array;
  type: 'png' | 'jpg';
  /** Clockwise, matching ImagePlacement.rotationDeg. */
  rotationDeg?: number;
  /** Force the z-order; otherwise an image with text over it goes behind. */
  behind?: boolean;
}

export interface PageLayout {
  facts: PageFacts;
  lines: readonly Line[];
  images: readonly ExactImage[];
  fonts: ReadonlyMap<string, FontInfo>;
  bodyFamily: string;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/** Nearest baseline on the page, which is the only leading Exact mode can measure. */
function leadings(lines: readonly Line[]): Map<Line, Pt> {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const out = new Map<Line, Pt>();
  for (let i = 0; i < sorted.length; i += 1) {
    const line = sorted[i];
    const limit = 3 * line.size;
    let best = 0;
    for (const other of [sorted[i - 1], sorted[i + 1]]) {
      if (!other) continue;
      const gap = Math.abs(other.y - line.y);
      if (gap < 0.5 || gap > limit) continue;
      if (best === 0 || gap < best) best = gap;
    }
    out.set(line, best);
  }
  return out;
}

function verticalOf(span: Span, box: { y: Pt; size: Pt }): Run['vertical'] {
  if (span.size > SUPER_SIZE_MAX * box.size) return 'baseline';
  const rise = box.y - span.y;
  if (rise > SUPER_OFFSET * box.size) return 'super';
  if (rise < -SUPER_OFFSET * box.size) return 'sub';
  return 'baseline';
}

function linkAt(span: Span, links: readonly LinkBox[]): string | null {
  if (links.length === 0) return null;
  const x = span.x + span.w / 2;
  const y = span.y - span.size * 0.35;
  for (const link of links) {
    const { rect } = link;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return link.url;
  }
  return null;
}

/** One framed box. A fragment, not a line: a tab stop cannot hold an absolute x, but a frame can. */
interface Box {
  x0: Pt;
  x1: Pt;
  y: Pt;
  size: Pt;
  fragment: Fragment;
}

const isInk = (span: Span): boolean => !span.synthetic && span.text.trim().length > 0;

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** One frame per box, which is what the per-page cap counts. */
export const boxCount = (
  lines: readonly Line[],
  fonts: ReadonlyMap<string, FontInfo>,
): number => lines.reduce((n, line) => n + Math.max(1, boxesOf(line, fonts).length), 0);

/** Contiguous slices of a fragment, cut before the re-set gaps have walked the text off its x. */
function splitWide(fragment: Fragment, fonts: ReadonlyMap<string, FontInfo>): Fragment[] {
  const spans = fragment.spans;
  const cuts: number[] = [];
  let previous = -1;
  let drift = 0;
  for (let i = 0; i < spans.length; i++) {
    if (!isInk(spans[i])) continue;
    const before = previous >= 0 ? spans[previous] : null;
    previous = i;
    if (!before) continue;
    const size = Math.max(before.size, spans[i].size);
    if (size <= 0) continue;
    const mono = fonts.get(spans[i].fontId)?.generic === 'monospace';
    const space = (mono ? MONO_SPACE_EM : SPACE_EM) * size;
    const gap = spans[i].x - (before.x + before.w);
    // A gap under one space is set as none at all, so only a wider one moves the text.
    drift += Math.max(0, gap - space);
    if (drift < DRIFT_BUDGET) continue;
    cuts.push(i);
    drift = 0;
  }
  if (cuts.length === 0) return [fragment];

  const bounds = [0, ...cuts, spans.length];
  const out: Fragment[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const slice = spans.slice(bounds[i], bounds[i + 1]);
    const ink = slice.filter(isInk);
    if (ink.length === 0) continue;
    out.push({
      x0: Math.min(...ink.map((span) => span.x)),
      x1: Math.max(...ink.map((span) => span.x + span.w)),
      spans: slice,
      text: slice.map((span) => span.text).join(''),
    });
  }
  return out.length > 0 ? out : [fragment];
}

function boxesOf(line: Line, fonts: ReadonlyMap<string, FontInfo>): Box[] {
  const fragments: readonly Fragment[] = (
    line.fragments.length > 0
      ? line.fragments
      : [{ x0: line.x0, x1: line.x1, spans: [...line.spans], text: line.text }]
  ).flatMap((fragment) => splitWide(fragment, fonts));

  return fragments.map((fragment) => {
    // buildLines welds two columns sharing a baseline band, so a fragment measures its own.
    const ink = fragment.spans.filter(isInk);
    return {
      x0: fragment.x0,
      x1: fragment.x1,
      y: ink.length > 0 ? median(ink.map((span) => span.y)) : line.y,
      size: ink.length > 0 ? Math.max(...ink.map((span) => span.size)) : line.size,
      fragment,
    };
  });
}

function boxRuns(box: Box, layout: PageLayout): Run[] {
  const { facts, fonts } = layout;
  const runs: Run[] = [];
  const texts = fragmentRunTexts(box.fragment, facts.bodySize);

  box.fragment.spans.forEach((span, slot) => {
    const text = texts[slot] ?? span.text;
    if (text.length === 0) return;
    const font = fonts.get(span.fontId);
    runs.push({
      text,
      fontId: span.fontId,
      size: span.size,
      bold: font?.bold ?? false,
      italic: font?.italic ?? false,
      colour: span.colour ?? '000000',
      vertical: verticalOf(span, box),
      href: linkAt(span, facts.links),
    });
  });

  return runs;
}

function frameFor(rect: Rect, page: { width: Pt; height: Pt }, exact: boolean): IFrameOptions {
  return {
    type: 'absolute',
    // Word drops a frame past an edge and clips one that overhangs, so y is capped at the foot, never raised.
    position: { x: tw(clamp(rect.x, 0, page.width - 1)), y: tw(Math.min(rect.y, page.height - 1)) },
    width: tw(rect.w),
    height: tw(rect.h),
    anchor: { horizontal: 'page', vertical: 'page' },
    wrap: 'none',
    rule: exact ? 'exact' : 'auto',
    anchorLock: true,
    space: { horizontal: 0, vertical: 0 },
  };
}

function textFrames(docx: Docx, layout: PageLayout): Paragraph[] {
  const { facts } = layout;
  const leading = leadings(layout.lines);
  const out: Paragraph[] = [];

  for (const line of layout.lines) {
    const lead = leading.get(line) ?? 0;

    for (const box of boxesOf(line, layout.fonts)) {
      const runs = boxRuns(box, layout);
      if (runs.length === 0) continue;

      const heightPt = Math.max(box.size * 1.2, lead, box.size + 1);
      const children: ParagraphChild[] = runsFor({ runs }, layout.fonts, {
        bodyFamily: layout.bodyFamily,
      }).map((emitted) => {
        const run = new docx.TextRun(emitted.options);
        return emitted.href
          ? new docx.ExternalHyperlink({ link: emitted.href, children: [run] })
          : run;
      });

      out.push(
        new docx.Paragraph({
          // Never clamp the width to the page: clamping is what makes the text wrap.
          frame: frameFor(
            {
              x: box.x0,
              y: box.y - BASELINE_RATIO * heightPt,
              w: (box.x1 - box.x0) * FRAME_SLACK + FRAME_PAD,
              h: heightPt,
            },
            facts,
            false,
          ),
          spacing: { before: 0, after: 0, line: tw(heightPt), lineRule: 'exact' },
          indent: { left: 0, right: 0 },
          alignment: 'left',
          children,
        }),
      );
    }
  }

  return out;
}

function shadeFrame(
  docx: Docx,
  rect: Rect,
  colour: string,
  page: { width: Pt; height: Pt },
): Paragraph {
  return new docx.Paragraph({
    frame: frameFor(rect, page, true),
    spacing: { before: 0, after: 0, line: tw(rect.h), lineRule: 'exact' },
    indent: { left: 0, right: 0 },
    shading: { type: 'clear', fill: colour, color: 'auto' },
  });
}

/** A shaded box, not a paragraph border: measured, borders land 0.5–2.3 pt out and the two renderers disagree. */
function ruleFrame(docx: Docx, rule: RuleSeg, page: { width: Pt; height: Pt }): Paragraph {
  const thickness = Math.max(rule.thickness, MIN_RULE);
  const rect: Rect =
    rule.axis === 'h'
      ? { x: rule.from, y: rule.at - thickness / 2, w: rule.to - rule.from, h: thickness }
      : { x: rule.at - thickness / 2, y: rule.from, w: thickness, h: rule.to - rule.from };
  return shadeFrame(docx, rect, hex(rule.colour), page);
}

function fillFrame(docx: Docx, fill: FillBox, page: { width: Pt; height: Pt }): Paragraph {
  return shadeFrame(docx, fill.rect, hex(fill.colour, 'FFFFFF'), page);
}

function overlapsText(rect: Rect, lines: readonly Line[]): boolean {
  return lines.some(
    (line) =>
      line.x1 > rect.x &&
      line.x0 < rect.x + rect.w &&
      line.y > rect.y &&
      line.y - line.size < rect.y + rect.h,
  );
}

function pictureParagraph(docx: Docx, pictures: readonly ExactImage[], lines: readonly Line[]): Paragraph {
  const children = pictures.map(
    (picture) =>
      new docx.ImageRun({
        type: picture.type,
        data: picture.data,
        transformation: {
          width: px96(picture.rect.w),
          height: px96(picture.rect.h),
          ...(picture.rotationDeg ? { rotation: Math.round(picture.rotationDeg) } : {}),
        },
        floating: {
          horizontalPosition: { relative: 'page', offset: emu(picture.rect.x) },
          verticalPosition: { relative: 'page', offset: emu(picture.rect.y) },
          wrap: { type: 0 },
          behindDocument: picture.behind ?? overlapsText(picture.rect, lines),
          allowOverlap: true,
        },
      }),
  );

  return new docx.Paragraph({
    spacing: { before: 0, after: 0, line: tw(FLOW_LINE), lineRule: 'exact' },
    children,
  });
}

function picturesFor(layout: PageLayout, opts: WordOptions): ExactImage[] {
  if (opts.imagesForScannedPages === false) return [...layout.images];
  const { raster, width, height } = layout.facts;
  // The page raster already contains every image on the page, so the placements are redundant.
  if (raster) {
    return [{ rect: { x: 0, y: 0, w: width, h: height }, data: raster.bytes, type: raster.type, behind: true }];
  }
  return [...layout.images];
}

function sectionFor(docx: Docx, layout: PageLayout, opts: WordOptions): ISectionOptions {
  const { facts } = layout;
  const pictures = picturesFor(layout, opts);
  const frameCount = boxCount(layout.lines, layout.fonts) + facts.rules.length + facts.fills.length;
  // Thousands of frames is what this cap exists to prevent; take the page picture instead.
  const degraded = frameCount > MAX_FRAMES_PER_PAGE && facts.raster !== undefined;
  const framed = facts.cls !== 'imageOnly' && !degraded;

  const children: Paragraph[] = [];
  if (pictures.length > 0) children.push(pictureParagraph(docx, pictures, framed ? layout.lines : []));
  else if (!framed) {
    children.push(
      new docx.Paragraph({
        alignment: 'center',
        spacing: { before: 0, after: 0 },
        children: [
          new docx.TextRun({
            text: placeholderLine(facts.pageNumber, facts.degradeReason),
            font: layout.bodyFamily,
          }),
        ],
      }),
    );
  }

  if (framed) {
    for (const fill of facts.fills) children.push(fillFrame(docx, fill, facts));
    for (const rule of facts.rules) children.push(ruleFrame(docx, rule, facts));
    children.push(...textFrames(docx, layout));
  }

  children.push(
    new docx.Paragraph({ spacing: { before: 0, after: 0, line: tw(FLOW_LINE), lineRule: 'exact' } }),
  );

  return {
    properties: {
      type: 'nextPage',
      page: {
        size: pageSizeFor({ widthPt: facts.width, heightPt: facts.height }),
        margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
      },
    },
    children,
  };
}

export async function exactSections(
  layouts: readonly PageLayout[],
  opts: WordOptions,
): Promise<ISectionOptions[]> {
  const docx = await import('docx');
  return layouts.map((layout) => sectionFor(docx, layout, opts));
}
