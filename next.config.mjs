/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export: every tool runs in the browser, so there is no server
  // runtime to pay for. Deploys free to Vercel, Cloudflare Pages, Netlify or
  // GitHub Pages with zero serverless functions.
  output: 'export',
  images: { unoptimized: true },
  // Emit /tools/csv-cleaner/index.html so static hosts resolve clean URLs.
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
