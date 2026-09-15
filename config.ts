export const site = {
  name: 'SecureKit',
  tagline: 'Free file tools that never upload your files',
  description:
    'Free, open-source tools for spreadsheets, images, PDFs and text. Everything runs in your browser — your files are never uploaded.',
  url: 'https://securekit.vercel.app',
  repo: 'https://github.com/sarkhailstorm/securekit',
  repoBranch: 'main',
} as const;

export const author = {
  name: 'Sarkhail',
  github: 'https://github.com/sarkhailstorm',
  since: 2026,
} as const;

export const support = {
  url: '',
  label: 'Support this project',
  emoji: '☕',
} as const;

export const donationsConfigured: boolean = (support.url as string).length > 0;

export function sourceUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${site.repo}/blob/${site.repoBranch}/${clean}`;
}

export type ToolId =
  | 'csv-cleaner'
  | 'json-csv-yaml-converter'
  | 'image-compressor'
  | 'pdf-tools'
  | 'pdf-to-word'
  | 'markdown-converter'
  | 'text-utilities';

export type Tool = {
  id: ToolId;
  name: string;
  href: string;
  blurb: string;
  description: string;
  icon: string;
  source: string;
  tags: readonly string[];
};

export const tools: readonly Tool[] = [
  {
    id: 'csv-cleaner',
    name: 'CSV & Excel Cleaner',
    href: '/tools/csv-cleaner',
    blurb: 'Tidy up a messy spreadsheet — duplicates, blank rows and stray spaces.',
    description:
      'Remove duplicate and empty rows, trim stray spaces, tidy up headings and fix mixed-up date formats. Check the preview, then download as CSV or Excel.',
    icon: 'Table2',
    source: 'src/app/tools/csv-cleaner/page.tsx',
    tags: ['Remove duplicates', 'Fix mixed dates', 'Tidy headings', 'CSV & Excel'],
  },
  {
    id: 'pdf-tools',
    name: 'PDF Tools',
    href: '/tools/pdf-tools',
    blurb: 'Combine, reorder, split and shrink PDFs, or swap between PDFs and pictures.',
    description:
      'Join PDFs and drag their pages into any order, pull out the pages you need as PDFs or pictures, shrink a file that is too big to email, or turn photos into a PDF.',
    icon: 'FileStack',
    source: 'src/app/tools/pdf-tools/page.tsx',
    tags: ['Merge & reorder', 'Extract pages', 'Pages to images', 'Images to PDF', 'Compress'],
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    href: '/tools/pdf-to-word',
    blurb: 'Turn a PDF into a Word document you can edit.',
    description:
      'Turn a PDF into a Word file that keeps its text, fonts, pictures and tables. Choose easy editing, or an exact copy of the layout.',
    icon: 'FileType2',
    source: 'src/app/tools/pdf-to-word/page.tsx',
    tags: ['Keeps formatting', 'Editable or exact', 'Pictures & tables', 'Word .docx'],
  },
  {
    id: 'image-compressor',
    name: 'Image Compressor',
    href: '/tools/image-compressor',
    blurb: 'Make photos smaller without a visible drop in quality.',
    description:
      'Shrink and resize JPEG, PNG and WebP — one photo or a whole folder. Pick a quality level, see what you saved, then download them singly or as a ZIP.',
    icon: 'ImageDown',
    source: 'src/app/tools/image-compressor/page.tsx',
    tags: ['Whole folders at once', 'Quality slider', 'Resize presets', 'ZIP download'],
  },
  {
    id: 'json-csv-yaml-converter',
    name: 'JSON ↔ CSV ↔ YAML',
    href: '/tools/json-csv-yaml-converter',
    blurb: 'Switch data between JSON, CSV and YAML — nesting handled for you.',
    description:
      'Drop in JSON, CSV or YAML and get either of the other two back. Nested data flattens into readable columns and rebuilds properly on the way back.',
    icon: 'ArrowLeftRight',
    source: 'src/app/tools/json-csv-yaml-converter/page.tsx',
    tags: ['Spots the format', 'Handles nesting', 'Converts both ways', 'Copy or download'],
  },
  {
    id: 'markdown-converter',
    name: 'Markdown Converter',
    href: '/tools/markdown-converter',
    blurb: 'Write Markdown, watch it render, save it as a page or PDF.',
    description:
      'Type Markdown on the left and watch the finished page appear on the right. Save it as a self-contained web page or a PDF, in the theme you like.',
    icon: 'FileCode2',
    source: 'src/app/tools/markdown-converter/page.tsx',
    tags: ['Live preview', 'Code highlighting', 'Choose a theme', 'Web page or PDF'],
  },
  {
    id: 'text-utilities',
    name: 'Text Utilities',
    href: '/tools/text-utilities',
    blurb: 'Compare, re-case, clean up and encode any piece of text.',
    description:
      'See what changed between two versions, switch capitalisation, clean up messy spacing, and encode or decode Base64, URLs and JWTs.',
    icon: 'Type',
    source: 'src/app/tools/text-utilities/page.tsx',
    tags: ['Spot the changes', 'Change the case', 'Clean up spacing', 'Base64 & JWT'],
  },
] as const;

export function getTool(id: ToolId): Tool {
  const tool = tools.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

/** Shown on every tool page. */
export const privacyBadge = 'Everything happens on your device — your files are never uploaded';
