'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { DashboardView } from '@/modules/reports/web';
import { formatBRL } from '@/ui/money';
import { HttpError, isGone, withStore } from '../salao/live';

/** Atualização automática do painel (RN-REP-03): 30 s, pausa com a aba escondida. */
export const DASHBOARD_REFRESH_MS = 30_000;

async function readDashboard(storeId: string): Promise<DashboardView> {
  const response = await fetch(withStore('/api/painel', storeId), {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) {
    // Sessão acabou (ou o aparelho foi bloqueado): a página leva ao login
    window.location.reload();
  }
  if (!response.ok) throw new HttpError(response.status);
  return (await response.json()) as DashboardView;
}

const time = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Painel do dia (RN-REP-03): vendas, contas, ticket médio, mesas, cozinha, caixas abertos (sem o
 * esperado — fechamento cego), mais vendidos e estoque baixo. Caixa, gerente e administrador (E9-4).
 */
export function DashboardPanel({
  initial,
  storeId,
  canSeeReports,
}: {
  readonly initial: DashboardView;
  readonly storeId: string;
  readonly canSeeReports: boolean;
}) {
  const { data, isError, error } = useQuery({
    queryKey: ['painel'],
    queryFn: () => readDashboard(storeId),
    initialData: initial,
    refetchInterval: (query) => (isGone(query.state.error) ? false : DASHBOARD_REFRESH_MS),
    retry: (count, failure) => !isGone(failure) && count < 1,
  });

  return (
    <section aria-labelledby="painel" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="painel" className="text-2xl font-bold">
          Painel de hoje
        </h2>
        {canSeeReports ? (
          <Link href="/relatorios" className="font-semibold text-azulejo underline">
            Ver relatórios
          </Link>
        ) : null}
      </div>

      {isError ? (
        <p
          role="status"
          className="rounded-md bg-atencao-claro px-4 py-2 font-semibold text-atencao"
        >
          {isGone(error)
            ? 'A loja mudou em outra aba ou o acesso acabou. Recarregue a página.'
            : 'Sem conexão: mostrando os últimos números. Tentando de novo…'}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Vendas" value={formatBRL(data.salesCents)} />
        <Card label="Contas fechadas" value={String(data.closedOrders)} />
        <Card label="Ticket médio" value={formatBRL(data.averageTicketCents)} />
        <Card label="Contas abertas" value={String(data.openOrders)} />
        <Card label="Mesas ocupadas" value={String(data.occupiedTables)} />
        <Card label="Itens na cozinha" value={String(data.kitchenItems)} />
        <Card
          label={`Atrasados (+${String(data.lateMinutes)} min)`}
          value={String(data.lateItems)}
          alert={data.lateItems > 0}
        />
        <Card label="Caixas abertos" value={String(data.openCash.length)} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">Mais vendidos</h3>
          {data.topProducts.length === 0 ? (
            <p className="text-tinta-suave">Nenhuma venda hoje.</p>
          ) : (
            <ol className="flex list-decimal flex-col gap-1 pl-6">
              {data.topProducts.map((product) => (
                <li key={product.name}>
                  {product.name} · <strong>{product.quantity} un.</strong>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">Caixas abertos</h3>
          {data.openCash.length === 0 ? (
            <p className="text-tinta-suave">Nenhum caixa aberto.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.openCash.map((cash) => (
                <li key={cash.terminalCode}>
                  <strong>{cash.terminalCode}</strong> · aberto às{' '}
                  <time dateTime={cash.openedAt} suppressHydrationWarning>
                    {time(cash.openedAt)}
                  </time>
                  {cash.openedByName ? ` por ${cash.openedByName}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">Estoque baixo</h3>
          {data.lowStock.length === 0 ? (
            <p className="text-tinta-suave">Nenhum insumo abaixo do mínimo.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.lowStock.map((item) => (
                <li key={item.name} className="text-alerta">
                  <strong>{item.name}</strong> ·{' '}
                  {Number(item.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}{' '}
                  {item.unit}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Card({
  label,
  value,
  alert = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly alert?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border-2 bg-white p-4 ${alert ? 'border-alerta' : 'border-borda'}`}
    >
      <dt className="text-sm font-semibold text-tinta-suave">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${alert ? 'text-alerta' : ''}`}>{value}</dd>
    </div>
  );
}
