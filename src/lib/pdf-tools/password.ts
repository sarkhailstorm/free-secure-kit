import { bytesOutstanding, loadAssets } from '@/lib/assets';
import { PdfToolsError } from './errors';

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

async function run(args: string[], bytes: Uint8Array, wantsOutput: boolean): Promise<Run> {
  const wasm = await compile();
  // The .mjs entry passes its factory through `globalThis`, which a bundler rewrites away; the CommonJS build exports it properly.
  const loaded = (await import('@jspawn/qpdf-wasm/qpdf.js')) as unknown as {
    default?: (options: QpdfOptions) => Promise<Qpdf>;
  };
  const createModule = loaded.default ?? (loaded as unknown as (options: QpdfOptions) => Promise<Qpdf>);

  const qpdf = await createModule({
    noInitialRun: true,
    // qpdf's messages never reach these in the browser build; the exit code and output file decide.
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
  | { kind: 'not-protected' }
  | { kind: 'needs-password' }
  | { kind: 'wrong-password' }
  | {
      kind: 'unlocked';
      bytes: Uint8Array;
      removed: 'password' | 'restrictions';
    };

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

/** Pass an empty password to probe: a restrictions-only file comes back unlocked. */
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
