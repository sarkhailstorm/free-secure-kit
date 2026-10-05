import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import {
  business,
  contactEmailConfigured,
  site,
  sourceUrl,
  support,
  tools,
  traderName,
} from '@/config';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms you agree to when you use FreeSecureKit, a set of free browser-based file tools.',
};

export default function Page() {
  return (
    <LegalPage id="terms" updated="5 October 2026">
      <h2>Who runs this site</h2>
      <p>
        FreeSecureKit is run by {traderName()}, an individual, from{' '}
        <a href={site.url}>{site.url}</a>. In these terms &ldquo;we&rdquo; and &ldquo;us&rdquo; mean
        the person who runs FreeSecureKit, and &ldquo;you&rdquo; means anyone using the site.
      </p>
      <p>
        By using FreeSecureKit you accept these terms. If you do not accept them, please do not use the
        site.
      </p>

      <h2>What FreeSecureKit is</h2>
      <p>
        FreeSecureKit is a set of {tools.length} tools for everyday file jobs: PDFs, spreadsheets,
        images, data formats, Markdown and text. The tools run inside your own web browser on your
        own device. There is no server that processes your files, because the site is a set of
        static files with no application code running behind it.
      </p>
      <p>
        Everything is free. There is no account, no sign-up, no subscription, no trial and no paid
        tier. Nothing is sold here and no feature is unlocked by paying.
      </p>

      <h2>The software is open source</h2>
      <p>
        The source code is published under the MIT licence, so you can read it, run it, change it
        and reuse it on the terms that licence sets out. You can read the{' '}
        <a href={sourceUrl('LICENSE')}>full licence text</a> and the{' '}
        <a href={site.repo}>rest of the code</a> on GitHub. The MIT licence covers the software
        itself; these terms cover your use of this website.
      </p>

      <h2>Provided as it is</h2>
      <p>
        FreeSecureKit is provided as it is, with no warranty of any kind. We do not promise that the
        site will always be available, that a tool will handle every file you give it, or that the
        result will be correct for your purpose. Browsers differ, files differ, and a very large
        file can exhaust the memory your browser is willing to use.
      </p>

      <h2>Your files are your responsibility</h2>
      <p>
        The tools work on your own files, on your own machine. We never receive them, so we cannot
        recover them, restore an earlier version or undo a change you made.
      </p>
      <p>
        <strong>Keep your originals.</strong> Work on a copy, and check the result before you throw
        the original away. To the fullest extent the law allows, we are not liable for lost,
        damaged or corrupted files, for lost time, or for any loss that follows from using the site
        or being unable to use it. Nothing here limits liability that cannot be limited by law.
      </p>
      <p>
        You are responsible for having the right to use the files you open in a tool, and for what
        you do with the results.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use FreeSecureKit to break the law or to infringe anyone else&rsquo;s rights.</li>
        <li>
          Do not attack the site, try to disrupt it for other people, or use it to distribute
          malicious files.
        </li>
        <li>
          Do not present FreeSecureKit as your own service, or suggest we endorse you, unless the MIT
          licence allows it.
        </li>
      </ul>

      <h2>No account, so nothing to terminate</h2>
      <p>
        There is no account to create, suspend or close, and we hold no file of yours. A few small
        things do live in your own browser: your light or dark choice, your Markdown export theme,
        a flag so a support message appears only once, and your Markdown draft, which stays in that
        browser until you clear it. You remove all of them by clearing this
        site&rsquo;s data in your browser; the Markdown draft is also removed by the Clear button in
        that tool. The <a href="/privacy">Privacy page</a> names every one of them.
      </p>
      <p>
        We can stop publishing the site, or change or remove a tool, at any time. If we do, the code
        remains available on GitHub under the MIT licence.
      </p>

      <h2>Contributions</h2>
      <p>
        If you choose to contribute money, it is voluntary and it buys nothing. You get no product,
        no service, no feature, no priority and no promise of future work in return. It is a
        thank-you for something that is already free, and payment is never required to use any part
        of the site.
      </p>
      <p>
        To contribute you leave this site for the provider that matches where you are:{' '}
        {support.routes.map((route) => `${route.provider} for ${route.who}`).join(', ')}. The
        payment is taken on that provider&rsquo;s own page, and the money reaches us through them. There
        is no payment widget here, so nothing to do with money ever runs on a page holding your
        files. We never see or hold your card or bank details. If you want a contribution back, the{' '}
        <a href="/refunds">Refunds page</a> sets out the window, what to send us and how long it
        takes.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms as the site changes. The &ldquo;Last updated&rdquo; date at the top
        of this page is the marker: if it has moved, something here has changed. Continuing to use
        the site after that date means you accept the updated terms.
      </p>

      <h2>Support and disputes</h2>
      <p>
        If something is broken, wrong or unclear, tell us and we will look at it. Raise it{' '}
        {contactEmailConfigured ? (
          <>
            by email at <a href={`mailto:${business.email}`}>{business.email}</a>, or in the{' '}
            <a href={`${site.repo}/issues`}>GitHub issue tracker</a>.
          </>
        ) : (
          <>
            in the <a href={`${site.repo}/issues`}>GitHub issue tracker</a>, which is public and
            monitored.
          </>
        )}{' '}
        We aim to reply within 2 business days. FreeSecureKit is maintained by one person in his own
        time, so a fix may take longer than a reply, and some requests will be declined.
      </p>
      <p>
        Please raise a problem with us first, so we have a chance to put it right, before taking it
        anywhere else. A dispute about a contribution is usually settled fastest by asking for a
        refund.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the law of the country in which FreeSecureKit is operated, and the
        courts of that country have jurisdiction over any dispute arising from them or from your use
        of the site.
      </p>
    </LegalPage>
  );
}
