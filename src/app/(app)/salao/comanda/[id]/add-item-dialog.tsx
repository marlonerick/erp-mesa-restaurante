'use client';

import { useEffect, useMemo, useState } from 'react';
import { addItemAction } from '@/modules/orders/interface/actions';
import type { MenuItemView } from '@/modules/orders/web';
import { ActionForm } from '@/ui/action-form';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Dialog, DialogContent, DialogTrigger } from '@/ui/dialog';
import { TextAreaField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { formatBRL } from '@/ui/money';
import { SubmitButton } from '@/ui/submit-button';
import { useRefreshAfter } from '../../live';
import { useServerAction } from '@/ui/use-server-action';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Lançar item (RN-ORD-05, RN-ORD-06): escolhe o produto (busca ou categoria), a quantidade, os
 * adicionais e a observação. A janela continua aberta para lançar o próximo.
 */
export function AddItemDialog({
  orderId,
  storeId,
  menu,
  notesMax,
  quantityMax,
}: {
  readonly orderId: string;
  readonly storeId: string;
  readonly menu: readonly MenuItemView[];
  readonly notesMax: number;
  readonly quantityMax: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<MenuItemView | null>(null);
  /** Confirmação do último lançamento, mostrada de volta na lista. */
  const [notice, setNotice] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, { name: string; items: MenuItemView[] }>();
    const wanted = normalize(search.trim());
    for (const item of menu) {
      if (wanted !== '' && !normalize(item.name).includes(wanted)) continue;
      const entry = map.get(item.categoryId) ?? { name: item.categoryName, items: [] };
      entry.items.push(item);
      map.set(item.categoryId, entry);
    }
    return [...map.values()];
  }, [menu, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setChosen(null);
          setSearch('');
          setNotice(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">Adicionar item</Button>
      </DialogTrigger>
      <DialogContent
        title={chosen ? chosen.name : 'Adicionar item'}
        description={
          chosen ? formatBRL(chosen.priceCents) : 'Busque pelo nome ou escolha na lista.'
        }
      >
        {chosen ? (
          <ItemForm
            key={chosen.productId}
            product={chosen}
            orderId={orderId}
            storeId={storeId}
            notesMax={notesMax}
            quantityMax={quantityMax}
            onBack={() => {
              setChosen(null);
            }}
            onAdded={(message) => {
              setNotice(message);
              setChosen(null);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {notice ? <FormMessage state={{ success: notice }} /> : null}
            <TextField
              label="Buscar produto"
              name="busca"
              type="search"
              autoComplete="off"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
            {categories.length === 0 ? (
              <p>Nenhum produto encontrado.</p>
            ) : (
              categories.map((category) => (
                <section key={category.name} aria-label={category.name}>
                  <h3 className="text-lg font-bold">{category.name}</h3>
                  <ul className="mt-1 flex flex-col border-t border-borda">
                    {category.items.map((item) => (
                      <li key={item.productId} className="border-b border-borda">
                        <button
                          type="button"
                          onClick={() => {
                            setChosen(item);
                          }}
                          className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-2 text-left hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
                        >
                          <span className="font-semibold">{item.name}</span>
                          <span className="shrink-0 text-tinta-suave">
                            {formatBRL(item.priceCents)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  product,
  orderId,
  storeId,
  notesMax,
  quantityMax,
  onBack,
  onAdded,
}: {
  readonly product: MenuItemView;
  readonly orderId: string;
  readonly storeId: string;
  readonly notesMax: number;
  readonly quantityMax: number;
  readonly onBack: () => void;
  readonly onAdded: (message: string) => void;
}) {
  const [state, action] = useServerAction(addItemAction);
  const [quantity, setQuantity] = useState(1);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  useRefreshAfter(state);

  // Lançou: volta para a lista, pronto para o próximo item
  const success = state?.success;
  const submittedAt = state?.submittedAt;
  useEffect(() => {
    if (success && submittedAt) onAdded(success);
    // Só quando chega uma resposta nova (onAdded muda a cada desenho da janela)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedAt]);

  const extras = product.groups
    .flatMap((group) => group.options)
    .filter((option) => picked.has(option.id))
    .reduce((sum, option) => sum + option.priceDeltaCents, 0);

  const toggle = (groupId: string, optionId: string, single: boolean) => {
    setPicked((current) => {
      const next = new Set(current);
      const group = product.groups.find((item) => item.id === groupId);
      if (single && next.has(optionId) && group?.minSelect === 0) {
        // Grupo opcional de uma escolha: tocar de novo desmarca (sugestão S-4)
        next.delete(optionId);
      } else if (single) {
        for (const option of group?.options ?? []) next.delete(option.id);
        next.add(optionId);
      } else if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
  };

  return (
    <ActionForm action={action} state={state}>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="productId" value={product.productId} />
      <input type="hidden" name="quantity" value={quantity} />
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="modifierId" value={id} />
      ))}

      <div className="flex flex-col gap-1.5">
        <span className="text-base font-semibold" id="quantidade-rotulo">
          Quantidade
        </span>
        <div className="flex items-center gap-3" role="group" aria-labelledby="quantidade-rotulo">
          <Button
            variant="secondary"
            aria-label="Diminuir quantidade"
            disabled={quantity <= 1}
            onClick={() => {
              setQuantity((value) => Math.max(1, value - 1));
            }}
          >
            −
          </Button>
          <output aria-live="polite" className="min-w-10 text-center text-2xl font-bold">
            {quantity}
          </output>
          <Button
            variant="secondary"
            aria-label="Aumentar quantidade"
            disabled={quantity >= quantityMax}
            onClick={() => {
              setQuantity((value) => Math.min(quantityMax, value + 1));
            }}
          >
            +
          </Button>
        </div>
      </div>

      {product.groups.map((group) => {
        const single = group.maxSelect === 1;
        const rule =
          group.minSelect === 0
            ? `até ${String(group.maxSelect)}`
            : group.minSelect === group.maxSelect
              ? `escolha ${String(group.minSelect)}`
              : `de ${String(group.minSelect)} a ${String(group.maxSelect)}`;
        return (
          <fieldset key={group.id} className="flex flex-col gap-2">
            <legend className="text-base font-semibold">
              {group.name} <span className="font-normal text-tinta-suave">({rule})</span>
            </legend>
            {group.options.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-md border-2 px-3',
                  picked.has(option.id) ? 'border-azulejo bg-azulejo-claro' : 'border-borda',
                )}
              >
                <input
                  // Opcional de uma escolha vira caixa de marcar: dá para desmarcar tocando de novo
                  type={single && group.minSelect > 0 ? 'radio' : 'checkbox'}
                  name={`grupo-${group.id}`}
                  className="size-6 accent-azulejo"
                  checked={picked.has(option.id)}
                  onChange={() => {
                    toggle(group.id, option.id, single);
                  }}
                />
                <span className="flex-1">{option.name}</span>
                {option.priceDeltaCents > 0 ? (
                  <span className="text-tinta-suave">+ {formatBRL(option.priceDeltaCents)}</span>
                ) : null}
              </label>
            ))}
          </fieldset>
        );
      })}

      <TextAreaField
        label="Observação (opcional)"
        name="notes"
        maxLength={notesMax}
        rows={2}
        hint='Ex.: "sem cebola", "ponto da carne bem passado"'
      />

      <p className="text-lg font-semibold">
        Total do item: {formatBRL((product.priceCents + extras) * quantity)}
      </p>
      <FormMessage state={state?.error ? state : null} />
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <SubmitButton pendingText="Lançando…">Lançar na conta</SubmitButton>
        <Button variant="quiet" onClick={onBack}>
          Voltar para a lista
        </Button>
      </div>
    </ActionForm>
  );
}
