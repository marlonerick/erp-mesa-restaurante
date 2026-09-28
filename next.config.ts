import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

// Cabeçalhos de segurança fixos (README B.8). A CSP com nonce é gerada por requisição em
// src/proxy.ts (Etapa 2).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  // Imagem de produção enxuta para container Node persistente (ADR-0011)
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Bibliotecas Node que não devem ser empacotadas pelo bundler
  serverExternalPackages: ['pino', 'mysql2', '@node-rs/argon2'],
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
