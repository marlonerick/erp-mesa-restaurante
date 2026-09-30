import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import {
  ITEM_NOTES_MAX_LENGTH,
  MAX_ITEM_QUANTITY,
  orders,
  toFloorView,
  toMenuView,
  toOrderView,
} from '@/modules/orders/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../../admin/no-permission';
import { OrderScreen } from './order-screen';

export const metadata: Metadata = { title: 'Comanda' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { context } = await requireSession();
  if (!hasPermission(context, 'orders.read') || !hasPermission(context, 'tables.read')) {
    return <NoPermission />;
  }
  const { id } = await params;
  if (!isId(id)) notFound();
  const order = await orders()
    .getOrder(context, id)
    .catch((error: unknown) => {
      if (isDomainError(error) && error.code === 'ORDER_NOT_FOUND') notFound();
      throw error;
    });
  const canAdd = hasPermission(context, 'orders.create');
  const [menu, floor] = await Promise.all([
    canAdd ? orders().menu(context) : Promise.resolve([]),
    orders().floor(context),
  ]);

  return (
    <OrderScreen
      initial={toOrderView(order)}
      menu={toMenuView(menu)}
      floor={toFloorView(floor)}
      storeId={context.storeId}
      can={{
        add: canAdd,
        update: hasPermission(context, 'orders.update'),
        cancel: hasPermission(context, 'orders.cancel'),
      }}
      limits={{ notes: ITEM_NOTES_MAX_LENGTH, quantity: MAX_ITEM_QUANTITY }}
    />
  );
}
