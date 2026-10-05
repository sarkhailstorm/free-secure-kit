// `btoa` only accepts code points up to U+00FF, so encode the UTF-8 bytes first
export function base64Encode(text: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // Chunked so a long string cannot blow the argument limit
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const encoded = btoa(binary);
  return urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : encoded;
}

// Accepts both the standard and URL-safe alphabets
export function base64DecodeBytes(input: string): Uint8Array {
  const compact = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (compact.length === 0) return new Uint8Array(0);

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    const bad = compact.match(/[^A-Za-z0-9+/=]/);
    if (bad) {
      throw new Error(`That isn't valid Base64 — it contains ${JSON.stringify(bad[0])}.`);
    }
    // Only "=" can be left: padding in the wrong place, or too much of it
    throw new Error(
      "That isn't valid Base64 — the \"=\" padding has to be the last one or two characters, and nothing may follow it.",
    );
  }

  const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("That isn't valid Base64 — the length doesn't line up.");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64Decode(input: string): string {
  const bytes = base64DecodeBytes(input);
  if (bytes.length === 0) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      'That decoded successfully but the bytes are not UTF-8 text — it looks like binary data.',
    );
  }
}

export type UrlScope = 'component' | 'full';

export function urlEncode(text: string, scope: UrlScope): string {
  return scope === 'component' ? encodeURIComponent(text) : encodeURI(text);
}

export function urlDecode(text: string, scope: UrlScope): string {
  try {
    return scope === 'component' ? decodeURIComponent(text) : decodeURI(text);
  } catch {
    const bad = /%(?![0-9A-Fa-f]{2})/.exec(text);
    if (bad) {
      throw new Error(
        `Broken percent-escape at position ${bad.index + 1} — a "%" must be followed by two hex digits.`,
      );
    }
    throw new Error('That contains a percent-escape that does not decode to valid UTF-8.');
  }
}

const HTML_ESCAPES: ReadonlyArray<[RegExp, string]> = [
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
  [/'/g, '&#39;'],
];

export function htmlEscape(text: string): string {
  return HTML_ESCAPES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

// Partial list; an entity that is not here is left as written
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  deg: '°', plusmn: '±', times: '×', divide: '÷',
  frac12: '½', frac14: '¼', frac34: '¾',
  sup1: '¹', sup2: '²', sup3: '³',
  euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', para: '¶', middot: '·', bull: '•',
  dagger: '†', Dagger: '‡', permil: '‰',
  larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔',
  infin: '∞', ne: '≠', le: '≤', ge: '≥', asymp: '≈',
  equiv: '≡', radic: '√', sum: '∑', prod: '∏',
  micro: 'µ', ordm: 'º', ordf: 'ª', iexcl: '¡', iquest: '¿',
  szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à',
  ccedil: 'ç', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä',
  shy: '­', ensp: ' ', emsp: ' ', thinsp: ' ', zwj: '‍', zwnj: '‌',
};

// Hand-rolled rather than via the DOM, so untrusted markup never reaches the parser
export function htmlUnescape(text: string): string {
  return text.replace(/&(#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]{1,31});/g, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body];
    return named ?? match;
  });
}

export interface JwtClaim {
  name: string;
  raw: string;
  // Empty unless there is something to add, such as a decoded timestamp
  meaning: string;
}

export type JwtValidity =
  | { state: 'valid'; detail: string }
  | { state: 'expired'; detail: string }
  | { state: 'not-yet-valid'; detail: string }
  | { state: 'unknown'; detail: string };

export interface JwtResult {
  header: string;
  payload: string;
  signature: string;
  algorithm: string | null;
  claims: JwtClaim[];
  validity: JwtValidity;
}

const CLAIM_NAMES: Readonly<Record<string, string>> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires at',
  nbf: 'Not valid before',
  iat: 'Issued at',
  jti: 'JWT ID',
  azp: 'Authorised party',
  scope: 'Scope',
  typ: 'Type',
  auth_time: 'Authenticated at',
};

const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatTimestamp(seconds: number, now: number): string {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return 'not a valid timestamp';
  return `${date.toLocaleString()} (${relativeTime(seconds * 1000 - now)})`;
}

export function relativeTime(deltaMs: number): string {
  const units: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (Math.abs(deltaMs) >= ms || unit === 'second') {
      return formatter.format(Math.round(deltaMs / ms), unit);
    }
  }
  return 'now';
}

// Decoder only: the signature is never checked, so none of this proves the token is genuine
export function decodeJwt(token: string, now: number): JwtResult {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  if (trimmed.length === 0) throw new Error('Paste a token to decode.');

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    throw new Error(
      `A JWT has three dot-separated parts — this one has ${parts.length}. Check for a missing character or a line break.`,
    );
  }
  if (parts.some((part) => part.length === 0)) {
    throw new Error('One of the three parts of this token is empty.');
  }

  const header = parseSegment(parts[0], 'header');
  const payload = parseSegment(parts[1], 'payload');

  const claims: JwtClaim[] = [];
  let expiresAt: number | null = null;
  let notBefore: number | null = null;

  for (const [key, value] of Object.entries(payload)) {
    const name = CLAIM_NAMES[key] ?? key;
    const raw: string =
      typeof value === 'string' ? value : (JSON.stringify(value) as string | undefined) ?? 'null';
    let meaning = '';

    if (TIME_CLAIMS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      meaning = formatTimestamp(value, now);
      if (key === 'exp') expiresAt = value;
      if (key === 'nbf') notBefore = value;
    }

    claims.push({ name: `${name} (${key})`, raw, meaning });
  }

  let validity: JwtValidity;
  if (expiresAt !== null && expiresAt * 1000 <= now) {
    validity = {
      state: 'expired',
      detail: `This token expired ${relativeTime(expiresAt * 1000 - now)}.`,
    };
  } else if (notBefore !== null && notBefore * 1000 > now) {
    validity = {
      state: 'not-yet-valid',
      detail: `This token does not become valid until ${new Date(notBefore * 1000).toLocaleString()}.`,
    };
  } else if (expiresAt !== null) {
    validity = {
      state: 'valid',
      detail: `Not expired — the exp claim runs out ${relativeTime(expiresAt * 1000 - now)}.`,
    };
  } else {
    validity = { state: 'unknown', detail: 'This token has no exp claim, so it states no expiry.' };
  }

  const algorithm = typeof header.alg === 'string' ? header.alg : null;

  return {
    header: JSON.stringify(header, null, 2),
    payload: JSON.stringify(payload, null, 2),
    signature: parts[2],
    algorithm,
    claims,
    validity,
  };
}

function parseSegment(segment: string, which: 'header' | 'payload'): Record<string, unknown> {
  let json: string;
  try {
    json = base64Decode(segment);
  } catch {
    throw new Error(`The ${which} is not valid base64url — this does not look like a JWT.`);
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new Error(`The ${which} decoded, but it is not a JSON object.`);
  }
}
