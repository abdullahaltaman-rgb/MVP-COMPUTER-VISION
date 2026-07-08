import { prisma, rawLibsql } from './db';
import { seedDatabase } from './seed-core';

// مخطّط قاعدة البيانات كاملًا (idempotent عبر IF NOT EXISTS) — للتهيئة الذاتية
// على الإنتاج (Turso) دون الحاجة إلى أوامر CLI.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "Branch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nameAr" TEXT NOT NULL,
  "districtAr" TEXT NOT NULL,
  "licenseNo" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 90,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Item" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "titleAr" TEXT NOT NULL,
  "fineText" TEXT NOT NULL,
  "fineAmount" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'violation'
);
CREATE TABLE IF NOT EXISTS "Case" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "refNo" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "confidence" REAL NOT NULL,
  "route" TEXT NOT NULL DEFAULT 'auto',
  "noteAr" TEXT,
  "bbox" TEXT,
  "potentialFine" INTEGER NOT NULL DEFAULT 0,
  "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "graceDeadline" DATETIME NOT NULL,
  "correctedAt" DATETIME,
  "isDemoData" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Case_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Case_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Evidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'detection',
  "imageB64" TEXT NOT NULL,
  "annotatedB64" TEXT,
  "sha256" TEXT NOT NULL,
  "prevHash" TEXT NOT NULL,
  "chainIndex" INTEGER NOT NULL,
  "cameraName" TEXT NOT NULL DEFAULT 'كاميرا العرض الحي',
  "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "CaseEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "labelAr" TEXT NOT NULL,
  "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ReviewItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "refNo" TEXT NOT NULL,
  "branchName" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "confidence" REAL NOT NULL,
  "noteAr" TEXT,
  "imageB64" TEXT NOT NULL,
  "bbox" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "isDemoData" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "ChainMeta" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
  "lastHash" TEXT NOT NULL DEFAULT '',
  "lastIndex" INTEGER NOT NULL DEFAULT -1
);
CREATE TABLE IF NOT EXISTS "AppState" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "RateLimit" (
  "ip" TEXT NOT NULL PRIMARY KEY,
  "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "Case_refNo_key" ON "Case"("refNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Evidence_chainIndex_key" ON "Evidence"("chainIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewItem_refNo_key" ON "ReviewItem"("refNo");
`;

let bootstrapped = false;
let inflight: Promise<{ created: boolean; seeded: boolean }> | null = null;

/**
 * تهيئة ذاتية idempotent: تُنشئ الجداول إن غابت، وتزرع البيانات إن كانت فارغة.
 * تُستدعى عند الإقلاع ومن نقطة نهاية احتياطية. آمنة للاستدعاء المتكرر.
 */
export async function ensureBootstrapped(force = false): Promise<{ created: boolean; seeded: boolean }> {
  if (bootstrapped && !force) return { created: false, seeded: false };
  if (inflight) return inflight;

  inflight = (async () => {
    let created = false;
    let seeded = false;
    try {
      const client = rawLibsql();
      await client.executeMultiple(SCHEMA_SQL);
      created = true;

      const count = await prisma.branch.count().catch(() => 0);
      if (count === 0) {
        await seedDatabase(prisma);
        seeded = true;
      }
      bootstrapped = true;
    } catch (e) {
      console.warn('bootstrap error:', e);
    } finally {
      inflight = null;
    }
    return { created, seeded };
  })();

  return inflight;
}
