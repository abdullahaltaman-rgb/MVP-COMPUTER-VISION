import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// تشخيص مؤقت: يكشف بنية قيمة TURSO_DATABASE_URL (الرابط ليس سرًّا) دون كشف الرمز.
export async function GET() {
  const raw = process.env.TURSO_DATABASE_URL ?? null;
  const token = process.env.TURSO_AUTH_TOKEN ?? null;
  return NextResponse.json({
    urlPresent: raw !== null,
    urlLength: raw?.length ?? 0,
    urlJson: JSON.stringify(raw), // يُظهر أي \n أو \r أو مسافات مخفية
    urlTrimmedLength: raw?.trim().length ?? 0,
    firstCodes: raw ? Array.from(raw.slice(0, 8)).map((c) => c.charCodeAt(0)) : [],
    lastCodes: raw ? Array.from(raw.slice(-8)).map((c) => c.charCodeAt(0)) : [],
    hasInnerWhitespace: raw ? /\s/.test(raw.trim()) : false,
    tokenPresent: token !== null,
    tokenLength: token?.length ?? 0,
    tokenHasWhitespace: token ? /\s/.test(token.trim()) : false,
  });
}
