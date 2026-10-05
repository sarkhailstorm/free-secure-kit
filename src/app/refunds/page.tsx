import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { business, contactEmailConfigured, site, supportProviders } from '@/config';

export const metadata: Metadata = {
  title: 'Refunds',
  description:
    'Nothing is sold on FreeSecureKit. If you contributed and want the money back, here is the window, the process and the timeline.',
};

export default function Page() {
  const providers = supportProviders.join(' or ');

  return (
    <LegalPage id="refunds" updated="5 October 2026">
      <h2>There is nothing to cancel</h2>
      <p>
        The tools are free. There is no product, no subscription, no order and no account, so there
        is no purchase to cancel and no plan to stop. Every tool stays available whether you pay
        anything or not.
      </p>
      <p>
        The only payment on this site is a voluntary contribution. It is a one-off payment, never
        recurring, and it buys nothing. You paid on a page hosted by {providers} &mdash; whichever
        one you used took the payment and sent your receipt. This page is about getting that money
        back.
      </p>

      <h2>You can have it back within 7 days</h2>
      <p>
        If you contributed and would rather not have, ask us within <strong>7 days</strong> of the
        payment date and we will refund it in full. You do not have to give a reason, and we will
        not ask for one.
      </p>
      <p>
        A contribution made by mistake is always refunded, even after the 7 days have passed. That
        includes a duplicate payment, a payment of the wrong amount, and a payment you did not
        intend to make at all. Tell us what happened and we will put it right.
      </p>

      <h2>How to ask</h2>
      <p>
        {contactEmailConfigured ? (
          <>
            Email <a href={`mailto:${business.email}`}>{business.email}</a> with the subject
            &ldquo;Refund&rdquo;.
          </>
        ) : (
          <>
            Open a request in the <a href={`${site.repo}/issues`}>GitHub issue tracker</a> and title
            it &ldquo;Refund&rdquo;.
          </>
        )}{' '}
        Include:
      </p>
      <ul>
        <li>the date of the payment;</li>
        <li>the amount, and the currency you paid in;</li>
        <li>
          any contact details you gave when you paid, so the payment can be matched to you;
        </li>
        <li>the payment or transaction reference on your receipt, if you still have the email.</li>
      </ul>
      <p>
        That is enough to find the payment. Please do not send your full card number, your CVV,
        your bank login or any one-time password &mdash; we never need them and we will never ask
        for them.
      </p>

      <h2>How long it takes</h2>
      <ul>
        <li>
          <strong>Within 2 business days:</strong> we reply to confirm we have found the payment and
          that the refund is going ahead.
        </li>
        <li>
          <strong>Within 5 to 7 business days:</strong> an approved refund goes back through
          whichever company took the payment, to however you paid &mdash; the same card or account
          the money came from. We cannot send it anywhere else.
        </li>
        <li>
          <strong>A few days more:</strong> your bank or card issuer decides when the money appears
          on your statement, and that step is outside our control.
        </li>
      </ul>
      <p>
        You get the full amount you contributed. We do not deduct a fee, and there is no charge for
        asking.
      </p>

      <h2>After the 7 days</h2>
      <p>
        Outside the window, and where the payment was not a mistake, we may not be able to reverse
        it &mdash; card networks and banks limit how far back a refund can go. Ask anyway if
        something looks wrong. We would rather return money than keep money somebody did not mean to
        send.
      </p>
    </LegalPage>
  );
}
