import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { cashier, toCashSummaryView } from '@/modules/cashier/web';
import { loadStoreSettings } from '@/modules/organizations/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { cn } from '@/ui/cn';
import { formatBRL } from '@/ui/money';
import { NoPermission } from '../../admin/no-permission';

export const metadata: Metadata = { title: 'Fechamento do caixa' };

/** Página do servidor: as horas usam o fuso da LOJA (o servidor roda em UTC). */
const timeIn = (timeZone: string) => (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));

/** Resultado do fechamento cego (RN-CASH-06): esperado, informado e diferença por forma. */
export default async function CashSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context } = await requireSession();
  if (!hasPermission(context, 'cashier.read')) return <NoPermission />;
  if (!isId(id)) notFound();
  let summary;
  try {
    summary = toCashSummaryView(await cashier().summary(context, id));
  } catch (error) {
    if (isDomainError(error) && error.code === 'CASH_SESSION_NOT_FOUND') notFound();
    throw error;
  }

  const time = timeIn((await loadStoreSettings(context))?.timezone ?? 'America/Sao_Paulo');

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/caixa" className="font-semibold text-azulejo underline">
        Voltar para o caixa
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Fechamento do caixa</h1>
        <p className="text-tinta-suave">
          Aberto {time(summary.openedAt)}
          {summary.openedByName ? ` por ${summary.openedByName}` : ''} · fundo{' '}
          {formatBRL(summary.openingAmountCents)}
          {summary.closedAt
            ? ` · fechado ${time(summary.closedAt)}${summary.closedByName ? ` por ${summary.closedByName}` : ''}`
            : ''}
        </p>
      </div>

      {summary.counts === null ? (
        <p className="rounded-md bg-atencao-claro px-4 py-3 font-semibold text-atencao">
          Este caixa ainda está aberto. A conferência aparece depois do fechamento.
        </p>
      ) : (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Conferência por forma de pagamento</caption>
          <thead>
            <tr className="border-b-2 border-borda">
              <th scope="col" className="py-2">
                Forma
              </th>
              <th scope="col" className="py-2 text-right">
                Esperado
              </th>
              <th scope="col" className="py-2 text-right">
                Informado
              </th>
              <th scope="col" className="py-2 text-right">
                Diferença
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.counts.map((line) => (
              <tr key={line.method} className="border-b border-borda">
                <th scope="row" className="py-2 font-semibold">
                  {line.methodLabel}
                </th>
                <td className="py-2 text-right">{formatBRL(line.expectedCents)}</td>
                <td className="py-2 text-right">
                  {line.declaredCents === null ? 'não conferido' : formatBRL(line.declaredCents)}
                </td>
                <td
                  className={cn(
                    'py-2 text-right font-bold',
                    line.differenceCents !== null && line.differenceCents < 0 && 'text-alerta',
                    line.differenceCents !== null && line.differenceCents > 0 && 'text-atencao',
                    line.differenceCents === 0 && 'text-confirma',
                  )}
                >
                  {line.differenceCents === null
                    ? '—'
                    : line.differenceCents === 0
                      ? 'Confere'
                      : `${line.differenceCents < 0 ? 'Falta' : 'Sobra'} ${formatBRL(Math.abs(line.differenceCents))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summary.alerts && summary.alerts.length > 0 ? (
        <section
          aria-labelledby="alertas"
          className="flex flex-col gap-2 rounded-md border-l-4 border-alerta bg-alerta-claro px-4 py-3 text-alerta"
        >
          <h2 id="alertas" className="text-xl font-bold">
            Atenção: sangria acima do dinheiro esperado
          </h2>
          <p>
            Estas sangrias retiraram mais dinheiro do que deveria haver na gaveta. Confira com quem
            fez.
          </p>
          <ul className="flex flex-col gap-1" aria-label="Sangrias acima do esperado">
            {summary.alerts.map((alert) => (
              <li key={alert.id} className="font-semibold">
                {time(alert.occurredAt)} · {formatBRL(alert.amountCents)} · {alert.reason}
                {alert.userName ? ` · ${alert.userName}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
