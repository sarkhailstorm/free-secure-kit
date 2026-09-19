import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import {
  site,
  author,
  business,
  legalNameConfigured,
  addressConfigured,
  contactEmailConfigured,
  contactPhoneConfigured,
} from '@/config';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'How to reach the developer of SecureKit, and which route suits which question.',
};

const hoursConfigured: boolean = (business.hours as string).length > 0;

const addressLines: readonly string[] = [
  business.address.line1,
  business.address.line2,
  [business.address.city, business.address.state].filter((part) => part.length > 0).join(', '),
  business.address.postcode,
  business.address.country,
].filter((line) => line.length > 0);

export default function ContactPage() {
  return (
    <LegalPage id="contact" updated="16 September 2026">
      <h2>Who you are contacting</h2>
      <p>
        SecureKit is built and maintained by {author.name}, an independent software developer. It
        is a one-person project, so every message is read by the same person who writes the code.
      </p>
      {legalNameConfigured ? (
        <p>
          The registered name of the business is <strong>{business.legalName}</strong>.
        </p>
      ) : null}

      {addressConfigured ? (
        <>
          <h2>Postal address</h2>
          <p>
            {addressLines.map((line, index) => (
              <Fragment key={line + String(index)}>
                {line}
                {index < addressLines.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        </>
      ) : null}

      {contactEmailConfigured ? (
        <>
          <h2>Email</h2>
          <p>
            <a href={`mailto:${business.email}`}>{business.email}</a>
          </p>
        </>
      ) : null}

      {contactPhoneConfigured ? (
        <>
          <h2>Phone</h2>
          <p>
            <strong>{business.phone}</strong>
            {hoursConfigured ? ` — ${business.hours}` : null}
          </p>
        </>
      ) : null}

      <h2>GitHub issue tracker</h2>
      <p>
        SecureKit is open source, and its issue tracker is open to everyone. This is the best place
        for anything to do with the software itself:{' '}
        <a href={`${site.repo}/issues`} target="_blank" rel="noopener noreferrer">
          {site.repo}/issues
        </a>
      </p>
      <p>
        Issues there are public, so anyone can read them. Please do not attach a file you would not
        want other people to see, and do not post payment details of any kind.
      </p>

      <h2>Which route to use</h2>
      <ul>
        <li>
          <strong>A tool is broken, or you want a new feature.</strong> Use the issue tracker.
          Telling us the browser you used and what you were trying to do is usually enough to fix
          it.
        </li>
        {contactEmailConfigured ? (
          <li>
            <strong>Anything about a contribution.</strong> Email us. That covers a payment that did
            not go through, a duplicate charge, a receipt, or a refund request &mdash; see the{' '}
            <Link href="/refunds">Refunds page</Link> for what happens next.
          </li>
        ) : null}
        {!contactEmailConfigured && contactPhoneConfigured ? (
          <li>
            <strong>Anything about a contribution.</strong> Call the number above. That covers a
            payment that did not go through, a duplicate charge, or a refund request &mdash; see the{' '}
            <Link href="/refunds">Refunds page</Link> for what happens next.
          </li>
        ) : null}
        <li>
          <strong>A question about privacy, or about what a tool does with your file.</strong> The{' '}
          <Link href="/privacy">Privacy page</Link> answers most of these in detail. If it does not
          answer yours, ask on the issue tracker.
        </li>
      </ul>

      <h2>There is no account, so there is nothing to recover</h2>
      <p>
        SecureKit has no sign-up, no login and no password. That means there is no account to
        recover, no subscription to cancel and no login support for us to provide. If a tool stops
        working for you, it is a bug in the software rather than a problem with your account, and
        the issue tracker is the right place for it.
      </p>
      <p>
        We also cannot help you recover a file. Your files are never uploaded, so we never hold a
        copy of anything you have worked on.
      </p>
    </LegalPage>
  );
}
