import { bytesOutstanding, loadAssets } from '@/lib/assets';
import { PdfToolsError } from './errors';

/**
 * Taking the password off a PDF, with qpdf.
 *
 * This is the one job pdf-lib cannot do: it refuses an encrypted file outright.
 * qpdf is the tool that exists for it, compiled to WebAssembly and run here, so
 * a bank statement never leaves the device. It is fetched the first time
 * someone asks and kept, like every other large file on this site.
 *
 * Nothing here guesses or removes a password you do not have. The password goes
 * straight to qpdf in this tab and is never stored.
 */

type Qpdf = {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number | undefined;
};

type QpdfOptions = {
  noInitialRun: boolean;
  print(text: string): void;
  printErr(text: string): void;
  instantiateWasm(
    imports: WebAssembly.Imports,
    done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
  ): Record<string, never>;
};

const IN = '/in.pdf';
const OUT = '/out.pdf';

/** qpdf says 0 for success and 3 when it succeeded but had something to say. */
const OK = new Set([0, 3]);

/** Compiling 1.2 MB of WebAssembly takes a moment, so it is done once. */
let compiled: Promise<WebAssembly.Module> | null = null;

async function compile(): Promise<WebAssembly.Module> {
  if (compiled) return compiled;
  compiled = (async () => {
    const assets = await loadAssets(['qpdf'], () => {});
    const bytes = assets.qpdf;
    if (!bytes) {
      throw new PdfToolsError(
        'The unlocker couldn’t be downloaded. Check your connection and try again.',
      );
    }
    // A fresh copy: the cached Uint8Array is reused, and compiling can detach it.
    return WebAssembly.compile(bytes.slice().buffer);
  })();
  try {
    return await compiled;
  } catch (err) {
    compiled = null;
    throw err;
  }
}

interface Run {
  code: number;
  output: Uint8Array | null;
}

/**
 * Run qpdf once over `bytes`.
 *
 * Each run gets its own instance. Emscripten's `callMain` is not built to be
 * called twice on one instance, and a half-finished run would otherwise leave
 * state behind for the next file.
 */
async function run(args: string[], bytes: Uint8Array, wantsOutput: boolean): Promise<Run> {
  const wasm = await compile();
  // The package's .mjs entry hands the factory around through `globalThis`,
  // which a bundler rewrites out from under it. Its CommonJS build exports the
  // factory properly, so that is the one imported here.
  const loaded = (await import('@jspawn/qpdf-wasm/qpdf.js')) as unknown as {
    default?: (options: QpdfOptions) => Promise<Qpdf>;
  };
  const createModule = loaded.default ?? (loaded as unknown as (options: QpdfOptions) => Promise<Qpdf>);

  const qpdf = await createModule({
    noInitialRun: true,
    // qpdf's own messages never reach these in the browser build, which is why
    // nothing below reads them: the exit code and the output file decide.
    print: () => {},
    printErr: () => {},
    instantiateWasm(imports, done) {
      void WebAssembly.instantiate(wasm, imports).then((instance) => done(instance, wasm));
      return {};
    },
  });

  qpdf.FS.writeFile(IN, bytes);
  let code = 0;
  try {
    code = qpdf.callMain(args) ?? 0;
  } catch (thrown) {
    // Emscripten throws an ExitStatus rather than returning, for a non-zero exit.
    const status = (thrown as { status?: number }).status;
    code = typeof status === 'number' ? status : -1;
  }

  let output: Uint8Array | null = null;
  if (wantsOutput && OK.has(code)) {
    try {
      output = qpdf.FS.readFile(OUT);
    } catch {
      output = null;
    }
  }
  return { code, output };
}

export type UnlockOutcome =
  /** There was nothing to remove. */
  | { kind: 'not-protected' }
  /** It opens, but only with a password we were not given. */
  | { kind: 'needs-password' }
  /** The password given is not the right one. */
  | { kind: 'wrong-password' }
  | {
      kind: 'unlocked';
      bytes: Uint8Array;
      /** A password someone had to type, or restrictions that blocked printing and copying. */
      removed: 'password' | 'restrictions';
    };

/** Every PDF starts with this, and nothing else does. */
function looksLikePdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/**
 * Whether the file carries an encryption dictionary.
 *
 * A PDF's trailer names its `/Encrypt` dictionary in plain bytes, even when the
 * rest of the file is scrambled and even when the trailer is a cross-reference
 * stream. Reading it here is what separates "this needs a password" from "this
 * file is broken", because qpdf's own message for the two is the same exit code
 * and its text does not survive the browser build.
 */
function hasEncryptDictionary(bytes: Uint8Array): boolean {
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"
  outer: for (let at = 0; at <= bytes.length - needle.length; at++) {
    for (let i = 0; i < needle.length; i++) {
      if (bytes[at + i] !== needle[i]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Take the protection off one PDF.
 *
 * Pass an empty password to find out what the file needs: a file with only
 * printing and copying restrictions opens without one, and comes back unlocked
 * in the same step.
 */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<UnlockOutcome> {
  if (!looksLikePdfBytes(bytes)) {
    throw new PdfToolsError(
      'That file is not a PDF. It may have been renamed, or only half downloaded.',
    );
  }

  const encrypted = hasEncryptDictionary(bytes);
  const result = await run(['--decrypt', `--password=${password}`, IN, OUT], bytes, true);

  if (OK.has(result.code) && result.output) {
    if (!encrypted) return { kind: 'not-protected' };
    return {
      kind: 'unlocked',
      bytes: result.output,
      removed: password === '' ? 'restrictions' : 'password',
    };
  }

  if (encrypted) {
    return password === '' ? { kind: 'needs-password' } : { kind: 'wrong-password' };
  }

  throw new PdfToolsError(
    'That PDF could not be opened. It may be damaged, or only half downloaded.',
  );
}

/** True when the unlocker is already on the device and costs nothing to use. */
export async function isUnlockerReady(): Promise<boolean> {
  return (await bytesOutstanding(['qpdf'])) === 0;
}

/** "about 330 KB", or null when there is nothing left to fetch. */
export async function unlockerDownloadSize(): Promise<string | null> {
  const bytes = await bytesOutstanding(['qpdf']);
  if (bytes === 0) return null;
  // Served compressed; this one comes down to roughly a quarter of its size.
  const over = bytes * 0.26;
  return over < 1_000_000
    ? `about ${Math.round(over / 10_000) * 10} KB`
    : `about ${(over / 1_000_000).toFixed(1)} MB`;
}
