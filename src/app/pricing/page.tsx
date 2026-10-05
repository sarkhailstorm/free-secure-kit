import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { SupportRoutes } from '@/components/SupportRoutes';
import { support, donationsConfigured, tools } from '@/config';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Every tool here is free. Contributions are voluntary, in US dollars or rupees, and buy nothing.',
};

export default function PricingPage() {
  return (
    <LegalPage id="pricing" updated="5 October 2026">
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
        There are two ways to send one, and you pick the one that matches where you are. Each is run
        by a single company, and you pay on that company&rsquo;s own page, not on ours. The money
        reaches the developer through that company, and never passes through this site.
      </p>
      <ul>
        <li>
          <strong>Currency.</strong> You pay in US dollars on one route and in rupees on the other.
          Neither one converts your money for you.
        </li>
        <li>
          <strong>Amount.</strong> Whatever you think is right. You type the amount yourself; there
          are no fixed prices or packages.
        </li>
        <li>
          <strong>Where you enter it.</strong> On the payment company&rsquo;s own page, which you
          reach by following a link from here. Neither page is on this site.
        </li>
        <li>
          <strong>How often.</strong> A one-off payment. Nothing recurring is set up, and there is
          no subscription to cancel.
        </li>
      </ul>
      <p>
        This site only links out. There is no donate widget and no payment script anywhere on
        FreeSecureKit, so no payment code ever runs on a page that is handling your files. That is
        deliberate.
      </p>
      <p>
        We never see your card or bank details. On either page you type the amount yourself and
        may leave a short note. We can see the amount, the currency, the date, whether the payment
        went through, any note you left, and whatever contact details the payment company passes on
        to us.
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

      <h2 id="contribute">How to contribute</h2>
      {donationsConfigured ? (
        <>
          <p>
            Pick the one that matches where you are. Each link opens that company&rsquo;s own page in
            a new tab, where you type the amount and pay. The {support.label} link on every page
            leads to the same two options.
          </p>
          <SupportRoutes className="my-5" />
          <p>
            PayPal will not work if you are in India. It stopped handling payments inside India on 1
            April 2021, so use the rupee link instead.
          </p>
        </>
      ) : (
        <p>
          There is no contribution page open at the moment, so there is nothing to contribute to
          today. When one opens, the links will appear here and the {support.label} link on every
          page will lead to them. You will type the amount yourself and pay on the payment
          company&rsquo;s own page.
        </p>
      )}
      <p>
        If a payment goes wrong &mdash; a duplicate charge, or one you did not mean to make &mdash;
        the <Link href="/refunds">Refunds page</Link> explains what happens and how to ask. A refund
        goes back through whichever company took the payment, to however you paid. Because nothing
        is sold, nothing is posted or delivered to you; the <Link href="/shipping">Delivery page</Link>{' '}
        covers that.
      </p>
    </LegalPage>
  );
}
