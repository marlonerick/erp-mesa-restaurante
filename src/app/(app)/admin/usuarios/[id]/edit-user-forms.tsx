'use client';

import { useActionState } from 'react';
import {
  disableUserAction,
  renameUserAction,
  resetPasswordAction,
  setUserRolesAction,
} from '@/modules/users/interface/actions';
import { PASSWORD_MAX_LENGTH } from '@/shared/kernel/credentials';
import { CheckboxField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { RoleCheckboxes } from '../role-checkboxes';

interface Props {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly status: 'ATIVO' | 'DESATIVADO';
    readonly storeRoles: readonly string[];
  };
  readonly can: { readonly update: boolean; readonly disable: boolean };
  readonly storeId: string;
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function EditUserForms({ user, can, storeId }: Props) {
  const [renameState, rename] = useActionState(renameUserAction, null);
  const [rolesState, setRoles] = useActionState(setUserRolesAction, null);
  const [resetState, reset] = useActionState(resetPasswordAction, null);
  const [disableState, disable] = useActionState(disableUserAction, null);
  const active = user.status === 'ATIVO';

  if (!can.update && !can.disable) {
    return <p>Seu perfil só permite ver este usuário.</p>;
  }

  return (
    <>
      {can.update ? (
        <>
          <Section title="Nome">
            <form action={rename} className="flex flex-col gap-4" noValidate>
              <input type="hidden" name="userId" value={user.id} />
              <FormMessage state={renameState} />
              <TextField
                label="Nome"
                name="name"
                defaultValue={user.name}
                required
                errors={renameState?.fieldErrors?.name}
              />
              <SubmitButton pendingText="Salvando…" variant="secondary">
                Salvar nome
              </SubmitButton>
            </form>
          </Section>

          <Section title="Perfis">
            <form action={setRoles} className="flex flex-col gap-4" noValidate>
              <input type="hidden" name="userId" value={user.id} />
              <FormMessage state={rolesState} />
              <RoleCheckboxes
                storeId={storeId}
                selected={user.storeRoles}
                errors={rolesState?.fieldErrors?.roleCodes}
              />
              <SubmitButton pendingText="Salvando…" variant="secondary">
                Salvar perfis
              </SubmitButton>
            </form>
          </Section>

          <Section title="Senha provisória">
            <p className="text-tinta-suave">
              Use quando a pessoa esquecer a senha. Ela sai de todos os aparelhos e troca a senha no
              próximo acesso. O PIN é destravado.
            </p>
            <form action={reset} className="flex flex-col gap-4" noValidate>
              <input type="hidden" name="userId" value={user.id} />
              <FormMessage state={resetState} />
              <TextField
                label="Nova senha provisória"
                name="temporaryPassword"
                autoComplete="off"
                maxLength={PASSWORD_MAX_LENGTH}
                required
                errors={resetState?.fieldErrors?.temporaryPassword}
              />
              <SubmitButton pendingText="Salvando…" variant="secondary">
                Definir senha provisória
              </SubmitButton>
            </form>
          </Section>
        </>
      ) : null}

      {can.disable && active ? (
        <Section title="Desativar">
          <p className="text-tinta-suave">
            A pessoa não consegue mais entrar e sai de todos os aparelhos. O histórico dela continua
            guardado.
          </p>
          <form action={disable} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={user.id} />
            <FormMessage state={disableState} />
            <CheckboxField
              name="confirm"
              required
              label={`Confirmo que ${user.name} não poderá mais entrar`}
            />
            <SubmitButton pendingText="Desativando…" variant="danger">
              Desativar usuário
            </SubmitButton>
          </form>
        </Section>
      ) : null}
    </>
  );
}
