/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the libSQL client external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client", "libsql"],
  },
};

module.exports = nextConfig;
