/**
 * Document stylesheets for the Markdown converter.
 *
 * Three genuinely different looks — not three shades of one — each written as
 * a real stylesheet. Every rule is generated against a *root selector* so the
 * same sheet can be pointed at the live preview (`.md-doc`), at the hidden
 * print surface (`#securekit-md-print .md-body`) or at the exported standalone
 * file, without any chance of the three bleeding into each other.
 *
 * Colours are plain hex rather than the site's theme tokens on purpose: the
 * document is a document, and the HTML/PDF a reader ends up with has to look
 * the same on a machine that has never seen this site's CSS variables.
 */

export type ThemeId = 'minimal' | 'github' | 'serif';

/** Class applied to the on-screen preview root. */
export const PREVIEW_ROOT_CLASS = 'md-doc';
/** Id of the body-level element that exists only to be printed. */
export const PRINT_ROOT_ID = 'securekit-md-print';
/** Class applied to the document inside the print surface. */
export const PRINT_BODY_CLASS = 'md-body';

export interface DocTheme {
  id: ThemeId;
  name: string;
  blurb: string;
}

export const themes: readonly DocTheme[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Clean sans-serif, roomy line height, almost no chrome.',
  },
  {
    id: 'github',
    name: 'GitHub',
    blurb: 'The familiar README look — ruled headings, boxed code, striped tables.',
  },
  {
    id: 'serif',
    name: 'Serif document',
    blurb: 'Justified serif body with indented paragraphs, like a printed report.',
  },
] as const;

export function getDocTheme(id: ThemeId): DocTheme {
  return themes.find((t) => t.id === id) ?? themes[0];
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themes.some((t) => t.id === value);
}

/* ------------------------------------------------------------------ palettes */

interface Palette {
  /** Page colour behind the document. */
  paper: string;
  text: string;
  soft: string;
  heading: string;
  link: string;
  border: string;
  rule: string;
  codeText: string;
  codeBg: string;
  preBg: string;
  preBorder: string;
  quoteText: string;
  quoteBar: string;
  tableHeadBg: string;
  tableZebra: string;
  mark: string;
}

const MINIMAL_LIGHT: Palette = {
  paper: '#ffffff',
  text: '#27272a',
  soft: '#52525b',
  heading: '#18181b',
  link: '#4f46e5',
  border: '#e4e4e7',
  rule: '#ececef',
  codeText: '#18181b',
  codeBg: '#f4f4f5',
  preBg: '#fafafa',
  preBorder: '#e4e4e7',
  quoteText: '#52525b',
  quoteBar: '#d4d4d8',
  tableHeadBg: 'transparent',
  tableZebra: 'transparent',
  mark: '#fef08a',
};

const MINIMAL_DARK: Palette = {
  paper: '#141417',
  text: '#d4d4d8',
  soft: '#a1a1aa',
  heading: '#fafafa',
  link: '#a5b4fc',
  border: '#2c2c33',
  rule: '#26262c',
  codeText: '#e4e4e7',
  codeBg: '#1f1f24',
  preBg: '#1a1a1f',
  preBorder: '#2c2c33',
  quoteText: '#a1a1aa',
  quoteBar: '#3f3f46',
  tableHeadBg: 'transparent',
  tableZebra: 'transparent',
  mark: '#854d0e',
};

const GITHUB_LIGHT: Palette = {
  paper: '#ffffff',
  text: '#1f2328',
  soft: '#59636e',
  heading: '#1f2328',
  link: '#0969da',
  border: '#d1d9e0',
  rule: '#d1d9e0',
  codeText: '#1f2328',
  codeBg: 'rgba(129,139,152,0.15)',
  preBg: '#f6f8fa',
  preBorder: 'transparent',
  quoteText: '#59636e',
  quoteBar: '#d1d9e0',
  tableHeadBg: '#f6f8fa',
  tableZebra: '#f6f8fa',
  mark: '#fff8c5',
};

const GITHUB_DARK: Palette = {
  paper: '#0d1117',
  text: '#e6edf3',
  soft: '#9198a1',
  heading: '#e6edf3',
  link: '#4493f8',
  border: '#3d444d',
  rule: '#3d444d',
  codeText: '#e6edf3',
  codeBg: 'rgba(101,108,118,0.28)',
  preBg: '#151b23',
  preBorder: 'transparent',
  quoteText: '#9198a1',
  quoteBar: '#3d444d',
  tableHeadBg: '#151b23',
  tableZebra: '#12181f',
  mark: '#5c4405',
};

const SERIF_LIGHT: Palette = {
  paper: '#fdfcf8',
  text: '#2b2724',
  soft: '#6b625a',
  heading: '#1c1917',
  link: '#8c2f39',
  border: '#ded8cd',
  rule: '#e8e3d9',
  codeText: '#3f3a35',
  codeBg: '#f2efe8',
  preBg: '#f7f4ed',
  preBorder: '#e3ddd1',
  quoteText: '#4a443e',
  quoteBar: '#c9c0b1',
  tableHeadBg: 'transparent',
  tableZebra: 'transparent',
  mark: '#f4e4a6',
};

const SERIF_DARK: Palette = {
  paper: '#1a1816',
  text: '#ddd6cd',
  soft: '#a89f95',
  heading: '#f5efe6',
  link: '#e8a0a6',
  border: '#35302a',
  rule: '#2b2723',
  codeText: '#e7e0d6',
  codeBg: '#23201c',
  preBg: '#201d1a',
  preBorder: '#35302a',
  quoteText: '#b3aaa0',
  quoteBar: '#4a433b',
  tableHeadBg: 'transparent',
  tableZebra: 'transparent',
  mark: '#6b5426',
};

/* ------------------------------------------------------- syntax highlighting */

interface CodePalette {
  comment: string;
  keyword: string;
  string: string;
  number: string;
  title: string;
  type: string;
  attr: string;
  builtin: string;
  meta: string;
  deletion: string;
  deletionBg: string;
  addition: string;
  additionBg: string;
}

const CODE_LIGHT: CodePalette = {
  comment: '#6a737d',
  keyword: '#d73a49',
  string: '#032f62',
  number: '#005cc5',
  title: '#6f42c1',
  type: '#22863a',
  attr: '#005cc5',
  builtin: '#e36209',
  meta: '#005cc5',
  deletion: '#82071e',
  deletionBg: '#ffebe9',
  addition: '#116329',
  additionBg: '#dafbe1',
};

const CODE_DARK: CodePalette = {
  comment: '#8b949e',
  keyword: '#ff7b72',
  string: '#a5d6ff',
  number: '#79c0ff',
  title: '#d2a8ff',
  type: '#7ee787',
  attr: '#79c0ff',
  builtin: '#ffa657',
  meta: '#79c0ff',
  deletion: '#ffdcd7',
  deletionBg: '#67060c',
  addition: '#aff5b4',
  additionBg: '#033a16',
};

function codeCss(r: string, c: CodePalette): string {
  return `
${r} .hljs-comment,
${r} .hljs-quote { color: ${c.comment}; font-style: italic; }
${r} .hljs-keyword,
${r} .hljs-selector-tag,
${r} .hljs-literal,
${r} .hljs-name { color: ${c.keyword}; }
${r} .hljs-string,
${r} .hljs-doctag,
${r} .hljs-regexp,
${r} .hljs-template-tag { color: ${c.string}; }
${r} .hljs-number,
${r} .hljs-variable,
${r} .hljs-template-variable,
${r} .hljs-selector-attr,
${r} .hljs-selector-pseudo { color: ${c.number}; }
${r} .hljs-title,
${r} .hljs-section,
${r} .hljs-selector-id { color: ${c.title}; font-weight: 600; }
${r} .hljs-type,
${r} .hljs-title.class_,
${r} .hljs-class .hljs-title { color: ${c.type}; }
${r} .hljs-attr,
${r} .hljs-attribute,
${r} .hljs-property { color: ${c.attr}; }
${r} .hljs-built_in,
${r} .hljs-symbol,
${r} .hljs-bullet,
${r} .hljs-link { color: ${c.builtin}; }
${r} .hljs-meta,
${r} .hljs-meta .hljs-keyword { color: ${c.meta}; }
${r} .hljs-deletion { color: ${c.deletion}; background: ${c.deletionBg}; }
${r} .hljs-addition { color: ${c.addition}; background: ${c.additionBg}; }
${r} .hljs-emphasis { font-style: italic; }
${r} .hljs-strong { font-weight: 600; }
`;
}

/* ----------------------------------------------------------------- structure */

/**
 * The handful of rules every theme needs to behave (wide tables scroll inside
 * themselves, images never overflow, task lists lose their bullets). Purely
 * structural — nothing here decides how a theme *looks*.
 */
function structuralCss(r: string): string {
  return `
${r} { box-sizing: border-box; overflow-wrap: break-word; }
${r} *, ${r} *::before, ${r} *::after { box-sizing: inherit; }
${r} > *:first-child { margin-top: 0; }
${r} > *:last-child { margin-bottom: 0; }
${r} img, ${r} video, ${r} svg { max-width: 100%; height: auto; }
${r} pre { overflow-x: auto; -webkit-overflow-scrolling: touch; }
${r} pre code { display: block; white-space: pre; }
${r} table { border-collapse: collapse; display: block; width: max-content; max-width: 100%; overflow-x: auto; }
${r} .contains-task-list { list-style: none; padding-left: 0.25em; }
${r} .task-list-item { padding-left: 0; }
${r} .task-list-item input[type="checkbox"] { margin: 0 0.5em 0 0; vertical-align: middle; }
${r} .contains-task-list .contains-task-list { padding-left: 1.5em; }
${r} sup, ${r} sub { line-height: 0; }
`;
}

/* -------------------------------------------------------------------- themes */

function minimalCss(r: string, p: Palette): string {
  return `
${r} {
  color: ${p.text};
  background: ${p.paper};
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15.5px;
  line-height: 1.75;
  letter-spacing: -0.003em;
  max-width: 46rem;
  margin: 0 auto;
  padding: 2.25rem 1.75rem 3rem;
}
${r} h1, ${r} h2, ${r} h3, ${r} h4 { color: ${p.heading}; font-weight: 600; line-height: 1.25; letter-spacing: -0.018em; }
${r} h1 { font-size: 1.9em; margin: 2.1em 0 0.6em; }
${r} h2 { font-size: 1.4em; margin: 2em 0 0.5em; }
${r} h3 { font-size: 1.15em; margin: 1.8em 0 0.45em; }
${r} h4 { font-size: 1em; margin: 1.6em 0 0.4em; }
${r} h5, ${r} h6 {
  font-size: 0.82em; margin: 1.6em 0 0.4em; color: ${p.soft};
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
}
${r} p { margin: 0 0 1.15em; }
${r} a { color: ${p.link}; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
${r} strong { font-weight: 650; color: ${p.heading}; }
${r} ul, ${r} ol { margin: 0 0 1.15em; padding-left: 1.35em; }
${r} li { margin: 0.3em 0; }
${r} li::marker { color: ${p.soft}; }
${r} li > ul, ${r} li > ol { margin: 0.3em 0 0.3em; }
${r} blockquote {
  margin: 1.6em 0; padding: 0 0 0 1.1em;
  border-left: 2px solid ${p.quoteBar}; color: ${p.quoteText}; font-style: italic;
}
${r} blockquote > *:last-child { margin-bottom: 0; }
${r} code {
  font-family: ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, monospace;
  font-size: 0.86em; background: ${p.codeBg}; color: ${p.codeText};
  padding: 0.15em 0.4em; border-radius: 4px;
}
${r} pre {
  background: ${p.preBg}; border: 1px solid ${p.preBorder}; border-radius: 10px;
  padding: 1rem 1.1rem; margin: 1.5em 0; font-size: 0.84em; line-height: 1.65;
}
${r} pre code { background: none; padding: 0; font-size: 1em; border-radius: 0; color: ${p.codeText}; }
${r} table { margin: 1.6em 0; font-size: 0.93em; }
${r} th { text-align: left; font-weight: 600; color: ${p.heading}; padding: 0.5em 1.1em 0.5em 0; border-bottom: 1px solid ${p.border}; }
${r} td { padding: 0.5em 1.1em 0.5em 0; border-bottom: 1px solid ${p.rule}; vertical-align: top; }
${r} tr:last-child td { border-bottom: 0; }
${r} hr { border: 0; border-top: 1px solid ${p.border}; margin: 2.5em 0; }
${r} img { border-radius: 8px; margin: 0.4em 0; }
${r} del { color: ${p.soft}; }
${r} mark { background: ${p.mark}; color: ${p.text}; padding: 0 0.15em; border-radius: 2px; }
${r} kbd {
  font-family: inherit; font-size: 0.8em; border: 1px solid ${p.border};
  border-bottom-width: 2px; border-radius: 5px; padding: 0.1em 0.4em; background: ${p.preBg};
}
@media (max-width: 640px) { ${r} { font-size: 15px; padding: 1.4rem 1.1rem 2rem; } }
`;
}

function githubCss(r: string, p: Palette): string {
  return `
${r} {
  color: ${p.text};
  background: ${p.paper};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  max-width: 54rem;
  margin: 0 auto;
  padding: 2rem 2rem 3rem;
}
${r} h1, ${r} h2, ${r} h3, ${r} h4, ${r} h5, ${r} h6 {
  color: ${p.heading}; font-weight: 600; line-height: 1.25; margin: 24px 0 16px;
}
${r} h1 { font-size: 2em; margin-top: 0.67em; padding-bottom: 0.3em; border-bottom: 1px solid ${p.border}; }
${r} h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid ${p.border}; }
${r} h3 { font-size: 1.25em; }
${r} h4 { font-size: 1em; }
${r} h5 { font-size: 0.875em; }
${r} h6 { font-size: 0.85em; color: ${p.soft}; }
${r} p { margin: 0 0 16px; }
${r} a { color: ${p.link}; text-decoration: none; }
${r} a:hover { text-decoration: underline; }
${r} strong { font-weight: 600; }
${r} ul, ${r} ol { margin: 0 0 16px; padding-left: 2em; }
${r} li + li { margin-top: 0.25em; }
${r} li > ul, ${r} li > ol { margin: 0.25em 0 0; }
${r} blockquote {
  margin: 0 0 16px; padding: 0 1em;
  color: ${p.quoteText}; border-left: 0.25em solid ${p.quoteBar};
}
${r} blockquote > *:last-child { margin-bottom: 0; }
${r} code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 85%; background: ${p.codeBg}; color: ${p.codeText};
  padding: 0.2em 0.4em; border-radius: 6px;
}
${r} pre {
  background: ${p.preBg}; border: 1px solid ${p.preBorder}; border-radius: 6px;
  padding: 16px; margin: 0 0 16px; font-size: 85%; line-height: 1.45;
}
${r} pre code { background: none; padding: 0; font-size: 1em; border-radius: 0; color: ${p.codeText}; }
${r} table { margin: 0 0 16px; font-size: 0.95em; }
${r} th, ${r} td { padding: 6px 13px; border: 1px solid ${p.border}; }
${r} th { font-weight: 600; text-align: left; background: ${p.tableHeadBg}; }
${r} tbody tr:nth-child(2n) td { background: ${p.tableZebra}; }
${r} hr { height: 0.25em; padding: 0; margin: 24px 0; background: ${p.rule}; border: 0; }
${r} img { border-radius: 6px; }
${r} del { color: ${p.soft}; }
${r} mark { background: ${p.mark}; color: ${p.text}; padding: 0.1em 0.2em; }
${r} kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 10px;
  padding: 4px 5px; border: 1px solid ${p.border}; border-bottom-width: 2px;
  border-radius: 6px; background: ${p.preBg}; color: ${p.text};
}
@media (max-width: 640px) { ${r} { font-size: 15px; padding: 1.4rem 1.1rem 2rem; } }
`;
}

function serifCss(r: string, p: Palette): string {
  return `
${r} {
  color: ${p.text};
  background: ${p.paper};
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  font-size: 17px;
  line-height: 1.75;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
  max-width: 38rem;
  margin: 0 auto;
  padding: 3rem 2rem 4rem;
}
${r} h1 {
  color: ${p.heading}; font-size: 1.75em; font-weight: 600; line-height: 1.25;
  text-align: center; letter-spacing: 0.01em; margin: 0 0 1.6em; text-wrap: balance;
}
${r} h1::after {
  content: ""; display: block; width: 3.5rem; height: 1px;
  background: ${p.quoteBar}; margin: 0.9rem auto 0;
}
${r} h2 {
  color: ${p.heading}; font-size: 1.16em; font-weight: 600; font-variant-caps: small-caps;
  letter-spacing: 0.05em; text-align: left; margin: 2.4em 0 0.8em;
  padding-bottom: 0.3em; border-bottom: 1px solid ${p.border};
}
${r} h3 { color: ${p.heading}; font-size: 1.04em; font-weight: 600; font-style: italic; text-align: left; margin: 2em 0 0.5em; }
${r} h4, ${r} h5, ${r} h6 { color: ${p.soft}; font-size: 0.96em; font-weight: 600; font-style: italic; text-align: left; margin: 1.7em 0 0.4em; }
${r} p { margin: 0 0 1em; }
${r} p + p { margin-top: -1em; text-indent: 1.6em; }
${r} a { color: ${p.link}; text-decoration: underline; text-underline-offset: 0.14em; text-decoration-thickness: 0.5px; }
${r} strong { font-weight: 700; }
${r} ul, ${r} ol { margin: 1.2em 0; padding-left: 1.7em; text-align: left; }
${r} li { margin: 0.3em 0; }
${r} li > ul, ${r} li > ol { margin: 0.3em 0 0.3em; }
${r} blockquote {
  margin: 1.7em 2em; padding: 0; border: 0;
  color: ${p.quoteText}; font-style: italic; font-size: 0.96em; text-align: left;
}
${r} blockquote p + p { margin-top: -1em; text-indent: 1.2em; }
${r} blockquote > *:last-child { margin-bottom: 0; }
${r} code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.82em; background: ${p.codeBg}; color: ${p.codeText};
  border: 1px solid ${p.preBorder}; padding: 0.08em 0.35em; border-radius: 3px;
}
${r} pre {
  background: ${p.preBg}; border: 1px solid ${p.preBorder}; border-left: 3px solid ${p.quoteBar};
  border-radius: 2px; padding: 0.9rem 1.05rem; margin: 1.7em 0;
  font-size: 0.78em; line-height: 1.6; text-align: left; hyphens: none;
}
${r} pre code { background: none; border: 0; padding: 0; font-size: 1em; color: ${p.codeText}; }
${r} table {
  margin: 1.9em 0; font-size: 0.9em; text-align: left; hyphens: none;
  border-top: 2px solid ${p.text}; border-bottom: 2px solid ${p.text};
}
${r} th {
  font-weight: 600; font-variant-caps: small-caps; letter-spacing: 0.03em;
  padding: 0.5em 1.4em 0.5em 0; border-bottom: 1px solid ${p.border}; text-align: left;
}
${r} td { padding: 0.5em 1.4em 0.5em 0; border-bottom: 1px solid ${p.rule}; vertical-align: top; }
${r} tr:last-child td { border-bottom: 0; }
${r} hr { border: 0; border-top: 1px solid ${p.border}; width: 30%; margin: 2.6em auto; }
${r} img { display: block; margin: 1.7em auto; border-radius: 2px; }
${r} del { color: ${p.soft}; }
${r} mark { background: ${p.mark}; color: ${p.text}; padding: 0 0.15em; }
${r} kbd { font-family: inherit; font-size: 0.85em; border: 1px solid ${p.border}; border-radius: 3px; padding: 0.05em 0.35em; }
@media (max-width: 640px) { ${r} { font-size: 16px; padding: 1.6rem 1.15rem 2rem; text-align: left; } ${r} blockquote { margin: 1.5em 1em; } }
`;
}

const BUILDERS: Record<ThemeId, (r: string, p: Palette) => string> = {
  minimal: minimalCss,
  github: githubCss,
  serif: serifCss,
};

const PALETTES: Record<ThemeId, { light: Palette; dark: Palette }> = {
  minimal: { light: MINIMAL_LIGHT, dark: MINIMAL_DARK },
  github: { light: GITHUB_LIGHT, dark: GITHUB_DARK },
  serif: { light: SERIF_LIGHT, dark: SERIF_DARK },
};

/** Paper colour of a theme's light treatment — used behind exported files. */
export function exportPaper(id: ThemeId): string {
  return PALETTES[id].light.paper;
}

/** One theme, light treatment, rendered against an arbitrary root selector. */
export function lightStylesheet(id: ThemeId, root: string): string {
  return (
    structuralCss(root) + BUILDERS[id](root, PALETTES[id].light) + codeCss(root, CODE_LIGHT)
  );
}

/**
 * Stylesheet for the live preview: the light treatment on `.md-doc`, plus a
 * dark treatment that only applies under the site's `.dark` root class.
 */
export function previewStylesheet(id: ThemeId): string {
  const light = `.${PREVIEW_ROOT_CLASS}`;
  const dark = `.dark .${PREVIEW_ROOT_CLASS}`;
  return (
    lightStylesheet(id, light) +
    BUILDERS[id](dark, PALETTES[id].dark) +
    codeCss(dark, CODE_DARK)
  );
}

/**
 * Everything the print surface needs: the light treatment (people print and
 * share those, so exports are never dark), plus the rules that hide the rest
 * of the page and keep the PDF readable — sensible margins, no page breaks
 * mid-code-block or straight after a heading, and printed link targets.
 */
export function printStylesheet(id: ThemeId): string {
  const r = `#${PRINT_ROOT_ID} .${PRINT_BODY_CLASS}`;
  return `
#${PRINT_ROOT_ID} { display: none; }
@media print {
  @page { margin: 18mm 16mm; }
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} { display: block !important; }
${lightStylesheet(id, r)}
  ${r} { max-width: none !important; margin: 0 !important; padding: 0 !important; background: transparent !important; font-size: 11.5pt; }
  ${r} pre, ${r} code, ${r} th, ${r} td, ${r} mark, ${r} .hljs-addition, ${r} .hljs-deletion {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  ${r} pre { white-space: pre-wrap; word-break: break-word; overflow: visible !important; }
  ${r} pre code { white-space: pre-wrap; }
  ${r} table { display: table !important; width: 100% !important; overflow: visible !important; }
  ${r} pre, ${r} blockquote, ${r} table, ${r} tr, ${r} img, ${r} li { break-inside: avoid; page-break-inside: avoid; }
  ${r} h1, ${r} h2, ${r} h3, ${r} h4, ${r} h5, ${r} h6 { break-after: avoid; page-break-after: avoid; }
  ${r} a { color: #0b4fbb !important; text-decoration: underline; }
  ${r} a[href^="http"]::after {
    content: " (" attr(href) ")"; font-size: 0.8em; color: #555; word-break: break-all;
  }
}
`;
}

/**
 * The `<style>` block inlined into a downloaded standalone HTML file.
 *
 * The print block has to come *after* the theme, not before it: a media query
 * adds no specificity, so rules of equal weight declared later simply win.
 * That ordering is what lets the print rules undo the on-screen scrolling
 * affordances — a scrollable `pre` or table prints clipped, because paper does
 * not scroll.
 */
export function exportStylesheet(id: ThemeId, root: string): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: ${exportPaper(id)}; }
${lightStylesheet(id, root)}
${root} pre, ${root} blockquote, ${root} table, ${root} img { break-inside: avoid; }
${root} h1, ${root} h2, ${root} h3, ${root} h4 { break-after: avoid; }
@media print {
  @page { margin: 18mm 16mm; }
  html, body { background: #fff; }
  ${root} { max-width: none; margin: 0; padding: 0; background: transparent; font-size: 11.5pt; }
  ${root} pre, ${root} code, ${root} th, ${root} td, ${root} mark {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  ${root} pre { white-space: pre-wrap; word-break: break-word; overflow: visible; }
  ${root} pre code { white-space: pre-wrap; }
  ${root} table { display: table; width: 100%; overflow: visible; }
  ${root} h1, ${root} h2, ${root} h3, ${root} h4, ${root} h5, ${root} h6 { break-after: avoid; }
  ${root} a[href^="http"]::after {
    content: " (" attr(href) ")"; font-size: 0.8em; color: #555; word-break: break-all;
  }
}
`;
}
