import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSessionToken, loginWithAccessCode, SESSION_COOKIE } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const Body = z.object({ accessCode: z.string().min(4).max(200) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'رمز الوصول مطلوب' }, { status: 400 });
  }
  const user = await loginWithAccessCode(parsed.data.accessCode);
  if (!user) {
    return NextResponse.json({ error: 'رمز الوصول غير صحيح' }, { status: 401 });
  }
  const token = await createSessionToken(user);
  await audit(user, 'login', 'user', user.id);

  const res = NextResponse.json({ ok: true, role: user.role, nameAr: user.nameAr });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 3600,
    path: '/',
  });
  return res;
}
