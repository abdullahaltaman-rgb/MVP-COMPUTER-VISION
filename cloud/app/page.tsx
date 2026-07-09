import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import LoginClient from '@/components/LoginClient';

export const dynamic = 'force-dynamic';

const HOME: Record<string, string> = {
  operator: '/operator',
  kafeel: '/kafeel',
  ops: '/ops',
  ministry: '/ministry',
};

export default async function Home() {
  const user = await currentUser();
  if (user) redirect(HOME[user.role] ?? '/');
  return <LoginClient />;
}
