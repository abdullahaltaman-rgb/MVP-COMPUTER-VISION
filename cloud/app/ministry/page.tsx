import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import MinistryClient from '@/components/MinistryClient';

export const dynamic = 'force-dynamic';

export default async function MinistryPage() {
  const user = await currentUser();
  if (!user) redirect('/');
  if (user.role !== 'ministry' && user.role !== 'ops') redirect('/');
  return <MinistryClient nameAr={user.nameAr} role={user.role} />;
}
