import { type InputHTMLAttributes, useId } from 'react';
import { cn } from './cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly name: string;
  readonly hint?: string;
  readonly errors?: readonly string[] | undefined;
}

/** Campo com rótulo sempre visível, dica e erro ligados ao campo (leitores de tela). */
export function TextField({ label, name, hint, errors, className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = errors?.length ? `${id}-erro` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={cn(
          'min-h-12 rounded-md border-2 border-borda bg-white px-3 text-lg text-tinta',
          'focus:border-azulejo focus:outline-3 focus:outline-azulejo-claro',
          errors !== undefined && errors.length > 0 && 'border-alerta',
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-tinta-suave">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={errorId} className="text-sm font-semibold text-alerta">
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

export interface CheckboxFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
}

export function CheckboxField({ label, hint, className, ...props }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-6 shrink-0 accent-azulejo"
        aria-describedby={hint ? `${id}-dica` : undefined}
        {...props}
      />
      <div>
        <label htmlFor={id} className="text-base font-semibold">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-dica`} className="text-sm text-tinta-suave">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
