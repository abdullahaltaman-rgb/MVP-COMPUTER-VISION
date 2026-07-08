import MinistryClient from '@/components/MinistryClient';
import { getMinistryData } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'غرفة عمليات الامتثال · أبيض' };

export default async function MinistryPage() {
  const data = await getMinistryData();
  return <MinistryClient initial={data} />;
}
