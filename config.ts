/** Site-wide settings. Set support.url to a Razorpay Payment Page to enable donation links. */

export const site = {
  name: 'SecureKit',
  tagline: 'Private file tools that never leave your browser',
  description:
    'A free, open-source suite of file and data utilities — CSV cleaning, format conversion, image compression, PDF editing and more. Every file is processed locally in your browser and never uploaded to a server.',
  /** Public URL of the deployed site. Used for metadata + social cards. */
  url: 'https://securekit.vercel.app',
  /** Public GitHub repository. Also used to build "view source" links. */
  repo: 'https://github.com/sarkhailstorm/securekit',
  /** Branch that `repo` links should point at. */
  repoBranch: 'main',
} as const;

export const author = {
  name: 'Sarkhail',
  github: 'https://github.com/sarkhailstorm',
  /** First publication year, not a last-updated date. */
  since: 2026,
} as const;

export const support = {
  /** Razorpay Payment Page URL, e.g. https://rzp.io/rzp/abc1234. Empty hides every donation link. */
  url: '',
  label: 'Support this project',
  emoji: '☕',
} as const;

export const donationsConfigured: boolean = (support.url as string).length > 0;

/** Build a link to a file in the public repo ("See how this works →"). */
export function sourceUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${site.repo}/blob/${site.repoBranch}/${clean}`;
}

export type ToolId =
  | 'csv-cleaner'
  | 'json-csv-yaml-converter'
  | 'image-compressor'
  | 'pdf-tools'
  | 'markdown-converter'
  | 'text-utilities';

export type Tool = {
  id: ToolId;
  name: string;
  href: string;
  /** One-line description for the landing page card. */
  blurb: string;
  /** Longer description used on the tool page + <meta description>. */
  description: string;
  /** lucide-react icon name. */
  icon: string;
  /** Repo-relative path to this tool's page source. */
  source: string;
  /** Short capability bullets for the landing card. */
  tags: readonly string[];
};

export const tools: readonly Tool[] = [
  {
    id: 'csv-cleaner',
    name: 'CSV & Excel Cleaner',
    href: '/tools/csv-cleaner',
    blurb: 'Strip duplicates, blank rows and messy headers from spreadsheets.',
    description:
      'Clean up CSV and Excel files: remove duplicate and blank rows, trim stray whitespace, standardise headers and normalise inconsistent date formats — then preview the result and download it as CSV or XLSX.',
    icon: 'Table2',
    source: 'src/app/tools/csv-cleaner/page.tsx',
    tags: ['Deduplicate', 'Trim & tidy', 'Date normalising', 'CSV + XLSX'],
  },
  {
    id: 'json-csv-yaml-converter',
    name: 'JSON ↔ CSV ↔ YAML',
    href: '/tools/json-csv-yaml-converter',
    blurb: 'Convert between the three formats, with nested data flattened.',
    description:
      'Paste or drop JSON, CSV or YAML and convert between them. Nested objects flatten to dot-notation columns for CSV and rebuild into real structures on the way back.',
    icon: 'ArrowLeftRight',
    source: 'src/app/tools/json-csv-yaml-converter/page.tsx',
    tags: ['Auto-detect', 'Dot-notation', 'Round-trips', 'Copy or download'],
  },
  {
    id: 'image-compressor',
    name: 'Image Compressor',
    href: '/tools/image-compressor',
    blurb: 'Shrink and resize JPEG, PNG and WebP images in batches.',
    description:
      'Compress and resize images without uploading them. Batch-process a whole folder, pick a quality level and a size preset, then download the results individually or as a ZIP.',
    icon: 'ImageDown',
    source: 'src/app/tools/image-compressor/page.tsx',
    tags: ['Batch', 'Quality slider', 'Resize presets', 'ZIP download'],
  },
  {
    id: 'pdf-tools',
    name: 'PDF Tools',
    href: '/tools/pdf-tools',
    blurb: 'Merge, split and compress PDFs without an upload.',
    description:
      'Merge several PDFs into one, split a document into separate files by picking pages, or shrink a PDF by re-encoding the images inside it — all locally.',
    icon: 'FileStack',
    source: 'src/app/tools/pdf-tools/page.tsx',
    tags: ['Merge & reorder', 'Split by page', 'Compress', 'Page previews'],
  },
  {
    id: 'markdown-converter',
    name: 'Markdown Converter',
    href: '/tools/markdown-converter',
    blurb: 'Write Markdown, preview it live, export HTML or PDF.',
    description:
      'A split-screen Markdown editor with live preview and syntax-highlighted code blocks. Export a clean standalone HTML file or print to PDF in one of several themes.',
    icon: 'FileCode2',
    source: 'src/app/tools/markdown-converter/page.tsx',
    tags: ['Live preview', 'Code highlighting', 'Export themes', 'HTML + PDF'],
  },
  {
    id: 'text-utilities',
    name: 'Text Utilities',
    href: '/tools/text-utilities',
    blurb: 'Diff, re-case, de-whitespace, encode and decode text.',
    description:
      'A grab-bag of everyday text tools: a line-and-word diff checker, case converters, a whitespace cleaner, and Base64 / URL / JWT encoding and decoding.',
    icon: 'Type',
    source: 'src/app/tools/text-utilities/page.tsx',
    tags: ['Diff checker', 'Case convert', 'Whitespace', 'Base64 & JWT'],
  },
] as const;

export function getTool(id: ToolId): Tool {
  const tool = tools.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

/** Shown on every tool page. */
export const privacyBadge = 'Runs entirely in your browser — your files are never uploaded';
