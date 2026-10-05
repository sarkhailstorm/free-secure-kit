import type { Confidence, DataFormat } from './types';

type PapaModule = typeof import('papaparse');
type YamlModule = typeof import('js-yaml');

export interface Detection {
  format: DataFormat;
  confidence: Confidence;
}

const TABLE_DELIMITERS = [',', '\t', ';', '|'];

// Never matches across a comma, semicolon or pipe, so `Ada,10:30` is not counted as YAML
const YAML_LINE_RE = /^\s*(?:#|-{3}\s*$|\.{3}\s*$|-(?:\s|$)|[^\s,;|][^,;|]{0,200}?:(?:\s|$))/;

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

// Cut at a line boundary, so field counts stay honest
function sampleLines(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastBreak = cut.lastIndexOf('\n');
  return lastBreak > 0 ? cut.slice(0, lastBreak) : cut;
}

interface LineShape {
  // Fraction 0–1 of sampled lines that look like YAML
  ratio: number;
  count: number;
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

// A lone column name is a short, space-free token like `email`; prose is not
function looksLikeLoneHeader(line: string): boolean {
  return line !== '' && line.length <= 64 && !/\s/.test(line);
}

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
  // Collapsed to one string, which is what YAML does to a single-column CSV
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

  // CSV must come before YAML, because CSV usually parses as YAML too
  if (tabular && yamlish < 0.5) {
    return { format: 'csv', confidence: yamlish < 0.2 ? 'high' : 'medium' };
  }

  // Broken JSON: `{"a": 1,}` is also a legal YAML flow mapping, and YAML would swallow it
  if (hasJsonShape(trimmed)) return { format: 'json', confidence: 'low' };

  // A one-column .csv has no delimiter to find, so the extension is all there is to go on
  if (preferred === 'csv' && yamlish < 0.5) {
    return { format: 'csv', confidence: 'medium' };
  }

  // Skip the probe on very large documents; line shape is enough
  if (text.length > 512_000) {
    if (yamlish >= 0.5) return { format: 'yaml', confidence: 'high' };
  } else {
    const probe = parsesAsYaml(text, yaml);
    if (probe.ok) {
      // Valid YAML, but folding a one-column list into one string is never what was meant
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

  if (tabular) return { format: 'csv', confidence: 'low' };
  // An opening brace or bracket almost always means truncated JSON, not YAML
  if (trimmed[0] === '{' || trimmed[0] === '[') return { format: 'json', confidence: 'low' };
  return { format: preferred ?? 'yaml', confidence: 'low' };
}
