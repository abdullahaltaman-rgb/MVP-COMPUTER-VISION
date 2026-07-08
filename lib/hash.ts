import crypto from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

/** sha256 خام لسلسلة نصية → hex */
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * حساب بصمة سجل في سلسلة العهدة:
 * hash = sha256( bytes(الدليل) + prevHash )
 * حيث bytes هي محتوى الصورة (base64) — نمثّلها كنص لغرض العرض التجريبي.
 */
export function computeEvidenceHash(imageB64: string, prevHash: string): string {
  return sha256Hex(imageB64 + prevHash);
}

/** اختصار البصمة للعرض: أول 8 · آخر 8 */
export function shortHash(hash: string): string {
  if (!hash || hash.length < 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}
