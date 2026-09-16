import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { support, donationsConfigured, tools } from '@/config';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Every SecureKit tool is free. Contributions are voluntary, in Indian Rupees, and buy nothing.',
};

export default function PricingPage() {
  return (
    <LegalPage id="pricing" updated="16 September 2026">
      <h2>Everything is free</h2>
      <p>
        Every tool on SecureKit costs nothing to use. There is no paid tier, no free trial that runs
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
        SecureKit is written and maintained by one developer. The software is given away, so the
        only way the time spent on it is paid for is if people choose to chip in. A contribution is
        exactly that: <strong>a voluntary gift towards the developer&rsquo;s time and the cost of
        running the site</strong>. It is not a purchase, and nothing is delivered in return.
      </p>
      <ul>
        <li>
          <strong>Currency.</strong> Indian Rupees (INR).
        </li>
        <li>
          <strong>Amount.</strong> Whatever you think is right. You type the amount yourself; there
          are no fixed prices or packages.
        </li>
        <li>
          <strong>Where you enter it.</strong> On a payment page hosted by Razorpay, our payment
          processor. Card and banking details are entered on Razorpay&rsquo;s page, never on this
          site.
        </li>
        <li>
          <strong>How often.</strong> A one-off payment. Nothing recurring is set up, and there is
          no subscription to cancel.
        </li>
      </ul>
      <p>
        The amount charged is the amount you enter. We add no fee, no tax on top and no processing
        charge at checkout.
      </p>

      <h2>What a contribution does not buy</h2>
      <p>
        Contributing gives you nothing that you do not already have:
      </p>
      <ul>
        <li>
          <strong>No licence.</strong> SecureKit is MIT-licensed. Every right the licence grants,
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
          <strong>No extra features.</strong> There is one version of SecureKit and everyone gets
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
          link, which is also in the footer of every page. It opens a payment page hosted by
          Razorpay, where you choose the amount and pay.
        </p>
      ) : (
        <p>
          There is no contribution page open at the moment, so nothing on this site can take a
          payment today. When one opens, the link will appear in the footer of every page and it
          will lead to a payment page hosted by Razorpay, where you choose the amount yourself.
        </p>
      )}
      <p>
        If a payment goes wrong &mdash; a duplicate charge, or one you did not mean to make &mdash;
        the <Link href="/refunds">Refunds page</Link> explains what happens and how to ask. Because
        nothing is sold, nothing is posted or delivered to you; the{' '}
        <Link href="/shipping">Delivery page</Link> covers that.
      </p>
    </LegalPage>
  );
}
