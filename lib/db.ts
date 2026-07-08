import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';
import path from 'node:path';

// Resolve the libSQL connection so that BOTH the Prisma CLI (which resolves
// sqlite paths relative to prisma/schema.prisma) and the runtime driver
// adapter (which resolves relative to process.cwd()) point at the SAME file.
// تنظيف قوي لقيم البيئة الملصقة: يزيل الفراغات والأسطر الجديدة وحروف
// حدود جداول Markdown (` و |) وعلامات الاقتباس — أسباب شائعة لـ "Invalid URL".
function sanitize(v: string | undefined): string {
  if (!v) return '';
  return v
    .trim()
    .replace(/[`|]/g, '') // باكتيك وشَرطة عمودية من نسخ جداول Markdown
    .replace(/^["'<>]+|["'<>]+$/g, '') // اقتباسات/أقواس محيطة
    .replace(/\s+/g, '') // أي فراغ داخلي
    .trim();
}

export function resolveUrl(): { url: string; authToken?: string } {
  const tursoUrl = sanitize(process.env.TURSO_DATABASE_URL);
  const authToken = sanitize(process.env.TURSO_AUTH_TOKEN);
  if (tursoUrl.length > 0) {
    return { url: tursoUrl, authToken: authToken || undefined };
  }
  // Local dev: keep the db file next to the Prisma schema (prisma/dev.db).
  const abs = path.join(process.cwd(), 'prisma', 'dev.db');
  return { url: `file:${abs}` };
}

/** عميل libSQL خام (لتنفيذ SQL مباشرة عند التهيئة الذاتية) */
export function rawLibsql() {
  return createClient(resolveUrl());
}

export const usingTurso = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.length > 0);

function makeClient(): PrismaClient {
  const { url, authToken } = resolveUrl();
  const libsql = createClient({ url, authToken });
  const adapter = new PrismaLibSQL(libsql);
  return new PrismaClient({ adapter, log: ['warn', 'error'] });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = makeClient();
  }
  return globalForPrisma.prisma;
}

// عميل كسول: لا يُنشأ اتصال القاعدة إلا عند أول استخدام فعلي (وقت التشغيل)،
// وليس عند استيراد الوحدة أو أثناء البناء (next build) — يتفادى Invalid URL وقت البناء.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
