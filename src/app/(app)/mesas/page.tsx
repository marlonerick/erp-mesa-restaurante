import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { TABLE_STATUS_LABEL } from '@/modules/tables';
import { tables } from '@/modules/tables/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../admin/no-permission';
import { NewTableForm } from './table-forms';

export const metadata: Metadata = { title: 'Mesas' };

/** Cadastro das mesas da loja ativa (RN-TAB-02, E6-2). */
export default async function TablesPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'tables.configure')) {
    return <NoPermission />;
  }
  const rows = await tables().listTables(context, { includeInactive: true });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Mesas</h1>
        <p className="text-tinta-suave">
          Mesas da loja {storeName}. O garçom vê as mesas ativas no mapa do salão.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-lg">Nenhuma mesa cadastrada ainda.</p>
      ) : (
        <ul className="flex flex-col border-t border-borda" aria-label="Mesas cadastradas">
          {rows.map((table) => (
            <li key={table.id} className="border-b border-borda">
              <Link
                href={`/mesas/${table.id}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-lg font-bold text-azulejo">Mesa {table.number}</span>
                  <span className="text-tinta-suave">
                    {table.area ?? 'Sem área'} · {table.seats} lugares
                  </span>
                </span>
                <span className="font-semibold">
                  {table.active ? (
                    TABLE_STATUS_LABEL[table.status]
                  ) : (
                    <span className="text-alerta">Desativada</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="nova-mesa" className="flex max-w-lg flex-col gap-5">
        <h2 id="nova-mesa" className="text-2xl font-bold">
          Cadastrar mesa
        </h2>
        <NewTableForm storeId={context.storeId} />
      </section>
    </div>
  );
}
