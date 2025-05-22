/** @type {import('next').NextConfig} */
// Updated for Vercel deployment
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/8b92d243-2141-4f78-85e3-9391e5135eaf',
        permanent: true,
      },
    ]
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Remove ignoreBuildErrors to see actual TypeScript errors
  },
  images: {
    unoptimized: true,
  },
  compiler: {
    // Enable styled-jsx
    styledComponents: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': '.',
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    }
    return config
  },
}

export default nextConfig