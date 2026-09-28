/**
 * Content Security Policy com nonce (README B.8). O navegador só executa scripts que carregam o
 * nonce desta resposta — um script injetado por um atacante não tem o nonce e é bloqueado (XSS).
 */
export function buildContentSecurityPolicy(options: {
  nonce: string;
  development: boolean;
  https: boolean;
}): string {
  const { nonce, development, https } = options;
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic': scripts carregados por um script confiável também são confiáveis.
    // Em desenvolvimento o Next precisa de eval para o recarregamento automático.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // Estilos inline do Next/Tailwind; risco muito menor que scripts
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${development ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}
