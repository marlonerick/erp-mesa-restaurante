import type { Metadata } from 'next';
import { requireSession } from '@/modules/auth/web';
import { orders, toFloorView } from '@/modules/orders/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../admin/no-permission';
import { FloorBoard } from './floor-board';

export const metadata: Metadata = { title: 'Salão' };

/** Mapa do salão da loja ativa (RN-TAB-07), pensado para o celular do garçom (Q-15). */
export default async function FloorPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'tables.read') || !hasPermission(context, 'orders.read')) {
    return <NoPermission />;
  }
  const floor = toFloorView(await orders().floor(context));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Salão</h1>
        <p className="text-tinta-suave">
          Loja {storeName}. Toque numa mesa livre para abrir; numa ocupada para ver a comanda.
        </p>
      </div>
      <FloorBoard
        initial={floor}
        storeId={context.storeId}
        can={{
          open: hasPermission(context, 'orders.create'),
          release: hasPermission(context, 'tables.manage'),
        }}
      />
    </div>
  );
}
