import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { PAYMENT_METHOD_LABEL } from '@/modules/cashier/web';
import {
  type CategoryView,
  finance,
  toCashFlowView,
  toCategoryView,
  toEntriesView,
} from '@/modules/finance/web';
import { loadStoreSettings } from '@/modules/organizations/web';
import {
  addDays,
  hasPermission,
  isDomainError,
  operationalDate,
  parseId,
  type RequestContext,
} from '@/shared/kernel';
import { Button } from '@/ui/button';
import { SelectField, TextField } from '@/ui/field';
import { formatBRL } from '@/ui/money';
import { NoPermission } from '../admin/no-permission';
import { formatDay, labelOf, reportHref } from '../relatorios/report-params';
import { Bars, Pager, SignedMoney, Stat, Table } from '../relatorios/report-ui';
import { CategoryToggle, EntryActions, NewCategoryForm, NewEntryForm } from './finance-forms';

export const metadata: Metadata = { title: 'Financeiro' };

const TABS = [
  { id: 'lancamentos', label: 'Lançamentos' },
  { id: 'fluxo', label: 'Fluxo de caixa' },
  { id: 'categorias', label: 'Categorias' },
] as const;

const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

/** Filtros do endereço: valor estranho vira "sem filtro" (nunca erro 500). */
const searchSchema = z.object({
  aba: z.enum(['lancamentos', 'fluxo', 'categorias']).catch('lancamentos'),
  de: dateText,
  ate: dateText,
  tipo: z.enum(['RECEITA', 'DESPESA']).optional().catch(undefined),
  situacao: z.enum(['PREVISTO', 'PAGO', 'CANCELADO']).optional().catch(undefined),
  categoria: z.uuid().optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
});

type Search = z.infer<typeof searchSchema>;

const STATUS_STYLE = {
  PREVISTO: 'bg-atencao-claro text-atencao',
  PAGO: 'bg-azulejo-claro text-azulejo',
  CANCELADO: 'bg-borda/40 text-tinta-suave line-through',
} as const;

/**
 * Financeiro básico da loja ativa (docs/modules/finance.md): receitas do caixa entram sozinhas no
 * fechamento; despesas e outras receitas são lançadas aqui. Gerente e administrador (E9-3).
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'finance.read')) {
    return <NoPermission />;
  }
  const search = searchSchema.parse(await searchParams);
  const settings = await loadStoreSettings(context);
  const today = settings
    ? operationalDate(context.clock.now(), settings.timezone, settings.operationalDayCutoff)
    : new Date().toISOString().slice(0, 10);
  // Padrão: o mês do dia operacional de hoje
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = addDays(`${addDays(monthStart, 32).slice(0, 7)}-01`, -1);
  const from = search.de ?? monthStart;
  const to = search.ate ?? monthEnd;
  const canManage = hasPermission(context, 'finance.manage');
  const categories = (await finance().categories(context)).map(toCategoryView);
  const body =
    search.aba === 'categorias'
      ? null
      : await guard(() =>
          search.aba === 'fluxo'
            ? CashFlowTab({ ctx: context, from, to })
            : EntriesTab({ ctx: context, search, from, to, today, canManage, categories }),
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Financeiro</h1>
        <p className="text-tinta-suave">
          Loja {storeName}. As vendas entram sozinhas ao fechar o caixa (uma receita por forma de
          pagamento); despesas e outras receitas são lançadas aqui.
        </p>
      </div>

      <nav aria-label="Financeiro" className="print:hidden">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <li key={item.id}>
              <Link
                href={reportHref('/financeiro', {
                  aba: item.id,
                  ...(search.de ? { de: search.de } : {}),
                  ...(search.ate ? { ate: search.ate } : {}),
                })}
                aria-current={item.id === search.aba ? 'page' : undefined}
                className={`flex min-h-12 items-center rounded-md border-2 px-4 font-semibold ${
                  item.id === search.aba
                    ? 'border-azulejo bg-azulejo text-white'
                    : 'border-borda bg-white text-azulejo hover:bg-azulejo-claro'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {search.aba === 'categorias' ? (
        <CategoriesTab categories={categories} storeId={context.storeId} canManage={canManage} />
      ) : (
        <>
          <form
            aria-label="Período"
            className="flex flex-wrap items-end gap-4 rounded-md border-2 border-borda bg-white p-4 print:hidden"
          >
            <input type="hidden" name="aba" value={search.aba} />
            <TextField label="De" name="de" type="date" defaultValue={from} required />
            <TextField label="Até" name="ate" type="date" defaultValue={to} required />
            {search.aba === 'lancamentos' ? (
              <>
                <SelectField
                  label="Tipo"
                  name="tipo"
                  defaultValue={search.tipo ?? ''}
                  options={[
                    { value: '', label: 'Receitas e despesas' },
                    { value: 'RECEITA', label: 'Só receitas' },
                    { value: 'DESPESA', label: 'Só despesas' },
                  ]}
                />
                <SelectField
                  label="Situação"
                  name="situacao"
                  defaultValue={search.situacao ?? ''}
                  options={[
                    { value: '', label: 'Todas' },
                    { value: 'PREVISTO', label: 'A pagar / a receber' },
                    { value: 'PAGO', label: 'Pagas / recebidas' },
                    { value: 'CANCELADO', label: 'Canceladas' },
                  ]}
                />
                <SelectField
                  label="Categoria"
                  name="categoria"
                  defaultValue={search.categoria ?? ''}
                  options={[
                    { value: '', label: 'Todas' },
                    ...categories.map((category) => ({
                      value: category.id,
                      label: `${category.name} (${category.type === 'RECEITA' ? 'receita' : 'despesa'})`,
                    })),
                  ]}
                />
              </>
            ) : null}
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
          </form>

          {body}
        </>
      )}
    </div>
  );
}

/** Erro de regra (período inválido…) vira aviso na tela; o resto segue para a página de erro. */
async function guard(render: () => Promise<ReactNode>): Promise<ReactNode> {
  try {
    return await render();
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return (
      <p
        role="alert"
        className="rounded-md border-l-4 border-alerta bg-alerta-claro px-4 py-3 font-semibold text-alerta"
      >
        {error.message}
      </p>
    );
  }
}

async function EntriesTab({
  ctx,
  search,
  from,
  to,
  today,
  canManage,
  categories,
}: {
  readonly ctx: RequestContext;
  readonly search: Search;
  readonly from: string;
  readonly to: string;
  readonly today: string;
  readonly canManage: boolean;
  readonly categories: readonly CategoryView[];
}) {
  const page = toEntriesView(
    await finance().entries(ctx, {
      from,
      to,
      type: search.tipo ?? null,
      status: search.situacao ?? null,
      categoryId: search.categoria ? parseId(search.categoria) : null,
      page: search.pagina,
    }),
  );
  return (
    <div className="flex flex-col gap-8">
      <p className="text-tinta-suave">
        Lançamentos com competência de {formatDay(from)} a {formatDay(to)}.
      </p>
      {page.rows.length === 0 ? (
        <p className="text-lg">Nenhum lançamento no período.</p>
      ) : (
        <ul className="flex flex-col border-t border-borda" aria-label="Lançamentos">
          {page.rows.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-3 border-b border-borda py-4 md:flex-row md:items-start md:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-lg font-bold">{entry.description}</span>
                <span className="text-tinta-suave">
                  {entry.typeLabel} · {entry.categoryName}
                  {entry.paymentMethod
                    ? ` · ${labelOf(PAYMENT_METHOD_LABEL, entry.paymentMethod)}`
                    : ''}{' '}
                  · competência {formatDay(entry.competenceDate)}
                  {entry.dueDate ? ` · vence ${formatDay(entry.dueDate)}` : ''}
                  {entry.paidDate ? ` · pago ${formatDay(entry.paidDate)}` : ''}
                </span>
                {entry.automatic ? (
                  <span className="text-sm text-tinta-suave">Do fechamento do caixa</span>
                ) : entry.createdByName ? (
                  <span className="text-sm text-tinta-suave">
                    Lançado por {entry.createdByName}
                  </span>
                ) : null}
                {entry.cancelReason ? (
                  <span className="text-sm text-alerta">Cancelado: {entry.cancelReason}</span>
                ) : null}
                {canManage ? (
                  <EntryActions entry={entry} storeId={ctx.storeId} today={today} />
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
                <span
                  className={`text-xl font-bold tabular-nums ${
                    entry.type === 'DESPESA' ? 'text-alerta' : ''
                  }`}
                >
                  {entry.type === 'DESPESA' ? '− ' : '+ '}
                  {formatBRL(entry.amountCents)}
                </span>
                <span
                  className={`rounded-md px-2 py-1 text-sm font-semibold ${STATUS_STYLE[entry.status]}`}
                >
                  {entry.statusLabel}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={page.page}
        pageSize={page.pageSize}
        total={page.total}
        href={(next) => reportHref('/financeiro', search, { pagina: next })}
      />

      {canManage ? (
        <section aria-labelledby="novo-lancamento" className="flex max-w-lg flex-col gap-5">
          <h2 id="novo-lancamento" className="text-2xl font-bold">
            Novo lançamento
          </h2>
          <NewEntryForm storeId={ctx.storeId} today={today} categories={categories} />
        </section>
      ) : null}
    </div>
  );
}

async function CashFlowTab({
  ctx,
  from,
  to,
}: {
  readonly ctx: RequestContext;
  readonly from: string;
  readonly to: string;
}) {
  const flow = toCashFlowView(await finance().cashFlow(ctx, { from, to }));
  const overdue = flow.upcoming.filter((entry) => entry.overdue);
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Entradas pagas" value={formatBRL(flow.inflowCents)} />
        <Stat label="Saídas pagas" value={formatBRL(flow.outflowCents)} />
        <Stat
          label="Saldo do período"
          value={formatBRL(flow.inflowCents - flow.outflowCents)}
          {...(flow.inflowCents < flow.outflowCents ? { tone: 'alerta' as const } : {})}
        />
      </div>
      <Bars
        title="Saldo acumulado por dia"
        items={flow.days.map((day) => ({
          label: formatDay(day.date),
          value: Math.max(0, day.cumulativeCents),
          text: formatBRL(day.cumulativeCents),
        }))}
      />
      <Table
        caption="Por dia (pelo dia do pagamento)"
        rowKey={(day) => day.date}
        rows={flow.days}
        empty="Nada pago no período."
        columns={[
          { header: 'Dia', cell: (day) => formatDay(day.date) },
          { header: 'Entradas', cell: (day) => formatBRL(day.inflowCents), numeric: true },
          { header: 'Saídas', cell: (day) => formatBRL(day.outflowCents), numeric: true },
          {
            header: 'Saldo do dia',
            cell: (day) => <SignedMoney cents={day.netCents} />,
            numeric: true,
          },
          {
            header: 'Acumulado',
            cell: (day) => <SignedMoney cents={day.cumulativeCents} />,
            numeric: true,
          },
        ]}
      />
      <section aria-labelledby="a-vencer" className="flex flex-col gap-3">
        <h2 id="a-vencer" className="text-xl font-bold">
          A pagar e a receber até {formatDay(addDays(flow.today, 30))}
        </h2>
        {overdue.length > 0 ? (
          <p role="status" className="font-semibold text-alerta">
            {overdue.length === 1
              ? '1 conta vencida.'
              : `${String(overdue.length)} contas vencidas.`}
          </p>
        ) : null}
        <Table
          caption="Próximos vencimentos (vencidas primeiro)"
          rowKey={(entry) => entry.id}
          rows={flow.upcoming}
          empty="Nada a pagar nem a receber nos próximos 30 dias."
          columns={[
            {
              header: 'Vencimento',
              cell: (entry) => (
                <span className={entry.overdue ? 'font-semibold text-alerta' : ''}>
                  {entry.dueDate ? formatDay(entry.dueDate) : '—'}
                  {entry.overdue ? ' (vencida)' : ''}
                </span>
              ),
            },
            { header: 'Descrição', cell: (entry) => entry.description },
            { header: 'Categoria', cell: (entry) => entry.categoryName },
            {
              header: 'Valor',
              cell: (entry) =>
                `${entry.type === 'DESPESA' ? '− ' : '+ '}${formatBRL(entry.amountCents)}`,
              numeric: true,
            },
          ]}
        />
      </section>
    </div>
  );
}

function CategoriesTab({
  categories,
  storeId,
  canManage,
}: {
  readonly categories: readonly CategoryView[];
  readonly storeId: string;
  readonly canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-tinta-suave">
        As categorias valem para todas as lojas da empresa. Categoria desativada não aparece em
        lançamentos novos; os antigos continuam com ela.
      </p>
      {(['RECEITA', 'DESPESA'] as const).map((type) => (
        <section key={type} aria-labelledby={`cat-${type}`} className="flex flex-col gap-3">
          <h2 id={`cat-${type}`} className="text-xl font-bold">
            {type === 'RECEITA' ? 'Receitas' : 'Despesas'}
          </h2>
          <ul className="flex flex-col border-t border-borda">
            {categories
              .filter((category) => category.type === type)
              .map((category) => (
                <li
                  key={category.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-borda py-3"
                >
                  <span className={category.active ? 'font-semibold' : 'text-tinta-suave'}>
                    {category.name}
                    {category.active ? '' : ' (desativada)'}
                  </span>
                  {canManage ? <CategoryToggle category={category} storeId={storeId} /> : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
      {canManage ? (
        <section aria-labelledby="nova-categoria" className="flex max-w-md flex-col gap-5">
          <h2 id="nova-categoria" className="text-2xl font-bold">
            Nova categoria
          </h2>
          <NewCategoryForm storeId={storeId} />
        </section>
      ) : null}
    </div>
  );
}
