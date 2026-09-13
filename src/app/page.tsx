import Link from 'next/link';
import {
  ArrowLeftRight,
  ArrowRight,
  FileCode2,
  FileStack,
  Github,
  ImageDown,
  Table2,
  Type,
  WifiOff,
  Zap,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { site, tools } from '@/config';

const icons: Record<string, LucideIcon> = {
  Table2,
  ArrowLeftRight,
  ImageDown,
  FileStack,
  FileCode2,
  Type,
};

const promises = [
  {
    icon: WifiOff,
    title: 'Nothing is uploaded',
    body: 'Every file is processed by your own browser. No server ever receives it — you can disconnect from the internet and the tools still work.',
  },
  {
    icon: UserX,
    title: 'No accounts, ever',
    body: 'No sign-up, no email wall, no trial. Open a tool and use it. Nothing is metered and nothing is behind a paywall.',
  },
  {
    icon: Zap,
    title: 'Instant, not "processing…"',
    body: 'Without a round trip to a server there is nothing to wait for. No queues, no artificial progress bars, no file size caps.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-ok/25 bg-ok/10 px-3 py-1 text-[12px] font-medium text-ok">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
              </span>
              100% client-side · nothing uploaded
            </p>

            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
              File tools that never
              <br className="hidden sm:block" /> see your files.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
              Clean spreadsheets, convert data formats, compress images and edit PDFs — all
              processed inside your browser. Your documents stay on your device, because there is
              no server to send them to.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#tools"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-ink shadow-sm transition-all hover:brightness-110"
              >
                Browse the tools
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a
                href={site.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-elevated"
              >
                <Github className="h-4 w-4" aria-hidden />
                View source
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- tools */}
      <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">Six tools, no strings</h2>
            <p className="mt-1.5 text-sm text-muted">
              Each one does a single job, with no limits and no sign-up.
            </p>
          </div>
        </div>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = icons[tool.icon] ?? Table2;
            return (
              <li key={tool.id}>
                <Link
                  href={tool.href}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lift"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-accent-ink">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>

                  <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-ink">
                    {tool.name}
                  </h3>
                  <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">
                    {tool.blurb}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {tool.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-line/60 px-1.5 py-0.5 text-[11px] font-medium text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                    Open tool
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ------------------------------------------------------------- promise */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Why &ldquo;no upload&rdquo; matters
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Most online converters ask you to hand over the file first. That means your spreadsheet
            of customer records, your scanned contract or your private photos land on someone
            else&rsquo;s machine. {site.name} takes a different route: the conversion code runs in
            the page you already have open.
          </p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {promises.map((p) => (
              <li key={p.title} className="rounded-2xl border border-line bg-bg p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <p.icon className="h-4 w-4" aria-hidden />
                </span>
                <h3 className="mt-3.5 text-sm font-semibold text-ink">{p.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{p.body}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-[13px] text-faint">
            Don&rsquo;t take our word for it —{' '}
            <a
              href={site.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
            >
              read the source
            </a>{' '}
            or open your browser&rsquo;s network tab while you use a tool. You won&rsquo;t see your
            file go anywhere.
          </p>
        </div>
      </section>
    </>
  );
}
