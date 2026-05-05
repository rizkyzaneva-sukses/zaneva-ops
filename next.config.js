/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  images: {
    remotePatterns: [],
  },
  experimental: {
    instrumentationHook: true,
  },
}

module.exports = nextConfig
