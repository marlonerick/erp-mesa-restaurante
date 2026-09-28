import { CheckboxField } from '@/ui/field';
import { ROLE_OPTIONS } from './roles';

export function RoleCheckboxes({
  selected = [],
  errors,
}: {
  readonly selected?: readonly string[];
  readonly errors?: readonly string[] | undefined;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-base font-semibold">Perfis nesta loja</legend>
      {ROLE_OPTIONS.map(([code, label]) => (
        <CheckboxField
          key={code}
          name="roleCodes"
          value={code}
          label={label}
          defaultChecked={selected.includes(code)}
        />
      ))}
      {errors?.length ? (
        <p className="text-sm font-semibold text-alerta">{errors.join(' ')}</p>
      ) : null}
    </fieldset>
  );
}
