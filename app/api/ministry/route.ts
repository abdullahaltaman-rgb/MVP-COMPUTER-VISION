import { NextResponse } from 'next/server';
import { getMinistryData } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getMinistryData();
  return NextResponse.json(data);
}
