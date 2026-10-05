export type CaseId =
  | 'upper'
  | 'lower'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'toggle';

export interface CaseDefinition {
  id: CaseId;
  label: string;
  example: string;
}

export const CASES: readonly CaseDefinition[] = [
  { id: 'upper', label: 'UPPERCASE', example: 'HELLO WORLD' },
  { id: 'lower', label: 'lowercase', example: 'hello world' },
  { id: 'title', label: 'Title Case', example: 'The Lord of the Rings' },
  { id: 'sentence', label: 'Sentence case', example: 'Hello world. Bye now.' },
  { id: 'camel', label: 'camelCase', example: 'helloWorld' },
  { id: 'pascal', label: 'PascalCase', example: 'HelloWorld' },
  { id: 'snake', label: 'snake_case', example: 'hello_world' },
  { id: 'kebab', label: 'kebab-case', example: 'hello-world' },
  { id: 'constant', label: 'CONSTANT_CASE', example: 'HELLO_WORLD' },
  { id: 'toggle', label: 'iNVERT cASE', example: 'hELLO wORLD' },
] as const;

// "XMLHttpRequest" -> ["XML", "Http", "Request"]; digits stay with the letters they follow
export function tokenize(input: string): string[] {
  return input
    // ACRONYMFollowed -> ACRONYM Followed
    .replace(/(\p{Lu}|\p{N})(\p{Lu}\p{Ll})/gu, '$1 $2')
    // camelBoundary -> camel Boundary
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length > 0);
}

// Joining words that stay lowercase inside a title
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'from', 'if', 'in',
  'nor', 'of', 'off', 'on', 'or', 'per', 'so', 'the', 'to', 'up', 'v', 'via',
  'vs', 'with', 'yet',
]);

const SENTENCE_BREAK = /([.!?…]["'’”)\]]*\s+)/;

function capitalise(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

// Leaves the original line terminators, including a CRLF/LF/CR mixture, untouched
function mapLines(text: string, fn: (line: string) => string): string {
  return text
    .split(/(\r\n|\n|\r)/)
    .map((part, index) => (index % 2 === 0 ? fn(part) : part))
    .join('');
}

function splitIndent(line: string): [string, string] {
  const match = /^\s*/.exec(line);
  const indent = match ? match[0] : '';
  return [indent, line.slice(indent.length)];
}

// "XMLHttpRequest" becomes three words, while "don't" stays one
function expandWord(word: string): string[] {
  const looksLikeIdentifier =
    word.includes('_') ||
    /(?:\p{Ll}|\p{N})\p{Lu}/u.test(word) ||
    /\p{Lu}\p{Lu}\p{Ll}/u.test(word);
  if (!looksLikeIdentifier) return [word];
  const parts = tokenize(word);
  return parts.length > 0 ? parts : [word];
}

// Keeps punctuation and spacing intact; identifier-shaped words are expanded first
function rewriteWords(
  line: string,
  transform: (word: string, index: number, total: number) => string,
): string {
  const pattern = /[\p{L}\p{N}_'’]+/gu;
  const matches = Array.from(line.matchAll(pattern));

  // Count the real words first so the transform knows about first/last
  const expanded = matches.map((match) => expandWord(match[0]));
  const total = expanded.reduce((sum, parts) => sum + parts.length, 0);

  let out = '';
  let cursor = 0;
  let wordIndex = 0;

  matches.forEach((match, i) => {
    const start = match.index ?? 0;
    out += line.slice(cursor, start);
    out += expanded[i]
      .map((word) => transform(word, wordIndex++, total))
      .join(' ');
    cursor = start + match[0].length;
  });

  return out + line.slice(cursor);
}

function toTitleCase(text: string): string {
  return mapLines(text, (line) =>
    rewriteWords(line, (word, index, total) => {
      const lower = word.toLowerCase();
      const isEdge = index === 0 || index === total - 1;
      return !isEdge && SMALL_WORDS.has(lower) ? lower : capitalise(word);
    }),
  );
}

function toSentenceCase(text: string): string {
  return mapLines(text, (line) => {
    const lowered = rewriteWords(line, (word) => word.toLowerCase());
    // Each line starts a sentence; so does anything after . ! ? or an ellipsis
    return lowered
      .split(SENTENCE_BREAK)
      .map((chunk, index) => (index % 2 === 0 ? upperFirstLetter(chunk) : chunk))
      .join('');
  });
}

// Skips any leading punctuation to find the first letter
function upperFirstLetter(chunk: string): string {
  const match = /\p{L}/u.exec(chunk);
  if (!match || match.index === undefined) return chunk;
  const i = match.index;
  return chunk.slice(0, i) + chunk[i].toUpperCase() + chunk.slice(i + 1);
}

function toProgrammerCase(
  text: string,
  join: (tokens: string[]) => string,
): string {
  return mapLines(text, (line) => {
    const [indent, body] = splitIndent(line);
    const tokens = tokenize(body);
    if (tokens.length === 0) return line;
    return indent + join(tokens);
  });
}

function toggleCase(text: string): string {
  let out = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    const upper = char.toUpperCase();
    out += char === lower && char !== upper ? upper : char === upper && char !== lower ? lower : char;
  }
  return out;
}

export function convertCase(text: string, id: CaseId): string {
  if (text.length === 0) return text;

  switch (id) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return toTitleCase(text);
    case 'sentence':
      return toSentenceCase(text);
    case 'camel':
      return toProgrammerCase(text, (tokens) =>
        tokens.map((t, i) => (i === 0 ? t.toLowerCase() : capitalise(t))).join(''),
      );
    case 'pascal':
      return toProgrammerCase(text, (tokens) => tokens.map(capitalise).join(''));
    case 'snake':
      return toProgrammerCase(text, (tokens) => tokens.map((t) => t.toLowerCase()).join('_'));
    case 'kebab':
      return toProgrammerCase(text, (tokens) => tokens.map((t) => t.toLowerCase()).join('-'));
    case 'constant':
      return toProgrammerCase(text, (tokens) => tokens.map((t) => t.toUpperCase()).join('_'));
    case 'toggle':
      return toggleCase(text);
    default:
      return text;
  }
}

export interface TextCounts {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
}

const WORD_PATTERN = /[\p{L}\p{N}'’]+/gu;

// The characters JavaScript's `\s` matches, tested without building a string
function isSpaceCode(code: number): boolean {
  return (
    code === 0x20 ||
    (code >= 0x09 && code <= 0x0d) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

export function countText(text: string): TextCounts {
  const characters = text.length;
  if (characters === 0) {
    return { characters: 0, charactersNoSpaces: 0, words: 0, lines: 0 };
  }

  let charactersNoSpaces = 0;
  let lines = 1;
  for (let i = 0; i < characters; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x0a) {
      lines += 1;
    } else if (code === 0x0d) {
      lines += 1;
      // CRLF is one break, not two
      if (text.charCodeAt(i + 1) === 0x0a) i += 1;
    } else if (!isSpaceCode(code)) {
      charactersNoSpaces += 1;
    }
  }

  // Counted rather than collected: building the array of words is the expensive part
  let words = 0;
  WORD_PATTERN.lastIndex = 0;
  while (WORD_PATTERN.exec(text) !== null) words += 1;

  return { characters, charactersNoSpaces, words, lines };
}
