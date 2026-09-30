import type { Metadata } from 'next';
import { requireSession } from '@/modules/auth/web';
import { kitchen, toKitchenView } from '@/modules/kitchen/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../admin/no-permission';
import { KitchenBoard } from './kitchen-board';

export const metadata: Metadata = { title: 'Cozinha' };

/** Tela da cozinha (KDS) da loja ativa, pensada para o tablet deitado (Q-15). */
export default async function KitchenPage() {
  const session = await requireSession();
  const { context } = session;
  if (!hasPermission(context, 'kds.read')) {
    return <NoPermission />;
  }
  const board = toKitchenView(await kitchen().board(context));

  return (
    <KitchenBoard
      initial={board}
      storeId={context.storeId}
      storeName={session.storeName}
      canManage={hasPermission(context, 'kds.manage')}
      sharedDevice={session.sharedDevice}
    />
  );
}
