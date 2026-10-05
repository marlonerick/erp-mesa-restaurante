import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { loadStoreSettings } from '@/modules/organizations/web';
import { reports, toDashboardView } from '@/modules/reports/web';
import { hasPermission, operationalDate, type RequestContext } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { DashboardPanel } from './dashboard-panel';

export const metadata: Metadata = { title: 'Início' };

/** "2026-03-14" → "sábado, 14 de março" (a data já é local: formata sem converter fuso). */
function formatOperationalDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const session = await requireSession();
  const { context } = session;
  const firstName = session.userName.split(' ')[0] ?? session.userName;
  const settings = await loadStoreSettings(context);
  const workDay = settings
    ? operationalDate(context.clock.now(), settings.timezone, settings.operationalDayCutoff)
    : null;
  // Painel do dia: caixa, gerente e administrador (E9-4)
  const dashboard = hasPermission(context, 'dashboard.read') ? await loadDashboard(context) : null;

  return (
    <div className="flex flex-col gap-8">
      {aviso === 'loja-indisponivel' ? (
        <p
          role="alert"
          className="rounded-md border-l-4 border-alerta bg-alerta-claro px-4 py-3 font-semibold text-alerta"
        >
          Não foi possível trocar de loja: ela foi desativada ou você não tem mais acesso a ela.
        </p>
      ) : null}
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Olá, {firstName}.</h1>
        <p className="text-lg text-tinta-suave">
          Você está na loja {session.storeName}
          {session.terminalName ? `, no terminal ${session.terminalName}` : ''}.
        </p>
        {workDay && settings ? (
          <p className="text-lg">
            Dia de trabalho: <strong>{formatOperationalDate(workDay)}</strong>{' '}
            <span className="text-tinta-suave">(vira às {settings.operationalDayCutoff})</span>
          </p>
        ) : null}
      </div>

      {dashboard ? (
        <DashboardPanel
          initial={dashboard}
          storeId={context.storeId}
          canSeeReports={hasPermission(context, 'reports.read')}
        />
      ) : null}

      <ul className="flex max-w-2xl flex-col divide-y divide-borda border-y border-borda">
        {context.permissions.has('tables.read') && context.permissions.has('orders.read') ? (
          <HomeLink href="/salao" title="Salão">
            Mapa das mesas, comandas e pedidos de balcão.
          </HomeLink>
        ) : null}
        {context.permissions.has('finance.read') ? (
          <HomeLink href="/financeiro" title="Financeiro">
            Despesas, contas a pagar e o fluxo de caixa. As vendas entram ao fechar o caixa.
          </HomeLink>
        ) : null}
        {context.permissions.has('reports.read') ? (
          <HomeLink href="/relatorios" title="Relatórios">
            Vendas, produtos e margem, caixa, estoque, operação e auditoria — com CSV e impressão.
          </HomeLink>
        ) : null}
        {context.permissions.has('users.read') ? (
          <HomeLink href="/admin/usuarios" title="Usuários">
            Cadastre a equipe, defina perfis e redefina senhas.
          </HomeLink>
        ) : null}
        {context.permissions.has('stores.manage') ? (
          <HomeLink href="/admin/lojas" title="Lojas">
            Taxa de serviço, virada do dia, estoque negativo e caixas abertos de cada loja.
          </HomeLink>
        ) : null}
        {context.permissions.has('terminals.manage') ? (
          <HomeLink href="/admin/terminais" title="Terminais">
            Registre este aparelho como caixa, tela da cozinha ou celular do salão.
          </HomeLink>
        ) : null}
        <HomeLink href="/meu-pin" title="Meu PIN">
          Cadastre o PIN de 6 dígitos para trocar de usuário no tablet e autorizar ações.
        </HomeLink>
      </ul>
    </div>
  );
}

/** O painel não derruba a tela inicial: se falhar (ex.: loja sem configurações), some e registra. */
async function loadDashboard(context: RequestContext) {
  try {
    return toDashboardView(await reports().dashboard(context));
  } catch (error) {
    getLogger().error({ err: error, requestId: context.requestId }, 'Painel indisponível');
    return null;
  }
}

function HomeLink({
  href,
  title,
  children,
}: {
  readonly href: string;
  readonly title: string;
  readonly children: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex flex-col gap-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
      >
        <span className="text-xl font-bold text-azulejo">{title}</span>
        <span className="text-tinta-suave">{children}</span>
      </Link>
    </li>
  );
}
