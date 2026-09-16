import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { business, contactEmailConfigured, site } from '@/config';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What happens to your files, what SecureKit stores in your browser, and what our host can see.',
};

export default function Page() {
  return (
    <LegalPage id="privacy" updated="16 September 2026">
      <h2>The short version</h2>
      <ul>
        <li>Your files are processed inside your browser. They are never uploaded to us.</li>
        <li>There is no account, no sign-up and no contact form.</li>
        <li>We run no analytics and set no cookies.</li>
        <li>
          Four small things are saved in your own browser. They are named below, and one of them is
          the text you type into the Markdown Converter.
        </li>
        <li>
          Our host, Vercel, logs every request for the pages themselves &mdash; as every website
          host does.
        </li>
      </ul>

      <h2>What happens to your files</h2>
      <p>
        When you drop a file onto a tool, your browser reads it from your disk and hands it to the
        page. The work &mdash; merging a PDF, cleaning a spreadsheet, shrinking a photo &mdash;
        happens in that tab, using code that was downloaded to your device. The finished file is
        built in memory and passed to your browser&rsquo;s own download. There is nowhere to send a
        file to, because there is no server: the site is a set of static files.
      </p>
      <p>
        While a tool is open, your file stays in the tab&rsquo;s memory on purpose, so you can
        change a setting and run it again without picking the file a second time. When you close the
        tab, it is gone. We will not claim more than that: the browser releases that memory when it
        chooses, and nothing here overwrites or securely erases anything.
      </p>
      <p>
        One thing does change in your files. The Image Compressor re-encodes each photo, and the
        copy it gives you has no EXIF data &mdash; so the camera details, and the GPS location if
        your photo carried one, are not in the compressed version.
      </p>
      <p>
        Anything you save is written to your own disk by your browser, exactly as with any other
        download.
      </p>

      <h2>What is stored on your device</h2>
      <p>
        Four things, all kept by your browser for this site alone. None of them is an identifier,
        and we cannot read any of them, because nothing is ever sent back to us.
      </p>
      <table>
        <thead>
          <tr>
            <th>What it is</th>
            <th>Saved under</th>
            <th>What it holds</th>
            <th>How long it lasts</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Light or dark mode</td>
            <td>securekit:theme</td>
            <td>The word light or dark</td>
            <td>Until you clear this site&rsquo;s data</td>
          </tr>
          <tr>
            <td>Your Markdown draft</td>
            <td>securekit:markdown-converter:doc</td>
            <td>The full text you have typed or pasted into the Markdown Converter</td>
            <td>Until you clear the editor, or clear this site&rsquo;s data</td>
          </tr>
          <tr>
            <td>Markdown export style</td>
            <td>securekit:markdown-converter:theme</td>
            <td>The name of the style you picked for exports</td>
            <td>Until you clear this site&rsquo;s data</td>
          </tr>
          <tr>
            <td>Support message flag</td>
            <td>securekit:support-nudge-seen</td>
            <td>A single 1, so a thank-you message can appear at most once</td>
            <td>Until you close the tab</td>
          </tr>
        </tbody>
      </table>
      <p>
        The last one is only written if a contributions link is switched on, which it is not at the
        moment. To remove all four, clear this site&rsquo;s data in your browser settings.
      </p>

      <h3>The Markdown draft, in plain terms</h3>
      <p>
        <strong>
          Everything you type into the Markdown Converter is saved in your own browser, half a
          second after you stop typing, so that it is still there when you come back.
        </strong>{' '}
        It survives closing the tab, quitting the browser and restarting the computer. Pressing
        Clear in the editor and confirming removes it straight away. On a shared, work or public
        computer, the next person who opens this tool in that browser will see what you wrote.
        Clear the editor before you walk away.
      </p>
      <p>
        No other tool keeps anything between visits. No file name, file size or file content is
        written to storage anywhere, and the site uses no cookies, no offline cache and no database
        in your browser.
      </p>

      <h2>What we collect</h2>
      <p>
        The site itself collects nothing, because nothing is transmitted from the page. There is no
        analytics, no error reporting, no session recording and no tracking pixel. Vercel Analytics
        and Vercel Speed Insights are specifically not installed &mdash; they are not in the
        project&rsquo;s dependencies and nothing of the kind is loaded by any page. Using a tool
        never tells us your name, your email address, what you converted or that a file existed at
        all. The one exception is the request log our host keeps, which is the next section.
      </p>
      <p>
        The site is served over HTTPS, and every page carries a policy telling your browser it may
        only open connections back to this site. That is a strong extra guard against a mistake in
        our code reaching somebody else&rsquo;s server, rather than a cast-iron guarantee.
      </p>

      <h2>What our host can see</h2>
      <p>
        The pages are served by Vercel, and Vercel&rsquo;s servers record every request they answer:
        your IP address, your browser and device description, the address requested, and the time.
        This is true of every website you visit. On a site with no server code of its own there is
        no way for us to switch it off, so we would rather say so than pretend otherwise.
      </p>
      <p>
        Those logs never contain the contents of your files, their names or their sizes &mdash;
        nothing you work on is ever part of a request. One detail is worth knowing: each
        tool&rsquo;s code is downloaded only when somebody opens that tool, so the log does show
        which tool was opened and when.
      </p>
      <p>
        An IP address counts as personal data in India and in many other places. The logs are held
        by Vercel under its own privacy policy. We do not use them to build a profile of anyone.
      </p>

      <h2>Third parties</h2>
      <ul>
        <li>
          <strong>Vercel</strong> hosts the site and sits in front of every page, as described
          above.
        </li>
        <li>
          <strong>GitHub</strong> is involved only if you click one of our links to the source code
          or the issue tracker, at which point you are on GitHub&rsquo;s site under its rules.
        </li>
        <li>
          <strong>Razorpay</strong> is involved only if you choose to make a contribution. See
          below.
        </li>
      </ul>
      <p>
        Third-party code does run in your browser &mdash; the PDF, spreadsheet, image and Markdown
        libraries that do the actual work. All of it is bundled into this site and served from here.
        Nothing is fetched from an outside content network while you use a tool, and no web fonts
        are downloaded: the text you are reading is set in your own system&rsquo;s fonts.
      </p>
      <p>
        One caveat about your own documents. If your Markdown contains an image hosted elsewhere, it
        is blocked while you preview it here. But a web page you export and save has no such
        protection, so opening that saved file later will fetch the image from wherever you pointed
        it.
      </p>

      <h2>Contributions</h2>
      <p>
        Nothing on SecureKit is for sale, and no feature is unlocked by paying. If you choose to
        make a voluntary contribution, the payment is handled by Razorpay on Razorpay&rsquo;s own
        page. Whatever you enter there &mdash; card, UPI or bank details, and any name or email
        Razorpay asks for &mdash; is collected and held by Razorpay under{' '}
        <a href="https://razorpay.com/privacy" rel="noopener noreferrer" target="_blank">
          its privacy policy
        </a>
        , not by us.
      </p>
      <p>
        We never see or store card or bank details. All we receive is what the Razorpay dashboard
        shows about a contribution: the amount, the date, the status, and the contact details you
        gave Razorpay. We use that only to answer a question about a payment or to issue a refund,
        and we do not add you to any mailing list.
      </p>

      <h2>Children</h2>
      <p>
        The tools are suitable for anyone, and there is no account to create. We do not knowingly
        collect personal information from a child; the only personal details that ever reach us are
        the ones a contributor gives Razorpay.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If the site changes in a way that affects this page, we will change the page and the date at
        the top of it. Every previous version is in the project&rsquo;s public commit history, so
        you can see exactly what changed and when.
      </p>

      <h2>Asking a question</h2>
      {contactEmailConfigured ? (
        <p>
          Email <a href={`mailto:${business.email}`}>{business.email}</a> and we will answer.
        </p>
      ) : (
        <p>
          Open an issue on the{' '}
          <a href={`${site.repo}/issues`} rel="noopener noreferrer" target="_blank">
            GitHub issue tracker
          </a>{' '}
          and we will answer there.
        </p>
      )}

      <h2>Check it for yourself</h2>
      <p>
        SecureKit is open source under the MIT licence. Every claim on this page can be checked
        against the code, and so can the network tab of your own browser while you use a tool. The
        source is at{' '}
        <a href={site.repo} rel="noopener noreferrer" target="_blank">
          {site.repo.replace('https://', '')}
        </a>
        .
      </p>
    </LegalPage>
  );
}
