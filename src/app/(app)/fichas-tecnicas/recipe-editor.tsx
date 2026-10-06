'use client';

import { useId, useState } from 'react';
import { saveRecipeAction } from '@/modules/recipes/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { Button } from '@/ui/button';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

interface Ingredient {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
}

interface Row {
  readonly key: number;
  readonly ingredientId: string;
  readonly quantity: string;
}

/**
 * Editor da ficha (RN-REC-02): uma linha por insumo, com a quantidade para UMA unidade vendida,
 * na unidade de controle do insumo. Salva a ficha inteira de uma vez (RN-REC-03).
 */
export function RecipeEditor({
  kind,
  targetId,
  version,
  initial,
  ingredients,
  maxLines,
}: {
  readonly kind: 'PRODUCT' | 'MODIFIER';
  readonly targetId: string;
  /** null = ainda sem ficha. */
  readonly version: number | null;
  readonly initial: readonly { ingredientId: string; quantity: string }[];
  readonly ingredients: readonly Ingredient[];
  readonly maxLines: number;
}) {
  const [state, action] = useServerAction(saveRecipeAction);
  const toRows = () =>
    (initial.length > 0 ? initial : [{ ingredientId: '', quantity: '' }]).map((row, index) => ({
      key: index,
      ...row,
    }));
  const [rows, setRows] = useState<Row[]>(toRows);
  const [nextKey, setNextKey] = useState(initial.length + 1);
  // Chegou uma versão nova do servidor (ex.: depois de "outra pessoa alterou"): as linhas da tela
  // passam a ser as GRAVADAS — senão o segundo clique salvaria as antigas por cima (achado I-2).
  // A mensagem do conflito continua visível (o componente não é recriado).
  const [loadedVersion, setLoadedVersion] = useState(version);
  if (loadedVersion !== version) {
    setLoadedVersion(version);
    setRows(toRows());
    setNextKey(initial.length + 1);
  }
  const baseId = useId();
  const unitOf = (id: string) => ingredients.find((item) => item.id === id)?.unit ?? '';

  const update = (key: number, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };

  return (
    <ActionForm key={version ?? 'nova'} action={action} state={state}>
      <FormMessage state={state} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={targetId} />
      <input type="hidden" name="version" value={version ?? ''} />
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-2 text-base font-semibold">Insumos para UMA unidade vendida</legend>
        {rows.map((row, index) => {
          const selectId = `${baseId}-insumo-${String(row.key)}`;
          const quantityId = `${baseId}-qtd-${String(row.key)}`;
          return (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_7rem] items-end gap-3 rounded-md border-2 border-borda bg-white p-3 sm:grid-cols-[1fr_9rem_auto]"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={selectId} className="font-semibold">
                  Insumo {index + 1}
                </label>
                <select
                  id={selectId}
                  name="ingredientId"
                  value={row.ingredientId}
                  onChange={(event) => {
                    update(row.key, { ingredientId: event.target.value });
                  }}
                  className="min-h-12 w-full min-w-0 rounded-md border-2 border-borda bg-white px-3 text-lg"
                >
                  <option value="">Escolha…</option>
                  {ingredients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={quantityId} className="font-semibold">
                  Quantidade{row.ingredientId ? ` (${unitOf(row.ingredientId)})` : ''}
                </label>
                <input
                  id={quantityId}
                  name="quantity"
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(event) => {
                    update(row.key, { quantity: event.target.value });
                  }}
                  className="min-h-12 w-full rounded-md border-2 border-borda bg-white px-3 text-lg"
                />
              </div>
              <Button
                variant="quiet"
                className="col-span-2 justify-self-start px-0 sm:col-span-1"
                onClick={() => {
                  setRows((current) => current.filter((item) => item.key !== row.key));
                }}
                aria-label={`Remover o insumo ${String(index + 1)}`}
              >
                Remover
              </Button>
            </div>
          );
        })}
      </fieldset>
      {rows.length < maxLines ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setRows((current) => [...current, { key: nextKey, ingredientId: '', quantity: '' }]);
            setNextKey((value) => value + 1);
          }}
        >
          Adicionar insumo
        </Button>
      ) : null}
      <p className="text-sm text-tinta-suave">
        Use vírgula para decimais (0,5). Linha em branco é ignorada; sem nenhuma linha, o item deixa
        de baixar estoque.
      </p>
      <SubmitButton pendingText="Salvando…">Salvar ficha técnica</SubmitButton>
    </ActionForm>
  );
}
