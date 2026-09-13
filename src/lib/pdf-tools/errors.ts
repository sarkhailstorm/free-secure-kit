/**
 * Turning library exceptions into sentences a person can act on.
 *
 * Two failures dominate real-world use: the file is password-protected, and
 * the file is not really a PDF (renamed, truncated, or half-downloaded).
 * Both throw from deep inside pdf-lib / pdf.js with messages written for
 * developers, so they are translated here.
 */

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
    return `${label} is password-protected. Encrypted PDFs can’t be opened here — remove the password in your PDF reader, then try again.`;
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

/** True when the file the user picked is plausibly a PDF at all. */
export function looksLikePdf(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}
