// ── مخزن الأدلة S3 المتوافق (منطقة سعودية، قابل للتهيئة عبر البيئة) ──
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

let client: S3Client | null = null;

export function s3Enabled(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || 'me-central-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export async function s3Put(
  key: string,
  bytes: Buffer,
  contentType = 'image/jpeg',
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

export async function s3Get(key: string): Promise<Buffer | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    );
    const arr = await res.Body!.transformToByteArray();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

export async function s3Delete(key: string): Promise<void> {
  try {
    await s3().send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    );
  } catch {
    // الحذف أفضل جهد — سجل التدقيق يوثّق عملية الإتلاف
  }
}
