/**
 * Header tidying.
 *
 * Two hard rules. No column may be lost: if two headers collapse to the same
 * text we keep them apart rather than let one quietly overwrite the other. And
 * with every toggle off nothing is touched at all, except that a nameless
 * column is given a name, because an empty header breaks the file we write.
 */

export interface HeaderOptions {
  standardise: boolean;
  lowercase: boolean;
  snakeCase: boolean;
}

export interface HeaderResult {
  headers: string[];
  /** Headers whose text the options changed. Blank backfills are not counted. */
  renamed: number;
  /** Headers that needed a `_2` style suffix to stay unique. */
  deduped: number;
  /** Nameless columns given a `Column N` name. Happens with every toggle off. */
  namedBlank: number;
  /**
   * Columns left unstandardised because tidying them would have made two
   * different names identical — `Price (£)` and `Price (€)` both becoming
   * `Price`.
   */
  keptToStayDistinct: number;
}

/**
 * Strip punctuation, but keep what a column name means by.
 *
 * Currency symbols, `%` and `°` are units, not punctuation: they are often the
 * only thing telling `Price (£)` from `Price (€)`, and stripping them turned
 * three columns into `Price`, `Price_2`, `Price_3`. Everything else that is
 * not a letter, digit, space, `_` or `-` becomes a space.
 */
function stripSpecial(value: string): string {
  return value.replace(/[^\p{L}\p{N}\p{Sc}%° _-]+/gu, ' ');
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

/** A name stripped of everything case and word separators alone can explain. */
function essence(raw: string): string {
  return raw
    .replace(/^﻿/, '')
    .toLowerCase()
    .replace(/[\s_-]+/gu, '');
}

function blankName(index: number, opts: HeaderOptions): string {
  const fallback = opts.snakeCase ? `column_${index + 1}` : `Column ${index + 1}`;
  return opts.lowercase && !opts.snakeCase ? fallback.toLowerCase() : fallback;
}

function cleanOne(raw: string, opts: HeaderOptions): string {
  let value = raw.replace(/^﻿/, '').trim();

  if (opts.standardise) {
    value = stripSpecial(value).replace(/\s+/g, ' ').trim();
  }
  if (opts.snakeCase) {
    value = toSnakeCase(value);
  } else if (opts.lowercase) {
    value = value.toLowerCase();
  }
  return value;
}

export function standardiseHeaders(headers: string[], opts: HeaderOptions): HeaderResult {
  const touching = opts.standardise || opts.lowercase || opts.snakeCase;

  // Names the tidying would merge by destroying the only difference between
  // them. `First Name` and `firstName` are one name written twice and merging
  // them is the point of the toggle; `Total #` and `Total &` are two columns.
  const merged = new Set<string>();
  if (touching) {
    const byClean = new Map<string, Set<string>>();
    for (const raw of headers) {
      const clean = cleanOne(raw, opts);
      if (!clean) continue;
      const group = byClean.get(clean) ?? new Set<string>();
      group.add(essence(raw));
      byClean.set(clean, group);
    }
    for (const [clean, group] of byClean) if (group.size > 1) merged.add(clean);
  }

  // Every name the file already carries, so a suffix we invent cannot steal one
  // a later column is going to need.
  const bases = headers.map((raw, i) => {
    const kept = raw.trim() === '' ? blankName(i, opts) : touching ? cleanOne(raw, opts) : raw;
    return kept === '' ? blankName(i, opts) : kept;
  });
  const reserved = new Set(bases);

  const assigned = new Set<string>();
  const out: string[] = [];
  let renamed = 0;
  let deduped = 0;
  let namedBlank = 0;
  let keptToStayDistinct = 0;

  headers.forEach((raw, i) => {
    let base = bases[i];
    const isBlank = raw.trim() === '';

    if (isBlank) {
      namedBlank += 1;
    } else if (touching && merged.has(base)) {
      base = raw.trim();
      keptToStayDistinct += 1;
    }

    let final = base;
    // A name the file already uses is only bumped when we would be the ones
    // duplicating it: a repeat the file itself carries is left as it came,
    // unless the toggles are on, where the merge is ours to resolve.
    const mustBeUnique = touching || isBlank;
    if (assigned.has(final) && mustBeUnique) {
      let n = 2;
      while (assigned.has(`${base}_${n}`) || reserved.has(`${base}_${n}`)) n += 1;
      final = `${base}_${n}`;
      deduped += 1;
    }
    assigned.add(final);

    if (!isBlank && base !== raw) renamed += 1;
    out.push(final);
  });

  return { headers: out, renamed, deduped, namedBlank, keptToStayDistinct };
}
