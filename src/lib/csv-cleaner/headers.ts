/**
 * Header tidying.
 *
 * The only hard requirement is that no column may be lost: if two headers
 * collapse to the same text we suffix them (`name`, `name_2`, `name_3`) rather
 * than let one quietly overwrite the other.
 */

export interface HeaderOptions {
  standardise: boolean;
  lowercase: boolean;
  snakeCase: boolean;
}

export interface HeaderResult {
  headers: string[];
  /** Headers whose text changed. */
  renamed: number;
  /** Headers that needed a `_2` style suffix to stay unique. */
  deduped: number;
}

/** Strip punctuation but keep letters (any script), digits, spaces, _ and -. */
function stripSpecial(value: string): string {
  return value.replace(/[^\p{L}\p{N} _-]+/gu, ' ');
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2') // firstName -> first Name
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2') // HTTPServer -> HTTP Server
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function cleanOne(raw: string, index: number, opts: HeaderOptions): string {
  let value = raw.replace(/^﻿/, '').trim();

  if (opts.standardise) {
    value = stripSpecial(value).replace(/\s+/g, ' ').trim();
  }
  if (opts.snakeCase) {
    value = toSnakeCase(value);
  } else if (opts.lowercase) {
    value = value.toLowerCase();
  }

  if (!value) {
    // A nameless column still needs a name, or CSV/XLSX readers lose it.
    const fallback = opts.snakeCase ? `column_${index + 1}` : `Column ${index + 1}`;
    value = opts.lowercase && !opts.snakeCase ? fallback.toLowerCase() : fallback;
  }
  return value;
}

export function standardiseHeaders(headers: string[], opts: HeaderOptions): HeaderResult {
  const touching = opts.standardise || opts.lowercase || opts.snakeCase;
  const used = new Map<string, number>();
  const out: string[] = [];
  let renamed = 0;
  let deduped = 0;

  headers.forEach((raw, i) => {
    // Even with every toggle off, an empty header would break the output, so
    // the blank-name backfill always runs.
    const base = touching ? cleanOne(raw, i, opts) : raw.trim() || `Column ${i + 1}`;

    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);

    let final = base;
    if (seen > 0) {
      let n = seen + 1;
      // Keep bumping in case `name_2` itself already exists in the file.
      while (used.has(`${base}_${n}`)) n += 1;
      final = `${base}_${n}`;
      used.set(final, 1);
      deduped += 1;
    }

    // Counted separately from `deduped` so the summary never double-reports.
    if (base !== raw) renamed += 1;
    out.push(final);
  });

  return { headers: out, renamed, deduped };
}
