import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import {
  site,
  author,
  business,
  legalNameConfigured,
  support,
  donationsConfigured,
  tools,
} from '@/config';

export const metadata: Metadata = {
  title: 'About',
  description:
    'FreeSecureKit is an open-source set of free file tools that run entirely in your browser, built by one developer.',
};

export default function AboutPage() {
  return (
    <LegalPage id="about" updated="16 September 2026">
      <h2>What FreeSecureKit is</h2>
      <p>
        FreeSecureKit is software: a web application that gives you {tools.length} free tools for everyday file
        work &mdash; PDFs, spreadsheets, images, structured data, Markdown and plain text. There is
        nothing to install and nothing to sign up for. You open a page, drop in a file, and get the
        result back.
      </p>

      <h2>The tools</h2>
      <ul>
        {tools.map((tool) => (
          <li key={tool.id}>
            <strong>{tool.name}</strong> &mdash; {tool.blurb}
          </li>
        ))}
      </ul>

      <h2>What makes it different</h2>
      <p>
        Most free file tools on the web work the same way: you upload your file to a
        company&rsquo;s server, the work happens there, and the result comes back to you. That means
        handing your spreadsheet, your scanned document or your photos to someone else.
      </p>
      <p>
        FreeSecureKit is built the other way round. All the code that does the work is ordinary
        JavaScript running inside your own browser, on your own machine, so{' '}
        <strong>your files are never uploaded</strong>. There is no server to upload them to: the
        site is a set of static files with no application code running behind it, and no database.
        That is also why there is no account &mdash; nothing here needs to know who you are.
      </p>
      <p>
        The full detail, including the small number of things that do get saved in your browser and
        what our host can see, is set out on the <Link href="/privacy">Privacy page</Link>.
      </p>

      <h2>Who runs it</h2>
      <p>
        FreeSecureKit is built and maintained by {author.name}, an independent software developer, and
        has been online since {author.since}. It is a one-person project: there is no team, no
        investors and no company behind it.
      </p>
      {legalNameConfigured ? (
        <p>
          The business behind the site is <strong>{business.legalName}</strong>.
        </p>
      ) : null}

      <h2>Open source</h2>
      <p>
        The whole project is released under the MIT licence and the source code is public. You can
        read exactly how each tool handles a file, check that the privacy claims on this site are
        true, run your own copy, or reuse any part of it in your own work.
      </p>
      <p>
        The repository is at{' '}
        <a href={site.repo} target="_blank" rel="noopener noreferrer">
          {site.repo}
        </a>
        . FreeSecureKit is copyright {author.since} {author.name}, released under the{' '}
        <a
          href={`${site.repo}/blob/${site.repoBranch}/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
        >
          MIT Licence
        </a>
        .
      </p>

      <h2>How it is paid for</h2>
      <p>
        This site is free and stays free. Nothing is sold here, nothing is locked behind a payment,
        and there are no adverts. The running costs are small because there is no server doing work
        for you, and the real cost is the developer&rsquo;s time.
      </p>
      <p>
        If the tools have saved you some trouble, you are welcome to make a voluntary contribution
        towards that time. It is a gift, not a purchase: it buys no features, no support and no
        priority. The <Link href="/pricing">Pricing page</Link> sets out exactly what is free and
        what a contribution is.
      </p>
      {donationsConfigured ? (
        <p>
          Contributions are handled away from this site. The button takes you out to{' '}
          {support.platform}, and {support.processor} takes the payment there, in your own currency.
          Nothing is embedded here and no payment code runs on a page that is handling your files.
        </p>
      ) : (
        <p>
          There is no contribution page open at the moment. When one opens it will be a link out to{' '}
          {support.platform}, with {support.processor} taking the payment there.
        </p>
      )}

      <h2>Getting in touch</h2>
      <p>
        Bug reports, questions and feature requests are all welcome. The{' '}
        <Link href="/contact">Contact page</Link> lists the ways to reach us.
      </p>
    </LegalPage>
  );
}
