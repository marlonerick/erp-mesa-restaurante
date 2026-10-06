'use client';

import {
  createProductAction,
  removeFromStoreAction,
  setProductStatusAction,
  setStorePriceAction,
  updateProductAction,
} from '@/modules/catalog/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

export interface ProductFormValues {
  readonly name: string;
  readonly categoryId: string;
  readonly sku: string;
  readonly description: string;
  readonly requiresPreparation: boolean;
  readonly modifierGroupIds: readonly string[];
}

interface Option {
  readonly id: string;
  readonly name: string;
}

interface Props {
  readonly values: ProductFormValues;
  /** Categorias que podem ser escolhidas (ativas + a atual). */
  readonly categories: readonly Option[];
  /** Grupos de adicionais que podem ser marcados (ativos + os já ligados). */
  readonly groups: readonly (Option & { readonly limits: string })[];
  /** Edição: produto e versão lida (bloqueio otimista). */
  readonly product?: { readonly id: string; readonly version: number };
  /** Cadastro: loja da tela (o preço entra nela) e se a pessoa pode definir preço. */
  readonly store?: { readonly id: string; readonly name: string; readonly canSetPrice: boolean };
  readonly descriptionMax: number;
}

/** Cadastro e edição do produto (RN-CAT-04, RN-CAT-06). */
export function ProductForm({ values, categories, groups, product, store, descriptionMax }: Props) {
  const [state, action] = useServerAction(product ? updateProductAction : createProductAction);
  const errors = state?.fieldErrors;
  return (
    <ActionForm key={product?.version} action={action} state={state}>
      <FormMessage state={state} />
      {product ? (
        <>
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="version" value={product.version} />
        </>
      ) : null}
      {store ? <input type="hidden" name="expectedStoreId" value={store.id} /> : null}
      <TextField
        label="Nome"
        name="name"
        defaultValue={values.name}
        hint="Como aparece na comanda. Ex.: X-Burger"
        required
        errors={errors?.name}
      />
      <SelectField
        label="Categoria"
        name="categoryId"
        defaultValue={values.categoryId}
        options={[
          { value: '', label: 'Escolha…' },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
        errors={errors?.categoryId}
      />
      {store?.canSetPrice ? (
        <TextField
          label={`Preço na loja ${store.name} (R$)`}
          name="priceHere"
          inputMode="decimal"
          defaultValue=""
          hint="Ex.: 32,50. Em branco: o produto ainda não é vendido nesta loja."
          errors={errors?.priceHere}
        />
      ) : store ? (
        <input type="hidden" name="priceHere" value="" />
      ) : null}
      <TextField
        label="Código (opcional)"
        name="sku"
        defaultValue={values.sku}
        autoCapitalize="characters"
        spellCheck={false}
        hint="Ex.: XB-01. Único na empresa."
        errors={errors?.sku}
      />
      <TextAreaField
        label="Descrição (opcional)"
        name="description"
        defaultValue={values.description}
        maxLength={descriptionMax}
        hint={`Até ${String(descriptionMax)} caracteres. Ex.: pão, carne 180 g e queijo.`}
        errors={errors?.description}
      />
      <CheckboxField
        label="Vai para a cozinha"
        name="requiresPreparation"
        defaultChecked={values.requiresPreparation}
        hint="Desmarque para bebidas e itens prontos: não aparecem na tela da cozinha."
      />
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-2 text-base font-semibold">Adicionais deste produto</legend>
        {groups.length === 0 ? (
          <p className="text-tinta-suave">Nenhum grupo de adicionais cadastrado.</p>
        ) : (
          groups.map((group) => (
            <CheckboxField
              key={group.id}
              label={group.name}
              hint={group.limits}
              name="modifierGroupIds"
              value={group.id}
              defaultChecked={values.modifierGroupIds.includes(group.id)}
            />
          ))
        )}
      </fieldset>
      <SubmitButton pendingText="Salvando…">
        {product ? 'Salvar produto' : 'Cadastrar produto'}
      </SubmitButton>
    </ActionForm>
  );
}

export interface StorePriceValues {
  readonly productId: string;
  readonly storeId: string;
  readonly storeName: string;
  /** null = não vende nesta loja. */
  readonly price: {
    readonly text: string;
    readonly version: number;
    readonly available: boolean;
  } | null;
}

/** Preço numa loja (RN-CAT-07): definir/alterar e "parar de vender nesta loja". */
export function StorePriceForm({ values }: { readonly values: StorePriceValues }) {
  const [state, action] = useServerAction(setStorePriceAction);
  const [removeState, remove] = useServerAction(removeFromStoreAction);
  const { price } = values;
  return (
    <div className="flex flex-col gap-3 border-b border-borda py-5">
      <h3 className="text-xl font-bold">{values.storeName}</h3>
      <p className="text-tinta-suave">
        {price === null
          ? 'Não é vendido nesta loja.'
          : price.available
            ? 'À venda.'
            : 'À venda, mas marcado como esgotado hoje.'}
      </p>
      <ActionForm key={price?.version ?? 'novo'} action={action} state={state}>
        <FormMessage state={state} />
        <input type="hidden" name="productId" value={values.productId} />
        <input type="hidden" name="storeId" value={values.storeId} />
        <input type="hidden" name="version" value={price?.version ?? ''} />
        <TextField
          label={`Preço na loja ${values.storeName} (R$)`}
          name="price"
          inputMode="decimal"
          defaultValue={price?.text ?? ''}
          hint="Ex.: 32,50"
          required
          errors={state?.fieldErrors?.price}
        />
        <SubmitButton pendingText="Salvando…" variant={price ? 'primary' : 'secondary'}>
          {price ? 'Salvar preço' : 'Vender nesta loja'}
        </SubmitButton>
      </ActionForm>
      {price ? (
        <ActionForm key={`remover-${String(price.version)}`} action={remove} state={removeState}>
          <FormMessage state={removeState} />
          <input type="hidden" name="productId" value={values.productId} />
          <input type="hidden" name="storeId" value={values.storeId} />
          <input type="hidden" name="version" value={price.version} />
          <SubmitButton pendingText="Salvando…" variant="quiet" className="self-start px-0">
            Parar de vender nesta loja
          </SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}

/** Desativar (sai do cardápio de todas as lojas) ou reativar (RN-CAT-05). */
export function ProductStatus({
  product,
}: {
  readonly product: { readonly id: string; readonly version: number; readonly active: boolean };
}) {
  const [state, action] = useServerAction(setProductStatusAction);
  return (
    <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
      <h2 className="text-2xl font-bold">
        {product.active ? 'Desativar produto' : 'Reativar produto'}
      </h2>
      <p className="text-tinta-suave">
        {product.active
          ? 'Sai do cardápio de todas as lojas. Preços e adicionais ficam guardados; nada é apagado.'
          : 'Volta ao cardápio das lojas em que tem preço.'}
      </p>
      <ActionForm key={product.version} action={action} state={state}>
        <FormMessage state={state} />
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="version" value={product.version} />
        <input type="hidden" name="active" value={product.active ? 'false' : 'true'} />
        <SubmitButton pendingText="Salvando…" variant={product.active ? 'danger' : 'secondary'}>
          {product.active ? 'Desativar produto' : 'Reativar produto'}
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
