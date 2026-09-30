import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { tables } from '@/modules/tables/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../admin/no-permission';
import { EditTableForm } from '../table-forms';

export const metadata: Metadata = { title: 'Mesa' };

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { context } = await requireSession();
  if (!hasPermission(context, 'tables.configure')) {
    return <NoPermission />;
  }
  const { id } = await params;
  if (!isId(id)) notFound();
  const table = await tables()
    .getTable(context, id)
    .catch((error: unknown) => {
      if (isDomainError(error) && error.code === 'TABLE_NOT_FOUND') notFound();
      throw error;
    });

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Link href="/mesas" className="font-semibold text-azulejo underline">
        Voltar para as mesas
      </Link>
      <h1 className="text-3xl font-bold">Mesa {table.number}</h1>
      <EditTableForm
        key={table.version}
        storeId={context.storeId}
        table={{
          id: table.id,
          version: table.version,
          number: table.number,
          area: table.area,
          seats: table.seats,
          active: table.active,
        }}
      />
    </div>
  );
}
