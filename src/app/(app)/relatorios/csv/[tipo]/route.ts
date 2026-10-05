import { NextResponse } from 'next/server';
import { AUDIT_EVENT_LABEL } from '@/modules/audit';
import { currentSession } from '@/modules/auth/web';
import { PAYMENT_METHOD_LABEL } from '@/modules/cashier/web';
import { loadStoreSettings } from '@/modules/organizations/web';
import { CSV_MAX_ROWS, csvMoney, reports, toCsv } from '@/modules/reports/web';
import { INTERNAL_ERROR_STATUS, toErrorResponse } from '@/shared/errors/error-response';
import { parseId, type RequestContext } from '@/shared/kernel';
import { requireScreenStore } from '@/shared/http/screen-store';
import { getLogger } from '@/shared/logger/logger';
import { formatQuantity, labelOf, reportSearchSchema, STOCK_TYPE_LABEL } from '../../report-params';

export const dynamic = 'force-dynamic';

interface Table {
  headers: string[];
  rows: (string | number | null)[][];
}
interface Filters {
  from?: string | null;
  to?: string | null;
}

/** Nome da loja no nome do arquivo: "Praia Grande" → "praia-grande". */
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'loja';

const methodLabel = (method: string) => labelOf(PAYMENT_METHOD_LABEL, method);
const percent = (part: number, total: number) =>
  total === 0 ? '0,0' : ((part * 100) / total).toFixed(1).replace('.', ',');

/** Cada relatório em linhas (os mesmos filtros da tela — RN-REP-09). */
const BUILDERS: Record<
  string,
  (
    ctx: RequestContext,
    filters: Filters,
    extra: { event?: string; userId?: string },
  ) => Promise<Table>
> = {
  async vendas(ctx, filters) {
    const report = await reports().sales(ctx, filters);
    return {
      headers: ['Dia', 'Contas', 'Itens', 'Descontos', 'Taxa de serviço', 'Total', 'Ticket médio'],
      rows: report.days.map((day) => [
        day.date,
        day.orders,
        csvMoney(day.itemsCents),
        csvMoney(day.discountsCents),
        csvMoney(day.serviceFeeCents),
        csvMoney(day.totalCents),
        csvMoney(day.averageTicketCents),
      ]),
    };
  },
  async pagamentos(ctx, filters) {
    const { methods } = await reports().sales(ctx, filters);
    const total = methods.reduce((sum, line) => sum + line.amountCents, 0);
    return {
      headers: ['Forma de pagamento', 'Pagamentos', 'Valor', '% do total'],
      rows: methods.map((line) => [
        methodLabel(line.method),
        line.payments,
        csvMoney(line.amountCents),
        percent(line.amountCents, total),
      ]),
    };
  },
  async categorias(ctx, filters) {
    const { categories } = await reports().sales(ctx, filters);
    return {
      headers: ['Categoria', 'Quantidade', 'Valor bruto', 'Descontos', 'Valor líquido'],
      rows: categories.map((line) => [
        line.name,
        line.quantity,
        csvMoney(line.grossCents),
        csvMoney(line.discountsCents),
        csvMoney(line.grossCents - line.discountsCents),
      ]),
    };
  },
  async operacao(ctx, filters) {
    const report = await reports().operations(ctx, filters);
    const guests = (report.guestsPerTableTenths / 10).toFixed(1).replace('.', ',');
    const indicator = (name: string, value: string | number) => [name, value, null, null, null];
    return {
      headers: [
        'Indicador',
        'Valor',
        'Motivo do cancelamento',
        'Itens cancelados',
        'Valor cancelado',
      ],
      rows: [
        indicator('Contas abertas', report.openedOrders),
        indicator('Contas de mesa', report.tableOrders),
        indicator('Contas de balcão', report.counterOrders),
        indicator('Contas fechadas', report.closedOrders),
        indicator('Ainda abertas', report.stillOpen),
        indicator('Canceladas', report.cancelledOrders),
        indicator('Juntadas a outra mesa', report.mergedOrders),
        indicator('Ticket médio', csvMoney(report.averageTicketCents)),
        indicator('Pessoas por mesa', guests),
        indicator('Descontos concedidos', csvMoney(report.discountsCents)),
        indicator('Taxas de serviço retiradas', report.serviceFeeWaived),
        ...report.cancelledItems.map((row) => [
          null,
          null,
          row.reason,
          row.items,
          csvMoney(row.valueCents),
        ]),
      ],
    };
  },
  async produtos(ctx, filters) {
    const report = await reports().salesByProduct(ctx, { ...filters, page: null });
    return {
      headers: ['Produto', 'Quantidade', 'Valor bruto', 'Descontos', 'Custo', 'Margem'],
      rows: report.rows.map((row) => [
        row.name,
        row.quantity,
        csvMoney(row.grossCents),
        csvMoney(row.discountsCents),
        csvMoney(row.costCents),
        csvMoney(row.marginCents),
      ]),
    };
  },
  async caixa(ctx, filters) {
    const { sessions } = await reports().cash(ctx, filters);
    const base = (session: (typeof sessions)[number]) => [
      session.operationalDate,
      `${session.terminalCode} (${session.terminalName})`,
      session.status === 'ABERTA' ? 'Aberto' : 'Fechado',
      session.openedByName,
      session.closedByName,
      csvMoney(session.openingCents),
      csvMoney(session.withdrawalsCents),
      csvMoney(session.suppliesCents),
    ];
    return {
      headers: [
        'Dia',
        'Terminal',
        'Situação',
        'Aberto por',
        'Fechado por',
        'Fundo de troco',
        'Sangrias',
        'Suprimentos',
        'Forma',
        'Esperado',
        'Informado',
        'Diferença',
      ],
      // Caixa aberto: sem esperado nem diferença (fechamento cego — RN-CASH-06)
      rows: sessions.flatMap((session) =>
        session.counts && session.counts.length > 0
          ? session.counts.map((line) => [
              ...base(session),
              methodLabel(line.method),
              csvMoney(line.expectedCents),
              line.declaredCents === null ? null : csvMoney(line.declaredCents),
              line.differenceCents === null ? null : csvMoney(line.differenceCents),
            ])
          : [[...base(session), null, null, null, null]],
      ),
    };
  },
  async estoque(ctx, filters) {
    const report = await reports().stock(ctx, filters);
    return {
      headers: ['Insumo', 'Saldo', 'Mínimo', 'Abaixo do mínimo'],
      rows: report.balances.map((row) => [
        row.name,
        formatQuantity(row.quantity, row.unit),
        formatQuantity(row.minQuantity, row.unit),
        row.belowMinimum ? 'Sim' : 'Não',
      ]),
    };
  },
  async movimentacoes(ctx, filters) {
    const report = await reports().stock(ctx, filters);
    return {
      headers: ['Tipo', 'Lançamentos', 'Valor'],
      rows: report.movements.map((row) => [
        labelOf(STOCK_TYPE_LABEL, row.type),
        row.movements,
        csvMoney(row.valueCents),
      ]),
    };
  },
  async auditoria(ctx, filters, extra) {
    const settings = await loadStoreSettings(ctx);
    const when = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: settings?.timezone ?? 'America/Sao_Paulo',
    });
    const report = await reports().audit(ctx, {
      ...filters,
      event: extra.event ?? null,
      userId: extra.userId ? parseId(extra.userId) : null,
      page: null,
    });
    return {
      headers: ['Data e hora', 'Evento', 'Pessoa', 'Autorizado por', 'O quê', 'Antes', 'Depois'],
      rows: report.rows.map((row) => [
        when.format(row.occurredAt),
        labelOf(AUDIT_EVENT_LABEL, row.event),
        row.actorName,
        row.authorizerName,
        row.entityType,
        row.beforeData ? JSON.stringify(row.beforeData) : null,
        row.afterData ? JSON.stringify(row.afterData) : null,
      ]),
    };
  },
};

/** CSV de um relatório (E9-6): `;`, vírgula decimal, até 10.000 linhas. */
export async function GET(request: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const session = await currentSession();
  if (!session || session.mustChangePassword) {
    return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const { tipo } = await params;
  // Só os tipos do objeto ("constructor", "toString"… não — achado S-3 da revisão)
  const builder = Object.hasOwn(BUILDERS, tipo) ? BUILDERS[tipo] : undefined;
  if (!builder) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  const search = reportSearchSchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  try {
    // A loja da TELA (achado I-2): trocou de loja em outra aba → 409, não baixa os dados da outra
    requireScreenStore(request, session.context);
    const table = await builder(
      session.context,
      { from: search.de ?? null, to: search.ate ?? search.de ?? null },
      {
        ...(search.evento ? { event: search.evento } : {}),
        ...(search.pessoa ? { userId: search.pessoa } : {}),
      },
    );
    const period = [search.de, search.ate].filter(Boolean).join('-a-') || 'hoje';
    const store = slug(session.storeName);
    // Chegou no limite: avisa na última linha em vez de cortar calado (S-6)
    const rows =
      table.rows.length >= CSV_MAX_ROWS
        ? [
            ...table.rows,
            [`Atenção: limite de ${String(CSV_MAX_ROWS)} linhas atingido. Diminua o período.`],
          ]
        : table.rows;
    return new NextResponse(toCsv(table.headers, rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="relatorio-${store}-${tipo}-${period}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const response = toErrorResponse(error, session.context.requestId);
    if (response.status === INTERNAL_ERROR_STATUS) {
      getLogger().error({ err: error, requestId: session.context.requestId }, 'Erro inesperado');
    }
    return NextResponse.json(response.body, { status: response.status });
  }
}
