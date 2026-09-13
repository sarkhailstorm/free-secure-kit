/**
 * Structural format detection.
 *
 * Order matters far more than cleverness here. A plain CSV file is *also*
 * valid YAML (every line becomes a scalar), so YAML can only ever be the last
 * resort. JSON is checked first because `JSON.parse` succeeding on something
 * that starts with a brace or bracket is as close to proof as we get.
 *
 * The file extension is used only to break ties — never to decide outright.
 */

import type { Confidence, DataFormat } from './types';

type PapaModule = typeof import('papaparse');
type YamlModule = typeof import('js-yaml');

export interface Detection {
  format: DataFormat;
  confidence: Confidence;
}

/** Delimiters we accept as evidence of a real table. */
const TABLE_DELIMITERS = [',', '\t', ';', '|'];

/**
 * Lines that look like YAML: a comment, a document marker, a `- ` list item,
 * or `key:` followed by whitespace or end-of-line. Deliberately refuses to
 * match across a comma/semicolon/pipe, so `Ada,10:30` is not counted.
 */
const YAML_LINE_RE = /^\s*(?:#|-{3}\s*$|\.{3}\s*$|-(?:\s|$)|[^\s,;|][^,;|]{0,200}?:(?:\s|$))/;

/** Extensions map to a preferred format, used only when evidence is thin. */
const EXTENSION_FORMAT: Record<string, DataFormat> = {
  json: 'json',
  csv: 'csv',
  tsv: 'csv',
  yaml: 'yaml',
  yml: 'yaml',
};

function hintFormat(hint?: string): DataFormat | null {
  if (!hint) return null;
  return EXTENSION_FORMAT[hint.toLowerCase()] ?? null;
}

/** Take a sample that never ends mid-line, so field counts stay honest. */
function sampleLines(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastBreak = cut.lastIndexOf('\n');
  return lastBreak > 0 ? cut.slice(0, lastBreak) : cut;
}

interface LineShape {
  /** Fraction of sampled lines that look like YAML. */
  ratio: number;
  /** How many non-empty lines were sampled. */
  count: number;
  /** The first non-empty line, trimmed. */
  first: string;
}

function lineShape(text: string): LineShape {
  const lines = sampleLines(text, 32_000)
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
    .slice(0, 40);
  if (lines.length === 0) return { ratio: 0, count: 0, first: '' };
  const matches = lines.filter((line) => YAML_LINE_RE.test(line)).length;
  return { ratio: matches / lines.length, count: lines.length, first: lines[0].trim() };
}

/**
 * Could this line be the header of a one-column table? A lone column name is
 * a short, space-free token — `email`, `sku`, `order_id`. Prose is not.
 */
function looksLikeLoneHeader(line: string): boolean {
  return line !== '' && line.length <= 64 && !/\s/.test(line);
}

/**
 * Does this look like a delimited table? We want a guessable delimiter, at
 * least two columns, and rows that mostly agree on how many columns there are.
 */
function looksLikeTable(text: string, papa: PapaModule, lenient: boolean): boolean {
  let rows: string[][];
  let delimiter: string;
  try {
    const result = papa.parse<string[]>(sampleLines(text, 64_000), {
      header: false,
      skipEmptyLines: 'greedy',
      preview: 25,
    });
    if (result.errors.some((e) => e.code === 'UndetectableDelimiter')) return false;
    rows = result.data;
    delimiter = result.meta.delimiter;
  } catch {
    return false;
  }

  if (!TABLE_DELIMITERS.includes(delimiter)) return false;

  const minRows = lenient ? 1 : 2;
  const minColumns = lenient ? 1 : 2;
  if (rows.length < minRows) return false;

  const width = rows[0].length;
  if (width < minColumns) return false;

  const agreeing = rows.filter((row) => row.length === width).length;
  return agreeing / rows.length >= 0.8;
}

interface YamlProbe {
  ok: boolean;
  /**
   * True when the whole document collapsed to one plain string — which is what
   * YAML does to a single-column CSV, folding every line into one scalar.
   */
  foldedScalar: boolean;
}

function parsesAsYaml(text: string, yaml: YamlModule): YamlProbe {
  try {
    const documents = yaml.loadAll(text);
    return {
      ok: true,
      foldedScalar: documents.length === 1 && typeof documents[0] === 'string',
    };
  } catch {
    return { ok: false, foldedScalar: false };
  }
}

/** Trimmed text that opens and closes like a JSON document. */
function hasJsonShape(trimmed: string): boolean {
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === '{' && last === '}') || (first === '[' && last === ']');
}

export function detectFormat(
  text: string,
  papa: PapaModule,
  yaml: YamlModule,
  hint?: string,
): Detection {
  const trimmed = text.trim();
  const preferred = hintFormat(hint);

  if (trimmed === '') {
    return { format: preferred ?? 'json', confidence: 'low' };
  }

  // 1. JSON — the only format with a parser strict enough to be trusted.
  try {
    JSON.parse(text);
    return { format: 'json', confidence: hasJsonShape(trimmed) ? 'high' : 'medium' };
  } catch {
    // not JSON; keep looking
  }

  const shape = lineShape(text);
  const yamlish = shape.ratio;
  const lenient = preferred === 'csv';
  const tabular = looksLikeTable(text, papa, lenient);

  // 2. CSV — must come before YAML, because CSV usually parses as YAML too.
  if (tabular && yamlish < 0.5) {
    return { format: 'csv', confidence: yamlish < 0.2 ? 'high' : 'medium' };
  }

  // 3. Broken JSON. `{"a": 1,}` is also a legal YAML flow mapping, so without
  //    this step YAML would quietly swallow it and the author would never see
  //    the comma they left behind. Braces almost always mean JSON was meant.
  if (hasJsonShape(trimmed)) return { format: 'json', confidence: 'low' };

  // 3b. A one-column .csv/.tsv has no delimiter to find, so there is no
  //     structural evidence left and the extension is all we have. It still
  //     beats YAML, which would fold the whole file into a single string.
  if (preferred === 'csv' && yamlish < 0.5) {
    return { format: 'csv', confidence: 'medium' };
  }

  // 4. YAML. Skip the probe on very large documents; line shape is enough.
  if (text.length > 512_000) {
    if (yamlish >= 0.5) return { format: 'yaml', confidence: 'high' };
  } else {
    const probe = parsesAsYaml(text, yaml);
    if (probe.ok) {
      // A single-column list of values is valid YAML — and reading it that way
      // glues every line into one long string, which is never what was meant.
      if (
        probe.foldedScalar &&
        yamlish < 0.2 &&
        shape.count >= 2 &&
        looksLikeLoneHeader(shape.first)
      ) {
        return { format: 'csv', confidence: 'low' };
      }
      return { format: 'yaml', confidence: yamlish >= 0.5 ? 'high' : 'medium' };
    }
  }

  // 5. Nothing parsed.
  if (tabular) return { format: 'csv', confidence: 'low' };
  // An opening brace or bracket almost always means truncated JSON. Saying so
  // gets the author "this array is never closed" instead of a YAML complaint
  // about a flow collection they never knowingly wrote.
  if (trimmed[0] === '{' || trimmed[0] === '[') return { format: 'json', confidence: 'low' };
  // Fall back to whatever the file extension suggested.
  return { format: preferred ?? 'yaml', confidence: 'low' };
}
