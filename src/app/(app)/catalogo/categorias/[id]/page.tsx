import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { catalog } from '@/modules/catalog/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../../admin/no-permission';
import { EditCategoryForm } from '../category-forms';

export const metadata: Metadata = { title: 'Editar categoria' };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context } = await requireSession();
  if (!hasPermission(context, 'products.update')) {
    return <NoPermission />;
  }
  if (!isId(id)) notFound();

  let category;
  try {
    category = await catalog().getCategory(context, id);
  } catch (error) {
    if (isDomainError(error) && error.code === 'CATEGORY_NOT_FOUND') notFound();
    throw error;
  }

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/catalogo/categorias"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para categorias
        </Link>
        <h1 className="text-3xl font-bold">{category.name}</h1>
        <p className="text-tinta-suave">{category.active ? 'Ativa' : 'Desativada'}</p>
      </div>
      <EditCategoryForm
        category={{
          id: category.id,
          version: category.version,
          name: category.name,
          active: category.active,
        }}
      />
    </div>
  );
}
