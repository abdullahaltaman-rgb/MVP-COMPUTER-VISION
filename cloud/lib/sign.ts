// ── توقيع رقمي للتقارير وبصمة التشغيل اليومية ──
// Ed25519 عبر SIGNING_PRIVATE_KEY_PEM، مع بديل HMAC-SHA256 (AUTH_SECRET) للتطوير.
import crypto from 'node:crypto';

export interface Signed {
  sha256: string;
  signature: string;
  algo: 'Ed25519' | 'HMAC-SHA256';
}

/** يُرتّب مفاتيح الكائن ترتيبًا قطعيًا كي تكون البصمة قابلة لإعادة الإنتاج */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortValue((v as Record<string, unknown>)[k])]),
    );
  }
  if (v instanceof Date) return v.toISOString();
  return v;
}

export function signBytes(bytes: Buffer): Signed {
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const pem = process.env.SIGNING_PRIVATE_KEY_PEM?.trim();
  if (pem) {
    const key = crypto.createPrivateKey(pem);
    const signature = crypto.sign(null, bytes, key).toString('base64');
    return { sha256, signature, algo: 'Ed25519' };
  }
  const secret = process.env.AUTH_SECRET || 'dev-secret';
  const signature = crypto.createHmac('sha256', secret).update(bytes).digest('base64');
  return { sha256, signature, algo: 'HMAC-SHA256' };
}

export function signPayload(payload: unknown): Signed {
  return signBytes(Buffer.from(canonicalJson(payload), 'utf8'));
}

export function signingPublicKeyPem(): string | null {
  const pem = process.env.SIGNING_PRIVATE_KEY_PEM?.trim();
  if (!pem) return null;
  try {
    const priv = crypto.createPrivateKey(pem);
    return crypto.createPublicKey(priv).export({ type: 'spki', format: 'pem' }).toString();
  } catch {
    return null;
  }
}
