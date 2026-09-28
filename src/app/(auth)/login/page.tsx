import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/modules/auth/web';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage() {
  if (await currentSession()) {
    redirect('/inicio');
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Entrar</h1>
        <p className="text-tinta-suave">
          Use o usuário e a senha que o gerente cadastrou para você.
        </p>
      </div>
      <LoginForm />
      <Link
        href="/quem-esta-usando"
        className="inline-flex min-h-12 items-center font-semibold text-azulejo underline-offset-4 hover:underline"
      >
        Trocar de usuário com PIN
      </Link>
    </div>
  );
}
