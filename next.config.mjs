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
  webpack(config, { isServer }) {
    if (!isServer) {
      // qpdf's Emscripten wrapper carries a Node branch it never takes in a
      // browser. Without this, webpack tries to resolve `module`, `path` and
      // `fs` for the client bundle and fails the build.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        module: false,
        path: false,
        fs: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
