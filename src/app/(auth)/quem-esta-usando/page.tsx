import type { Metadata } from 'next';
import Link from 'next/link';
import { currentDeviceUsers } from '@/modules/auth/web';
import { SwitchUser } from './switch-user';

export const metadata: Metadata = { title: 'Quem está usando?' };

export default async function WhoIsUsingPage() {
  const users = await currentDeviceUsers();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Quem está usando?</h1>
      {users.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-lg">
            Ninguém entrou com senha neste aparelho nos últimos 7 dias. Entre com sua senha uma vez;
            depois, a troca é feita com o PIN.
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-azulejo px-5 font-semibold text-white hover:bg-azulejo-escuro"
          >
            Entrar com senha
          </Link>
        </div>
      ) : (
        <SwitchUser users={users} />
      )}
    </div>
  );
}
