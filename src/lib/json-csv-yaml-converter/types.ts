export type DataFormat = 'json' | 'csv' | 'yaml';

export type SourceChoice = DataFormat | 'auto';

export type JsonIndent = '2' | '4' | 'tab' | 'min';

export type Confidence = 'high' | 'medium' | 'low';

export type Primitive = string | number | boolean | null;

export type DataValue = Primitive | DataValue[] | { [key: string]: DataValue };

export const FORMAT_LABEL: Record<DataFormat, string> = {
  json: 'JSON',
  csv: 'CSV',
  yaml: 'YAML',
};

export const CSV_DELIMITERS = [',', '\t', ';', '|'] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export const DELIMITER_LABEL: Record<CsvDelimiter, string> = {
  ',': 'Comma',
  '\t': 'Tab',
  ';': 'Semicolon',
  '|': 'Pipe',
};

/** Column name used when a record has no keys of its own (a bare scalar row). */
export const SCALAR_COLUMN = 'value';

export const MAX_DEPTH = 64;
export const MAX_ARRAY_INDEX = 100_000;

export interface ConvertError {
  /** Short, human-readable sentence. Never a raw stack. */
  message: string;
  line: number | null;
  column: number | null;
  /** 'parse' (the default) means the input was rejected; 'internal' means the tool faltered. */
  kind?: 'parse' | 'internal';
}

export interface ConvertOutcome {
  status: 'empty' | 'ok' | 'error';
  /** The format the input was read as (after any manual override). */
  detected: DataFormat;
  confidence: Confidence;
  /** Whether `detected` came from the detector or from the user's picker. */
  overridden: boolean;
  output: string;
  /** Top-level records seen in the input. */
  records: number;
  /** Distinct flattened columns — only filled in when the target is CSV. */
  columns: number;
  outputBytes: number;
  notes: string[];
  error: ConvertError | null;
}

export interface ConvertRequest {
  text: string;
  source: SourceChoice;
  target: DataFormat;
  jsonIndent: JsonIndent;
  yamlIndent: number;
  csvDelimiter: string;
  coerceTypes: boolean;
  /** Lowercase extension of a dropped file, used only to break ties. */
  hint?: string;
}

export function utf8Bytes(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair: four bytes, and the low half is consumed here.
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}
