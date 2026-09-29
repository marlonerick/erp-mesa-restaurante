import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { BASE_UNITS } from '@/modules/inventory';
import { inventory } from '@/modules/inventory/web';
import { hasPermission } from '@/shared/kernel';
import { Button } from '@/ui/button';
import { CheckboxField, TextField } from '@/ui/field';
import { formatAmount, formatUnitCost, UNIT_NAMES } from '@/ui/quantity';
import { NoPermission } from '../admin/no-permission';
import { NewIngredientForm } from './ingredient-forms';

export const metadata: Metadata = { title: 'Estoque' };

/** Filtros do endereço: valor estranho vira "sem filtro" (nunca erro 500). */
const searchSchema = z.object({
  busca: z.string().max(80).catch(''),
  alerta: z.literal('1').optional().catch(undefined),
  inativos: z.literal('1').optional().catch(undefined),
});

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'inventory.read')) {
    return <NoPermission />;
  }
  const { busca, alerta, inativos } = searchSchema.parse(await searchParams);
  const [items, below] = await Promise.all([
    inventory().listIngredients(context, {
      search: busca,
      includeInactive: inativos === '1',
      belowMinimumOnly: alerta === '1',
    }),
    inventory().listIngredients(context, { belowMinimumOnly: true }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Estoque</h1>
        <p className="text-tinta-suave">
          Saldos da loja {storeName}. Os insumos valem para todas as lojas da empresa; o saldo é de
          cada loja.
        </p>
      </div>

      {below.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border-l-4 border-alerta bg-alerta-claro px-4 py-3"
        >
          <p className="font-semibold text-alerta">
            {below.length === 1
              ? '1 insumo no estoque mínimo ou abaixo.'
              : `${String(below.length)} insumos no estoque mínimo ou abaixo.`}
          </p>
          <Link href="/estoque?alerta=1" className="font-semibold text-azulejo underline">
            Ver só esses
          </Link>
        </div>
      ) : null}

      <form
        role="search"
        aria-label="Filtrar insumos"
        className="grid gap-4 rounded-md border-2 border-borda bg-white p-4 md:grid-cols-[2fr_auto] md:items-end"
      >
        <TextField label="Buscar" name="busca" defaultValue={busca} hint="Nome do insumo" />
        <div className="flex flex-col gap-3 md:order-last md:col-span-2 md:flex-row md:gap-8">
          <CheckboxField
            label="Só abaixo do mínimo"
            name="alerta"
            value="1"
            defaultChecked={alerta === '1'}
          />
          <CheckboxField
            label="Mostrar desativados"
            name="inativos"
            value="1"
            defaultChecked={inativos === '1'}
          />
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="text-lg">
          {busca || alerta ? 'Nenhum insumo encontrado.' : 'Nenhum insumo cadastrado ainda.'}
        </p>
      ) : (
        <ul className="flex flex-col border-t border-borda" aria-label="Insumos">
          {items.map((item) => (
            <li key={item.id} className="border-b border-borda">
              <Link
                href={`/estoque/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-lg font-bold text-azulejo">{item.name}</span>
                  <span className="text-tinta-suave">
                    Custo médio {formatUnitCost(item.avgCostMicros, item.baseUnit)}
                    {item.minQuantity > 0
                      ? ` · mínimo ${formatAmount(item.minQuantity, item.baseUnit)}`
                      : ''}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {!item.active ? <span className="text-alerta">Desativado</span> : null}
                  {item.belowMinimum ? (
                    <span className="rounded-md bg-alerta-claro px-2 py-1 text-alerta">
                      Abaixo do mínimo
                    </span>
                  ) : null}
                  <span className={item.quantity < 0 ? 'text-alerta' : ''}>
                    {formatAmount(item.quantity, item.baseUnit)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hasPermission(context, 'inventory.manage') ? (
        <section aria-labelledby="novo-insumo" className="flex max-w-lg flex-col gap-5">
          <h2 id="novo-insumo" className="text-2xl font-bold">
            Cadastrar insumo
          </h2>
          <NewIngredientForm
            storeId={context.storeId}
            units={BASE_UNITS.map((unit) => ({ value: unit, label: UNIT_NAMES[unit] }))}
          />
        </section>
      ) : null}
    </div>
  );
}
