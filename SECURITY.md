# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead: go to the **Security** tab of this
repository and choose **Report a vulnerability**. That opens a thread only you
and the maintainer can see.

You will get a first reply within 7 days. If a fix is needed, you are welcome to
be credited in the release notes, or to stay anonymous.

## What counts here

This is a static site with no server, no accounts and no database, so the usual
categories mostly do not apply. What does matter:

- **Anything that sends a user's file content off the device.** This is the
  project's one promise. A bug that breaks it is the most serious report
  possible, including one caused by a dependency.
- **Anything that defeats the Content-Security-Policy** in
  [`src/app/layout.tsx`](src/app/layout.tsx), which is what enforces the promise
  rather than merely stating it.
- **Cross-site scripting** through a file a user opens, for instance a crafted
  SVG, a Markdown document or a spreadsheet cell.
- **A dependency advisory** that actually reaches code running in the browser.

## What does not

- Reports from automated scanners with no working example.
- Missing headers that do not apply to a static site with no cookies and no
  login.
- Anything requiring the attacker to already control the user's machine or
  browser extensions.

## Scope

The deployed site and this repository. The payment pages linked from the support
page belong to PayPal and Razorpay; report issues there to them.
