import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import OperatorClient from '@/components/OperatorClient';

export const dynamic = 'force-dynamic';

export default async function OperatorPage() {
  const user = await currentUser();
  if (!user) redirect('/');
  if (user.role !== 'operator') redirect('/');
  return <OperatorClient nameAr={user.nameAr} />;
}
