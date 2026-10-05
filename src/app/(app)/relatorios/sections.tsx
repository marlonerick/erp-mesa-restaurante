import Link from 'next/link';
import { AUDIT_EVENT_LABEL, AUDIT_EVENTS } from '@/modules/audit';
import { PAYMENT_METHOD_LABEL } from '@/modules/cashier/web';
import { reports } from '@/modules/reports/web';
import { parseId, type RequestContext } from '@/shared/kernel';
import { Button } from '@/ui/button';
import { SelectField } from '@/ui/field';
import { formatBRL } from '@/ui/money';
import {
  formatDay,
  formatQuantity,
  labelOf,
  reportHref,
  type ReportSearch,
  STOCK_TYPE_LABEL,
} from './report-params';
import { Bars, Pager, SignedMoney, Stat, Table } from './report-ui';

// Uma seção por aba de /relatorios (docs/modules/reports.md §3). Tudo no servidor: só leitura.

interface SectionProps {
  readonly ctx: RequestContext;
  readonly search: ReportSearch;
  readonly timeZone: string;
}

const period = (search: ReportSearch) => ({
  from: search.de ?? null,
  to: search.ate ?? search.de ?? null,
});
const methodLabel = (method: string) => labelOf(PAYMENT_METHOD_LABEL, method);
const units = (quantity: number) => `${String(quantity)} un.`;

function CsvLink({
  type,
  search,
  children,
}: {
  type: string;
  search: ReportSearch;
  children: string;
}) {
  return (
    <a
      href={reportHref(`/relatorios/csv/${type}`, {
        ...(search.de ? { de: search.de } : {}),
        ...(search.ate ? { ate: search.ate } : {}),
        ...(search.evento ? { evento: search.evento } : {}),
        ...(search.pessoa ? { pessoa: search.pessoa } : {}),
      })}
      className="font-semibold text-azulejo underline print:hidden"
      download
    >
      {children}
    </a>
  );
}

export async function SalesSection({ ctx, search }: SectionProps) {
  const report = await reports().sales(ctx, period(search));
  const { totals } = report;
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Vendas" value={formatBRL(totals.totalCents)} />
        <Stat label="Contas fechadas" value={String(totals.orders)} />
        <Stat label="Ticket médio" value={formatBRL(totals.averageTicketCents)} />
        <Stat label="Descontos" value={formatBRL(totals.discountsCents)} />
        <Stat label="Taxa de serviço" value={formatBRL(totals.serviceFeeCents)} />
      </div>

      <Bars
        title="Vendas por dia (dia operacional do fechamento)"
        items={report.days.map((day) => ({
          label: formatDay(day.date),
          value: day.totalCents,
          text: formatBRL(day.totalCents),
        }))}
      />
      <Table
        caption="Por dia"
        rowKey={(day) => day.date}
        rows={report.days}
        columns={[
          { header: 'Dia', cell: (day) => formatDay(day.date) },
          { header: 'Contas', cell: (day) => day.orders, numeric: true },
          { header: 'Itens', cell: (day) => formatBRL(day.itemsCents), numeric: true },
          { header: 'Descontos', cell: (day) => formatBRL(day.discountsCents), numeric: true },
          { header: 'Taxa', cell: (day) => formatBRL(day.serviceFeeCents), numeric: true },
          { header: 'Total', cell: (day) => formatBRL(day.totalCents), numeric: true },
          {
            header: 'Ticket médio',
            cell: (day) => formatBRL(day.averageTicketCents),
            numeric: true,
          },
        ]}
      />
      <CsvLink type="vendas" search={search}>
        Baixar vendas por dia (CSV)
      </CsvLink>

      <div className="grid gap-8 lg:grid-cols-2">
        <Bars
          title="Por forma de pagamento"
          items={report.methods.map((line) => ({
            label: methodLabel(line.method),
            value: line.amountCents,
            text: formatBRL(line.amountCents),
          }))}
        />
        <Bars
          title="Por categoria do cardápio"
          items={report.categories.map((line) => ({
            label: line.name,
            value: line.grossCents - line.discountsCents,
            text: formatBRL(line.grossCents - line.discountsCents),
          }))}
        />
      </div>
      <CsvLink type="pagamentos" search={search}>
        Baixar formas de pagamento (CSV)
      </CsvLink>
    </div>
  );
}

export async function ProductsSection({ ctx, search }: SectionProps) {
  const report = await reports().salesByProduct(ctx, { ...period(search), page: search.pagina });
  return (
    <div className="flex flex-col gap-6">
      <p className="text-tinta-suave">
        Custo = consumo da ficha técnica no momento da venda. Margem = valor − descontos − custo.
        Produto sem ficha técnica aparece com custo zero.
      </p>
      <Table
        caption="Vendas por produto (maior valor primeiro)"
        rowKey={(row) => row.productId}
        rows={report.rows}
        columns={[
          { header: 'Produto', cell: (row) => row.name },
          { header: 'Quantidade', cell: (row) => units(row.quantity), numeric: true },
          { header: 'Valor bruto', cell: (row) => formatBRL(row.grossCents), numeric: true },
          { header: 'Descontos', cell: (row) => formatBRL(row.discountsCents), numeric: true },
          { header: 'Custo', cell: (row) => formatBRL(row.costCents), numeric: true },
          {
            header: 'Margem',
            cell: (row) => <SignedMoney cents={row.marginCents} />,
            numeric: true,
          },
        ]}
      />
      <Pager
        page={report.page}
        pageSize={report.pageSize}
        total={report.total}
        href={(page) => reportHref('/relatorios', search, { pagina: page })}
      />
      <CsvLink type="produtos" search={search}>
        Baixar vendas por produto (CSV)
      </CsvLink>
    </div>
  );
}

export async function CashSection({ ctx, search, timeZone }: SectionProps) {
  const { sessions } = await reports().cash(ctx, period(search));
  const time = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  return (
    <div className="flex flex-col gap-6">
      {sessions.length === 0 ? (
        <p className="text-tinta-suave">Nenhum caixa no período.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-3 rounded-md border-2 border-borda bg-white p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold">
                  {session.terminalCode} · {session.terminalName} ·{' '}
                  {formatDay(session.operationalDate)}
                </h3>
                <span className="font-semibold">
                  {session.status === 'ABERTA' ? 'Aberto' : 'Fechado'}
                </span>
              </div>
              <p className="text-tinta-suave">
                Aberto {time.format(session.openedAt)}
                {session.openedByName ? ` por ${session.openedByName}` : ''}
                {session.closedAt
                  ? ` · fechado ${time.format(session.closedAt)}${
                      session.closedByName ? ` por ${session.closedByName}` : ''
                    }`
                  : ''}
              </p>
              <p>
                Fundo {formatBRL(session.openingCents)} · sangrias{' '}
                {formatBRL(session.withdrawalsCents)} · suprimentos{' '}
                {formatBRL(session.suppliesCents)}
              </p>
              {session.alerts > 0 ? (
                <p className="font-semibold text-alerta">
                  {session.alerts === 1
                    ? '1 sangria acima do dinheiro esperado na gaveta.'
                    : `${String(session.alerts)} sangrias acima do dinheiro esperado na gaveta.`}{' '}
                  <Link href={`/caixa/${session.id}`} className="underline">
                    Ver o fechamento
                  </Link>
                </p>
              ) : null}
              {session.counts ? (
                <Table
                  caption="Conferência do fechamento"
                  rowKey={(line) => line.method}
                  rows={session.counts}
                  columns={[
                    { header: 'Forma', cell: (line) => methodLabel(line.method) },
                    {
                      header: 'Esperado',
                      cell: (line) => formatBRL(line.expectedCents),
                      numeric: true,
                    },
                    {
                      header: 'Informado',
                      cell: (line) =>
                        line.declaredCents === null ? '—' : formatBRL(line.declaredCents),
                      numeric: true,
                    },
                    {
                      header: 'Diferença',
                      cell: (line) =>
                        line.differenceCents === null ? (
                          '—'
                        ) : (
                          <SignedMoney cents={line.differenceCents} />
                        ),
                      numeric: true,
                    },
                  ]}
                />
              ) : (
                <p className="text-tinta-suave">
                  A conferência aparece depois do fechamento (fechamento cego).
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <CsvLink type="caixa" search={search}>
        Baixar caixas (CSV)
      </CsvLink>
    </div>
  );
}

export async function StockSection({ ctx, search }: SectionProps) {
  const report = await reports().stock(ctx, period(search));
  const below = report.balances.filter((row) => row.belowMinimum);
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="CMV (custo do que foi vendido)" value={formatBRL(report.cogsCents)} />
        <Stat label="Perdas" value={formatBRL(report.lossesCents)} />
        <Stat
          label="Insumos no mínimo ou abaixo"
          value={String(below.length)}
          {...(below.length > 0 ? { tone: 'alerta' as const } : {})}
        />
      </div>
      <Table
        caption="Movimentações do período"
        rowKey={(row) => row.type}
        rows={report.movements}
        columns={[
          { header: 'Tipo', cell: (row) => labelOf(STOCK_TYPE_LABEL, row.type) },
          { header: 'Lançamentos', cell: (row) => row.movements, numeric: true },
          { header: 'Valor', cell: (row) => formatBRL(row.valueCents), numeric: true },
        ]}
      />
      <CsvLink type="movimentacoes" search={search}>
        Baixar movimentações (CSV)
      </CsvLink>
      <Table
        caption="Saldo atual"
        rowKey={(row) => row.ingredientId}
        rows={report.balances}
        empty="Nenhum insumo cadastrado."
        columns={[
          { header: 'Insumo', cell: (row) => row.name },
          {
            header: 'Saldo',
            cell: (row) => (
              <span className={row.belowMinimum ? 'font-semibold text-alerta' : ''}>
                {formatQuantity(row.quantity, row.unit)}
                {row.belowMinimum ? ' (abaixo do mínimo)' : ''}
              </span>
            ),
            numeric: true,
          },
          {
            header: 'Mínimo',
            cell: (row) => formatQuantity(row.minQuantity, row.unit),
            numeric: true,
          },
        ]}
      />
      <CsvLink type="estoque" search={search}>
        Baixar saldos (CSV)
      </CsvLink>
    </div>
  );
}

export async function OperationsSection({ ctx, search }: SectionProps) {
  const report = await reports().operations(ctx, period(search));
  const guests = (report.guestsPerTableTenths / 10).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  });
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Contas abertas"
          value={String(report.openedOrders)}
          hint={`${String(report.tableOrders)} mesa · ${String(report.counterOrders)} balcão`}
        />
        <Stat label="Contas fechadas" value={String(report.closedOrders)} />
        <Stat label="Ainda abertas" value={String(report.stillOpen)} />
        <Stat
          label="Canceladas"
          value={String(report.cancelledOrders)}
          hint={`${String(report.mergedOrders)} juntadas a outra mesa`}
        />
        <Stat label="Ticket médio" value={formatBRL(report.averageTicketCents)} />
        <Stat label="Pessoas por mesa" value={guests} hint="Só as mesas que informaram" />
        <Stat label="Descontos concedidos" value={formatBRL(report.discountsCents)} />
        <Stat label="Taxas de serviço retiradas" value={String(report.serviceFeeWaived)} />
      </div>
      <Table
        caption="Itens cancelados (motivos mais comuns primeiro)"
        rowKey={(row) => row.reason}
        rows={report.cancelledItems}
        empty="Nenhum item cancelado no período."
        columns={[
          { header: 'Motivo', cell: (row) => row.reason },
          { header: 'Itens', cell: (row) => row.items, numeric: true },
          { header: 'Valor', cell: (row) => formatBRL(row.valueCents), numeric: true },
        ]}
      />
    </div>
  );
}

export async function AuditSection({ ctx, search, timeZone }: SectionProps) {
  const report = await reports().audit(ctx, {
    ...period(search),
    event: search.evento ?? null,
    userId: search.pessoa ? parseId(search.pessoa) : null,
    page: search.pagina,
  });
  const when = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone,
  });
  const events = [...AUDIT_EVENTS]
    .map((event) => ({ value: event, label: AUDIT_EVENT_LABEL[event] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return (
    <div className="flex flex-col gap-6">
      <form aria-label="Filtrar auditoria" className="flex flex-wrap items-end gap-4 print:hidden">
        <input type="hidden" name="aba" value="auditoria" />
        {search.de ? <input type="hidden" name="de" value={search.de} /> : null}
        {search.ate ? <input type="hidden" name="ate" value={search.ate} /> : null}
        {search.pessoa ? <input type="hidden" name="pessoa" value={search.pessoa} /> : null}
        <div className="min-w-64">
          <SelectField
            label="Evento"
            name="evento"
            defaultValue={search.evento ?? ''}
            options={[{ value: '', label: 'Todos os eventos' }, ...events]}
          />
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {search.pessoa ? (
          <Link
            href={reportHref('/relatorios', { ...search, pessoa: undefined, pagina: 1 })}
            className="font-semibold text-azulejo underline"
          >
            Mostrar todas as pessoas
          </Link>
        ) : null}
      </form>
      <Table
        caption={`Eventos da loja (${String(report.total)})`}
        rowKey={(row) => row.id}
        rows={report.rows}
        empty="Nenhum evento no período."
        columns={[
          { header: 'Quando', cell: (row) => when.format(row.occurredAt) },
          {
            header: 'Evento',
            cell: (row) => labelOf(AUDIT_EVENT_LABEL, row.event),
          },
          {
            header: 'Pessoa',
            cell: (row) =>
              row.actorUserId ? (
                <Link
                  href={reportHref('/relatorios', search, { pessoa: row.actorUserId, pagina: 1 })}
                  className="text-azulejo underline"
                >
                  {row.actorName ?? 'Sem nome'}
                </Link>
              ) : (
                'Sistema'
              ),
          },
          { header: 'Autorizado por', cell: (row) => row.authorizerName ?? '' },
          {
            header: 'Detalhes',
            cell: (row) => (
              <span className="block max-w-md text-sm break-words whitespace-normal text-tinta-suave">
                {[
                  row.beforeData ? `antes: ${JSON.stringify(row.beforeData)}` : '',
                  row.afterData ? `depois: ${JSON.stringify(row.afterData)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ),
          },
        ]}
      />
      <Pager
        page={report.page}
        pageSize={report.pageSize}
        total={report.total}
        href={(page) => reportHref('/relatorios', search, { pagina: page })}
      />
      <CsvLink type="auditoria" search={search}>
        Baixar auditoria (CSV, até 10.000 linhas)
      </CsvLink>
    </div>
  );
}
