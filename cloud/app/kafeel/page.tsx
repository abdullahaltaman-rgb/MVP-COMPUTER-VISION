import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import KafeelClient from '@/components/KafeelClient';

export const dynamic = 'force-dynamic';

export default async function KafeelPage() {
  const user = await currentUser();
  if (!user) redirect('/');
  if (user.role !== 'kafeel') redirect('/');
  return <KafeelClient nameAr={user.nameAr} />;
}
