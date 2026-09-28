import type { Metadata } from 'next';
import { requireSession } from '@/modules/auth/web';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function ChangePasswordPage() {
  const session = await requireSession({ allowPasswordChange: true });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">
          {session.mustChangePassword ? 'Crie sua senha' : 'Trocar senha'}
        </h1>
        <p className="text-tinta-suave">
          {session.mustChangePassword
            ? `${session.userName}, sua senha atual é provisória. Crie uma senha só sua para continuar.`
            : 'Ao trocar, você continua neste aparelho e sai dos outros.'}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
