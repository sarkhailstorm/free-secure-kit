import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeftRight,
  ArrowRight,
  FileCode2,
  FileStack,
  FileType2,
  Home,
  ImageDown,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { tools } from '@/config';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

const icons: Record<string, LucideIcon> = {
  Table2,
  ArrowLeftRight,
  ImageDown,
  FileStack,
  FileType2,
  FileCode2,
  Type,
};


export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
      <p className="font-mono text-sm font-medium tracking-widest text-accent">404</p>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        That page isn&rsquo;t here.
      </h1>

      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
        The link may be out of date, or the address might have a typo in it. Nothing has been lost
        on your end &mdash; this site never holds your files in the first place.
      </p>

      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-ink shadow-sm transition-all hover:brightness-110"
        >
          <Home className="h-4 w-4" aria-hidden />
          Back to the tools
        </Link>
      </div>

      <div className="mt-12 border-t border-line pt-8">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Or jump straight to a tool</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {tools.map((tool) => {
            const Icon = icons[tool.icon] ?? Table2;
            return (
              <li key={tool.id}>
                <Link
                  href={tool.href}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 transition-all hover:border-accent/40 hover:shadow-card"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
                    {tool.name}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
