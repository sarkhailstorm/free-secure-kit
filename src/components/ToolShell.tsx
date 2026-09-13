import Link from 'next/link';
import { ArrowLeft, Code2 } from 'lucide-react';
import { getTool, sourceUrl, type ToolId } from '@/config';
import { PrivacyBadge } from './PrivacyBadge';

/**
 * Shared frame for every tool page: back link, title, description, the
 * "never uploaded" badge, and a link to this tool's own source file.
 */
export function ToolShell({
  id,
  children,
}: {
  id: ToolId;
  children: React.ReactNode;
}) {
  const tool = getTool(id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="no-print">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All tools
        </Link>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {tool.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{tool.description}</p>
          </div>
          <a
            href={sourceUrl(tool.source)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:text-ink sm:self-auto"
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden />
            See how this works
            <span aria-hidden>→</span>
          </a>
        </div>

        <PrivacyBadge className="mt-5" />
      </div>

      <div className="mt-7">{children}</div>
    </div>
  );
}
