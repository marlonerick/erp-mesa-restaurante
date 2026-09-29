'use client';

import { useActionState, useState } from 'react';
import {
  bindTerminalAction,
  createTerminalAction,
  setTerminalActiveAction,
  unbindTerminalAction,
  updateTerminalAction,
} from '@/modules/organizations/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { SelectField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';

export const KIND_LABELS = {
  CAIXA: 'Caixa (computador ou tablet do caixa)',
  KDS: 'Cozinha (tela de pedidos)',
  MOVEL: 'Salão (celular ou tablet do garçom)',
} as const;

type Kind = keyof typeof KIND_LABELS;

const kindOptions = (Object.keys(KIND_LABELS) as Kind[]).map((kind) => ({
  value: kind,
  label: KIND_LABELS[kind],
}));

interface TerminalValues {
  readonly code: string;
  readonly name: string;
  readonly kind: Kind;
}

/** Cadastro e edição de terminal (RN-ORG-08). */
export function TerminalForm({
  values,
  terminal,
}: {
  readonly values: TerminalValues;
  readonly terminal?: { readonly id: string; readonly version: number };
}) {
  const [state, action] = useActionState(
    terminal ? updateTerminalAction : createTerminalAction,
    null,
  );
  const errors = state?.fieldErrors;
  return (
    <ActionForm key={terminal?.version} action={action} state={state} resetOnSuccess={!terminal}>
      <FormMessage state={state} />
      {terminal ? (
        <>
          <input type="hidden" name="terminalId" value={terminal.id} />
          <input type="hidden" name="version" value={terminal.version} />
        </>
      ) : null}
      <TextField
        label="Código"
        name="code"
        defaultValue={values.code}
        autoCapitalize="characters"
        spellCheck={false}
        hint="Curto, único na loja. Ex.: CX1"
        required
        errors={errors?.code}
      />
      <TextField
        label="Nome"
        name="name"
        defaultValue={values.name}
        hint="Como aparece para a equipe. Ex.: Caixa 1"
        required
        errors={errors?.name}
      />
      <SelectField
        label="Tipo"
        name="kind"
        defaultValue={values.kind}
        options={kindOptions}
        errors={errors?.kind}
      />
      <SubmitButton pendingText="Salvando…" variant={terminal ? 'primary' : 'secondary'}>
        {terminal ? 'Salvar terminal' : 'Cadastrar terminal'}
      </SubmitButton>
    </ActionForm>
  );
}

/** Vincular ESTE aparelho ao terminal, ou desfazer o vínculo (RN-ORG-09). */
export function DeviceBinding({
  terminal,
}: {
  readonly terminal: {
    readonly id: string;
    readonly name: string;
    readonly active: boolean;
    readonly isThisDevice: boolean;
    readonly hasDevice: boolean;
  };
}) {
  const [bindState, bind] = useActionState(bindTerminalAction, null);
  const [unbindState, unbind] = useActionState(unbindTerminalAction, null);
  // Depois de vincular, o botão some (o aparelho já é este terminal): a mensagem fica FORA dos
  // formulários e mostra o resultado da última ação
  const [last, setLast] = useState<'bind' | 'unbind' | null>(null);
  const message = last === 'bind' ? bindState : last === 'unbind' ? unbindState : null;

  return (
    <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
      <h2 className="text-2xl font-bold">Aparelho</h2>
      <FormMessage state={message} />
      <p>
        {terminal.isThisDevice
          ? `Este aparelho é o terminal ${terminal.name}.`
          : terminal.hasDevice
            ? 'Outro aparelho está vinculado a este terminal.'
            : 'Nenhum aparelho vinculado.'}
      </p>
      {terminal.active && !terminal.isThisDevice ? (
        <ActionForm
          action={bind}
          state={bindState}
          onSubmit={() => {
            setLast('bind');
          }}
        >
          <input type="hidden" name="terminalId" value={terminal.id} />
          <p className="text-tinta-suave">
            Faça isto no próprio aparelho do terminal.
            {terminal.hasDevice ? ' O aparelho anterior deixa de ser este terminal.' : ''} Se este
            aparelho já era outro terminal, aquele vínculo é desfeito.
          </p>
          <SubmitButton pendingText="Vinculando…">
            Usar este aparelho como {terminal.name}
          </SubmitButton>
        </ActionForm>
      ) : null}
      {terminal.hasDevice ? (
        <ActionForm
          action={unbind}
          state={unbindState}
          onSubmit={() => {
            setLast('unbind');
          }}
        >
          <input type="hidden" name="terminalId" value={terminal.id} />
          <SubmitButton pendingText="Desvinculando…" variant="secondary">
            Desvincular aparelho
          </SubmitButton>
        </ActionForm>
      ) : null}
    </section>
  );
}

/** Desativar (desfaz o vínculo com o aparelho) ou reativar o terminal. */
export function TerminalStatus({
  terminal,
}: {
  readonly terminal: { readonly id: string; readonly version: number; readonly active: boolean };
}) {
  const [state, action] = useActionState(setTerminalActiveAction, null);
  return (
    <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
      <h2 className="text-2xl font-bold">
        {terminal.active ? 'Desativar terminal' : 'Reativar terminal'}
      </h2>
      <p className="text-tinta-suave">
        {terminal.active
          ? 'O aparelho deixa de ser este terminal. O histórico continua guardado.'
          : 'O terminal volta a poder receber um aparelho.'}
      </p>
      <ActionForm key={terminal.version} action={action} state={state}>
        <FormMessage state={state} />
        <input type="hidden" name="terminalId" value={terminal.id} />
        <input type="hidden" name="version" value={terminal.version} />
        <input type="hidden" name="active" value={terminal.active ? 'false' : 'true'} />
        <SubmitButton pendingText="Salvando…" variant={terminal.active ? 'danger' : 'secondary'}>
          {terminal.active ? 'Desativar terminal' : 'Reativar terminal'}
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
