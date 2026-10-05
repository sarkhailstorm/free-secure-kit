// @jspawn/qpdf-wasm ships no types; only the parts of the Emscripten module we call are declared
declare module '@jspawn/qpdf-wasm/qpdf.js' {
  interface QpdfModule {
    FS: {
      writeFile(path: string, data: Uint8Array): void;
      readFile(path: string): Uint8Array;
      unlink(path: string): void;
    };
    // May throw an ExitStatus carrying the code instead of returning it
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
