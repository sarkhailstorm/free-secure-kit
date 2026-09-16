import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { legalPages, type LegalPageId } from '@/config';

export function LegalPage({
  id,
  updated,
  children,
}: {
  id: LegalPageId;
  updated: string;
  children: React.ReactNode;
}) {
  const page = legalPages.find((p) => p.id === id);
  if (!page) throw new Error(`Unknown legal page: ${id}`);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All tools
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {page.title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{page.blurb}</p>
      <p className="mt-1 text-[13px] text-faint">Last updated {updated}</p>

      <div className="legal mt-8">{children}</div>

      <nav aria-label="Policies" className="mt-12 border-t border-line pt-6">
        <p className="text-[13px] font-semibold text-ink">Other pages</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {legalPages
            .filter((p) => p.id !== id)
            .map((p) => (
              <li key={p.id}>
                <Link
                  href={p.href}
                  className="text-[13px] text-muted underline decoration-line underline-offset-2 transition-colors hover:text-ink"
                >
                  {p.title}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}
