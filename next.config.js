/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },

  // Ignorar errores de ESLint en build (para deploys rápidos)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Ignorar errores de TypeScript en build (opcional, quitar en producción)
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig

