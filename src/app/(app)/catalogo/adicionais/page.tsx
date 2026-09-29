import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { MAX_SELECT_LIMIT } from '@/modules/catalog';
import { catalog } from '@/modules/catalog/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../../admin/no-permission';
import { limitsText } from '../options';
import { ModifierGroupForm } from './modifier-forms';

export const metadata: Metadata = { title: 'Adicionais' };

export default async function ModifierGroupsPage() {
  const { context } = await requireSession();
  if (!hasPermission(context, 'products.update')) {
    return <NoPermission />;
  }
  const groups = await catalog().listModifierGroups(context);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Adicionais</h1>
        <p className="text-tinta-suave">
          Grupos de perguntas feitas ao lançar o produto, como “Ponto da carne” ou “Extras”. O preço
          de cada opção é o mesmo em todas as lojas. Ligue os grupos a cada produto na tela do
          produto.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-lg">Nenhum grupo cadastrado ainda.</p>
      ) : (
        <ul className="flex flex-col border-t border-borda" aria-label="Grupos de adicionais">
          {groups.map((group) => {
            const active = group.modifiers.filter((item) => item.active).length;
            return (
              <li key={group.id} className="border-b border-borda">
                <Link
                  href={`/catalogo/adicionais/${group.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-lg font-bold text-azulejo">{group.name}</span>
                    <span className="text-tinta-suave">
                      {limitsText(group)} · {active === 1 ? '1 opção' : `${String(active)} opções`}
                    </span>
                  </span>
                  <span className="font-semibold">
                    {!group.active ? (
                      <span className="text-alerta">Desativado</span>
                    ) : !group.satisfiable ? (
                      <span className="text-alerta">Faltam opções</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {hasPermission(context, 'products.create') ? (
        <section aria-labelledby="novo-grupo" className="flex max-w-lg flex-col gap-5">
          <h2 id="novo-grupo" className="text-2xl font-bold">
            Cadastrar grupo
          </h2>
          <ModifierGroupForm
            values={{ name: '', minSelect: 0, maxSelect: 1, active: true }}
            storeId={context.storeId}
            maxLimit={MAX_SELECT_LIMIT}
          />
        </section>
      ) : null}
    </div>
  );
}
