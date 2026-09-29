import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { support, donationsConfigured, tools } from '@/config';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Every tool here is free. Contributions are voluntary, in your own currency, and buy nothing.',
};

export default function PricingPage() {
  return (
    <LegalPage id="pricing" updated="16 September 2026">
      <h2>Everything is free</h2>
      <p>
        Every tool on FreeSecureKit costs nothing to use. There is no paid tier, no free trial that runs
        out, no usage limit, no file size cap you can pay to lift, and no feature that unlocks when
        you pay. There is no account, and you are never asked for card details to use anything on
        this site.
      </p>

      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.id}>
              <td>{tool.name}</td>
              <td>Free</td>
            </tr>
          ))}
          <tr>
            <td>Everything else on the site</td>
            <td>Free</td>
          </tr>
        </tbody>
      </table>

      <p>
        There are no hidden charges, no adverts, no sponsored placements and no upsell. The price
        above is the whole price.
      </p>

      <h2>So what is the payment for?</h2>
      <p>
        FreeSecureKit is written and maintained by one developer. The software is given away, so the
        only way the time spent on it is paid for is if people choose to chip in. A contribution is
        exactly that: <strong>a voluntary gift towards the developer&rsquo;s time and the cost of
        running the site</strong>. It is not a purchase, and nothing is delivered in return.
      </p>
      <p>
        Two companies are involved. {support.platform} hosts the page you land on, but never holds
        or handles the money. {support.processor} takes the payment, and is the only one that sees
        your card or bank details. The money goes straight from you into the developer&rsquo;s own
        account at {support.processor}.
      </p>
      <ul>
        <li>
          <strong>Currency.</strong> You pay in your own currency. {support.processor} converts it.
        </li>
        <li>
          <strong>Amount.</strong> Whatever you think is right. You type the amount yourself; there
          are no fixed prices or packages.
        </li>
        <li>
          <strong>Where you enter it.</strong> On a page hosted by {support.platform}, which asks
          for a name and an email address and lets you leave a message, and then on{' '}
          {support.processor}, which asks for whatever it needs to take the payment. Neither page
          is on this site.
        </li>
        <li>
          <strong>How often.</strong> A one-off payment. Nothing recurring is set up, and there is
          no subscription to cancel.
        </li>
      </ul>
      <p>
        This site only links out to {support.platform}. There is no donate widget and no payment
        script anywhere on FreeSecureKit, so no payment code ever runs on a page that is handling your
        files. That is deliberate.
      </p>
      <p>
        We never see your card or bank details. We see only what {support.platform} and{' '}
        {support.processor} show us: a name, an email address, an amount, and a message if you left
        one.
      </p>
      <p>
        We add nothing on top of the amount you type in: no fee, no tax and no processing charge of
        our own.
      </p>

      <h2>What a contribution does not buy</h2>
      <p>
        Contributing gives you nothing that you do not already have:
      </p>
      <ul>
        <li>
          <strong>No licence.</strong> FreeSecureKit is MIT-licensed. Every right the licence grants,
          you already have for free.
        </li>
        <li>
          <strong>No support entitlement.</strong> There is no priority queue, no guaranteed reply
          and no service level of any kind.
        </li>
        <li>
          <strong>No priority.</strong> Bug reports and feature requests are judged on their merits,
          not on whether the person asking has contributed.
        </li>
        <li>
          <strong>No extra features.</strong> There is one version of FreeSecureKit and everyone gets
          the same one. Nothing is hidden behind a payment, before or after.
        </li>
      </ul>

      <h2>How to contribute</h2>
      {donationsConfigured ? (
        <p>
          Use the{' '}
          <a href={support.url} target="_blank" rel="noopener noreferrer">
            {support.label}
          </a>{' '}
          link, which is also in the footer of every page. It opens a page on {support.platform},
          where you choose the amount and pay through {support.processor}.
        </p>
      ) : (
        <p>
          There is no contribution page open at the moment, so there is nothing to contribute to
          today. When one opens, the link will appear in the footer of every page. It will
          lead to a page on {support.platform}, where you choose the amount yourself and pay
          through {support.processor}.
        </p>
      )}
      <p>
        If a payment goes wrong &mdash; a duplicate charge, or one you did not mean to make &mdash;
        the <Link href="/refunds">Refunds page</Link> explains what happens and how to ask. A refund
        goes back through {support.processor}, to however you paid. Because nothing is sold, nothing
        is posted or delivered to you; the <Link href="/shipping">Delivery page</Link> covers that.
      </p>
    </LegalPage>
  );
}
