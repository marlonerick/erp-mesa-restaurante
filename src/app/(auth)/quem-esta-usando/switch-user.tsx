'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { DeviceUser } from '@/modules/auth';
import { switchUserAction } from '@/modules/auth/interface/actions';
import { cn } from '@/ui/cn';
import { FormMessage } from '@/ui/form-message';

const PIN_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/**
 * Troca rápida (RN-AUTH-11): toque no próprio nome e digite o PIN. O PIN é enviado sozinho ao
 * completar 6 dígitos — um toque a menos para quem está com a bandeja na mão.
 */
export function SwitchUser({ users }: { readonly users: readonly DeviceUser[] }) {
  const [selected, setSelected] = useState<DeviceUser | null>(null);
  const [pin, setPin] = useState('');
  const [state, action, pending] = useActionState(switchUserAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Ao enviar, os dígitos já estão no formulário; limpar deixa o teclado pronto se o PIN errar
  const submit = (formData: FormData) => {
    setPin('');
    action(formData);
  };

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !pending) formRef.current?.requestSubmit();
  }, [pin, pending]);

  // Teclado físico também funciona (computador ou tablet com teclado)
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) setPin((current) => (current + event.key).slice(0, PIN_LENGTH));
      if (event.key === 'Backspace') setPin((current) => current.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [selected]);

  if (!selected) {
    return (
      <div className="flex flex-col gap-6">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Pessoas deste aparelho">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                disabled={user.pinLocked}
                onClick={() => {
                  setSelected(user);
                  setPin('');
                }}
                className={cn(
                  'azulejo-tile flex w-full flex-col items-center gap-2 rounded-md bg-white p-4 text-center',
                  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-azulejo',
                  'enabled:hover:bg-azulejo-claro disabled:opacity-60',
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-14 place-items-center rounded-md bg-azulejo text-xl font-bold text-white"
                >
                  {initials(user.name)}
                </span>
                <span className="font-semibold">{user.name}</span>
                {user.pinLocked ? (
                  <span className="text-sm text-alerta">PIN bloqueado — entre com a senha</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <Link
          href="/login"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Entrar com senha
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-5">
      <input type="hidden" name="userId" value={selected.id} />
      <input type="hidden" name="pin" value={pin} />
      <p className="text-xl">
        <span className="font-bold">{selected.name}</span>, digite seu PIN
      </p>
      <FormMessage state={state} />
      <div
        className="flex justify-center gap-3"
        aria-label={`${String(pin.length)} de 6 dígitos`}
        role="img"
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            className={cn(
              'size-4 rounded-full border-2 border-azulejo',
              index < pin.length && 'bg-azulejo',
            )}
          />
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <PinKey
            key={key}
            label={key}
            disabled={pending}
            onPress={() => {
              setPin((p) => (p + key).slice(0, PIN_LENGTH));
            }}
          />
        ))}
        <PinKey
          label="Apagar"
          small
          disabled={pending || pin.length === 0}
          onPress={() => {
            setPin((p) => p.slice(0, -1));
          }}
        />
        <PinKey
          label="0"
          disabled={pending}
          onPress={() => {
            setPin((p) => (p + '0').slice(0, PIN_LENGTH));
          }}
        />
        <PinKey
          label="Voltar"
          small
          disabled={pending}
          onPress={() => {
            setSelected(null);
            setPin('');
          }}
        />
      </div>
      {pending ? (
        <p role="status" className="text-center text-tinta-suave">
          Conferindo o PIN…
        </p>
      ) : null}
    </form>
  );
}

function PinKey({
  label,
  onPress,
  disabled,
  small = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly small?: boolean;
}) {
  // Elemento próprio (não o <Button>): as classes base do botão anulariam o tamanho e a cor
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className={cn(
        'azulejo-tile grid aspect-square place-items-center rounded-md bg-azulejo-claro font-bold text-tinta',
        'hover:bg-white active:bg-azulejo active:text-white disabled:opacity-60',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-azulejo',
        small ? 'text-base' : 'text-4xl',
      )}
    >
      {label}
    </button>
  );
}
