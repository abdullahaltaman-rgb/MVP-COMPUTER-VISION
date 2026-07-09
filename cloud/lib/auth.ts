// ── مصادقة المستخدمين (JWT في كوكي) + مصادقة أجهزة الحافة (Bearer token) ──
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import prisma from './db';
import { sha256Hex } from './hash';

export const SESSION_COOKIE = 'abyad_session';
const SESSION_DAYS = 30;

export type Role = 'operator' | 'kafeel' | 'ops' | 'ministry';

export interface SessionUser {
  id: string;
  role: Role;
  nameAr: string;
  branchId: string | null;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret');
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.id || !payload.role) return null;
    return {
      id: payload.id as string,
      role: payload.role as Role,
      nameAr: (payload.nameAr as string) || '',
      branchId: (payload.branchId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** المستخدم الحالي من كوكي الجلسة (في مكونات/مسارات الخادم) */
export async function currentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

/** يتطلب دورًا محددًا وإلا يعيد 401/403 — للاستخدام في Route Handlers */
export async function requireRole(
  ...roles: Role[]
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await currentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: 'الجلسة غير موجودة — سجّل الدخول' }, { status: 401 }),
    };
  }
  if (!roles.includes(user.role)) {
    return {
      error: NextResponse.json({ error: 'صلاحيات غير كافية' }, { status: 403 }),
    };
  }
  return { user };
}

/** دخول برمز الوصول → المستخدم أو null */
export async function loginWithAccessCode(accessCode: string): Promise<SessionUser | null> {
  const hash = sha256Hex(accessCode.trim());
  const u = await prisma.user.findUnique({ where: { accessCodeHash: hash } });
  if (!u || !u.active) return null;
  return { id: u.id, role: u.role as Role, nameAr: u.nameAr, branchId: u.branchId };
}

// ── مصادقة أجهزة الحافة ──

export async function authenticateDevice(): Promise<
  | { device: { id: string; branchId: string; name: string } }
  | { error: NextResponse }
> {
  const auth = headers().get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    return {
      error: NextResponse.json({ error: 'رمز الجهاز مفقود' }, { status: 401 }),
    };
  }
  const device = await prisma.device.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { id: true, branchId: true, name: true },
  });
  if (!device) {
    return {
      error: NextResponse.json({ error: 'رمز الجهاز غير صالح' }, { status: 401 }),
    };
  }
  return { device };
}

/** حارس crons — يقبل ترويسة Vercel Cron أو CRON_SECRET يدويًا */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}
