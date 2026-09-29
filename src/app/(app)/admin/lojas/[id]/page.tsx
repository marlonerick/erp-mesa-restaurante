import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { BRAZIL_TIMEZONES, formatPercent, MAX_OPEN_CASH_LIMIT } from '@/modules/organizations';
import { orgAdmin } from '@/modules/organizations/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../no-permission';
import { StoreForm } from '../store-form';
import { StoreStatusForm } from './store-status-form';

export const metadata: Metadata = { title: 'Editar loja' };

export default async function EditStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context } = await requireSession();
  if (!hasPermission(context, 'stores.manage')) {
    return <NoPermission />;
  }
  if (!isId(id)) notFound();

  let store;
  try {
    store = await orgAdmin().getStore(context, id);
  } catch (error) {
    // Loja de outra organização ou sem a permissão nela: mesma resposta
    if (isDomainError(error) && ['STORE_NOT_FOUND', 'FORBIDDEN'].includes(error.code)) notFound();
    throw error;
  }

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/lojas"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para lojas
        </Link>
        <h1 className="text-3xl font-bold">{store.name}</h1>
        <p className="text-tinta-suave">
          Código {store.code} · {store.status === 'ATIVO' ? 'Ativa' : 'Desativada'}
          {store.id === context.storeId ? ' · em uso nesta sessão' : ''}
        </p>
      </div>

      <StoreForm
        values={{ ...store, serviceFee: formatPercent(store.serviceFeeBp) }}
        timezones={BRAZIL_TIMEZONES}
        maxOpenCashLimit={MAX_OPEN_CASH_LIMIT}
        store={{ id: store.id, version: store.version }}
      />

      <StoreStatusForm
        store={{
          id: store.id,
          name: store.name,
          version: store.version,
          status: store.status,
          inUse: store.id === context.storeId,
        }}
      />
    </div>
  );
}
