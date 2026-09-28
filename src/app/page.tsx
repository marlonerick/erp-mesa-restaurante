import { redirect } from 'next/navigation';
import { currentSession } from '@/modules/auth/web';

export default async function RootPage() {
  redirect((await currentSession()) ? '/inicio' : '/login');
}
