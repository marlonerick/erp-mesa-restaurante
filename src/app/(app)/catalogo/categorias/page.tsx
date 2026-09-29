import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { catalog } from '@/modules/catalog/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../../admin/no-permission';
import { MoveButtons, NewCategoryForm } from './category-forms';

export const metadata: Metadata = { title: 'Categorias' };

export default async function CategoriesPage() {
  const { context } = await requireSession();
  if (!hasPermission(context, 'products.update')) {
    return <NoPermission />;
  }
  const categories = await catalog().listCategories(context);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Categorias</h1>
        <p className="text-tinta-suave">
          A ordem desta lista é a ordem do cardápio na comanda. Valem para todas as lojas da
          empresa.
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="text-lg">Nenhuma categoria cadastrada ainda.</p>
      ) : (
        <ol
          className="flex flex-col border-t border-borda"
          aria-label="Categorias, na ordem do cardápio"
        >
          {categories.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-borda py-3"
            >
              <Link
                href={`/catalogo/categorias/${item.id}`}
                className="flex min-w-0 flex-col hover:underline focus-visible:outline-3 focus-visible:outline-azulejo"
              >
                <span className="text-lg font-bold text-azulejo">{item.name}</span>
                <span className="text-tinta-suave">
                  {item.productCount === 1 ? '1 produto' : `${String(item.productCount)} produtos`}
                  {item.active ? '' : ' · Desativada'}
                </span>
              </Link>
              <MoveButtons
                category={{ id: item.id, name: item.name }}
                first={index === 0}
                last={index === categories.length - 1}
              />
            </li>
          ))}
        </ol>
      )}

      {hasPermission(context, 'products.create') ? (
        <section aria-labelledby="nova-categoria" className="flex max-w-lg flex-col gap-5">
          <h2 id="nova-categoria" className="text-2xl font-bold">
            Cadastrar categoria
          </h2>
          <NewCategoryForm storeId={context.storeId} />
        </section>
      ) : null}
    </div>
  );
}
