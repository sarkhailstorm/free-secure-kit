import type { Metadata, Viewport } from 'next';
import './globals.css';
import { site } from '@/config';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    'csv cleaner',
    'json to csv',
    'yaml converter',
    'image compressor',
    'merge pdf',
    'split pdf',
    'markdown to pdf',
    'text diff',
    'client-side',
    'private',
    'no upload',
  ],
  openGraph: {
    type: 'website',
    url: site.url,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    siteName: site.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0e' },
  ],
};

/**
 * Applies the saved theme before first paint so there is no light-mode flash.
 * Kept inline and tiny; it reads only localStorage, never the network.
 */
const themeScript = `
(function () {
  try {
    var saved = localStorage.getItem('privly:theme');
    var dark = saved ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

/**
 * Content-Security-Policy, delivered as a meta tag because a static export has
 * no server to set headers.
 *
 * The directive that matters here is `connect-src 'self'`: it makes the
 * "your files are never uploaded" promise something the *browser* enforces
 * rather than something you have to take on trust. Even if a dependency tried
 * to phone home — or a future edit introduced a bug — the request would be
 * blocked outright. `form-action 'none'` closes the other obvious exfiltration
 * route, and `object-src 'none'` blocks plugin content.
 *
 * `script-src` has to keep 'unsafe-inline' for now: Next.js emits inline
 * bootstrap scripts, and a static site cannot issue per-request nonces. So
 * this policy is hardening against data exfiltration, not a complete defence
 * against XSS — the Markdown tool sanitises its own HTML with DOMPurify for
 * that.
 *
 * blob: and data: are needed for canvas output, generated file previews and
 * the pdf.js worker, and are all local to the page.
 *
 * One thing this policy must NOT do is break `next dev`. The dev server
 * compiles modules through eval() for hot reloading and talks to a websocket,
 * so development needs 'unsafe-eval' and a ws: connection. Without them React
 * never hydrates and the whole app goes inert — rendered, but nothing
 * clickable. Those two allowances are development-only; the deployed build
 * keeps the strict policy.
 */
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} blob:`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' blob: data:${isDev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={csp} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-accent-ink"
        >
          Skip to content
        </a>
        <ToastProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
