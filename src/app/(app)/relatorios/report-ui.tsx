import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatBRL } from '@/ui/money';

// Peças das telas de relatório. Barras simples em HTML (E9-5): sem biblioteca de gráficos; o valor
// sempre aparece em texto ao lado (a barra é só um apoio visual — aria-hidden).

export interface BarItem {
  readonly label: string;
  readonly value: number;
  /** Texto do valor (ex.: "R$ 110,10" ou "3 un."). */
  readonly text: string;
}

export function Bars({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly BarItem[];
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="font-semibold">{title}</figcaption>
      {items.length === 0 ? (
        <p className="text-tinta-suave">Sem dados no período.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.label}
              className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-2"
            >
              <span className="truncate">{item.label}</span>
              <span aria-hidden="true" className="h-4 rounded-sm bg-borda/40 print:bg-transparent">
                <span
                  className="block h-4 rounded-sm bg-azulejo print:border print:border-black"
                  style={{ width: `${String(Math.max(0, (item.value / max) * 100))}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums">{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Cartão de número grande (vendas, contas, ticket médio…). */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: 'alerta';
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border-2 bg-white p-4 ${
        tone === 'alerta' ? 'border-alerta' : 'border-borda'
      }`}
    >
      <span className="text-sm font-semibold text-tinta-suave">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${tone === 'alerta' ? 'text-alerta' : ''}`}>
        {value}
      </span>
      {hint ? <span className="text-sm text-tinta-suave">{hint}</span> : null}
    </div>
  );
}

export interface Column<T> {
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  readonly numeric?: boolean;
}

/** Tabela com rolagem lateral própria (a página não rola de lado no celular). */
export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty = 'Nada no período.',
}: {
  readonly caption: string;
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-bold">{caption}</h3>
        <p className="text-tinta-suave">{empty}</p>
      </section>
    );
  }
  return (
    <div className="max-w-full overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-max border-collapse text-left">
        <caption className="mb-2 text-left text-lg font-bold">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-tinta">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`px-2 py-2 font-semibold ${column.numeric ? 'text-right' : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-borda">
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={`px-2 py-2 ${column.numeric ? 'text-right tabular-nums' : ''}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Valor com sinal e cor: diferença de caixa, margem negativa. */
export function SignedMoney({ cents }: { readonly cents: number }) {
  if (cents === 0) return <>{formatBRL(0)}</>;
  return (
    <span className={cents < 0 ? 'font-semibold text-alerta' : 'font-semibold'}>
      {cents > 0 ? '+' : ''}
      {formatBRL(cents)}
    </span>
  );
}

/** "Página 2 de 5" com anterior e próxima (paginação no servidor — RN-REP-09). */
export function Pager({
  page,
  pageSize,
  total,
  href,
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center gap-4 print:hidden">
      {page > 1 ? (
        <Link href={href(page - 1)} className="font-semibold text-azulejo underline">
          ← Anterior
        </Link>
      ) : null}
      <span>
        Página {page} de {pages} ({total} linhas)
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="font-semibold text-azulejo underline">
          Próxima →
        </Link>
      ) : null}
    </nav>
  );
}
