/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No `output` field here on purpose:
  //   - Cloudflare Pages: built via @cloudflare/next-on-pages (npm run build:cf
  //     or npm run deploy:web from the project root).
  //   - Self-hosted Node:  npm run build && npm run start
};

export default nextConfig;
