import Link from 'next/link';
import { Github, Lock } from 'lucide-react';
import { site, tools, author, donationsConfigured, legalPages } from '@/config';
import { SupportButton } from './SupportButton';

export function Footer() {
  return (
    <footer className="no-print mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {donationsConfigured ? (
          <div className="mb-10 flex flex-col items-start gap-4 rounded-2xl border border-line bg-bg p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink">
                These tools are free, and always will be.
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                If they saved you some time, you are very welcome to chip in ☕
              </p>
            </div>
            <SupportButton />
          </div>
        ) : null}

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="text-sm font-semibold tracking-tight text-ink">{site.name}</p>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
              Free tools for spreadsheets, images, PDFs and text. Nothing to sign up for, nothing uploaded.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-ok/25 bg-ok/10 px-2.5 py-1.5 text-[12px] font-medium text-ok">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Your files never leave your device
            </p>
          </div>

          <nav aria-label="Tools">
            <p className="text-[13px] font-semibold text-ink">Tools</p>
            <ul className="mt-3 space-y-2">
              {tools.map((tool) => (
                <li key={tool.id}>
                  <Link
                    href={tool.href}
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Policies">
            <p className="text-[13px] font-semibold text-ink">Site</p>
            <ul className="mt-3 space-y-2">
              {legalPages.map((page) => (
                <li key={page.id}>
                  <Link
                    href={page.href}
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Project">
            <p className="text-[13px] font-semibold text-ink">Project</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href={site.repo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
                >
                  <Github className="h-3.5 w-3.5" aria-hidden />
                  Source on GitHub
                </a>
              </li>
              <li>
                <a
                  href={`${site.repo}/blob/${site.repoBranch}/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-muted transition-colors hover:text-ink"
                >
                  MIT License
                </a>
              </li>
              <li>
                <a
                  href={`${site.repo}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-muted transition-colors hover:text-ink"
                >
                  Report an issue
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-[12px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {author.since} {author.name}. Released under the{' '}
            <a
              href={`${site.repo}/blob/${site.repoBranch}/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-line underline-offset-2 transition-colors hover:text-ink"
            >
              MIT License
            </a>
            .
          </p>

          <p>
            Built by{' '}
            <a
              href={author.github}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-muted underline decoration-line underline-offset-2 transition-colors hover:text-ink"
            >
              {author.name}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
