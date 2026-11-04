import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    output: 'standalone',
    outputFileTracingRoot: process.cwd(),
    experimental: { cpus: 2 },
    images: {
        unoptimized: true,
    },
}

export default nextConfig
