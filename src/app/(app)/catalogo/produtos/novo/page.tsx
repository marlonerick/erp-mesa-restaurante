import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { DESCRIPTION_MAX_LENGTH } from '@/modules/catalog';
import { catalog } from '@/modules/catalog/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../../../admin/no-permission';
import { categoryOptions, groupOptions } from '../../options';
import { ProductForm } from '../product-forms';

export const metadata: Metadata = { title: 'Cadastrar produto' };

export default async function NewProductPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'products.create')) {
    return <NoPermission />;
  }
  const [categories, groups] = await Promise.all([
    catalog().listCategories(context),
    catalog().listModifierGroups(context),
  ]);
  const choices = categoryOptions(categories);

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/catalogo/produtos"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para produtos
        </Link>
        <h1 className="text-3xl font-bold">Cadastrar produto</h1>
      </div>
      {choices.length === 0 ? (
        <p className="text-lg">
          Cadastre antes uma categoria em{' '}
          <Link href="/catalogo/categorias" className="font-semibold text-azulejo underline">
            Categorias
          </Link>
          .
        </p>
      ) : (
        <ProductForm
          values={{
            name: '',
            categoryId: '',
            sku: '',
            description: '',
            requiresPreparation: true,
            modifierGroupIds: [],
          }}
          categories={choices}
          groups={groupOptions(groups)}
          store={{
            id: context.storeId,
            name: storeName,
            canSetPrice: hasPermission(context, 'products.update'),
          }}
          descriptionMax={DESCRIPTION_MAX_LENGTH}
        />
      )}
    </div>
  );
}
