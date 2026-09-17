undefined<div align="center">

# SecureKit

**Private file tools that never leave your browser.**

Clean spreadsheets, convert data formats, compress images and edit PDFs —
all processed locally, with nothing uploaded to a server.

[Live site](https://securekit.vercel.app) · [Report an issue](https://github.com/sarkhailstorm/securekit/issues)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## What this is

Four everyday file and data utilities, in one place, free and without an account:

| Tool | What it does |
| --- | --- |
| [PDF Tools](src/app/tools/pdf-tools/page.tsx) | Merge PDFs and reorder their pages, extract pages as PDFs or PNG/JPEG images, compress, build a PDF from images, convert a PDF to an editable Word document, and turn the tables in a PDF into an Excel spreadsheet |
| [Image Tools](src/app/tools/image-tools/page.tsx) | Batch compress and resize JPEG, PNG and WebP, or cut the subject out of a photo and save it with a transparent or solid-colour background |
| [CSV & Excel Cleaner](src/app/tools/csv-cleaner/page.tsx) | Remove duplicate and blank rows, trim whitespace, standardise headers, normalise inconsistent date formats |
| [Developer Tools](src/app/tools/developer-tools/page.tsx) | Convert between JSON, CSV and YAML with nesting flattened to dot-notation columns and back; a live Markdown editor exporting to standalone HTML or PDF with themes; diff checker, case converter, whitespace cleaner and Base64 / URL / JWT encoding |

No sign-up, no email wall, no file size caps, no paywalled features. Every tool is complete.

## The "no upload" part

This is the whole point, so it is worth being precise about what it means.

Conventional online converters work by **uploading your file to a server**, processing it there and
sending the result back. That means your spreadsheet of customer records, your scanned contract or
your private photos land on a machine you do not control, subject to a retention policy you did not
read.

SecureKit does the processing in **the page you already have open**. When you drop a file onto a tool,
the browser reads it into memory with the standard `File` API and the conversion runs in JavaScript
on your own machine. The result is handed back to you as an in-memory blob. There is no upload step
because there is no server to upload to — the whole site is static files.

**You can verify this yourself**, and you should not take our word for it:

- Open your browser's developer tools, switch to the Network tab, and use any tool. You will not
  see your file go anywhere.
- Load the site, turn off your Wi-Fi, and keep using it. Every tool still works offline.
- Read the source. Every tool's page links directly to its own source file.

What this approach genuinely costs you: very large files are limited by your device's memory rather
than by a server's, and PDF compression is weaker than what a server-side tool like Ghostscript can
manage. We would rather be honest about that trade-off than quietly take your documents.

### Enforced, not just promised

The app ships a [Content-Security-Policy](src/app/layout.tsx) with `connect-src 'self'` and
`form-action 'none'`. The browser itself then refuses any attempt to send data to another origin,
so the no-upload guarantee does not rest on trusting the code — or on every future contributor
getting it right. If a dependency ever tried to phone home, the request would simply be blocked.

### What is *not* collected

No analytics, no tracking pixels, no cookies, no error reporting service, no fonts or scripts
fetched from a third-party CDN at runtime. The support button is a plain outbound link to a hosted
Razorpay Payment Page rather than an embedded payment widget, specifically so that no third-party
script runs on this site and no payment code ever touches a page that handles your files.

The only data stored at all is in your own browser: your light/dark theme preference, the Markdown
editor's draft so a refresh does not lose your work, and a flag recording that you dismissed the
donation message. All of it is in `localStorage`/`sessionStorage` on your device and none of it is
ever transmitted.

## Tech stack

- **[Next.js](https://nextjs.org) 15** (App Router) with a fully static export — no server runtime
- **TypeScript** in strict mode
- **Tailwind CSS**, themed with CSS variables for light and dark modes
- Processing libraries, all running client-side and loaded on demand:
  [papaparse](https://www.papaparse.com/), [SheetJS](https://sheetjs.com/),
  [js-yaml](https://github.com/nodeca/js-yaml),
  [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression),
  [pdf-lib](https://pdf-lib.js.org/), [pdf.js](https://mozilla.github.io/pdf.js/),
  [JSZip](https://stuk.github.io/jszip/), [marked](https://marked.js.org/),
  [highlight.js](https://highlightjs.org/), [DOMPurify](https://github.com/cure53/DOMPurify),
  [jsdiff](https://github.com/kpdecker/jsdiff),
  [onnxruntime-web](https://github.com/microsoft/onnxruntime)

Because the output is a static site with no serverless functions, hosting it costs nothing on
Vercel, Cloudflare Pages, Netlify or GitHub Pages, and stays free regardless of traffic.

## Running it locally

Requires Node.js 18.18 or newer.

```bash
git clone https://github.com/your-username/securekit.git
cd securekit
npm install
npm run dev
```

Then open <http://localhost:3000>.

| Script | Does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Produce the static site in `out/` |
| `npm run start` | Serve the built `out/` directory locally |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint |

### A note on the SheetJS dependency

`xlsx` is installed from `https://cdn.sheetjs.com/...` rather than from npm. This is deliberate and
is [SheetJS's own documented installation method](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
The `xlsx` package published on npm is frozen at an old version with unpatched prototype-pollution
and ReDoS advisories, which matters a great deal here because this app parses spreadsheets that
users supply. The vendor CDN serves the current, patched release.

### The pdf.js worker

`npm install` and `npm run build` copy the pdf.js worker from `node_modules` into `public/` via
`scripts/copy-pdf-worker.mjs`, so it is served from this site's own origin instead of a CDN. That
keeps the no-third-party-requests promise intact and lets the PDF tools work offline.

### Models for the background remover

The background remover needs two files that are far too big to put in a JavaScript bundle: the
cut-out models in `public/models/`, and the browser runtime that runs them in `public/ort/`.

The runtime is copied out of `node_modules` by `scripts/copy-onnx-runtime.mjs`, exactly as the
pdf.js worker is, and is not committed. The two models **are** committed, because they come from
other people's servers rather than from npm, and a build should not break the day one of those
servers goes away. `scripts/fetch-bg-models.mjs` fetches them once, checks the byte count and
SHA-256 of each, and does nothing when they are already in place. Both are Apache-2.0 — see
[MODEL-LICENCES.md](MODEL-LICENCES.md).

None of it is fetched when the site loads. A model is downloaded only when someone opens the tool
and asks for a cut-out, and the browser then keeps it, so it is never downloaded twice.

## Deploying

The build produces a plain static site, so any static host works.

**Vercel** — import the repository; the defaults are correct, and it will detect Next.js.

**Cloudflare Pages / Netlify** — build command `npm run build`, output directory `out`.

**GitHub Pages** — `npm run build`, then publish `out/`. If you deploy to a project subpath rather
than a domain root, set `basePath` in [`next.config.mjs`](next.config.mjs) to match.

## Configuration

Everything site-specific lives in one file: **[`config.ts`](config.ts)**.

Donations run through a hosted Razorpay Payment Page, so there is no server and no API key in this
repository. To point them at your own account, set the one value:

```ts
export const support = {
  url: '',   // ← your Razorpay Payment Page URL, e.g. https://rzp.io/rzp/abc1234
  ...
};
```

The header button, the footer callout and the post-download message all read from it. While it is
empty, the donation UI hides itself rather than linking to a dead page.

The same file holds the site name, URL, repository link and the tool registry that drives the
landing page and navigation.

## Support

SecureKit is free and open source, and every feature works without paying. If it saved you some time,
you are welcome to chip in via the support link in the footer — entirely optional, and nothing is
gated behind it.

## Contributing

Issues and pull requests are welcome. Two rules matter more than the rest:

1. **Nothing may be uploaded.** Any change that sends user file content off the device will be
   rejected. That includes analytics and third-party runtime scripts.
2. **No feature gets paywalled.** Donations are a tip, not a subscription.

Beyond that: keep tools focused on one job, use the semantic theme tokens so dark mode keeps
working, and load heavy libraries with a dynamic `import()` so they stay out of the initial bundle.

## License

[MIT](LICENSE).
