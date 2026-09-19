import {
  MAX_ARRAY_INDEX,
  MAX_DEPTH,
  SCALAR_COLUMN,
  type DataValue,
  type Primitive,
} from './types';

type Container = DataValue[] | { [key: string]: DataValue };

export interface PathSegment {
  /** The unescaped key. */
  key: string;
  /** Array index when the raw segment was bare digits, otherwise null. */
  index: number | null;
}

export interface FlatTable {
  fields: string[];
  rows: Record<string, Primitive>[];
  /** True when nesting was cut off at MAX_DEPTH. */
  truncated: boolean;
}

const EMPTY_OBJECT_CELL = '{}';
const EMPTY_ARRAY_CELL = '[]';

/** Bare, canonical digits — "0", "1", "42" but not "007" or "-1". */
const INDEX_RE = /^(?:0|[1-9]\d*)$/;

const ALL_DIGITS_RE = /^\d+$/;

/** Escape one key so it survives a dot-notation path. */
export function escapeSegment(key: string, isObjectKey: boolean): string {
  const escaped = key.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
  // An object key of "0" would otherwise be rebuilt as an array index.
  return isObjectKey && ALL_DIGITS_RE.test(escaped) ? `\\${escaped}` : escaped;
}

/** Split a dot path on its *unescaped* dots, unescaping each segment. */
export function splitPath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let raw = '';
  let key = '';

  const flush = () => {
    const isIndex = INDEX_RE.test(raw) && Number(raw) <= MAX_ARRAY_INDEX;
    segments.push({ key, index: isIndex ? Number(raw) : null });
    raw = '';
    key = '';
  };

  for (let i = 0; i < path.length; i += 1) {
    const char = path[i];
    if (char === '\\' && i + 1 < path.length) {
      raw += char + path[i + 1];
      key += path[i + 1];
      i += 1;
    } else if (char === '.') {
      flush();
    } else {
      raw += char;
      key += char;
    }
  }
  flush();

  return segments;
}

// `prefix` is null only at the root; an empty string is a real path, from the key `""`.
function flattenInto(
  value: DataValue,
  out: Record<string, Primitive>,
  prefix: string | null,
  depth: number,
  onPath: Set<object>,
  state: { truncated: boolean },
): void {
  const column = prefix === null ? SCALAR_COLUMN : prefix;

  if (value === null || typeof value !== 'object') {
    out[column] = value;
    return;
  }

  if (depth >= MAX_DEPTH) {
    state.truncated = true;
    out[column] = Array.isArray(value) ? EMPTY_ARRAY_CELL : EMPTY_OBJECT_CELL;
    return;
  }

  // Self-referencing structures are possible via YAML anchors.
  if (onPath.has(value)) {
    out[column] = null;
    return;
  }
  onPath.add(value);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      out[column] = EMPTY_ARRAY_CELL;
    } else {
      value.forEach((item, index) => {
        flattenInto(
          item,
          out,
          prefix === null ? String(index) : `${prefix}.${index}`,
          depth + 1,
          onPath,
          state,
        );
      });
    }
  } else {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      out[column] = EMPTY_OBJECT_CELL;
    } else {
      for (const key of keys) {
        const segment = escapeSegment(key, true);
        flattenInto(
          value[key],
          out,
          prefix === null ? segment : `${prefix}.${segment}`,
          depth + 1,
          onPath,
          state,
        );
      }
    }
  }

  onPath.delete(value);
}

/** Flatten a single record into `{ 'a.b': value }` form. */
export function flattenRecord(value: DataValue): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  flattenInto(value, out, null, 0, new Set<object>(), { truncated: false });
  return out;
}

/** Split a document into the records that become CSV rows. */
export function toRecords(value: DataValue): DataValue[] {
  return Array.isArray(value) ? value : [value];
}

/** Columns are the union of every record's keys, in first-seen order. */
export function flattenTable(value: DataValue): FlatTable {
  const state = { truncated: false };
  const rows = toRecords(value).map((record) => {
    const out: Record<string, Primitive> = {};
    flattenInto(record, out, null, 0, new Set<object>(), state);
    return out;
  });

  const fields: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
    }
  }

  return { fields, rows, truncated: state.truncated };
}

function isContainer(value: DataValue | undefined): value is Container {
  return typeof value === 'object' && value !== null;
}

function readSlot(container: Container, segment: PathSegment): DataValue | undefined {
  if (Array.isArray(container)) {
    return segment.index !== null ? container[segment.index] : undefined;
  }
  return container[segment.key];
}

function writeSlot(container: Container, segment: PathSegment, value: DataValue): void {
  if (Array.isArray(container)) {
    if (segment.index !== null) {
      container[segment.index] = value;
      return;
    }
    // Unreachable: the descent below never hands a named key to an array.
    return;
  }
  container[segment.key] = value;
}

function arrayToObject(list: DataValue[]): { [key: string]: DataValue } {
  const out: { [key: string]: DataValue } = {};
  for (let i = 0; i < list.length; i += 1) {
    if (i in list) out[String(i)] = list[i];
  }
  return out;
}

function assign(root: { [key: string]: DataValue }, segments: PathSegment[], value: DataValue): void {
  let container: Container = root;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const wantArray = segments[i + 1].index !== null;
    const existing = readSlot(container, segment);

    let child: Container;
    if (isContainer(existing)) {
      if (Array.isArray(existing) && !wantArray) {
        // Same path used both `list.0` and `list.name` — keep both by widening.
        child = arrayToObject(existing);
        writeSlot(container, segment, child);
      } else {
        // An object asked to hold an index simply stores the digit as a key.
        child = existing;
      }
    } else {
      child = wantArray ? [] : {};
      writeSlot(container, segment, child);
    }
    container = child;
  }

  writeSlot(container, segments[segments.length - 1], value);
}

/** Never throws: conflicting shapes are widened rather than rejected. */
export function unflattenRecord(cells: Record<string, DataValue>): DataValue {
  const holder: { [key: string]: DataValue } = {};
  const rootSegment: PathSegment = { key: '__root__', index: null };
  let touched = false;

  for (const [path, value] of Object.entries(cells)) {
    assign(holder, [rootSegment, ...splitPath(path)], value);
    touched = true;
  }

  if (!touched) return {};
  const root = holder[rootSegment.key];
  return root === undefined ? {} : root;
}

/** True when a dot path ends in an array index — `tags.1`, but not `a.b`. */
export function endsWithIndex(path: string): boolean {
  const segments = splitPath(path);
  return segments[segments.length - 1].index !== null;
}

/** No leading zeros (so ZIP codes and IDs survive), no `+`, no hex, no `Infinity`. */
const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** With coercion off every cell stays a string. */
export function coerceCell(raw: string, coerce: boolean): DataValue {
  if (!coerce || raw === '') return raw;

  const text = raw.trim();
  if (text === '') return raw;

  if (text === 'null' || text === 'NULL' || text === 'Null') return null;
  if (text === 'true' || text === 'TRUE' || text === 'True') return true;
  if (text === 'false' || text === 'FALSE' || text === 'False') return false;
  if (text === '{}') return {};
  if (text === '[]') return [];

  if (NUMBER_RE.test(text)) {
    const value = Number(text);
    if (Number.isFinite(value)) {
      // Long integers (card numbers, snowflake ids) lose digits as doubles.
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) return raw;
      // Long decimals can round; keep the exact text rather than lie.
      if (text.length > 15 && String(value) !== text) return raw;
      return value;
    }
  }

  return raw;
}

/** A missing cell renders empty; a real null renders as the text "null". */
export function cellToText(value: Primitive | undefined): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return value;
}
