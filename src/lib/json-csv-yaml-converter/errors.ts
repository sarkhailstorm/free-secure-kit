import type { ConvertError } from './types';

// Line and column come back 1-based
export function lineColumnAt(text: string, index: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < clamped; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lastBreak = i;
    }
  }
  return { line, column: clamped - lastBreak };
}

interface Fault {
  index: number;
  message: string;
}

interface Scanner {
  text: string;
  pos: number;
}

// Deep enough for any real document, shallow enough not to blow the stack
const MAX_SCAN_DEPTH = 400;

const VALID_ESCAPES = '"\\/bfnrtu';
const NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const HEX4_RE = /^[0-9a-fA-F]{4}$/;

function describeChar(char: string | undefined): string {
  if (char === undefined) return 'the end of the document';
  if (char === '\n' || char === '\r') return 'a line break';
  if (char === '\t') return 'a tab';
  if (char === ' ') return 'a space';
  return `"${char}"`;
}

function skipWhitespace(s: Scanner): void {
  while (s.pos < s.text.length) {
    const char = s.text[s.pos];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') s.pos += 1;
    else break;
  }
}

function scanString(s: Scanner): Fault | null {
  const start = s.pos;
  s.pos += 1; // opening quote

  while (s.pos < s.text.length) {
    const char = s.text[s.pos];

    if (char === '"') {
      s.pos += 1;
      return null;
    }

    if (char === '\\') {
      s.pos += 1;
      if (s.pos >= s.text.length) break;
      const escape = s.text[s.pos];
      if (!VALID_ESCAPES.includes(escape)) {
        return { index: s.pos, message: `\\${escape} is not a valid escape inside a string` };
      }
      if (escape === 'u') {
        if (!HEX4_RE.test(s.text.slice(s.pos + 1, s.pos + 5))) {
          return { index: s.pos, message: 'A \\u escape needs exactly four hex digits' };
        }
        s.pos += 4;
      }
      s.pos += 1;
      continue;
    }

    if (s.text.charCodeAt(s.pos) < 0x20) {
      return {
        index: s.pos,
        message: 'A line break or control character inside a string has to be escaped',
      };
    }

    s.pos += 1;
  }

  return { index: start, message: 'This string is never closed' };
}

function scanNumber(s: Scanner): Fault | null {
  NUMBER_RE.lastIndex = s.pos;
  const match = NUMBER_RE.exec(s.text);
  if (!match || match.index !== s.pos || match[0].length === 0) {
    return { index: s.pos, message: 'This is not a valid number' };
  }
  s.pos += match[0].length;
  return null;
}

function scanObject(s: Scanner, depth: number): Fault | null {
  const open = s.pos;
  s.pos += 1;
  skipWhitespace(s);

  if (s.text[s.pos] === '}') {
    s.pos += 1;
    return null;
  }

  for (;;) {
    skipWhitespace(s);
    if (s.pos >= s.text.length) return { index: open, message: 'This object is never closed' };

    if (s.text[s.pos] !== '"') {
      return {
        index: s.pos,
        message: `Expected a double-quoted property name but found ${describeChar(s.text[s.pos])}`,
      };
    }

    const nameFault = scanString(s);
    if (nameFault) return nameFault;

    skipWhitespace(s);
    if (s.text[s.pos] !== ':') {
      return {
        index: s.pos,
        message: `Expected ":" after the property name but found ${describeChar(s.text[s.pos])}`,
      };
    }
    s.pos += 1;

    const valueFault = scanValue(s, depth + 1);
    if (valueFault) return valueFault;

    skipWhitespace(s);
    const char = s.text[s.pos];
    if (char === ',') {
      s.pos += 1;
      continue;
    }
    if (char === '}') {
      s.pos += 1;
      return null;
    }
    if (s.pos >= s.text.length) return { index: open, message: 'This object is never closed' };
    return { index: s.pos, message: `Expected "," or "}" but found ${describeChar(char)}` };
  }
}

function scanArray(s: Scanner, depth: number): Fault | null {
  const open = s.pos;
  s.pos += 1;
  skipWhitespace(s);

  if (s.text[s.pos] === ']') {
    s.pos += 1;
    return null;
  }

  for (;;) {
    const itemFault = scanValue(s, depth + 1);
    if (itemFault) return itemFault;

    skipWhitespace(s);
    const char = s.text[s.pos];
    if (char === ',') {
      s.pos += 1;
      continue;
    }
    if (char === ']') {
      s.pos += 1;
      return null;
    }
    if (s.pos >= s.text.length) return { index: open, message: 'This array is never closed' };
    return { index: s.pos, message: `Expected "," or "]" but found ${describeChar(char)}` };
  }
}

function scanValue(s: Scanner, depth: number): Fault | null {
  if (depth > MAX_SCAN_DEPTH) {
    return { index: s.pos, message: 'The document is nested too deeply to read' };
  }

  skipWhitespace(s);
  if (s.pos >= s.text.length) {
    return { index: s.pos, message: 'The document ends before this value is finished' };
  }

  const char = s.text[s.pos];
  if (char === '{') return scanObject(s, depth);
  if (char === '[') return scanArray(s, depth);
  if (char === '"') return scanString(s);
  if (char === '-' || (char >= '0' && char <= '9')) return scanNumber(s);

  if (s.text.startsWith('true', s.pos)) {
    s.pos += 4;
    return null;
  }
  if (s.text.startsWith('false', s.pos)) {
    s.pos += 5;
    return null;
  }
  if (s.text.startsWith('null', s.pos)) {
    s.pos += 4;
    return null;
  }

  return { index: s.pos, message: `Expected a value but found ${describeChar(char)}` };
}

function locateJsonFault(text: string): Fault | null {
  const scanner: Scanner = { text, pos: 0 };

  skipWhitespace(scanner);
  if (scanner.pos >= text.length) return { index: 0, message: 'There is nothing to parse' };

  const fault = scanValue(scanner, 0);
  if (fault) return fault;

  skipWhitespace(scanner);
  if (scanner.pos < text.length) {
    return {
      index: scanner.pos,
      message: `Unexpected ${describeChar(text[scanner.pos])} after the end of the document`,
    };
  }

  return null;
}

function tidy(message: string): string {
  const cleaned = message
    // V8 sometimes echoes the whole document back: "…, "{…}" is not valid JSON"
    .replace(/,\s[\s\S]*?is not valid JSON\.?$/, '')
    .replace(/\s*is not valid JSON\.?$/, '')
    .replace(/^JSON\.parse:\s*/i, '')
    .replace(/^JSON Parse error:\s*/i, '')
    .replace(/\s*in JSON at position \d+(\s*\(line \d+ column \d+\))?/i, '')
    .replace(/\s*at line \d+ column \d+ of the JSON data/i, '')
    .replace(/\s*of the JSON data$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;]+$/, '');
  if (!cleaned) return 'The document could not be parsed';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown parsing error';
}

export function describeJsonError(error: unknown, text: string): ConvertError {
  const fault = locateJsonFault(text);
  if (fault) {
    const { line, column } = lineColumnAt(text, fault.index);
    return { message: fault.message, line, column };
  }

  // The scanner above and the real parser disagree, so trust the parser's words
  const raw = errorMessage(error);

  const explicit = /line (\d+) column (\d+)/i.exec(raw);
  if (explicit) {
    return { message: tidy(raw), line: Number(explicit[1]), column: Number(explicit[2]) };
  }

  const position = /position (\d+)/i.exec(raw);
  if (position) {
    const { line, column } = lineColumnAt(text, Number(position[1]));
    return { message: tidy(raw), line, column };
  }

  return { message: tidy(raw), line: null, column: null };
}

interface YamlMark {
  line: number;
  column: number;
}

// js-yaml throws a YAMLException; match it structurally, not by identity
function readYamlMark(error: unknown): { reason: string; mark: YamlMark | null } | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { reason?: unknown; mark?: unknown };
  if (typeof candidate.reason !== 'string') return null;

  let mark: YamlMark | null = null;
  if (typeof candidate.mark === 'object' && candidate.mark !== null) {
    const raw = candidate.mark as { line?: unknown; column?: unknown };
    if (typeof raw.line === 'number' && typeof raw.column === 'number') {
      // js-yaml counts from zero
      mark = { line: raw.line + 1, column: raw.column + 1 };
    }
  }
  return { reason: candidate.reason, mark };
}

export function describeYamlError(error: unknown): ConvertError {
  const parsed = readYamlMark(error);
  if (parsed) {
    return {
      message: tidy(parsed.reason),
      line: parsed.mark?.line ?? null,
      column: parsed.mark?.column ?? null,
    };
  }
  return { message: tidy(errorMessage(error)), line: null, column: null };
}

export function describeUnknownError(error: unknown): ConvertError {
  return { message: tidy(errorMessage(error)), line: null, column: null };
}

export function formatPosition(error: ConvertError): string {
  if (error.line === null) return '';
  if (error.column === null) return `line ${error.line}`;
  return `line ${error.line}, column ${error.column}`;
}
