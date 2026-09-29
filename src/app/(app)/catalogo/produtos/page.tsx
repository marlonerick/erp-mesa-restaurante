import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { catalog } from '@/modules/catalog/web';
import { hasPermission, isId } from '@/shared/kernel';
import { Button } from '@/ui/button';
import { CheckboxField, SelectField, TextField } from '@/ui/field';
import { formatBRL } from '@/ui/money';
import { NoPermission } from '../../admin/no-permission';

export const metadata: Metadata = { title: 'Produtos' };

interface Search {
  readonly busca?: string;
  readonly categoria?: string;
  readonly inativos?: string;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'products.update')) {
    return <NoPermission />;
  }
  const { busca = '', categoria = '', inativos } = await searchParams;
  const categoryId = isId(categoria) ? categoria : null;
  const includeInactive = inativos === '1';
  const [categories, products] = await Promise.all([
    catalog().listCategories(context),
    catalog().listProducts(context, { search: busca, categoryId, includeInactive }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-tinta-suave">
            Cardápio da empresa. Os preços mostrados são da loja {storeName}.
          </p>
        </div>
        {hasPermission(context, 'products.create') ? (
          <Link
            href="/catalogo/produtos/novo"
            className="inline-flex min-h-12 items-center rounded-md bg-azulejo px-5 font-semibold text-white hover:bg-azulejo-escuro focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-azulejo"
          >
            Cadastrar produto
          </Link>
        ) : null}
      </div>

      {/* Filtros por GET: o endereço guarda a busca (dá para voltar e recarregar) */}
      <form
        role="search"
        aria-label="Filtrar produtos"
        className="grid gap-4 rounded-md border-2 border-borda bg-white p-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
      >
        <TextField label="Buscar" name="busca" defaultValue={busca} hint="Nome ou código" />
        <SelectField
          label="Categoria"
          name="categoria"
          defaultValue={categoryId ?? ''}
          options={[
            { value: '', label: 'Todas' },
            ...categories.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        {/* Antes do botão (celular); no computador, linha de baixo */}
        <CheckboxField
          label="Mostrar desativados"
          name="inativos"
          value="1"
          defaultChecked={includeInactive}
          className="md:order-last md:col-span-3"
        />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {products.length === 0 ? (
        <p className="text-lg">
          {busca || categoryId ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.'}
        </p>
      ) : (
        <ul className="flex flex-col border-t border-borda" aria-label="Produtos">
          {products.map((product) => (
            <li key={product.id} className="border-b border-borda">
              <Link
                href={`/catalogo/produtos/${product.id}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-lg font-bold text-azulejo">
                    {product.name}
                    {product.sku ? (
                      <span className="font-normal text-tinta-suave"> ({product.sku})</span>
                    ) : null}
                  </span>
                  <span className="text-tinta-suave">
                    {product.categoryName}
                    {product.categoryActive ? '' : ' (categoria desativada)'}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {!product.active ? <span className="text-alerta">Desativado</span> : null}
                  {product.available === false ? (
                    <span className="rounded-md bg-alerta-claro px-2 py-1 text-alerta">
                      Esgotado
                    </span>
                  ) : null}
                  {product.priceCents === null ? (
                    <span className="text-tinta-suave">Não vendido nesta loja</span>
                  ) : (
                    <span>{formatBRL(product.priceCents)}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
