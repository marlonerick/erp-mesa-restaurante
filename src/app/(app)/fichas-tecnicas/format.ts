/** Décimos de ponto percentual → "78,8%" (pode ser negativa). */
export function formatMargin(tenths: number): string {
  const sign = tenths < 0 ? '-' : '';
  const magnitude = Math.abs(tenths);
  return `${sign}${String(Math.trunc(magnitude / 10))},${String(magnitude % 10)}%`;
}

/** Endereço da ficha: /fichas-tecnicas/produto/{id} ou /fichas-tecnicas/adicional/{id}. */
export const recipePath = (kind: 'PRODUCT' | 'MODIFIER', id: string) =>
  `/fichas-tecnicas/${kind === 'PRODUCT' ? 'produto' : 'adicional'}/${id}`;
