'use client';

import {
  createCompanyAction,
  updateCompanyAction,
} from '@/modules/organizations/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

interface Props {
  readonly values: {
    readonly legalName: string;
    readonly tradeName: string;
    readonly cnpj: string;
  };
  /** Edição: empresa e versão lida. Sem ela: cadastro de empresa nova. */
  readonly company?: { readonly id: string; readonly version: number };
}

/** Razão social, nome fantasia e CNPJ opcional (RN-ORG-02). */
export function CompanyForm({ values, company }: Props) {
  const [state, action] = useServerAction(company ? updateCompanyAction : createCompanyAction);
  const errors = state?.fieldErrors;

  return (
    <ActionForm key={company?.version} action={action} state={state} resetOnSuccess={!company}>
      <FormMessage state={state} />
      {company ? (
        <>
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="version" value={company.version} />
        </>
      ) : null}
      <TextField
        label="Nome fantasia"
        name="tradeName"
        defaultValue={values.tradeName}
        hint="O nome que o cliente conhece."
        required
        errors={errors?.tradeName}
      />
      <TextField
        label="Razão social"
        name="legalName"
        defaultValue={values.legalName}
        required
        errors={errors?.legalName}
      />
      <TextField
        label="CNPJ (opcional)"
        name="cnpj"
        inputMode="numeric"
        defaultValue={values.cnpj}
        hint="Com ou sem pontuação. Ex.: 11.222.333/0001-81"
        errors={errors?.cnpj}
      />
      <SubmitButton pendingText="Salvando…" variant={company ? 'primary' : 'secondary'}>
        {company ? 'Salvar empresa' : 'Cadastrar empresa'}
      </SubmitButton>
    </ActionForm>
  );
}
