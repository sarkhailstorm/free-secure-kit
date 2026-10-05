# Contributing

Issues and pull requests are welcome. This is a small project maintained by one
person, so a short issue before a large pull request saves us both time.

## Two rules that override everything else

1. **Nothing may be uploaded.** Any change that sends user file content off the
   device will be rejected. That includes analytics, error reporting and
   third-party runtime scripts. The Content-Security-Policy in
   [`src/app/layout.tsx`](src/app/layout.tsx) enforces this, so a change that
   needs the policy loosened is almost certainly the wrong change.

2. **No feature gets paywalled.** Contributions are a tip, not a subscription.

## Getting it running

Node 18.18 or newer.

```bash
git clone https://github.com/sarkhailstorm/free-secure-kit.git
cd free-secure-kit
npm install
npm run dev
```

`npm install` fetches the ONNX models and copies the pdf.js worker and qpdf out
of `node_modules`, so the first run takes a minute.

Before opening a pull request:

```bash
npm run typecheck
npm run lint
npm run build
```

CI runs the same three. Lint runs with `--max-warnings 0`, so warnings fail.

## House style

- **Tools do one job.** Keep a tool focused rather than growing a second
  purpose into it.
- **Load heavy libraries with a dynamic `import()`** so they stay out of the
  initial bundle. Everything in `src/lib` that pulls in a parser or a model
  follows this.
- **Use the semantic theme tokens** (`text-ink`, `bg-surface`, `border-line`
  and so on) rather than raw Tailwind colours, or dark mode breaks.
- **Comment the why, not the what.** Most code needs none. Keep one where a
  reader would otherwise trip: a workaround, a non-obvious constraint, a magic
  number's origin. One line.
- **Plain British English** in anything a user reads.

## Adding a tool

Tools live as a tab inside one of the four existing cards rather than as a new
card. Add the panel under `src/components/tools/<card>/`, the logic under
`src/lib/`, and wire it into that card's page. If you think something warrants a
new card, open an issue first.

## Things worth knowing

- `xlsx` is installed from SheetJS's own CDN rather than npm, deliberately. The
  npm copy is frozen at a version with unpatched advisories, and this app parses
  spreadsheets that users supply.
- The models in `public/models/` are committed; the ONNX runtime and qpdf are
  copied from `node_modules` at install time and are not. See
  [THIRD-PARTY-LICENCES.md](THIRD-PARTY-LICENCES.md).
- Browser storage keys are prefixed `free-secure-kit:`, with the pre-rename
  `securekit:` keys still read once and migrated. Do not rename a key without
  carrying the old one across.
