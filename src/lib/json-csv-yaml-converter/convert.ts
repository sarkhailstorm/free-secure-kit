/**
 * The conversion pipeline: text in, text out, nothing else.
 *
 * Nothing in this file touches the network, the DOM or storage — the whole
 * point of the site is that your data never leaves the tab it was pasted into.
 * papaparse, js-yaml and highlight.js are imported lazily so they stay out of
 * the initial page bundle.
 */

import {
  cellToText,
  coerceCell,
  endsWithIndex,
  flattenTable,
  unflattenRecord,
} from './flatten';
import { detectFormat } from './detect';
import { describeJsonError, describeUnknownError, describeYamlError } from './errors';
import {
  MAX_DEPTH,
  utf8Bytes,
  type ConvertOutcome,
  type ConvertRequest,
  type DataFormat,
  type DataValue,
} from './types';

type PapaModule = typeof import('papaparse');
type YamlModule = typeof import('js-yaml');

/** Papaparse puts the overflow of a too-long row under this key. */
const EXTRA_FIELD = '__parsed_extra';

/* --------------------------------------------------------- lazy module load */

async function loadPapa(): Promise<PapaModule> {
  const mod = await import('papaparse');
  const bundled = (mod as unknown as { default?: PapaModule }).default;
  return bundled && typeof bundled.parse === 'function' ? bundled : (mod as unknown as PapaModule);
}

async function loadYaml(): Promise<YamlModule> {
  const mod = await import('js-yaml');
  const bundled = (mod as unknown as { default?: YamlModule }).default;
  return bundled && typeof bundled.load === 'function' ? bundled : (mod as unknown as YamlModule);
}

/* ------------------------------------------------------------- normalising */

interface NormaliseState {
  truncated: boolean;
  cyclic: boolean;
}

/**
 * Reduce whatever a parser handed back to the subset all three formats share.
 * YAML in particular can produce Dates, Infinity, Maps and — via anchors —
 * genuinely circular structures, any of which would otherwise crash
 * `JSON.stringify` or spin the flattener forever.
 */
function normalise(input: unknown, depth: number, onPath: Set<object>, state: NormaliseState): DataValue {
  if (input === null || input === undefined) return null;

  const kind = typeof input;
  if (kind === 'string') return input as string;
  if (kind === 'boolean') return input as boolean;
  if (kind === 'number') return input as number;
  if (kind === 'bigint') return String(input);
  if (kind !== 'object') return null;

  const value = input as object;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (value instanceof RegExp) return String(value);

  if (depth >= MAX_DEPTH) {
    state.truncated = true;
    return null;
  }
  if (onPath.has(value)) {
    state.cyclic = true;
    return null;
  }
  onPath.add(value);

  let result: DataValue;
  if (Array.isArray(value)) {
    result = value.map((item) => normalise(item, depth + 1, onPath, state));
  } else if (value instanceof Set) {
    result = Array.from(value, (item) => normalise(item, depth + 1, onPath, state));
  } else if (value instanceof Map) {
    const out: { [key: string]: DataValue } = {};
    value.forEach((item, key) => {
      out[String(key)] = normalise(item, depth + 1, onPath, state);
    });
    result = out;
  } else {
    const out: { [key: string]: DataValue } = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = normalise(item, depth + 1, onPath, state);
    }
    result = out;
  }

  onPath.delete(value);
  return result;
}

/* ----------------------------------------------------------------- parsing */

interface ParsedInput {
  value: DataValue;
  notes: string[];
  /** Kept for csv → csv, so re-formatting never rewrites a single cell. */
  table: { fields: string[]; rows: string[][] } | null;
}

/** Thrown for input we cannot parse; carries a message fit for the screen. */
class InputError extends Error {
  readonly line: number | null;
  readonly column: number | null;

  constructor(message: string, line: number | null = null, column: number | null = null) {
    super(message);
    this.name = 'InputError';
    this.line = line;
    this.column = column;
  }
}

function finish(raw: unknown, notes: string[], table: ParsedInput['table']): ParsedInput {
  const state: NormaliseState = { truncated: false, cyclic: false };
  const value = normalise(raw, 0, new Set<object>(), state);
  if (state.cyclic) {
    notes.push('Repeated references pointed back at themselves and were replaced with null.');
  }
  if (state.truncated) {
    notes.push(`Nesting deeper than ${MAX_DEPTH} levels was trimmed.`);
  }
  return { value, notes, table };
}

function parseJson(text: string): ParsedInput {
  try {
    return finish(JSON.parse(text) as unknown, [], null);
  } catch (error) {
    const described = describeJsonError(error, text);
    throw new InputError(described.message, described.line, described.column);
  }
}

function parseYaml(text: string, yaml: YamlModule): ParsedInput {
  let documents: unknown[];
  try {
    documents = yaml.loadAll(text);
  } catch (error) {
    const described = describeYamlError(error);
    throw new InputError(described.message, described.line, described.column);
  }

  const notes: string[] = [];
  let raw: unknown;
  if (documents.length === 0) {
    raw = null;
  } else if (documents.length === 1) {
    raw = documents[0];
  } else {
    raw = documents;
    notes.push(`Combined ${documents.length} YAML documents into one array.`);
  }
  return finish(raw, notes, null);
}

function parseCsv(text: string, papa: PapaModule, coerce: boolean): ParsedInput {
  // papaparse renames a repeated header (`a`, `a_1`) rather than dropping it;
  // keeping the originals is the only way to notice that it happened.
  const headers: string[] = [];
  const result = papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: (header) => {
      const trimmed = header.trim();
      headers.push(trimmed);
      return trimmed;
    },
  });

  const fields = (result.meta.fields ?? []).filter((field) => field !== EXTRA_FIELD);
  if (fields.length === 0 || fields.every((field) => field === '')) {
    throw new InputError('No column headers were found — the first line should name the columns');
  }

  const notes: string[] = [];

  if (headers.length === fields.length && fields.some((field, i) => field !== headers[i])) {
    notes.push('Two columns shared a name, so the later one was renamed to keep both.');
  }

  // A column with no name in the header row still holds data. Give it one
  // rather than dropping the values on the floor — and make sure the name we
  // invent cannot collide with a column that is genuinely called `column_2`.
  const taken = new Set(fields);
  const pathFor = new Map<string, string>();
  fields.forEach((field, index) => {
    if (field !== '') {
      pathFor.set(field, field);
      return;
    }
    let generated = `column_${index + 1}`;
    let suffix = 2;
    while (taken.has(generated)) generated = `column_${index + 1}_${suffix++}`;
    taken.add(generated);
    pathFor.set(field, generated);
  });
  const unnamed = fields.filter((field) => field === '').length;
  if (unnamed > 0) {
    notes.push(
      `${unnamed} ${unnamed === 1 ? 'column had' : 'columns had'} no name in the header row; ` +
        'the values were kept under a generated name such as column_2.',
    );
  }

  const mismatched = result.errors.filter((e) => e.type === 'FieldMismatch').length;
  if (mismatched > 0) {
    notes.push(
      `${mismatched} ${mismatched === 1 ? 'row has' : 'rows have'} a different number of ` +
        'columns than the header row.',
    );
  }
  const quoteIssue = result.errors.find((e) => e.type === 'Quotes');
  if (quoteIssue) {
    const where = typeof quoteIssue.row === 'number' ? ` near line ${quoteIssue.row + 2}` : '';
    notes.push(`A quoted value looks unbalanced${where} — check the output carefully.`);
  }
  if (result.data.length === 0) {
    notes.push('The header row was read, but there are no data rows below it.');
  }

  // Cache the "is this column an array index?" answer per column, not per cell.
  const indexColumn = new Map<string, boolean>();
  for (const field of fields) {
    indexColumn.set(field, endsWithIndex(pathFor.get(field) ?? field));
  }

  const records = result.data.map((row) => {
    const cells: Record<string, DataValue> = {};
    for (const field of fields) {
      const raw = row[field];
      // Absent (the row was short) — leave the key out entirely.
      if (typeof raw !== 'string') continue;
      // An empty cell under an array index is a gap, not an empty string, so
      // ragged arrays such as tags.0 / tags.1 survive the round trip.
      if (coerce && raw === '' && indexColumn.get(field)) continue;
      cells[pathFor.get(field) ?? field] = coerceCell(raw, coerce);
    }
    return unflattenRecord(cells);
  });

  const table = {
    fields,
    rows: result.data.map((row) =>
      fields.map((field) => (typeof row[field] === 'string' ? row[field] : '')),
    ),
  };

  return finish(records, notes, table);
}

/* ------------------------------------------------------------- serialising */

interface Serialised {
  output: string;
  columns: number;
  notes: string[];
}

function toJsonText(value: DataValue, indent: ConvertRequest['jsonIndent']): Serialised {
  const space = indent === 'min' ? undefined : indent === 'tab' ? '\t' : Number(indent);
  const text = JSON.stringify(value, null, space);
  return { output: typeof text === 'string' ? text : 'null', columns: 0, notes: [] };
}

function toYamlText(value: DataValue, yaml: YamlModule, indent: number): Serialised {
  const text = yaml.dump(value, {
    indent,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  return { output: text, columns: 0, notes: [] };
}

function toCsvText(value: DataValue, papa: PapaModule, delimiter: string): Serialised {
  const { fields, rows, truncated } = flattenTable(value);
  const notes: string[] = [];

  if (truncated) notes.push(`Nesting deeper than ${MAX_DEPTH} levels was trimmed.`);
  if (!Array.isArray(value)) notes.push('A single object became one CSV row.');
  if (fields.length === 0) {
    notes.push('There are no records to write.');
    return { output: '', columns: 0, notes };
  }

  const data = rows.map((row) => fields.map((field) => cellToText(row[field])));
  const output = papa.unparse({ fields, data }, { delimiter, newline: '\r\n' });
  return { output, columns: fields.length, notes };
}

/* ---------------------------------------------------------------- pipeline */

function countRecords(value: DataValue): number {
  return Array.isArray(value) ? value.length : 1;
}

/** The same caveat can arise while both reading and writing; say it once. */
function mergeNotes(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat()));
}

/**
 * Read `text` in one format and write it out in another. Converting to the
 * same format is a pretty-printer, and for csv → csv that means tidying the
 * quoting and delimiter without reinterpreting a single cell.
 */
export async function convertText(request: ConvertRequest): Promise<ConvertOutcome> {
  const { text, source, target } = request;
  const explicit: DataFormat | null = source === 'auto' ? null : source;
  const overridden = explicit !== null;

  const base: ConvertOutcome = {
    status: 'empty',
    detected: explicit ?? 'json',
    confidence: overridden ? 'high' : 'low',
    overridden,
    output: '',
    records: 0,
    columns: 0,
    outputBytes: 0,
    notes: [],
    error: null,
  };

  if (text.trim() === '') return base;

  let papa: PapaModule;
  let yaml: YamlModule;
  try {
    [papa, yaml] = await Promise.all([loadPapa(), loadYaml()]);
  } catch {
    // The parsers are code-split, so a half-loaded page (a flaky first visit,
    // or a tab left open across a redeploy) can fail here. Webpack's own words
    // are meaningless to the reader, so say what actually happened.
    return {
      ...base,
      status: 'error',
      error: {
        message: 'The parsers are still loading, or failed to load. Reload the page and try again.',
        line: null,
        column: null,
        kind: 'internal',
      },
    };
  }

  let detected: DataFormat;
  let confidence: ConvertOutcome['confidence'];
  if (explicit !== null) {
    detected = explicit;
    confidence = 'high';
  } else {
    const detection = detectFormat(text, papa, yaml, request.hint);
    detected = detection.format;
    confidence = detection.confidence;
  }

  let parsed: ParsedInput;
  try {
    if (detected === 'json') parsed = parseJson(text);
    else if (detected === 'csv') parsed = parseCsv(text, papa, request.coerceTypes);
    else parsed = parseYaml(text, yaml);
  } catch (error) {
    const described =
      error instanceof InputError
        ? { message: error.message, line: error.line, column: error.column }
        : describeUnknownError(error);
    return { ...base, status: 'error', detected, confidence, error: described };
  }

  try {
    // csv → csv: re-emit the original cells so "1.50" never becomes "1.5".
    if (detected === 'csv' && target === 'csv' && parsed.table) {
      const { fields, rows } = parsed.table;
      const output = papa.unparse(
        { fields, data: rows },
        { delimiter: request.csvDelimiter, newline: '\r\n' },
      );
      return {
        ...base,
        status: 'ok',
        detected,
        confidence,
        output,
        records: rows.length,
        columns: fields.length,
        outputBytes: utf8Bytes(output),
        notes: mergeNotes(parsed.notes, [
          'Re-formatted in place — cell values were left exactly as they were.',
        ]),
      };
    }

    let serialised: Serialised;
    if (target === 'json') serialised = toJsonText(parsed.value, request.jsonIndent);
    else if (target === 'yaml') serialised = toYamlText(parsed.value, yaml, request.yamlIndent);
    else serialised = toCsvText(parsed.value, papa, request.csvDelimiter);

    return {
      ...base,
      status: 'ok',
      detected,
      confidence,
      output: serialised.output,
      records: countRecords(parsed.value),
      columns: serialised.columns,
      outputBytes: utf8Bytes(serialised.output),
      notes: mergeNotes(parsed.notes, serialised.notes),
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      detected,
      confidence,
      notes: parsed.notes,
      error: { ...describeUnknownError(error), kind: 'internal' },
    };
  }
}
