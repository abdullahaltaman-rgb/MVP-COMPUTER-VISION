// ── Gemini 2.5 Flash-Lite: تحقق دلالي فوري + دفعات مجدولة (Batch API) ──
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash-lite';

export interface SemanticVerdict {
  violation: boolean;
  confidence: number;
  noteAr: string;
}

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function apiKey(): string {
  return (process.env.GEMINI_API_KEY || '').trim();
}

const SYSTEM_AR =
  'أنت مدقق امتثال لمغاسل الملابس في الرياض. أجب حصريًا بJSON صالح بالصيغة: ' +
  '{"violation": true|false, "confidence": 0.0-1.0, "note_ar": "جملة عربية واحدة"} ' +
  'دون أي نص إضافي. كن متحفظًا: إن لم تكن متأكدًا اخفض confidence.';

function buildRequest(promptAr: string, imageB64: string) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${SYSTEM_AR}\n\nالسؤال: ${promptAr}` },
          { inline_data: { mime_type: 'image/jpeg', data: imageB64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
  };
}

export function parseVerdict(text: string): SemanticVerdict | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (typeof j.violation !== 'boolean') return null;
    const conf = Math.max(0, Math.min(1, Number(j.confidence) || 0));
    return { violation: j.violation, confidence: conf, noteAr: String(j.note_ar || '') };
  } catch {
    return null;
  }
}

function extractText(resp: unknown): string {
  const r = resp as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return r?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

/** نداء متزامن — لإعادة كشف التصحيح والتحقق الدلالي للأحداث الحية */
export async function semanticCheck(
  promptAr: string,
  imageB64: string,
): Promise<SemanticVerdict | null> {
  if (!geminiEnabled()) return null;
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequest(promptAr, imageB64)),
  });
  if (!res.ok) return null;
  return parseVerdict(extractText(await res.json()));
}

// ── Batch API للفحوصات المجدولة (نصف التكلفة، نتائج غير متزامنة) ──

export interface BatchItem {
  key: string; // معرف داخلي: snapshotId|itemCode
  promptAr: string;
  imageB64: string;
}

/** يُرسل دفعة ويعيد اسم المهمة لدى Gemini (batches/…) أو null عند الفشل */
export async function submitBatch(items: BatchItem[]): Promise<string | null> {
  if (!geminiEnabled() || items.length === 0) return null;
  const body = {
    batch: {
      display_name: `abyad-semantic-${Date.now()}`,
      input_config: {
        requests: {
          requests: items.map((it) => ({
            request: buildRequest(it.promptAr, it.imageB64),
            metadata: { key: it.key },
          })),
        },
      },
    },
  };
  const res = await fetch(`${BASE}/models/${MODEL}:batchGenerateContent?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { name?: string };
  return j.name || null;
}

export interface BatchResult {
  done: boolean;
  failed: boolean;
  items: { key: string; verdict: SemanticVerdict | null }[];
}

/** يستطلع حالة دفعة؛ عند الاكتمال يعيد الأحكام مفهرسة بالمفتاح */
export async function pollBatch(name: string): Promise<BatchResult> {
  const res = await fetch(`${BASE}/${name}?key=${apiKey()}`);
  if (!res.ok) return { done: false, failed: true, items: [] };
  const j = (await res.json()) as {
    done?: boolean;
    error?: unknown;
    metadata?: { state?: string };
    response?: {
      inlinedResponses?: {
        inlinedResponses?: { response?: unknown; metadata?: { key?: string } }[];
      };
    };
  };
  const state = j.metadata?.state || '';
  if (j.error || state === 'BATCH_STATE_FAILED' || state === 'BATCH_STATE_CANCELLED') {
    return { done: true, failed: true, items: [] };
  }
  if (!j.done && state !== 'BATCH_STATE_SUCCEEDED') {
    return { done: false, failed: false, items: [] };
  }
  const inlined = j.response?.inlinedResponses?.inlinedResponses || [];
  return {
    done: true,
    failed: false,
    items: inlined.map((r) => ({
      key: r.metadata?.key || '',
      verdict: parseVerdict(extractText(r.response)),
    })),
  };
}
