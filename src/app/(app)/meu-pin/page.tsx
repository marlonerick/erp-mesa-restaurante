import type { Metadata } from 'next';
import { PinForm } from './pin-form';

export const metadata: Metadata = { title: 'Meu PIN' };

export default function MyPinPage() {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Meu PIN</h1>
        <p className="text-tinta-suave">
          Com o PIN você troca de usuário no aparelho compartilhado em segundos. Gerentes também
          usam o PIN para autorizar ações no aparelho de outra pessoa.
        </p>
      </div>
      <PinForm />
    </div>
  );
}
