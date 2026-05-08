/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'node-cron'],
  images: {
    remotePatterns: [],
  },
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // node-cron must not be bundled by webpack — it uses Node.js APIs
      const existing = Array.isArray(config.externals) ? config.externals : []
      config.externals = [...existing, 'node-cron']
    }
    return config
  },
}

module.exports = nextConfig
