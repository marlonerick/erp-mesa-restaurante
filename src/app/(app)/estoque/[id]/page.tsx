import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireSession } from '@/modules/auth/web';
import { fixedUnitsFor, type MovementType } from '@/modules/inventory';
import { inventory } from '@/modules/inventory/web';
import { loadStoreSettings } from '@/modules/organizations/web';
import {
  formatQuantityInput,
  formatQuantityText,
  hasPermission,
  isDomainError,
  isId,
} from '@/shared/kernel';
import { formatBRL } from '@/ui/money';
import { formatAmount, formatUnitCost } from '@/ui/quantity';
import { NoPermission } from '../../admin/no-permission';
import {
  ConversionForms,
  CountForm,
  EntryForm,
  ExitForm,
  IngredientDataForm,
  LossForm,
  MinimumForm,
} from '../ingredient-forms';

export const metadata: Metadata = { title: 'Insumo' };

const TYPE_LABELS: Readonly<Record<MovementType, string>> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Contagem',
  PERDA: 'Perda',
  CONSUMO_VENDA: 'Venda',
  ESTORNO_VENDA: 'Venda cancelada',
};

const LOSS_LABELS: Readonly<Record<string, string>> = {
  VENCIDO: 'Vencido',
  ESTRAGADO: 'Estragado',
  ERRO_PREPARO: 'Erro no preparo',
  QUEBRA: 'Quebra',
  OUTRO: 'Outro',
  CANCELAMENTO_APOS_PREPARO: 'Cancelado depois do preparo',
};

/** Bloco que abre e fecha (HTML nativo: teclado e leitor de tela sem código extra). */
function Launch({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <details className="group rounded-md border-2 border-borda bg-white">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 text-lg font-bold text-azulejo focus-visible:outline-3 focus-visible:outline-azulejo">
        {title}
      </summary>
      <div className="border-t-2 border-borda p-4">{children}</div>
    </details>
  );
}

export default async function IngredientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'inventory.read')) {
    return <NoPermission />;
  }
  if (!isId(id)) notFound();

  let item;
  try {
    item = await inventory().getIngredient(context, id);
  } catch (error) {
    // De outra empresa: mesma resposta de inexistente (isolamento)
    if (isDomainError(error) && error.code === 'INGREDIENT_NOT_FOUND') notFound();
    throw error;
  }
  const settings = await loadStoreSettings(context);
  const when = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: settings?.timezone ?? 'America/Sao_Paulo',
  });
  const canManage = hasPermission(context, 'inventory.manage');
  const units = [
    ...fixedUnitsFor(item.baseUnit).map((unit) => ({ value: unit, label: unit })),
    ...item.conversions.map((conversion) => ({
      value: conversion.id,
      label: `${conversion.unitName} (${formatQuantityText(conversion.factorThousandths)} ${item.baseUnit})`,
    })),
  ];
  const target = { ingredientId: item.id, storeId: context.storeId, units };

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/estoque"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para o estoque
        </Link>
        <h1 className="text-3xl font-bold">{item.name}</h1>
        <p className="text-tinta-suave">
          Loja {storeName} · controlado em {item.baseUnit}
          {item.active ? '' : ' · Desativado'}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border-2 border-borda bg-white p-4">
          <dt className="text-tinta-suave">Saldo</dt>
          <dd className={`text-2xl font-bold ${item.quantity < 0 ? 'text-alerta' : ''}`}>
            {formatAmount(item.quantity, item.baseUnit)}
          </dd>
        </div>
        <div className="rounded-md border-2 border-borda bg-white p-4">
          <dt className="text-tinta-suave">Custo médio</dt>
          <dd className="text-2xl font-bold">
            {formatUnitCost(item.avgCostMicros, item.baseUnit)}
          </dd>
        </div>
        <div
          className={`rounded-md border-2 p-4 ${item.belowMinimum ? 'border-alerta bg-alerta-claro' : 'border-borda bg-white'}`}
        >
          <dt className="text-tinta-suave">Mínimo</dt>
          <dd className="text-2xl font-bold">
            {item.minQuantity > 0 ? formatAmount(item.minQuantity, item.baseUnit) : 'Sem alerta'}
          </dd>
          {item.belowMinimum ? (
            <dd className="font-semibold text-alerta">Abaixo do mínimo — hora de comprar</dd>
          ) : null}
        </div>
      </dl>

      {canManage ? (
        <section aria-labelledby="lancar" className="flex flex-col gap-3">
          <h2 id="lancar" className="text-2xl font-bold">
            Lançar
          </h2>
          {item.active ? (
            <Launch title="Entrada (compra)">
              <EntryForm target={target} />
            </Launch>
          ) : null}
          <Launch title="Contagem">
            <CountForm target={target} />
          </Launch>
          <Launch title="Saída">
            <ExitForm target={target} />
          </Launch>
          <Launch title="Perda">
            <LossForm
              target={target}
              reasons={['VENCIDO', 'ESTRAGADO', 'ERRO_PREPARO', 'QUEBRA', 'OUTRO'].map((value) => ({
                value,
                label: LOSS_LABELS[value] ?? value,
              }))}
            />
          </Launch>
        </section>
      ) : null}

      <section aria-labelledby="extrato" className="flex flex-col gap-3">
        <h2 id="extrato" className="text-2xl font-bold">
          Extrato
        </h2>
        {item.movements.length === 0 ? (
          <p>Nenhuma movimentação nesta loja ainda.</p>
        ) : (
          <ol
            className="flex flex-col border-t border-borda"
            aria-label="Movimentações, da mais nova"
          >
            {item.movements.map((movement) => (
              <li
                key={movement.id}
                className="grid gap-x-4 gap-y-1 border-b border-borda py-3 sm:grid-cols-[1fr_auto]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">
                    {TYPE_LABELS[movement.type]}
                    {movement.lossReason ? ` · ${LOSS_LABELS[movement.lossReason] ?? ''}` : ''}
                  </span>
                  <span className="text-sm text-tinta-suave">
                    {when.format(movement.occurredAt)}
                    {movement.userName ? ` · ${movement.userName}` : ''}
                    {movement.enteredText ? ` · digitado: ${movement.enteredText}` : ''}
                  </span>
                  {movement.note ? <span className="text-sm">{movement.note}</span> : null}
                </span>
                <span className="flex flex-col sm:items-end">
                  <span
                    className={`font-bold ${movement.quantity < 0 ? 'text-alerta' : 'text-confirma'}`}
                  >
                    {movement.quantity > 0 ? '+' : ''}
                    {formatAmount(movement.quantity, item.baseUnit)}
                  </span>
                  <span className="text-sm text-tinta-suave">
                    {formatBRL(movement.valueCents)} · saldo{' '}
                    {formatAmount(movement.balanceAfter, item.baseUnit)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {canManage ? (
        <>
          <section className="flex max-w-lg flex-col gap-4 border-t-2 border-borda pt-6">
            <h2 className="text-2xl font-bold">Estoque mínimo nesta loja</h2>
            <MinimumForm
              ingredientId={item.id}
              storeId={context.storeId}
              value={formatQuantityInput(item.minQuantity)}
              unitLabel={item.baseUnit}
            />
          </section>
          <section className="flex max-w-lg flex-col gap-4 border-t-2 border-borda pt-6">
            <h2 className="text-2xl font-bold">Unidades de compra</h2>
            <ConversionForms
              ingredientId={item.id}
              baseLabel={item.baseUnit}
              conversions={item.conversions.map((conversion) => ({
                id: conversion.id,
                unitName: conversion.unitName,
                factor: formatQuantityText(conversion.factorThousandths),
              }))}
            />
          </section>
          <section className="flex max-w-lg flex-col gap-4 border-t-2 border-borda pt-6">
            <h2 className="text-2xl font-bold">Dados</h2>
            <IngredientDataForm
              ingredient={{
                id: item.id,
                version: item.version,
                name: item.name,
                active: item.active,
              }}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
