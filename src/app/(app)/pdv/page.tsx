import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { cashier } from '@/modules/cashier/web';
import { pos, toReceivableView } from '@/modules/pos/web';
import { hasPermission } from '@/shared/kernel';
import { cn } from '@/ui/cn';
import { formatBRL } from '@/ui/money';
import { NoPermission } from '../admin/no-permission';

export const metadata: Metadata = { title: 'PDV' };

/** Contas a receber da loja (docs/modules/pos.md §8): total, pago e o que falta. */
export default async function PosPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'payments.create') && !hasPermission(context, 'cashier.read')) {
    return <NoPermission />;
  }
  const rows = toReceivableView(await pos().receivables(context));
  const cash = hasPermission(context, 'cashier.read') ? await cashier().current(context) : null;
  // Quem pediu a pré-conta ou já pagou parte aparece primeiro
  const sorted = [...rows].sort((a, b) => Number(b.prebill) - Number(a.prebill));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">PDV</h1>
        <p className="text-tinta-suave">Loja {storeName}. Toque numa conta para receber.</p>
      </div>

      {cash && !cash.session ? (
        <p
          role="note"
          className="rounded-md border-l-4 border-atencao bg-atencao-claro px-4 py-3 font-semibold text-atencao"
        >
          {cash.terminal
            ? 'O caixa deste terminal está fechado: abra o caixa para receber.'
            : 'Este aparelho não é um terminal de caixa: dá para ver as contas, mas não receber.'}{' '}
          <Link href="/caixa" className="underline">
            Ir para o caixa
          </Link>
        </p>
      ) : null}

      {sorted.length === 0 ? (
        <p className="rounded-md border-2 border-dashed border-borda bg-white px-4 py-8 text-center text-tinta-suave">
          Nenhuma conta aberta.
        </p>
      ) : (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4"
          aria-label="Contas a receber"
        >
          {sorted.map((row) => (
            <li key={row.orderId}>
              <Link
                href={`/pdv/conta/${row.orderId}`}
                className={cn(
                  'flex h-full flex-col gap-2 rounded-lg border-2 bg-white p-4 hover:border-azulejo',
                  row.prebill ? 'border-atencao' : 'border-borda',
                )}
              >
                <span className="text-xl font-bold">{row.title}</span>
                <span className="text-sm text-tinta-suave">Conta {row.number}</span>
                <span className="text-lg">
                  Total <strong>{formatBRL(row.totals.totalCents)}</strong>
                </span>
                {row.totals.paidCents > 0 ? (
                  <span>
                    Pago {formatBRL(row.totals.paidCents)} · falta{' '}
                    <strong>{formatBRL(row.totals.balanceCents)}</strong>
                  </span>
                ) : null}
                <span className="flex flex-wrap gap-2 text-sm font-semibold">
                  {row.prebill ? (
                    <span className="rounded-md bg-atencao-claro px-2 py-0.5 text-atencao">
                      Em pagamento
                    </span>
                  ) : null}
                  {row.pendingCount > 0 ? (
                    <span className="rounded-md bg-louca px-2 py-0.5 text-tinta-suave">
                      {row.pendingCount} não enviado(s)
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
