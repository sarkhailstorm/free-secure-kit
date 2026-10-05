import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { donationsConfigured } from '@/config';
import { CoffeeIcon } from '@/components/CoffeeIcon';
import { SupportRoutes } from '@/components/SupportRoutes';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Every tool here is free and stays free. If one saved you some time, there are two ways to leave a tip.',
};

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to the tools
      </Link>

      <span className="mt-8 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <CoffeeIcon className="h-5 w-5" />
      </span>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Thanks for thinking of it
      </h1>

      {donationsConfigured ? (
        <>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            These tools are free, and always will be. A tip is a gift, not a purchase, so pick
            whichever option suits you and type in any amount.
          </p>

          <SupportRoutes className="mt-7" />

          <p className="mt-5 text-[13px] leading-relaxed text-muted">
            PayPal cannot take payments from people inside India, so if you are in India, please use
            the rupee option.
          </p>

          <p className="mt-7 border-t border-line pt-5 text-[13px] leading-relaxed text-muted">
            Each option opens that company&rsquo;s own page in a new tab, so no payment code ever
            runs here. The <Link href="/pricing">Pricing page</Link> has the full detail, and the{' '}
            <Link href="/refunds">Refunds page</Link> is there if something goes wrong.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          There is no way to contribute open at the moment, so there is nothing to do here today.
          Every tool stays free regardless. The <Link href="/pricing">Pricing page</Link> explains
          how that works.
        </p>
      )}
    </div>
  );
}
