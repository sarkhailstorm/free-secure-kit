/**
 * @jspawn/qpdf-wasm ships no types. This is the part of the Emscripten module
 * this site uses, and nothing more.
 */
declare module '@jspawn/qpdf-wasm/qpdf.js' {
  interface QpdfModule {
    FS: {
      writeFile(path: string, data: Uint8Array): void;
      readFile(path: string): Uint8Array;
      unlink(path: string): void;
    };
    /** Returns the exit code, or throws an ExitStatus carrying one. */
    callMain(args: string[]): number | undefined;
  }

  interface QpdfModuleOptions {
    noInitialRun?: boolean;
    print?(text: string): void;
    printErr?(text: string): void;
    instantiateWasm?(
      imports: WebAssembly.Imports,
      done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ): unknown;
  }

  export default function createModule(options?: QpdfModuleOptions): Promise<QpdfModule>;
}
