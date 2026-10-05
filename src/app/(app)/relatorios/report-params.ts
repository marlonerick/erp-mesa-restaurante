import { z } from 'zod';
import { AUDIT_EVENTS } from '@/modules/audit';

// Filtros dos relatórios no endereço (?de=&ate=&pagina=…). Valor estranho vira "sem filtro" —
// nunca erro 500; o período ainda é conferido no domínio (INVALID_PERIOD).

export const REPORT_TABS = [
  { id: 'vendas', label: 'Vendas' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'caixa', label: 'Caixa' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'operacao', label: 'Operação' },
  { id: 'auditoria', label: 'Auditoria' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['id'];

const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const reportSearchSchema = z.object({
  aba: z.enum(REPORT_TABS.map((tab) => tab.id) as [ReportTab, ...ReportTab[]]).catch('vendas'),
  de: dateText,
  ate: dateText,
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
  evento: z.enum(AUDIT_EVENTS).optional().catch(undefined),
  pessoa: z.uuid().optional().catch(undefined),
});

export type ReportSearch = z.infer<typeof reportSearchSchema>;

/** Endereço com os filtros atuais trocando só o que mudou (paginação, abas, CSV). */
export function reportHref(
  base: string,
  search: Readonly<Record<string, string | number | undefined>>,
  change: Readonly<Record<string, string | number | undefined>> = {},
): string {
  const merged = { ...search, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== '' && !(key === 'pagina' && value === 1)) {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** "2026-03-14" → "14/03/2026" (data local: sem converter fuso). */
export const formatDay = (date: string) => date.split('-').reverse().join('/');

export const STOCK_TYPE_LABEL: Readonly<Record<string, string>> = {
  ENTRADA: 'Entrada (compra)',
  SAIDA: 'Saída',
  AJUSTE: 'Contagem',
  PERDA: 'Perda',
  CONSUMO_VENDA: 'Venda',
  ESTORNO_VENDA: 'Venda cancelada',
};

/** Quantidade em unidade base ("850.000" g) → "850 g". */
export function formatQuantity(text: string, unit: string): string {
  const value = Number(text);
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit}`;
}

/** Texto de um código ("PIX" → "PIX", "CASH_OPENED" → "Caixa aberto"); desconhecido = o código. */
export const labelOf = (labels: Partial<Readonly<Record<string, string>>>, key: string) =>
  labels[key] ?? key;
