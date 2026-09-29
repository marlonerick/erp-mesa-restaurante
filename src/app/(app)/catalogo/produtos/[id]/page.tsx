import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { DESCRIPTION_MAX_LENGTH } from '@/modules/catalog';
import { catalog } from '@/modules/catalog/web';
import { formatMoneyText, hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../../admin/no-permission';
import { categoryOptions, groupOptions } from '../../options';
import { ProductForm, ProductStatus, StorePriceForm } from '../product-forms';

export const metadata: Metadata = { title: 'Editar produto' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context } = await requireSession();
  if (!hasPermission(context, 'products.update')) {
    return <NoPermission />;
  }
  if (!isId(id)) notFound();

  let product;
  try {
    product = await catalog().getProduct(context, id);
  } catch (error) {
    // Produto de outra empresa: mesma resposta de inexistente (isolamento)
    if (isDomainError(error) && error.code === 'PRODUCT_NOT_FOUND') notFound();
    throw error;
  }
  const [categories, groups] = await Promise.all([
    catalog().listCategories(context),
    catalog().listModifierGroups(context),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/catalogo/produtos"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para produtos
        </Link>
        <h1 className="text-3xl font-bold">{product.name}</h1>
        <p className="text-tinta-suave">
          {product.active ? 'Ativo' : 'Desativado'}
          {product.sku ? ` · Código ${product.sku}` : ''}
        </p>
      </div>

      <section aria-labelledby="precos" className="flex flex-col gap-2">
        <h2 id="precos" className="text-2xl font-bold">
          Preço por loja
        </h2>
        <p className="text-tinta-suave">
          Sem preço, o produto não é vendido na loja. Aparecem só as lojas em que você pode alterar
          o preço.
        </p>
        {product.prices.map((item) => (
          <StorePriceForm
            key={item.storeId}
            values={{
              productId: product.id,
              storeId: item.storeId,
              storeName: item.storeName,
              price: item.price
                ? {
                    text: formatMoneyText(item.price.priceCents),
                    version: item.price.version,
                    available: item.price.available,
                  }
                : null,
            }}
          />
        ))}
      </section>

      <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
        <h2 className="text-2xl font-bold">Dados</h2>
        <ProductForm
          values={{
            name: product.name,
            categoryId: product.categoryId,
            sku: product.sku ?? '',
            description: product.description ?? '',
            requiresPreparation: product.requiresPreparation,
            modifierGroupIds: product.modifierGroupIds,
          }}
          categories={categoryOptions(categories, product.categoryId)}
          groups={groupOptions(groups, product.modifierGroupIds)}
          product={{ id: product.id, version: product.version }}
          descriptionMax={DESCRIPTION_MAX_LENGTH}
        />
      </section>

      <ProductStatus
        product={{ id: product.id, version: product.version, active: product.active }}
      />
    </div>
  );
}
