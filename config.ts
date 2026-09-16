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
  label: 'Buy me a coffee',
  emoji: '☕',
} as const;

export const donationsConfigured: boolean = (support.url as string).length > 0;

/**
 * Real-world identity behind the site. Razorpay's activation review requires a
 * legal name, a street address and a working phone number; anything left empty
 * is omitted from the Contact page rather than shown as a placeholder.
 */
export const business = {
  /** Exactly as printed on the PAN card. */
  legalName: '',
  email: '',
  phone: '',
  hours: '',
  address: {
    line1: '',
    line2: '',
    city: '',
    state: '',
    postcode: '',
    country: 'India',
  },
  /** Udyam/MSME registration number, if you have one. */
  udyam: '',
} as const;

export const contactEmailConfigured: boolean = (business.email as string).length > 0;
export const contactPhoneConfigured: boolean = (business.phone as string).length > 0;
export const addressConfigured: boolean = (business.address.line1 as string).length > 0;
export const legalNameConfigured: boolean = (business.legalName as string).length > 0;

/** Who the site belongs to in policy copy. Falls back to the display name. */
export function traderName(): string {
  return legalNameConfigured ? business.legalName : author.name;
}

export type LegalPageId =
  | 'about'
  | 'contact'
  | 'pricing'
  | 'terms'
  | 'privacy'
  | 'refunds'
  | 'shipping';

export const legalPages: readonly {
  id: LegalPageId;
  href: string;
  title: string;
  blurb: string;
}[] = [
  { id: 'about', href: '/about', title: 'About', blurb: 'Who makes SecureKit, and why.' },
  { id: 'contact', href: '/contact', title: 'Contact', blurb: 'How to reach us.' },
  { id: 'pricing', href: '/pricing', title: 'Pricing', blurb: 'What it costs: nothing.' },
  { id: 'terms', href: '/terms', title: 'Terms', blurb: 'What you agree to by using the site.' },
  {
    id: 'privacy',
    href: '/privacy',
    title: 'Privacy',
    blurb: 'Exactly what happens to your files and your data.',
  },
  {
    id: 'refunds',
    href: '/refunds',
    title: 'Refunds',
    blurb: 'Cancelling or refunding a contribution.',
  },
  {
    id: 'shipping',
    href: '/shipping',
    title: 'Delivery',
    blurb: 'Nothing is posted to you. What that means.',
  },
] as const;

export function sourceUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${site.repo}/blob/${site.repoBranch}/${clean}`;
}

export type ToolId =
  | 'background-remover'
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
  blurb: string;
  description: string;
  icon: string;
  source: string;
  tags: readonly string[];
};

export const tools: readonly Tool[] = [
  {
    id: 'pdf-tools',
    name: 'PDF Tools',
    href: '/tools/pdf-tools',
    blurb: 'Combine, reorder, split and shrink PDFs, or turn one into Word or Excel.',
    description:
      'Join PDFs and drag their pages into any order, pull out the pages you need as PDFs or pictures, shrink a file that is too big to email, turn photos into a PDF, convert one into an editable Word file, or turn the tables in a bank statement or invoice into a spreadsheet.',
    icon: 'FileStack',
    source: 'src/app/tools/pdf-tools/page.tsx',
    tags: [
      'Merge & reorder',
      'Extract pages',
      'Pages to images',
      'Images to PDF',
      'PDF to Word',
      'PDF to Excel',
    ],
  },
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
    id: 'background-remover',
    name: 'Background Remover',
    href: '/tools/background-remover',
    blurb: 'Cut the subject out of a photo and save it with nothing behind it.',
    description:
      'Cut the subject out of a photo and get it back on a see-through background, ready to put on a plain colour or another picture. Works on people, products, pets and objects, and your photo never leaves your device.',
    icon: 'Scissors',
    source: 'src/app/tools/background-remover/page.tsx',
    tags: ['People or objects', 'See-through PNG', 'Plain colour background', 'Before and after'],
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
