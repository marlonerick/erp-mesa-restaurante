import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

// Cabeçalhos de segurança básicos (README B.8). A CSP completa, com nonce para scripts,
// entra na Etapa 2 junto com o login; aqui só vão diretivas que não quebram o Next.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
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
  serverExternalPackages: ['pino', 'mysql2'],
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
