/** @type {import('next').NextConfig} */
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
}

export default nextConfig