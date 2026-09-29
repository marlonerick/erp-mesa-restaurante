import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { MAX_SELECT_LIMIT } from '@/modules/catalog';
import { catalog } from '@/modules/catalog/web';
import { formatMoneyText, hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../../admin/no-permission';
import { limitsText } from '../../options';
import { ModifierGroupForm, ModifierRow, NewModifierForm } from '../modifier-forms';

export const metadata: Metadata = { title: 'Editar adicionais' };

export default async function EditModifierGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { context } = await requireSession();
  if (!hasPermission(context, 'products.update')) {
    return <NoPermission />;
  }
  if (!isId(id)) notFound();

  let group;
  try {
    group = await catalog().getModifierGroup(context, id);
  } catch (error) {
    if (isDomainError(error) && error.code === 'MODIFIER_GROUP_NOT_FOUND') notFound();
    throw error;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/catalogo/adicionais"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para adicionais
        </Link>
        <h1 className="text-3xl font-bold">{group.name}</h1>
        <p className="text-tinta-suave">
          {limitsText(group)} · {group.active ? 'Ativo' : 'Desativado'}
        </p>
      </div>

      {!group.satisfiable ? (
        <p
          role="alert"
          className="rounded-md border-l-4 border-alerta bg-alerta-claro px-4 py-3 font-semibold text-alerta"
        >
          O mínimo de escolhas é maior que o número de opções ativas: os produtos com este grupo não
          poderão ser lançados. Inclua opções ou diminua o mínimo.
        </p>
      ) : null}

      <section aria-labelledby="opcoes" className="flex flex-col gap-4">
        <h2 id="opcoes" className="text-2xl font-bold">
          Opções
        </h2>
        {group.modifiers.length === 0 ? (
          <p>Nenhuma opção ainda.</p>
        ) : (
          <ul className="flex flex-col border-t border-borda">
            {group.modifiers.map((item) => (
              <ModifierRow
                key={item.id}
                modifier={{
                  id: item.id,
                  version: item.version,
                  name: item.name,
                  priceText: formatMoneyText(item.priceDeltaCents),
                  active: item.active,
                }}
              />
            ))}
          </ul>
        )}
        {hasPermission(context, 'products.create') ? (
          <div className="flex max-w-lg flex-col gap-4 pt-2">
            <h3 className="text-xl font-bold">Incluir opção</h3>
            <NewModifierForm groupId={group.id} storeId={context.storeId} />
          </div>
        ) : null}
      </section>

      <section className="flex max-w-lg flex-col gap-4 border-t-2 border-borda pt-6">
        <h2 className="text-2xl font-bold">Dados do grupo</h2>
        <ModifierGroupForm
          values={{
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            active: group.active,
          }}
          group={{ id: group.id, version: group.version }}
          maxLimit={MAX_SELECT_LIMIT}
        />
      </section>
    </div>
  );
}
