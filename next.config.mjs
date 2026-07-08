/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@libsql/client', '@prisma/adapter-libsql'],
  },
};

export default nextConfig;
