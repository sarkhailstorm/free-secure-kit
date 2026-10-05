import { plural } from '@/lib/format';

export type TabMode = 'off' | 'tabs-to-spaces' | 'spaces-to-tabs';
export type LineEndingMode = 'off' | 'lf' | 'crlf';

export interface WhitespaceOptions {
  stripInvisible: boolean;
  normaliseSpaces: boolean;
  trimTrailing: boolean;
  trimLeading: boolean;
  collapseSpaces: boolean;
  tabs: TabMode;
  tabWidth: number;
  collapseBlankLines: boolean;
  maxBlankLines: number;
  removeBlankLines: boolean;
  lineEndings: LineEndingMode;
}

export const DEFAULT_WHITESPACE_OPTIONS: WhitespaceOptions = {
  stripInvisible: true,
  normaliseSpaces: true,
  trimTrailing: true,
  trimLeading: false,
  collapseSpaces: false,
  tabs: 'off',
  tabWidth: 2,
  collapseBlankLines: true,
  maxBlankLines: 1,
  removeBlankLines: false,
  lineEndings: 'off',
};

export interface WhitespaceNote {
  id: string;
  count: number;
  // A finished sentence, ready to show as-is
  text: string;
}

export interface WhitespaceResult {
  output: string;
  notes: WhitespaceNote[];
  before: { characters: number; lines: number };
  after: { characters: number; lines: number };
}

// Zero-width, bidi and other formatting characters that render as nothing
const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

// Control characters that are not tab, newline or carriage return
const STRAY_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Space-like characters that are not a plain ASCII space
const ODD_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r\n|\n|\r/).length;
}

// Expands to the next tab stop like an editor, not to a fixed run of spaces
function expandTabs(line: string, width: number): string {
  if (!line.includes('\t')) return line;
  const stop = Math.max(1, width);
  let out = '';
  let column = 0;
  for (const char of line) {
    if (char === '\t') {
      const span = stop - (column % stop);
      out += ' '.repeat(span);
      column += span;
    } else {
      out += char;
      column += 1;
    }
  }
  return out;
}

// Only the indentation is touched, never runs of spaces inside the line
function contractIndent(line: string, width: number): string {
  const match = /^[ \t]+/.exec(line);
  if (!match) return line;
  const stop = Math.max(1, width);
  const indent = expandTabs(match[0], stop);
  const tabs = Math.floor(indent.length / stop);
  const remainder = indent.length % stop;
  return '\t'.repeat(tabs) + ' '.repeat(remainder) + line.slice(match[0].length);
}

export function cleanWhitespace(input: string, options: WhitespaceOptions): WhitespaceResult {
  const before = { characters: input.length, lines: countLines(input) };
  const notes: WhitespaceNote[] = [];

  if (input.length === 0) {
    return { output: '', notes, before, after: { characters: 0, lines: 0 } };
  }

  let text = input;

  if (options.stripInvisible) {
    const invisible = countMatches(text, INVISIBLE);
    const control = countMatches(text, STRAY_CONTROL);
    if (invisible > 0) {
      notes.push({
        id: 'invisible',
        count: invisible,
        text: `Removed ${plural(invisible, 'zero-width or direction-marker character')}`,
      });
    }
    if (control > 0) {
      notes.push({
        id: 'control',
        count: control,
        text: `Removed ${plural(control, 'stray control character')}`,
      });
    }
    text = text.replace(INVISIBLE, '').replace(STRAY_CONTROL, '');
  }

  if (options.normaliseSpaces) {
    const odd = countMatches(text, ODD_SPACES);
    if (odd > 0) {
      notes.push({
        id: 'odd-spaces',
        count: odd,
        text: `Replaced ${plural(odd, 'non-breaking or unusual space')} with a plain space`,
      });
    }
    text = text.replace(ODD_SPACES, ' ');
  }

  // Work in LF internally; the requested ending is applied at the very end
  const originalCrlf = countMatches(text, /\r\n/g);
  const loneLf = countMatches(text, /\n/g) - originalCrlf;
  const loneCr = countMatches(text, /\r/g) - originalCrlf;
  const wasAllCrlf = originalCrlf > 0 && loneLf === 0 && loneCr === 0;
  const wasMixed = [originalCrlf, loneLf, loneCr].filter((n) => n > 0).length > 1;

  let lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  if (options.tabs === 'tabs-to-spaces') {
    let converted = 0;
    lines = lines.map((line) => {
      converted += countMatches(line, /\t/g);
      return expandTabs(line, options.tabWidth);
    });
    if (converted > 0) {
      notes.push({
        id: 'tabs',
        count: converted,
        text: `Expanded ${plural(converted, 'tab')} into spaces`,
      });
    }
  } else if (options.tabs === 'spaces-to-tabs') {
    let converted = 0;
    lines = lines.map((line) => {
      const next = contractIndent(line, options.tabWidth);
      if (next !== line) converted += 1;
      return next;
    });
    if (converted > 0) {
      notes.push({
        id: 'indent',
        count: converted,
        text: `Re-indented ${plural(converted, 'line')} with tabs`,
      });
    }
  }

  if (options.trimTrailing) {
    let removed = 0;
    lines = lines.map((line) => {
      const next = line.replace(/[ \t]+$/, '');
      removed += line.length - next.length;
      return next;
    });
    if (removed > 0) {
      notes.push({
        id: 'trailing',
        count: removed,
        text: `Trimmed ${plural(removed, 'trailing whitespace character')}`,
      });
    }
  }

  if (options.trimLeading) {
    let removed = 0;
    lines = lines.map((line) => {
      const next = line.replace(/^[ \t]+/, '');
      removed += line.length - next.length;
      return next;
    });
    if (removed > 0) {
      notes.push({
        id: 'leading',
        count: removed,
        text: `Trimmed ${plural(removed, 'leading whitespace character')}`,
      });
    }
  }

  if (options.collapseSpaces) {
    let removed = 0;
    lines = lines.map((line) => {
      // Keep the indentation intact; only squeeze runs inside the line
      const match = /^[ \t]*/.exec(line);
      const indent = match ? match[0] : '';
      const body = line.slice(indent.length).replace(/[ \t]{2,}/g, ' ');
      removed += line.length - indent.length - body.length;
      return indent + body;
    });
    if (removed > 0) {
      notes.push({
        id: 'runs',
        count: removed,
        text: `Collapsed ${plural(removed, 'repeated space')}`,
      });
    }
  }

  const isBlank = (line: string) => line.trim().length === 0;

  if (options.removeBlankLines) {
    const removed = lines.filter(isBlank).length;
    lines = lines.filter((line) => !isBlank(line));
    if (removed > 0) {
      notes.push({
        id: 'blank',
        count: removed,
        text: `Removed ${plural(removed, 'blank line')}`,
      });
    }
  } else if (options.collapseBlankLines) {
    const max = Math.max(0, options.maxBlankLines);
    const kept: string[] = [];
    let run = 0;
    let removed = 0;
    for (const line of lines) {
      if (isBlank(line)) {
        run += 1;
        if (run <= max) kept.push(line);
        else removed += 1;
      } else {
        run = 0;
        kept.push(line);
      }
    }
    lines = kept;
    if (removed > 0) {
      notes.push({
        id: 'blank-run',
        count: removed,
        text: `Collapsed ${plural(removed, 'extra blank line')}`,
      });
    }
  }

  // A mixture cannot be preserved faithfully, so it settles on LF and says so
  const keepCrlf = options.lineEndings === 'crlf' || (options.lineEndings === 'off' && wasAllCrlf);
  const output = lines.join(keepCrlf ? '\r\n' : '\n');

  if (options.lineEndings === 'crlf' && !wasAllCrlf) {
    const breaks = Math.max(0, lines.length - 1);
    if (breaks > 0) {
      notes.push({
        id: 'endings',
        count: breaks,
        text: `Set ${plural(breaks, 'line ending')} to CRLF`,
      });
    }
  } else if (options.lineEndings === 'lf' && originalCrlf > 0) {
    notes.push({
      id: 'endings',
      count: originalCrlf,
      text: `Converted ${plural(originalCrlf, 'CRLF line ending')} to LF`,
    });
  } else if (options.lineEndings === 'off' && wasMixed) {
    notes.push({
      id: 'endings',
      count: originalCrlf + loneCr,
      text: 'Line endings were mixed, so they were all normalised to LF',
    });
  }

  return {
    output,
    notes,
    before,
    after: { characters: output.length, lines: countLines(output) },
  };
}

export interface InvisibleHit {
  line: number;
  column: number;
  code: string;
  name: string;
}

const INVISIBLE_NAMES: Readonly<Record<number, string>> = {
  0x00ad: 'Soft hyphen',
  0x00a0: 'No-break space',
  0x061c: 'Arabic letter mark',
  0x180e: 'Mongolian vowel separator',
  0x200b: 'Zero-width space',
  0x200c: 'Zero-width non-joiner',
  0x200d: 'Zero-width joiner',
  0x200e: 'Left-to-right mark',
  0x200f: 'Right-to-left mark',
  0x202f: 'Narrow no-break space',
  0x2060: 'Word joiner',
  0x3000: 'Ideographic space',
  0xfeff: 'Zero-width no-break space (BOM)',
};

// Line and column are 1-based
export function findInvisible(input: string, limit = 20): InvisibleHit[] {
  const hits: InvisibleHit[] = [];
  const pattern = new RegExp(
    `${INVISIBLE.source}|${ODD_SPACES.source}|${STRAY_CONTROL.source}`,
    'g',
  );
  let line = 1;
  let column = 1;

  for (let i = 0; i < input.length && hits.length < limit; i += 1) {
    const char = input[i];
    if (char === '\n') {
      line += 1;
      column = 1;
      continue;
    }
    if (char === '\r') continue;

    pattern.lastIndex = 0;
    if (pattern.test(char)) {
      const code = char.codePointAt(0) ?? 0;
      hits.push({
        line,
        column,
        code: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
        name: INVISIBLE_NAMES[code] ?? 'Invisible character',
      });
    }
    column += 1;
  }

  return hits;
}
