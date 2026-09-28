import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Imagem de produção enxuta para container Node persistente (ADR-0011)
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Bibliotecas Node que não devem ser empacotadas pelo bundler
  serverExternalPackages: ['pino', 'mysql2'],
};

export default nextConfig;
