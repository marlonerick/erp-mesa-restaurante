// Mesas FICTÍCIAS do seed (regra inviolável 8 do README): salão e varanda no Centro, salão na Praia,
// e uma conta de exemplo aberta na mesa 2 do Centro com um X-Salada ainda não enviado.
import { and, eq } from 'drizzle-orm';
import {
  customerOrder,
  diningTable,
  orderItem,
  product,
  productStore,
  store,
  storeSequence,
} from '@/shared/db/schema';
import type { Transaction } from '@/shared/db/transaction';
import { type Id, newId, operationalDate } from '@/shared/kernel';

/** [número, área, lugares] */
const CENTRO: readonly [string, string, number][] = [
  ['1', 'Salão', 4],
  ['2', 'Salão', 4],
  ['3', 'Salão', 4],
  ['4', 'Salão', 4],
  ['5', 'Salão', 6],
  ['6', 'Salão', 6],
  ['7', 'Salão', 2],
  ['8', 'Salão', 2],
  ['V1', 'Varanda', 4],
  ['V2', 'Varanda', 4],
  ['V3', 'Varanda', 6],
  ['V4', 'Varanda', 8],
];
const PRAIA: readonly [string, string, number][] = [
  ['1', 'Salão', 4],
  ['2', 'Salão', 4],
  ['3', 'Salão', 4],
  ['4', 'Salão', 4],
  ['5', 'Salão', 6],
  ['6', 'Salão', 6],
  ['7', 'Salão', 2],
  ['8', 'Salão', 2],
];

/** Cria as mesas se a loja ainda não tem nenhuma. */
export async function seedDemoTables(
  tx: Transaction,
  input: { centro: Id; praia: Id; userId: Id },
): Promise<boolean> {
  const existing = await tx
    .select({ id: diningTable.id })
    .from(diningTable)
    .where(eq(diningTable.storeId, input.centro))
    .limit(1);
  if (existing.length > 0) return false;

  const ids = new Map<string, Id>();
  for (const [storeId, rows] of [
    [input.centro, CENTRO],
    [input.praia, PRAIA],
  ] as const) {
    for (const [number, area, seats] of rows) {
      const id = newId();
      if (storeId === input.centro) ids.set(number, id);
      await tx.insert(diningTable).values({ id, storeId, number, area, seats });
    }
  }

  // Conta de exemplo: mesa 2 do Centro, 1 X-Salada ainda não enviado (a cozinha não recebeu nada)
  const [burger] = await tx
    .select({
      id: product.id,
      name: product.name,
      priceCents: productStore.priceCents,
      requiresPreparation: product.requiresPreparation,
    })
    .from(product)
    .innerJoin(
      productStore,
      and(eq(productStore.productId, product.id), eq(productStore.storeId, input.centro)),
    )
    .where(eq(product.name, 'X-Salada'))
    .limit(1);
  const tableId = ids.get('2');
  const [settings] = await tx
    .select({ timezone: store.timezone, cutoff: store.operationalDayCutoff })
    .from(store)
    .where(eq(store.id, input.centro));
  if (!burger || !tableId || !settings) return true;

  const now = new Date();
  // TIME chega como "05:00:00"; o dia operacional usa "05:00"
  const day = operationalDate(now, settings.timezone, settings.cutoff.slice(0, 5));
  await tx
    .insert(storeSequence)
    .values({ storeId: input.centro, name: 'customer_order', operationalDate: day, lastValue: 1 })
    .onDuplicateKeyUpdate({ set: { lastValue: 1 } });
  const orderId = newId();
  await tx.insert(customerOrder).values({
    id: orderId,
    storeId: input.centro,
    number: 1,
    openedDate: day,
    type: 'MESA',
    label: '2',
    guests: 2,
    openedBy: input.userId,
    openedAt: now,
  });
  await tx
    .update(diningTable)
    .set({ status: 'OCUPADA', currentOrderId: orderId })
    .where(eq(diningTable.id, tableId));
  await tx.insert(orderItem).values({
    id: newId(),
    storeId: input.centro,
    orderId,
    productId: burger.id,
    productName: burger.name,
    unitPriceCents: burger.priceCents,
    quantity: 1,
    notes: 'sem cebola',
    requiresPreparation: burger.requiresPreparation,
    createdBy: input.userId,
    createdAt: now,
  });
  return true;
}
