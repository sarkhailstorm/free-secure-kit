'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Github, Menu, ShieldCheck, X } from 'lucide-react';
import { site, tools } from '@/config';
import { SupportButton } from './SupportButton';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-ink"
          onClick={() => setOpen(false)}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-ink">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-[15px]">{site.name}</span>
        </Link>

        <nav aria-label="Tools" className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={tool.href}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-line/50 hover:text-ink"
            >
              {tool.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={site.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:text-ink sm:inline-flex"
          >
            <Github className="h-4 w-4" aria-hidden />
          </a>
          <ThemeToggle />
          <div className="hidden sm:block">
            <SupportButton size="sm" />
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:text-ink lg:hidden"
          >
            {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-line bg-bg lg:hidden">
          <nav aria-label="Tools" className="mx-auto grid max-w-6xl gap-0.5 px-4 py-3 sm:px-6">
            {tools.map((tool) => (
              <Link
                key={tool.id}
                href={tool.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-line/50 hover:text-ink"
              >
                {tool.name}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t border-line px-3 pt-3">
              <a
                href={site.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
              >
                <Github className="h-4 w-4" aria-hidden />
                GitHub
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
