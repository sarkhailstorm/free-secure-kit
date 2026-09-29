export const site = {
  name: 'FreeSecureKit',
  tagline: 'Tools that never upload your files',
  description:
    'Open-source tools for spreadsheets, images, PDFs and text, free to use. Everything runs in your browser — your files are never uploaded.',
  url: 'https://freesecurekit.vercel.app',
  repo: 'https://github.com/sarkhailstorm/securekit',
  repoBranch: 'main',
  /** Proves ownership to Google Search Console. Public by design, not a secret. */
  googleSiteVerification: 'WOX1L5jSTNu4UD1pxP5jF9KDokyG2cRlziKz1Cqxbb0',
} as const;

export const author = {
  name: 'Sarkhail',
  github: 'https://github.com/sarkhailstorm',
  since: 2026,
} as const;

export const support = {
  url: 'https://rzp.io/rzp/OKGOxtcO',
  label: 'Buy me a coffee',
  emoji: '☕',
  /** The page a contributor lands on. */
  platform: 'Razorpay',
  platformUrl: 'https://razorpay.com',
  platformPrivacyUrl: 'https://razorpay.com/privacy',
  /** Who actually takes the payment and sees the card details. */
  processor: 'PayPal',
  processorPrivacyUrl: 'https://www.paypal.com/uk/legalhub/privacy-full',
} as const;

export const donationsConfigured: boolean = (support.url as string).length > 0;

export const business = {
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
    country: '',
  },
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
  { id: 'about', href: '/about', title: 'About', blurb: 'Who makes FreeSecureKit, and why.' },
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
  | 'spreadsheet-tools'
  | 'image-tools'
  | 'pdf-tools'
  | 'developer-tools';

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
    blurb: 'Combine, split and shrink PDFs, unlock one, or turn it into Word or Excel.',
    description:
      'Join PDFs and drag their pages into any order, pull out the pages you need as PDFs or pictures, shrink a file that is too big to email, take the password off a locked bank statement, turn photos into a PDF, convert one into an editable Word file, or turn the tables in an invoice into a spreadsheet.',
    icon: 'FileStack',
    source: 'src/app/tools/pdf-tools/page.tsx',
    tags: [
      'Merge & reorder',
      'Extract pages',
      'Unlock a locked PDF',
      'Images to PDF',
      'PDF to Word',
      'PDF to Excel',
    ],
  },
  {
    id: 'image-tools',
    name: 'Image Tools',
    href: '/tools/image-tools',
    blurb: 'Make a passport photo, shrink photos, or cut the subject out of one.',
    description:
      'Turn a photo from your phone into a passport photo at the exact size your country asks for, and hear what would get it turned down before you send it. Make photos smaller without a visible drop in quality — one or a whole folder. Or cut the subject out of a photo and get it back on a see-through background.',
    icon: 'ImageDown',
    source: 'src/app/tools/image-tools/page.tsx',
    tags: ['Passport photos', 'Whole folders at once', 'Remove background', '6 × 4 print sheet'],
  },
  {
    id: 'spreadsheet-tools',
    name: 'Spreadsheet Tools',
    href: '/tools/spreadsheet-tools',
    blurb: 'Tidy up a messy spreadsheet, and see exactly what changed.',
    description:
      'Finds where your table really starts, reads accented names and pound signs properly, and drops duplicate and empty rows. Merges spellings that mean the same thing, tells you what looks wrong that it cannot fix, and shows you every cell it changed so you can put any row back. Works across every sheet in a workbook.',
    icon: 'Table2',
    source: 'src/app/tools/spreadsheet-tools/page.tsx',
    tags: ['Finds the real headings', 'Shows what changed', 'Merges spellings', 'Every sheet at once'],
  },
  {
    id: 'developer-tools',
    name: 'Developer Tools',
    href: '/tools/developer-tools',
    blurb: 'Convert data formats, write Markdown, and work on text.',
    description:
      'Convert between JSON, CSV and YAML with nesting handled for you. Write Markdown and save it as a page or PDF. Compare two versions of some text, change its case, clean up its spacing, and encode or decode Base64, URLs and JWTs.',
    icon: 'Code2',
    source: 'src/app/tools/developer-tools/page.tsx',
    tags: ['JSON, CSV & YAML', 'Markdown to PDF', 'Diff & case', 'Base64 & JWT'],
  },
] as const;

export function getTool(id: ToolId): Tool {
  const tool = tools.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

/** Shown on every tool page. */
export const privacyBadge = 'Everything happens on your device — your files are never uploaded';
