import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import type { RecipeSummary } from '@/modules/recipes';
import { recipes } from '@/modules/recipes/web';
import { hasPermission } from '@/shared/kernel';
import { formatBRL } from '@/ui/money';
import { NoPermission } from '../admin/no-permission';
import { formatMargin, recipePath } from './format';

export const metadata: Metadata = { title: 'Fichas técnicas' };

function RecipeList({
  items,
  label,
  priceLabel,
}: {
  readonly items: readonly RecipeSummary[];
  readonly label: string;
  readonly priceLabel: string;
}) {
  if (items.length === 0) return <p>Nenhum cadastrado.</p>;
  return (
    <ul className="flex flex-col border-t border-borda" aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className="border-b border-borda">
          <Link
            href={recipePath(item.kind, item.id)}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-lg font-bold text-azulejo">{item.name}</span>
              <span className="text-tinta-suave">
                {item.groupName}
                {item.active ? '' : ' · desativado'}
              </span>
            </span>
            {item.hasRecipe ? (
              <span className="flex flex-col text-right">
                <span className="font-semibold">Custo {formatBRL(item.costCents)}</span>
                <span className="text-sm text-tinta-suave">
                  {item.priceCents === null
                    ? 'Não vendido nesta loja'
                    : `${priceLabel} ${formatBRL(item.priceCents)}`}
                  {item.marginTenths === null ? '' : ` · margem ${formatMargin(item.marginTenths)}`}
                </span>
              </span>
            ) : (
              <span className="rounded-md bg-alerta-claro px-2 py-1 font-semibold text-alerta">
                Sem ficha
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function RecipesPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'recipes.read')) {
    return <NoPermission />;
  }
  const { products, modifiers } = await recipes().listRecipes(context);
  const missing = products.filter((item) => item.active && !item.hasRecipe).length;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Fichas técnicas</h1>
        <p className="text-tinta-suave">
          Quanto de cada insumo vai em cada produto e adicional. Custo e margem com os custos médios
          e os preços da loja {storeName}. Produto sem ficha não baixa estoque na venda.
        </p>
        {missing > 0 ? (
          <p className="font-semibold" role="status">
            {missing === 1
              ? '1 produto ativo sem ficha.'
              : `${String(missing)} produtos ativos sem ficha.`}
          </p>
        ) : null}
      </div>
      <section aria-labelledby="produtos" className="flex flex-col gap-3">
        <h2 id="produtos" className="text-2xl font-bold">
          Produtos
        </h2>
        <RecipeList items={products} label="Fichas dos produtos" priceLabel="Preço" />
      </section>
      <section aria-labelledby="adicionais" className="flex flex-col gap-3">
        <h2 id="adicionais" className="text-2xl font-bold">
          Adicionais
        </h2>
        <RecipeList items={modifiers} label="Fichas dos adicionais" priceLabel="Preço extra" />
      </section>
    </div>
  );
}
