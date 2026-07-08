import LiveClient from '@/components/LiveClient';
import { SCENES_LITE } from '@/lib/scenes-lite';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الرصد الحي · أبيض' };

export default function LivePage() {
  return <LiveClient scenes={SCENES_LITE} />;
}
