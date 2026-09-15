import type { ConversionNote, DegradeReason } from './types';

/** Past four groups, a page list stops informing and starts being a wall of numbers. */
const MAX_NAMED_GROUPS = 4;

function join(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Runs of three or more consecutive pages read better as a range. */
function groupPages(sorted: readonly number[]): { label: string; size: number }[] {
  const groups: { label: string; size: number }[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const size = j - i + 1;
    if (size >= 3) {
      groups.push({ label: `${sorted[i]} to ${sorted[j]}`, size });
      i = j + 1;
    } else {
      groups.push({ label: String(sorted[i]), size: 1 });
      i++;
    }
  }
  return groups;
}

/** 'page 3', 'pages 4 and 7', 'pages 1 to 8', 'pages 1, 3, 5 and 4 others', 'some pages'. */
function pageRef(list: readonly number[]): { ref: string; many: boolean } {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  if (sorted.length === 0) return { ref: 'some pages', many: true };
  if (sorted.length === 1) return { ref: `page ${sorted[0]}`, many: false };

  const groups = groupPages(sorted);
  if (groups.length <= MAX_NAMED_GROUPS) {
    return { ref: `pages ${join(groups.map((g) => g.label))}`, many: true };
  }
  const named = groups.slice(0, MAX_NAMED_GROUPS - 1);
  const rest = sorted.length - named.reduce((n, g) => n + g.size, 0);
  return {
    ref: `pages ${join([...named.map((g) => g.label), `${rest} others`])}`,
    many: true,
  };
}

const up = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const count = (n: number, one: string, more: string): string =>
  n === 1 ? `One ${one}` : `${n} ${more}`;

/** The union is closed, so this only compiles while every code has a sentence. */
function exhausted(note: never): string {
  void note;
  return 'Part of this PDF couldn’t be carried over into Word.';
}

/** Stands in for a page no picture could be made of, so the reader is told what is missing. */
export function placeholderLine(pageNumber: number, reason: DegradeReason | undefined): string {
  return reason === 'no-text' || reason === 'invisible-text-only'
    ? `Page ${pageNumber} was a scan, so it isn’t included.`
    : `Page ${pageNumber} of the original couldn’t be carried over.`;
}

function rasterSentence(
  ref: string,
  many: boolean,
  reason: DegradeReason,
  pictured: boolean,
): string {
  const tail = pictured
    ? `so ${many ? 'they’ve' : 'it’s'} gone in as ${many ? 'pictures' : 'a picture'}.`
    : `so ${many ? 'they’re' : 'it’s'} not in your Word file.`;
  switch (reason) {
    case 'no-text':
      return `${up(ref)} had no text on ${many ? 'them' : 'it'}, ${tail}`;
    case 'invisible-text-only':
      return `The text on ${ref} was hidden in the PDF, ${tail}`;
    case 'too-many-runs':
    case 'too-many-lines':
      return `${up(ref)} had far too much on ${many ? 'them' : 'it'} to rebuild, ${tail}`;
    case 'vector-art':
      return `${up(ref)} ${many ? 'contain' : 'contains'} drawings Word can’t redraw, ${tail}`;
    case 'rotated-text':
      return `Most of the text on ${ref} runs sideways, ${tail}`;
    case 'columns-failed':
      return `The layout of ${ref} couldn’t be worked out, ${tail}`;
    default:
      return exhausted(reason);
  }
}

export function describeNote(note: ConversionNote): string {
  switch (note.code) {
    case 'scannedPages': {
      const { ref, many } = pageRef(note.pages);
      if (!note.pictured) {
        return `${up(ref)} ${many ? 'are scans' : 'is a scan'}, and no picture went in, so ${many ? 'they’re' : 'it’s'} blank in your Word file.`;
      }
      return `${up(ref)} ${many ? 'are scans' : 'is a scan'}, so ${many ? 'they’ve' : 'it’s'} gone in as ${many ? 'pictures' : 'a picture'} — you can’t edit or search the words.`;
    }

    case 'ocrLayerUsed': {
      const { ref, many } = pageRef(note.pages);
      return `${up(ref)} ${many ? 'are scans' : 'is a scan'} that already had text stored with ${many ? 'them' : 'it'}. We’ve used that text, so a few words may be wrong.`;
    }

    case 'symbolicDropped': {
      const { ref } = pageRef(note.pages);
      return `A few symbols on ${ref} couldn’t be worked out, so they’ve been left out.`;
    }

    case 'missingFont': {
      if (!note.psName) {
        return 'Some fonts weren’t stored inside this PDF, so Word will use the closest match it has. Line breaks may fall in slightly different places.';
      }
      return `The font “${note.psName}” wasn’t stored inside this PDF, so Word will use ${note.family} instead. Line breaks may fall in slightly different places.`;
    }

    case 'vectorDropped': {
      const { ref } = pageRef(note.pages);
      const many = note.count !== 1;
      return `${count(note.count, 'drawing', 'drawings')} on ${ref} couldn’t be rebuilt in Word, so ${many ? 'they’ve' : 'it’s'} been left out.`;
    }

    case 'rotatedText': {
      const { ref, many } = pageRef(note.pages);
      return `${up(ref)} ${many ? 'have' : 'has'} sideways text that couldn’t be carried over.`;
    }

    case 'columnsFlattened': {
      const { ref } = pageRef(note.pages);
      return `The columns on ${ref} didn’t line up cleanly, so the lines have been kept in the order they appear.`;
    }

    case 'tabColumns': {
      const { ref } = pageRef(note.pages);
      return `Columns on ${ref} are lined up with tabs, not a table — fine to read, harder to edit.`;
    }

    case 'tableGuessed': {
      const { ref } = pageRef(note.pages);
      const many = note.count !== 1;
      return `${count(note.count, 'table', 'tables')} on ${ref} ${many ? 'were' : 'was'} worked out from the lines drawn on the page. Please check the columns.`;
    }

    case 'imageDownscaled':
      return `${count(note.count, 'picture was', 'pictures were')} made smaller to keep the Word file down.`;

    case 'imagesDropped':
      return `${count(note.count, 'picture was', 'pictures were')} left out to keep the Word file down.`;

    case 'rasterPage': {
      const { ref, many } = pageRef(note.pages);
      return rasterSentence(ref, many, note.reason, note.pictured);
    }

    case 'pageFailed': {
      const { ref, many } = pageRef(note.pages);
      return `${up(ref)} of the original couldn’t be read, so ${many ? 'they aren’t' : 'it isn’t'} in your Word file.`;
    }

    case 'untagged': {
      const { ref } = pageRef(note.pages);
      return `This PDF doesn’t say which lines on ${ref} are headings or lists, so we guessed. Please check them.`;
    }

    case 'rtl': {
      if (note.pages.length === 0) {
        return 'This document contains right-to-left text — please check it reads correctly.';
      }
      const { ref, many } = pageRef(note.pages);
      return `${up(ref)} ${many ? 'contain' : 'contains'} right-to-left text — please check ${many ? 'they read' : 'it reads'} correctly.`;
    }

    default:
      return exhausted(note);
  }
}
