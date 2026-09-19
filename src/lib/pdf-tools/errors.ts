const ENCRYPTED =
  /encrypt|password|PasswordException|EncryptedPDFError|permissions? password/i;

const CORRUPT =
  /No PDF header|InvalidPDFException|Invalid PDF|Failed to parse|FormatError|UnexpectedObjectType|ParseError|ReparseError|MissingPDFException|Expected instance of|stream must have|Invalid object ref|Trailer/i;

const TOO_BIG =
  /out of memory|Array buffer allocation failed|Invalid (typed )?array length|Maximum call stack/i;

/** An error we raised ourselves, whose message is already fit to show. */
export class PdfToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfToolsError';
  }
}

export function describePdfError(err: unknown, filename?: string): string {
  if (err instanceof Error && err.name === 'PdfToolsError') return err.message;

  const label = filename ? `“${filename}”` : 'That file';
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  const haystack = `${name} ${message}`;

  if (ENCRYPTED.test(haystack)) {
    return `${label} is password-protected. Take the password off it in the Unlock tab first, then come back.`;
  }
  if (CORRUPT.test(haystack)) {
    return `${label} doesn’t look like a readable PDF. It may be corrupt, truncated, or another kind of file with a .pdf name.`;
  }
  if (TOO_BIG.test(haystack)) {
    return `${label} is too large for this browser tab to hold in memory. Try splitting it into smaller pieces first.`;
  }

  const detail = message.trim().slice(0, 140);
  return detail
    ? `Couldn’t read ${label}: ${detail}`
    : `Couldn’t read ${label}. It may be corrupt or password-protected.`;
}

export function looksLikePdf(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}
