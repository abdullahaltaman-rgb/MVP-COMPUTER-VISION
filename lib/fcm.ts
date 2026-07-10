// ── FCM عبر firebase-admin — مواضيع branch_{id}_operator / branch_{id}_kafeel ──
import type { App } from 'firebase-admin/app';

let app: App | null = null;

export function fcmEnabled(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim());
}

async function getApp(): Promise<App | null> {
  if (!fcmEnabled()) return null;
  if (app) return app;
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const existing = getApps();
  if (existing.length) {
    app = existing[0];
    return app;
  }
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64!, 'base64').toString('utf8');
  app = initializeApp({ credential: cert(JSON.parse(json)) });
  return app;
}

export function operatorTopic(branchId: string): string {
  return `branch_${branchId}_operator`;
}
export function kafeelTopic(branchId: string): string {
  return `branch_${branchId}_kafeel`;
}

export interface FcmMessage {
  topic: string;
  titleAr: string;
  bodyAr: string;
  data?: Record<string, string>;
}

/** يرسل إلى موضوع ويعيد معرف رسالة FCM أو null (بيئة بلا Firebase) */
export async function sendToTopic(msg: FcmMessage): Promise<string | null> {
  const a = await getApp();
  if (!a) return null;
  const { getMessaging } = await import('firebase-admin/messaging');
  const id = await getMessaging(a).send({
    topic: msg.topic,
    notification: { title: msg.titleAr, body: msg.bodyAr },
    data: msg.data || {},
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  });
  return id;
}
