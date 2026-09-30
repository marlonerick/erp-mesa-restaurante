import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import {
  BRAZIL_TIMEZONES,
  DEFAULT_STORE_SETTINGS,
  formatPercent,
  MAX_KDS_ALERT_MINUTES,
  MAX_OPEN_CASH_LIMIT,
} from '@/modules/organizations';
import { orgAdmin } from '@/modules/organizations/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../no-permission';
import { StoreForm } from './store-form';

export const metadata: Metadata = { title: 'Lojas' };

export default async function StoresPage() {
  const { context } = await requireSession();
  if (!hasPermission(context, 'stores.manage')) {
    return <NoPermission />;
  }
  const [stores, companies] = await Promise.all([
    orgAdmin().listStores(context),
    orgAdmin().listCompanies(context),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Lojas</h1>
        <p className="text-tinta-suave">
          Cada loja tem as próprias regras: virada do dia, taxa de serviço, estoque e caixas.
        </p>
      </div>

      <ul className="flex flex-col border-t border-borda" aria-label="Lojas">
        {stores.map((store) => (
          <li key={store.id} className="border-b border-borda">
            <Link
              href={`/admin/lojas/${store.id}`}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
            >
              <span className="flex flex-col">
                <span className="text-lg font-bold text-azulejo">
                  {store.name}
                  {store.id === context.storeId ? (
                    <span className="ml-2 text-sm font-semibold text-tinta-suave">(em uso)</span>
                  ) : null}
                </span>
                <span className="text-tinta-suave">
                  Código {store.code} · taxa {formatPercent(store.serviceFeeBp)}% · vira às{' '}
                  {store.operationalDayCutoff}
                </span>
              </span>
              {store.status === 'ATIVO' ? (
                <span className="font-semibold">Ativa</span>
              ) : (
                <span className="font-semibold text-alerta">Desativada</span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {companies.length > 0 ? (
        <section aria-labelledby="nova-loja" className="flex max-w-lg flex-col gap-5">
          <h2 id="nova-loja" className="text-2xl font-bold">
            Cadastrar loja
          </h2>
          <p className="text-tinta-suave">
            A loja nasce ativa, com as configurações padrão e a estação de cozinha “Cozinha”.
          </p>
          <StoreForm
            values={{
              name: '',
              code: '',
              ...DEFAULT_STORE_SETTINGS,
              serviceFee: formatPercent(DEFAULT_STORE_SETTINGS.serviceFeeBp),
            }}
            timezones={BRAZIL_TIMEZONES}
            maxOpenCashLimit={MAX_OPEN_CASH_LIMIT}
            maxKdsAlertMinutes={MAX_KDS_ALERT_MINUTES}
            companies={companies.map((item) => ({ id: item.id, name: item.tradeName }))}
          />
        </section>
      ) : null}
    </div>
  );
}
