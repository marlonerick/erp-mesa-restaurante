'use client';

import { useActionState, useId } from 'react';
import { createStoreAction, updateStoreAction } from '@/modules/organizations/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { SelectField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';

export interface StoreFormValues {
  readonly name: string;
  readonly code: string;
  readonly timezone: string;
  readonly operationalDayCutoff: string;
  /** Texto da tela, ex.: "12,5". */
  readonly serviceFee: string;
  readonly negativeStockPolicy: 'PERMITIR_COM_ALERTA' | 'BLOQUEAR';
  readonly maxOpenCashSessions: number;
  readonly kdsWarningMinutes: number;
  readonly kdsLateMinutes: number;
}

interface Props {
  readonly values: StoreFormValues;
  readonly timezones: readonly { readonly id: string; readonly label: string }[];
  readonly maxOpenCashLimit: number;
  readonly maxKdsAlertMinutes: number;
  /** Edição: loja e versão lida (bloqueio otimista). Cadastro: empresas disponíveis. */
  readonly store?: { readonly id: string; readonly version: number };
  readonly companies?: readonly { readonly id: string; readonly name: string }[];
}

const POLICIES = [
  {
    value: 'PERMITIR_COM_ALERTA',
    title: 'Permitir com alerta',
    description: 'A venda continua mesmo sem saldo; o sistema avisa para conferir o estoque.',
  },
  {
    value: 'BLOQUEAR',
    title: 'Bloquear',
    description: 'O pedido é recusado quando falta insumo no estoque.',
  },
] as const;

/** Cadastro e edição de loja com as configurações (RN-ORG-03, RN-ORG-04). */
export function StoreForm({
  values,
  timezones,
  maxOpenCashLimit,
  maxKdsAlertMinutes,
  store,
  companies,
}: Props) {
  const [state, action] = useActionState(store ? updateStoreAction : createStoreAction, null);
  const errors = state?.fieldErrors;
  const policyId = useId();

  return (
    <ActionForm
      // Nova versão salva: o formulário renasce com os valores gravados
      key={store?.version}
      action={action}
      state={state}
      resetOnSuccess={!store}
    >
      <FormMessage state={state} />
      {store ? (
        <>
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="version" value={store.version} />
        </>
      ) : companies && companies.length > 1 ? (
        <SelectField
          label="Empresa"
          name="companyId"
          options={companies.map((item) => ({ value: item.id, label: item.name }))}
        />
      ) : (
        <input type="hidden" name="companyId" value={companies?.[0]?.id ?? ''} />
      )}

      <TextField
        label="Nome"
        name="name"
        defaultValue={values.name}
        required
        errors={errors?.name}
      />
      <TextField
        label="Código"
        name="code"
        defaultValue={values.code}
        autoCapitalize="characters"
        spellCheck={false}
        hint="Curto e sem espaços. Ex.: CENTRO"
        required
        errors={errors?.code}
      />

      <fieldset className="flex min-w-0 flex-col gap-5 border-t-2 border-borda pt-5">
        <legend className="pr-2 text-xl font-bold">Configurações</legend>
        <SelectField
          label="Fuso horário"
          name="timezone"
          defaultValue={values.timezone}
          options={timezones.map((zone) => ({ value: zone.id, label: zone.label }))}
          errors={errors?.timezone}
        />
        <TextField
          label="Virada do dia de trabalho"
          name="operationalDayCutoff"
          type="time"
          step={60}
          defaultValue={values.operationalDayCutoff}
          hint="Vendas depois da meia-noite e antes deste horário contam no dia anterior."
          required
          errors={errors?.operationalDayCutoff}
        />
        <TextField
          label="Taxa de serviço (%)"
          name="serviceFee"
          inputMode="decimal"
          defaultValue={values.serviceFee}
          hint="De 0 a 100, com até 2 casas decimais. Ex.: 10 ou 12,5"
          required
          errors={errors?.serviceFee}
        />
        <TextField
          label="Caixas abertos ao mesmo tempo"
          name="maxOpenCashSessions"
          type="number"
          inputMode="numeric"
          min={1}
          max={maxOpenCashLimit}
          defaultValue={values.maxOpenCashSessions}
          hint={`De 1 a ${String(maxOpenCashLimit)}. Vale quando o caixa for usado (próximas etapas).`}
          required
          errors={errors?.maxOpenCashSessions}
        />
        <TextField
          label="Cozinha: “Atenção” (amarelo) aos minutos"
          name="kdsWarningMinutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={maxKdsAlertMinutes}
          defaultValue={values.kdsWarningMinutes}
          hint="Tempo desde o envio do pedido até o cartão ficar amarelo na tela da cozinha."
          required
          errors={errors?.kdsWarningMinutes}
        />
        <TextField
          label="Cozinha: “Atrasado” (vermelho) aos minutos"
          name="kdsLateMinutes"
          type="number"
          inputMode="numeric"
          min={2}
          max={maxKdsAlertMinutes}
          defaultValue={values.kdsLateMinutes}
          hint={`Maior que o amarelo, até ${String(maxKdsAlertMinutes)} minutos.`}
          required
          errors={errors?.kdsLateMinutes}
        />

        <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={`${policyId}-dica`}>
          <legend className="text-base font-semibold">Quando faltar estoque</legend>
          <p id={`${policyId}-dica`} className="text-sm text-tinta-suave">
            Vale quando o estoque for usado (próximas etapas).
          </p>
          {POLICIES.map((policy) => (
            <label
              key={policy.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border-2 border-borda bg-white p-3 has-checked:border-azulejo has-checked:bg-azulejo-claro"
            >
              <input
                type="radio"
                name="negativeStockPolicy"
                value={policy.value}
                defaultChecked={values.negativeStockPolicy === policy.value}
                className="mt-1 size-5 shrink-0 accent-azulejo"
              />
              <span className="flex flex-col">
                <span className="font-semibold">{policy.title}</span>
                <span className="text-sm text-tinta-suave">{policy.description}</span>
              </span>
            </label>
          ))}
          {errors?.negativeStockPolicy ? (
            <p className="text-sm font-semibold text-alerta">
              {errors.negativeStockPolicy.join(' ')}
            </p>
          ) : null}
        </fieldset>
      </fieldset>

      <SubmitButton pendingText="Salvando…">
        {store ? 'Salvar loja' : 'Cadastrar loja'}
      </SubmitButton>
    </ActionForm>
  );
}
