import { ITEMS, POSITIVES, ITEM_MAP, POSITIVE_MAP, ALL_CODES } from './catalog';
import { SEED_SCENES } from './seed-images';

export interface DetectionResult {
  code: string;
  status: 'violation' | 'compliant' | 'not_visible';
  confidence: number;
  bbox: [number, number, number, number]; // normalized x,y,w,h
  noteAr: string;
  titleAr: string; // مُثرى من الكتالوج للعرض
}

export interface DetectContext {
  source: 'webcam' | 'seed' | 'upload';
  seedFile?: string;
  forceMock?: boolean;
}

export interface DetectResponse {
  results: DetectionResult[];
  provider: 'gemini' | 'mock';
  notice?: string; // إشعار عربي عند التحوّل إلى المحاكاة
}

// ── بناء موجّه النظام (System Prompt) للكتالوج المغلق ──
function buildSystemPrompt(): string {
  const violations = ITEMS.map((i) => `- ${i.code}: ${i.titleAr}`).join('\n');
  const positives = POSITIVES.map((p) => `- ${p.code}: ${p.titleAr} (حالة امتثال إيجابية)`).join('\n');
  return `أنت محرّك رصد امتثال بصري لأمانة منطقة الرياض. قيّم الصورة *كما لو كانت منطقة عمل داخل مغسلة سعودية*، وقارنها بالكتالوج المغلق التالي فقط ولا تخترع بنودًا خارجه:

المخالفات:
${violations}

المؤشرات الإيجابية:
${positives}

القواعد:
- إن ظهرت **سيجارة** أو **دخان تدخين** أو أداة تدخين (شيشة/معسّل/سيجارة إلكترونية/فيب) أو شخص يدخّن أو شخص نائم داخل المحل فهذا البند 9/8/1/1 (التدخين أو النوم). ضع bbox حول السيجارة/اليد الماسكة لها أو الشخص.
- إن ظهر شخص لا يرتدي زيًّا موحدًا/كمامة/غطاء شعر فهذا البند 3/8/1/1.
- إن ظهر طعام أو مشروب (كوب قهوة، علبة، زجاجة ماء) على سطح العمل فهذا البند 7/8/1/1.
- افحص كل عنصر بدقّة وأعِد كل ما تراه من مخالفات الكتالوج (قد تكون أكثر من واحدة).
- استخدم status="violation" للمخالفة، "compliant" للمؤشر الإيجابي، "not_visible" لما لا يظهر.
- bbox إحداثيات نسبية [x,y,w,h] بين 0 و1 من أعلى يسار الصورة.
- confidence رقم بين 0 و1.
- note_ar جملة عربية قصيرة تصف ما رُصد.

أعِد *JSON صارمًا فقط* دون أي نص إضافي، على هيئة مصفوفة:
[{"code":"...","status":"violation|compliant|not_visible","confidence":0.0,"bbox":[0,0,0,0],"note_ar":"..."}]
لا تُعِد أي بند بحالة not_visible.`;
}

function enrich(r: Omit<DetectionResult, 'titleAr'>): DetectionResult {
  const title =
    ITEM_MAP[r.code]?.titleAr ?? POSITIVE_MAP[r.code]?.titleAr ?? r.code;
  const bbox = normalizeBbox(r.bbox);
  return { ...r, bbox, titleAr: title };
}

function normalizeBbox(b: unknown): [number, number, number, number] {
  if (!Array.isArray(b) || b.length < 4) return [0.3, 0.3, 0.4, 0.4];
  let [x, y, w, h] = b.map((n) => Number(n));
  // بعض النماذج تُعيد بالنسبة المئوية (0..100)
  if ([x, y, w, h].some((v) => v > 1.5)) {
    x /= 100; y /= 100; w /= 100; h /= 100;
  }
  const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, isFinite(v) ? v : 0));
  x = clamp(x); y = clamp(y);
  w = clamp(w, 0.02, 1 - x);
  h = clamp(h, 0.02, 1 - y);
  return [x, y, w, h];
}

// ────────────────────────── GEMINI ──────────────────────────
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash'];

function parseDataUri(dataUri: string): { mime: string; data: string } {
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/s);
  if (m) return { mime: m[1], data: m[2] };
  // ربما base64 خام
  return { mime: 'image/jpeg', data: dataUri.replace(/^data:.*,/, '') };
}

async function callGeminiModel(
  model: string,
  imageDataUri: string,
  apiKey: string,
): Promise<DetectionResult[]> {
  const { mime, data } = parseDataUri(imageDataUri);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'قيّم هذه الصورة وأعد JSON فقط.' },
          { inline_data: { mime_type: mime, data } },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 1024 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`Gemini ${model} HTTP ${res.status}`);
  }
  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  return parseModelJson(text);
}

// تحليل دفاعي لمخرجات النموذج
export function parseModelJson(text: string): DetectionResult[] {
  if (!text) return [];
  let raw = text.trim();
  // إزالة أسوار الشيفرة إن وُجدت
  raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  // التقاط أول مصفوفة JSON
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    raw = raw.slice(start, end + 1);
  }
  let arr: any;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: DetectionResult[] = [];
  for (const it of arr) {
    if (!it || typeof it.code !== 'string') continue;
    if (!ALL_CODES.includes(it.code)) continue; // كتالوج مغلق
    const status =
      it.status === 'violation' || it.status === 'compliant' || it.status === 'not_visible'
        ? it.status
        : 'violation';
    if (status === 'not_visible') continue;
    const conf = Math.min(1, Math.max(0, Number(it.confidence) || 0.7));
    out.push(
      enrich({
        code: it.code,
        status,
        confidence: conf,
        bbox: it.bbox,
        noteAr: typeof it.note_ar === 'string' ? it.note_ar : '',
      }),
    );
  }
  return out;
}

// ────────────────────────── MOCK ──────────────────────────
function mockForSeed(seedFile?: string): DetectionResult[] {
  const scene = SEED_SCENES.find((s) => s.file === seedFile);
  if (!scene) return mockWebcam('seed-unknown');
  return [
    enrich({
      code: scene.code,
      status: scene.status,
      confidence: scene.confidence,
      bbox: scene.bbox,
      noteAr: scene.noteAr,
    }),
  ];
}

// أزواج معقولة للبث الحي — تضمن ظهور 3/8/1/1 و 7/8/1/1 (سحر العرض)
const WEBCAM_PAIRS: Array<Array<Omit<DetectionResult, 'titleAr'>>> = [
  [
    { code: '3/8/1/1', status: 'violation', confidence: 0.89, bbox: [0.30, 0.16, 0.34, 0.70], noteAr: 'شخص دون زي موحد أو كمامة في الإطار' },
    { code: '7/8/1/1', status: 'violation', confidence: 0.87, bbox: [0.60, 0.40, 0.20, 0.24], noteAr: 'مشروب/كوب على سطح قريب من موقع العمل' },
  ],
  [
    { code: '7/8/1/1', status: 'violation', confidence: 0.86, bbox: [0.55, 0.38, 0.22, 0.26], noteAr: 'كوب مشروب ظاهر في مجال الكاميرا' },
  ],
  [
    { code: '3/8/1/1', status: 'violation', confidence: 0.90, bbox: [0.34, 0.12, 0.32, 0.74], noteAr: 'شخص بلا زي موحد مكتمل' },
    { code: 'POS-EXTINGUISHER', status: 'compliant', confidence: 0.88, bbox: [0.05, 0.30, 0.12, 0.4], noteAr: 'طفاية حريق ظاهرة' },
  ],
];

function hashLen(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 997) h = (h + s.charCodeAt(i)) % 100000;
  return h + s.length;
}

function mockWebcam(seed: string): DetectionResult[] {
  const idx = hashLen(seed) % WEBCAM_PAIRS.length;
  const pair = WEBCAM_PAIRS[idx];
  // تباين طفيف في الثقة ليبدو حيًّا (حتمي حسب البصمة)
  const jitter = ((hashLen(seed) % 5) - 2) / 100;
  return pair.map((r) =>
    enrich({ ...r, confidence: Math.min(0.98, Math.max(0.6, r.confidence + jitter)) }),
  );
}

export function runMock(imageDataUri: string, ctx: DetectContext): DetectionResult[] {
  if (ctx.source === 'seed') return mockForSeed(ctx.seedFile);
  return mockWebcam(imageDataUri.slice(0, 512) + (ctx.seedFile ?? ''));
}

// ────────────────────────── الواجهة العامة ──────────────────────────
/**
 * detect(imageBase64, ctx) — الواجهة الموحّدة.
 * تستخدم Gemini إن توفّر المفتاح ولم يُطلب المحاكاة؛ وإلا/عند الفشل → Mock.
 */
export async function detect(
  imageBase64: string,
  ctx: DetectContext,
): Promise<DetectResponse> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const useMock = ctx.forceMock || !key || key.length < 8;

  if (useMock) {
    return {
      results: runMock(imageBase64, ctx),
      provider: 'mock',
      notice: ctx.forceMock
        ? undefined
        : !key || key.length < 8
          ? 'يعمل العرض حاليًا بمحرّك المحاكاة (لم يُضبط مفتاح Gemini).'
          : undefined,
    };
  }

  // محاولة Gemini مع نموذج احتياطي
  for (const model of GEMINI_MODELS) {
    try {
      const results = await callGeminiModel(model, imageBase64, key!);
      return { results, provider: 'gemini' };
    } catch (e) {
      // جرّب النموذج التالي
      continue;
    }
  }

  // فشل كل النماذج → محاكاة مع إشعار
  return {
    results: runMock(imageBase64, ctx),
    provider: 'mock',
    notice: 'تعذّر الوصول إلى محرّك Gemini — تم التحويل مؤقتًا إلى المحاكاة.',
  };
}
