import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

// Fonte desenhada para máxima legibilidade (baixa visão) — salão com pouca luz e pressa.
// O next/font baixa a fonte no build e serve do próprio site (sem depender do Google).
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-atkinson',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: 'ERP Restaurante', template: '%s · ERP Restaurante' },
  description: 'Salão, cozinha, caixa e estoque do restaurante',
};

export const viewport: Viewport = {
  themeColor: '#1f4e9c',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Toda página é gerada por requisição: a CSP usa um nonce novo a cada resposta (src/proxy.ts)
  await connection();
  return (
    <html lang="pt-BR" className={atkinson.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
