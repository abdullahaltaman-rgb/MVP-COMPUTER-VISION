import { prisma } from '../lib/db';
import { seedDatabase } from '../lib/seed-core';

async function main() {
  console.log('🌱 بدء التهيئة (seed) …');
  const r = await seedDatabase(prisma);
  console.log(`✅ تمت التهيئة: ${r.branches} فروع، ${r.cases} حالات، ${r.evidence} دليل في السلسلة.`);
}

main()
  .catch((e) => {
    console.error('❌ فشل seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
