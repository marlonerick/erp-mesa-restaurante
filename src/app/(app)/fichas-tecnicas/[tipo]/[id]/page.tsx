import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { MAX_RECIPE_LINES } from '@/modules/recipes';
import { recipes } from '@/modules/recipes/web';
import {
  formatQuantityInput,
  formatQuantityText,
  hasPermission,
  isDomainError,
  isId,
} from '@/shared/kernel';
import { formatBRL } from '@/ui/money';
import { NoPermission } from '../../../admin/no-permission';
import { formatMargin } from '../../format';
import { RecipeEditor } from '../../recipe-editor';

export const metadata: Metadata = { title: 'Ficha técnica' };

const KINDS = { produto: 'PRODUCT', adicional: 'MODIFIER' } as const;

export default async function RecipePage({
  params,
}: {
  params: Promise<{ tipo: string; id: string }>;
}) {
  const { tipo, id } = await params;
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'recipes.read')) {
    return <NoPermission />;
  }
  const kind = Object.hasOwn(KINDS, tipo) ? KINDS[tipo as keyof typeof KINDS] : undefined;
  if (!kind || !isId(id)) notFound();

  let recipe;
  try {
    recipe = await recipes().getRecipe(context, { kind, id });
  } catch (error) {
    if (
      isDomainError(error) &&
      (error.code === 'PRODUCT_NOT_FOUND' || error.code === 'MODIFIER_NOT_FOUND')
    ) {
      notFound();
    }
    throw error;
  }
  const canManage = hasPermission(context, 'recipes.manage');

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/fichas-tecnicas"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para fichas técnicas
        </Link>
        <h1 className="text-3xl font-bold">{recipe.name}</h1>
        <p className="text-tinta-suave">
          {kind === 'PRODUCT' ? 'Produto' : 'Adicional'} · {recipe.groupName}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border-2 border-borda bg-white p-4">
          <dt className="text-tinta-suave">Custo teórico</dt>
          <dd className="text-2xl font-bold">
            {recipe.hasRecipe ? formatBRL(recipe.costCents) : 'Sem ficha'}
          </dd>
        </div>
        <div className="rounded-md border-2 border-borda bg-white p-4">
          <dt className="text-tinta-suave">
            {kind === 'PRODUCT' ? `Preço na loja ${storeName}` : 'Preço extra'}
          </dt>
          <dd className="text-2xl font-bold">
            {recipe.priceCents === null ? 'Não vendido' : formatBRL(recipe.priceCents)}
          </dd>
        </div>
        <div className="rounded-md border-2 border-borda bg-white p-4">
          <dt className="text-tinta-suave">Margem</dt>
          <dd
            className={`text-2xl font-bold ${recipe.marginTenths !== null && recipe.marginTenths < 0 ? 'text-alerta' : ''}`}
          >
            {recipe.marginTenths === null ? '—' : formatMargin(recipe.marginTenths)}
          </dd>
        </div>
      </dl>

      {recipe.lines.length > 0 ? (
        <section aria-labelledby="linhas" className="flex flex-col gap-3">
          <h2 id="linhas" className="text-2xl font-bold">
            Insumos
          </h2>
          <ul className="flex flex-col border-t border-borda">
            {recipe.lines.map((line) => (
              <li
                key={line.ingredientId}
                className="flex flex-wrap justify-between gap-3 border-b border-borda py-3"
              >
                <span>
                  <span className="font-semibold">{line.name}</span> ·{' '}
                  {formatQuantityText(line.quantity)} {line.baseUnit}
                </span>
                <span>{formatBRL(line.lineCostCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage ? (
        <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
          <h2 className="text-2xl font-bold">
            {recipe.hasRecipe ? 'Alterar ficha' : 'Cadastrar ficha'}
          </h2>
          <p className="text-tinta-suave">
            A ficha nova vale daqui para frente: vendas já feitas guardam o consumo e o custo da
            época.
          </p>
          <RecipeEditor
            kind={kind}
            targetId={recipe.id}
            version={recipe.version}
            initial={recipe.lines.map((line) => ({
              ingredientId: line.ingredientId,
              quantity: formatQuantityInput(line.quantity),
            }))}
            ingredients={[
              ...recipe.ingredients.map((item) => ({
                id: item.id,
                name: item.name,
                unit: item.baseUnit,
              })),
              // Insumo já na ficha que foi desativado continua escolhível (RN-REC-02)
              ...recipe.lines
                .filter((line) => !recipe.ingredients.some((item) => item.id === line.ingredientId))
                .map((line) => ({
                  id: line.ingredientId,
                  name: `${line.name} (desativado)`,
                  unit: line.baseUnit,
                })),
            ]}
            maxLines={MAX_RECIPE_LINES}
          />
        </section>
      ) : null}
    </div>
  );
}
