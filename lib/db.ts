import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';
import path from 'node:path';

// Resolve the libSQL connection so that BOTH the Prisma CLI (which resolves
// sqlite paths relative to prisma/schema.prisma) and the runtime driver
// adapter (which resolves relative to process.cwd()) point at the SAME file.
function resolveUrl(): { url: string; authToken?: string } {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl && tursoUrl.length > 0) {
    return { url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN };
  }
  // Local dev: keep the db file next to the Prisma schema (prisma/dev.db).
  const abs = path.join(process.cwd(), 'prisma', 'dev.db');
  return { url: `file:${abs}` };
}

function makeClient(): PrismaClient {
  const { url, authToken } = resolveUrl();
  const libsql = createClient({ url, authToken });
  const adapter = new PrismaLibSQL(libsql);
  return new PrismaClient({ adapter, log: ['warn', 'error'] });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
