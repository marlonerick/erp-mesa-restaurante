import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { loadStoreSettings } from '@/modules/organizations/web';
import {
  hasPermission,
  isDomainError,
  operationalDate,
  type RequestContext,
} from '@/shared/kernel';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/field';
import { NoPermission } from '../admin/no-permission';
import { PrintButton } from './print-button';
import {
  formatDay,
  REPORT_TABS,
  reportHref,
  type ReportSearch,
  reportSearchSchema,
} from './report-params';
import {
  AuditSection,
  CashSection,
  OperationsSection,
  ProductsSection,
  SalesSection,
  StockSection,
} from './sections';

export const metadata: Metadata = { title: 'Relatórios' };

const SECTIONS = {
  vendas: SalesSection,
  produtos: ProductsSection,
  caixa: CashSection,
  estoque: StockSection,
  operacao: OperationsSection,
  auditoria: AuditSection,
} as const;

/**
 * Relatórios da loja ativa (docs/modules/reports.md): período em dias operacionais (padrão: hoje),
 * barras simples, CSV e impressão. Gerente e administrador (E9-4); auditoria com `audit.read`.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'reports.read')) {
    return <NoPermission />;
  }
  const search = reportSearchSchema.parse(await searchParams);
  const canAudit = hasPermission(context, 'audit.read');
  const tabs = REPORT_TABS.filter((tab) => tab.id !== 'auditoria' || canAudit);
  const tab = tabs.some((item) => item.id === search.aba) ? search.aba : 'vendas';
  const settings = await loadStoreSettings(context);
  const timeZone = settings?.timezone ?? 'America/Sao_Paulo';
  const today = settings
    ? operationalDate(context.clock.now(), settings.timezone, settings.operationalDayCutoff)
    : null;
  const from = search.de ?? today ?? '';
  const to = search.ate ?? search.de ?? today ?? '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-tinta-suave">
            Loja {storeName} ·{' '}
            {from === to ? formatDay(from) : `${formatDay(from)} a ${formatDay(to)}`}
            {settings ? ` · o dia vira às ${settings.operationalDayCutoff}` : ''}
          </p>
        </div>
        <PrintButton />
      </div>

      <form
        aria-label="Período"
        className="flex flex-wrap items-end gap-4 rounded-md border-2 border-borda bg-white p-4 print:hidden"
      >
        <input type="hidden" name="aba" value={tab} />
        <TextField label="De" name="de" type="date" defaultValue={from} required />
        <TextField label="Até" name="ate" type="date" defaultValue={to} required />
        <Button type="submit" variant="secondary">
          Ver período
        </Button>
        <Link
          href={reportHref('/relatorios', { aba: tab })}
          className="font-semibold text-azulejo underline"
        >
          Hoje
        </Link>
      </form>

      <nav aria-label="Relatórios" className="print:hidden">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <li key={item.id}>
              <Link
                href={reportHref('/relatorios', {
                  aba: item.id,
                  ...(search.de ? { de: search.de } : {}),
                  ...(search.ate ? { ate: search.ate } : {}),
                })}
                aria-current={item.id === tab ? 'page' : undefined}
                className={`flex min-h-12 items-center rounded-md border-2 px-4 font-semibold ${
                  item.id === tab
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

      <h2 className="text-2xl font-bold">{tabs.find((item) => item.id === tab)?.label}</h2>
      <Section tab={tab} ctx={context} search={search} timeZone={timeZone} />
    </div>
  );
}

/** Erro de regra (período inválido…) vira aviso na tela; o resto segue para a página de erro. */
async function Section({
  tab,
  ...props
}: {
  readonly tab: keyof typeof SECTIONS;
  readonly ctx: RequestContext;
  readonly search: ReportSearch;
  readonly timeZone: string;
}) {
  const Component = SECTIONS[tab];
  try {
    return await Component(props);
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
