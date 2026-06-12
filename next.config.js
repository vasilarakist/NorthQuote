/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from 307-redirecting requests whose trailing-slash presence
  // doesn't match the route. External services like Stripe webhooks POST to a
  // fixed URL and cannot follow redirects — they need a direct 200.
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
