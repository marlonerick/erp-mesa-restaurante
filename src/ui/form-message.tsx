import type { FormState } from '@/shared/errors/form-state';

/** Resultado de um formulário: erro explica o que houve; sucesso confirma o que mudou. */
export function FormMessage({ state }: { readonly state: FormState | null }) {
  if (state?.error) {
    return (
      <p
        role="alert"
        className="rounded-md border-l-4 border-alerta bg-alerta-claro px-4 py-3 font-semibold text-alerta"
      >
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return (
      <p
        role="status"
        className="rounded-md border-l-4 border-confirma bg-confirma-claro px-4 py-3 font-semibold text-confirma"
      >
        {state.success}
      </p>
    );
  }
  return null;
}
