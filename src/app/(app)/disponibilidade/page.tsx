import type { Metadata } from 'next';
import { requireSession } from '@/modules/auth/web';
import { catalog } from '@/modules/catalog/web';
import { hasPermission } from '@/shared/kernel';
import { formatBRL } from '@/ui/money';
import { NoPermission } from '../admin/no-permission';
import { AvailabilityToggle } from './availability-toggle';

export const metadata: Metadata = { title: 'Disponibilidade' };

/** O que acabou hoje na loja ativa (RN-CAT-09, E4-1). */
export default async function AvailabilityPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'products.availability')) {
    return <NoPermission />;
  }
  const categories = await catalog().listAvailability(context);
  const soldOut = categories.flatMap((group) => group.products).filter((item) => !item.available);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Disponibilidade</h1>
        <p className="text-tinta-suave">
          Cardápio da loja {storeName}. Marque “Acabou” e o produto sai da comanda até alguém marcar
          “Voltou”. Vale só para esta loja.
        </p>
        <p className="font-semibold" role="status">
          {soldOut.length === 0
            ? 'Nada esgotado agora.'
            : soldOut.length === 1
              ? '1 produto esgotado.'
              : `${String(soldOut.length)} produtos esgotados.`}
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="text-lg">Nenhum produto à venda nesta loja ainda.</p>
      ) : (
        categories.map((group) => (
          <section key={group.categoryId} aria-labelledby={`cat-${group.categoryId}`}>
            <h2 id={`cat-${group.categoryId}`} className="text-2xl font-bold">
              {group.categoryName}
            </h2>
            <ul className="mt-2 flex flex-col border-t border-borda">
              {group.products.map((item) => (
                <AvailabilityToggle
                  // Situação nova do servidor: o botão renasce com o texto certo
                  key={`${item.productId}-${String(item.available)}`}
                  product={{
                    id: item.productId,
                    name: item.name,
                    price: formatBRL(item.priceCents),
                    available: item.available,
                  }}
                  storeId={context.storeId}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
