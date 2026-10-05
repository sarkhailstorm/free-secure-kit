/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: no server runtime, so hosting stays free
  output: 'export',
  images: { unoptimized: true },
  // Emits an index.html per route so static hosts resolve clean URLs
  trailingSlash: true,
  reactStrictMode: true,
  webpack(config, { isServer }) {
    if (!isServer) {
      // qpdf's Emscripten wrapper has a Node branch it never takes in a browser;
      // without these, webpack fails the client build resolving module/path/fs
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
