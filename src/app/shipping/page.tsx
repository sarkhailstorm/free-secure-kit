import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { business, contactEmailConfigured, site } from '@/config';

export const metadata: Metadata = {
  title: 'Delivery',
  description:
    'SecureKit is software that runs in your browser. Nothing is posted, no address is collected, and every tool is available immediately.',
};

export default function Page() {
  return (
    <LegalPage id="shipping" updated="16 September 2026">
      <h2>Nothing is posted to you</h2>
      <p>
        SecureKit is software that runs inside your web browser. There is no physical product, no
        packaging and no parcel, so there is nothing to ship &mdash; to any address, in any country.
        We use no courier and no postal service, and we never ask for a delivery address.
      </p>

      <h2>Access is immediate</h2>
      <p>
        Every tool is on the site and ready to use the moment the page loads. There is no sign-up,
        no waiting list, no activation step, no licence key and no email you have to click before
        anything works. Open <a href={site.url}>{site.url}</a>, pick a tool, use it. The files you
        create are saved straight to your own device by your browser.
      </p>

      <h2>No delivery charges, anywhere</h2>
      <p>
        Because nothing is shipped, there are no shipping costs, no customs or import charges, and
        no delivery timeline &mdash; in India or anywhere else in the world. There is no order to
        track and no dispatch to wait for.
      </p>

      <h2>Contributions do not trigger a delivery</h2>
      <p>
        A voluntary contribution does not cause anything to be sent, shipped or unlocked. You are
        not buying a product, so nothing is dispatched and nothing changes on the site.
      </p>
      <p>
        Razorpay sends a receipt to the email address you give at checkout. That receipt is the only
        thing you receive. If you would like the
        contribution back, the <a href="/refunds">Refunds page</a> explains how.
      </p>

      <h2>If something does not load</h2>
      <p>
        If a tool will not open or a download does not start, that is a fault to fix rather than a
        delivery to chase. Tell us{' '}
        {contactEmailConfigured ? (
          <>
            at <a href={`mailto:${business.email}`}>{business.email}</a> or in the{' '}
            <a href={`${site.repo}/issues`}>GitHub issue tracker</a>
          </>
        ) : (
          <>
            in the <a href={`${site.repo}/issues`}>GitHub issue tracker</a>
          </>
        )}{' '}
        and we will reply within 2 business days.
      </p>
    </LegalPage>
  );
}
