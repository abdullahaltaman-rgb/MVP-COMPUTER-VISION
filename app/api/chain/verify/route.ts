// ── التحقق الكامل من سلسلة العهدة: hash = sha256(bytes + prevHash) — كما في الديمو ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyChain } from '@/lib/chain';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const result = await verifyChain(prisma);
  return NextResponse.json(result);
}
