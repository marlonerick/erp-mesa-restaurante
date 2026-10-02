import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { cashier } from '@/modules/cashier/web';
import { pos, toBillView } from '@/modules/pos/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../../admin/no-permission';
import { BillScreen } from './bill-screen';

export const metadata: Metadata = { title: 'Conta' };

/** A conta no PDV (docs/modules/pos.md): pré-conta, descontos, taxa, pagamentos e divisão. */
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'payments.create') && !hasPermission(context, 'cashier.read')) {
    return <NoPermission />;
  }
  if (!isId(id)) notFound();
  let bill;
  try {
    bill = toBillView(await pos().bill(context, id));
  } catch (error) {
    if (isDomainError(error) && error.code === 'ORDER_NOT_FOUND') notFound();
    throw error;
  }
  const cash = hasPermission(context, 'cashier.read') ? await cashier().current(context) : null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/pdv" className="font-semibold text-azulejo underline">
        Voltar para o PDV
      </Link>
      <BillScreen
        bill={bill}
        storeId={context.storeId}
        storeName={storeName}
        cashOpen={Boolean(cash?.session)}
        discountLimitBp={await pos().myDiscountLimit(context)}
        can={{
          receive: hasPermission(context, 'payments.create'),
          aboveLimit: hasPermission(context, 'discounts.apply_above_limit'),
          cancelPayment: hasPermission(context, 'payments.cancel'),
        }}
      />
    </div>
  );
}
