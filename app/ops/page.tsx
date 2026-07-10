import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import OpsClient from '@/components/OpsClient';

export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const user = await currentUser();
  if (!user) redirect('/');
  if (user.role !== 'ops') redirect('/');
  return <OpsClient nameAr={user.nameAr} />;
}
