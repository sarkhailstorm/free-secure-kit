import type { IBorderOptions, IPageSizeAttributes, IRunOptions } from 'docx';
import { resolveFamily } from '../fonts';
import type { FontInfo, ParaBlock, Run, RuleSeg, Section } from '../types';
import { borderEighths, hex, hp, tw } from './units';

export interface RunOpts {
  /** Family a symbolic run falls back to when its block has no plain text to borrow from. */
  bodyFamily: string;
}

export interface EmittedRun {
  /** Ready for `new TextRun(...)`; a tab run carries no text, the caller adds `new Tab()`. */
  options: IRunOptions;
  tab: boolean;
  href: string | null;
}

/** Char-weighted family of the block's own real text — what a symbolic run borrows. */
function dominantFamily(
  runs: readonly Run[],
  fonts: ReadonlyMap<string, FontInfo>,
  fallback: string,
): string {
  const weights = new Map<string, number>();
  for (const run of runs) {
    if (run.tab) continue;
    const font = fonts.get(run.fontId);
    if (!font || font.symbolic) continue;
    const chars = run.text.trim().length;
    if (chars === 0) continue;
    weights.set(font.family, (weights.get(font.family) ?? 0) + chars);
  }

  let best = fallback;
  let top = 0;
  for (const [family, chars] of weights) {
    if (chars > top) {
      top = chars;
      best = family;
    }
  }
  return best;
}

export function runsFor(
  block: { runs: readonly Run[] },
  fonts: ReadonlyMap<string, FontInfo>,
  opts: RunOpts,
): EmittedRun[] {
  const blockFamily = dominantFamily(block.runs, fonts, opts.bodyFamily);

  return block.runs.map((run) => {
    const font = fonts.get(run.fontId);
    const options: IRunOptions = {
      ...(run.tab ? {} : { text: run.text }),
      // Never the symbolic face: Word reads the text back through its private encoding.
      font: font ? resolveFamily(font, blockFamily) : blockFamily,
      size: hp(run.size),
      bold: run.bold,
      italics: run.italic,
      color: hex(run.colour),
      ...(run.vertical === 'super' && { superScript: true }),
      ...(run.vertical === 'sub' && { subScript: true }),
    };
    return { options, tab: run.tab === true, href: run.href };
  });
}

export function pageSizeFor(section: Pick<Section, 'widthPt' | 'heightPt'>): IPageSizeAttributes {
  const landscape = section.widthPt > section.heightPt;
  // createPageSize swaps the pair itself under LANDSCAPE, so it always gets the portrait one.
  return {
    width: tw(Math.min(section.widthPt, section.heightPt)),
    height: tw(Math.max(section.widthPt, section.heightPt)),
    orientation: landscape ? 'landscape' : 'portrait',
  };
}

type BorderLike = Pick<RuleSeg, 'thickness' | 'colour'> | NonNullable<ParaBlock['bottomBorder']>;

export function borderFrom(rule: BorderLike): IBorderOptions {
  const thickness = 'thickness' in rule ? rule.thickness : rule.thicknessPt;
  return {
    style: 'single',
    size: borderEighths(thickness),
    space: 1,
    color: hex(rule.colour),
  };
}
