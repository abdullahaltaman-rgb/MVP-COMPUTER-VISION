<div dir="rtl">

# دليل التكامل — أبيض فيجن v1.0

هذا المستند لفريق تطبيق مالك أبيض: كل ما يلزم لتضمين شاشات المنظومة أصليًا
(nativeّا) داخل التطبيق — واجهات REST، والمصادقة، وحمولات إشعارات FCM.

- **الخادم:** `https://<deployment>.vercel.app` (يُحدد عند النشر — `APP_BASE_URL`)
- **الصيغة:** JSON بترميز UTF-8، التواريخ ISO-8601 UTC
- **المصادقة (مستخدمون):** كوكي جلسة `abyad_session` (JWT HS256، 30 يومًا) يصدر من
  `POST /api/auth/login`. للتضمين داخل التطبيق: نفّذ الدخول مرة واحدة واحتفظ بالكوكي
  في جلسة WebView/عميل HTTP.
- **المصادقة (أجهزة الحافة):** `Authorization: Bearer <device-token>` — لا تخص تطبيق المالك.

---

## 1) مواصفة OpenAPI

```yaml
openapi: 3.0.3
info:
  title: Abyad Vision Cloud API
  version: 1.0.0
  description: منظومة أبيض فيجن — رصد الامتثال الحي (فرع الرياض التجريبي)
servers:
  - url: https://<deployment>.vercel.app
components:
  securitySchemes:
    sessionCookie:
      type: apiKey
      in: cookie
      name: abyad_session
    deviceToken:
      type: http
      scheme: bearer
      description: رمز جهاز الحافة (sha256 مخزّن سحابيًا)
  schemas:
    Case:
      type: object
      properties:
        id: { type: string }
        refNo: { type: string, example: AV-2026-0007 }
        itemCode: { type: string, example: 7/8/1/1 }
        status:
          type: string
          enum: [new, notified, in_grace, corrected, escalated]
        confidence: { type: number, format: float }
        route: { type: string, enum: [auto, review] }
        potentialFine: { type: integer, description: بالريال }
        detectedAt: { type: string, format: date-time }
        graceDeadline: { type: string, format: date-time, description: مهلة 48 ساعة }
        correctedAt: { type: string, format: date-time, nullable: true }
        escalationReason:
          type: string
          nullable: true
          enum: [grace_expired, repeat_7d]
    Notification:
      type: object
      properties:
        id: { type: string }
        type:
          type: string
          enum: [case_opened, case_closed, escalation, weekly_report, device_offline]
        titleAr: { type: string }
        bodyAr: { type: string }
        at: { type: string, format: date-time }
    Report:
      type: object
      properties:
        id: { type: string }
        periodStart: { type: string, format: date-time }
        periodEnd: { type: string, format: date-time }
        sha256: { type: string, description: بصمة بايتات الـ PDF }
        signature: { type: string, description: توقيع Ed25519 base64 }
        algo: { type: string, enum: [Ed25519, HMAC-SHA256] }

paths:
  /api/auth/login:
    post:
      summary: دخول برمز وصول (يعيد كوكي جلسة)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [accessCode]
              properties:
                accessCode: { type: string }
      responses:
        '200':
          description: نجاح — Set-Cookie abyad_session
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  role: { type: string, enum: [operator, kafeel, ops, ministry] }
                  nameAr: { type: string }
        '401': { description: رمز غير صحيح }

  /api/auth/logout:
    post: { summary: إنهاء الجلسة, responses: { '200': { description: ok } } }

  /api/auth/me:
    get:
      summary: المستخدم الحالي
      security: [{ sessionCookie: [] }]
      responses:
        '200': { description: '{ user: { id, role, nameAr, branchId } }' }
        '401': { description: لا جلسة }

  /api/operator:
    get:
      summary: لوحة المشغّل — الفرع + الحالات (بأدلتها وخطها الزمني) + التنبيهات
      security: [{ sessionCookie: [] }]
      responses:
        '200':
          description: '{ branch, cases: Case[] (مع evidences/timeline), notifications: Notification[] }'

  /api/operator/correct:
    post:
      summary: رفع لقطة تصحيح → إعادة كشف Gemini → إغلاق تلقائي عند زوال المخالفة
      security: [{ sessionCookie: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [caseId, imageB64]
              properties:
                caseId: { type: string }
                imageB64: { type: string, description: JPEG base64 بلا بادئة data URI }
      responses:
        '200':
          description: >
            { ok, closed: true } عند الإغلاق، أو
            { ok: false, closed: false, reason } إن كانت المخالفة ما تزال ظاهرة
        '409': { description: الحالة مغلقة أو مُصعّدة }

  /api/kafeel:
    get:
      summary: لوحة الكفيل — المؤشر + الحالات (قراءة) + التقارير الموقّعة + التصعيدات
      security: [{ sessionCookie: [] }]
      responses:
        '200':
          description: '{ branch, score, monthStats, cases, reports: Report[], escalations }'

  /api/reports/{id}/pdf:
    get:
      summary: تنزيل PDF التقرير الأسبوعي الموقّع
      security: [{ sessionCookie: [] }]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          description: application/pdf + ترويسات X-Signature و X-Sha256 و X-Signature-Algo
        '404': { description: غير موجود }

  /api/evidence/{id}:
    get:
      summary: صورة الدليل (JPEG) — مصادقة إلزامية
      security: [{ sessionCookie: [] }]
      responses:
        '200': { description: image/jpeg }
        '410': { description: أُتلفت البايتات (سياسة 90 يومًا) — البصمة باقية في السلسلة }

  /api/chain/verify:
    get:
      summary: التحقق الكامل من سلسلة العهدة sha256(bytes+prevHash)
      responses:
        '200':
          description: '{ ok, total, brokenCount, purgedCount, rootHash, records[] }'

  /api/ministry:
    get:
      summary: لوحة الأمانة (قراءة فقط — دور ministry أو ops)
      security: [{ sessionCookie: [] }]
      responses:
        '200': { description: '{ branches, cases, stats, chainRoot, digests }' }

  # ── واجهات جهاز الحافة (Bearer) — للاطلاع، لا يستهلكها تطبيق المالك ──
  /api/edge/events:
    post:
      summary: ingest حدث رصد من الجسر
      security: [{ deviceToken: [] }]
      responses:
        '200': { description: '{ accepted, eventId?, gated: auto|review|drop, silent, caseId? }' }
  /api/edge/heartbeat:
    post: { summary: نبض 60 ثانية, security: [{ deviceToken: [] }], responses: { '200': { description: ok } } }
  /api/edge/config:
    get: { summary: الإعداد عن بُعد (قواعد §5 + SILENT_MODE), security: [{ deviceToken: [] }], responses: { '200': { description: config } } }
  /api/edge/snapshots:
    post: { summary: لقطة دورية للفحص الدلالي, security: [{ deviceToken: [] }], responses: { '200': { description: ok } } }
```

---

## 2) إشعارات FCM

### المواضيع (Topics)

| الموضوع | الجمهور | متى |
|---|---|---|
| `branch_{branchId}_operator` | تطبيق المشغّل | فوري لكل حالة + عند الإغلاق |
| `branch_{branchId}_kafeel` | تطبيق الكفيل | التقرير الأسبوعي (الخميس 17:00) + التصعيد **فقط** |

`branchId` هو معرّف الفرع في المنظومة (يصلكم من `GET /api/operator` أو `/api/kafeel`
في الحقل `branch.id`). اشتراك العميل:

```kotlin
Firebase.messaging.subscribeToTopic("branch_${branchId}_operator")
```

> **مصفوفة الإشعارات (إلزامية):** المشغّل لا يستقبل تصعيدات ولا تقارير؛ الكفيل لا
> يستقبل إشعار فتح/إغلاق الحالات — فقط التقرير الأسبوعي والتصعيد (انتهاء مهلة أو
> تكرار نفس البند خلال 7 أيام).
>
> **SILENT_MODE:** عند تفعيله (أسبوع المعايرة) لا يصدر **أي** إشعار للمشغّل أو
> الكفيل — تُسجَّل الإشعارات داخليًا بحالة `suppressed_silent` فقط.

### حمولات الرسائل

كل الرسائل تحمل `notification` (عنوان/نص عربيان) + `data` للتوجيه داخل التطبيق:

**1. فتح حالة (للمشغّل):**
```json
{
  "topic": "branch_{branchId}_operator",
  "notification": {
    "title": "حالة جديدة — بند 7/8/1/1",
    "body": "تناول الأطعمة والمشروبات في مواقع العمل · مهلة التصحيح 48 ساعة · الغرامة المحتملة 250 ريال / عامل"
  },
  "data": {
    "type": "case_opened",
    "caseId": "cmrd...",
    "refNo": "AV-2026-0007"
  }
}
```
التوجيه المقترح: فتح شاشة الحالة (`/api/operator` → الحالة `caseId`).

**2. إغلاق حالة (للمشغّل):**
```json
{
  "data": { "type": "case_closed", "caseId": "…", "refNo": "AV-2026-0007" },
  "notification": {
    "title": "أُغلقت الحالة AV-2026-0007",
    "body": "تناول الأطعمة والمشروبات في مواقع العمل — تم توثيق التصحيح ضمن المهلة"
  }
}
```

**3. تصعيد (للكفيل فقط):**
```json
{
  "topic": "branch_{branchId}_kafeel",
  "notification": {
    "title": "تصعيد — الحالة AV-2026-0007",
    "body": "قيام العامل بالعمل دون ارتداء الزي الموحد … · انتهت مهلة الـ 48 ساعة دون تصحيح"
  },
  "data": {
    "type": "escalation",
    "caseId": "…",
    "refNo": "AV-2026-0007",
    "reason": "grace_expired"
  }
}
```
`reason`: `grace_expired` أو `repeat_7d` (تكرار نفس البند خلال 7 أيام).

**4. التقرير الأسبوعي (للكفيل):**
```json
{
  "topic": "branch_{branchId}_kafeel",
  "notification": {
    "title": "التقرير الأسبوعي الموقّع — مغسلة أبيض — فرع الملقا",
    "body": "مؤشر الامتثال 85% · 3 حالات · 1 تصعيد"
  },
  "data": { "type": "weekly_report", "reportId": "…" }
}
```
التوجيه: `GET /api/reports/{reportId}/pdf` (يتطلب جلسة كفيل).

### إعداد الخادم

- ضع حساب خدمة Firebase (JSON) بترميز base64 في `FIREBASE_SERVICE_ACCOUNT_B64`.
- الرسائل تُرسل بأولوية عالية (`android.priority=high` + APNs sound default).
- كل إشعار يُوثَّق في جدول `Notification` (بما فيها المكبوتة صامتًا والفاشلة).

---

## 3) التحقق من التوقيعات (تقارير + بصمة التشغيل)

- الخوارزمية: **Ed25519** (أو HMAC-SHA256 عند غياب مفتاح في بيئات التطوير — الحقل `algo`).
- تقرير أسبوعي: التوقيع على **بايتات ملف الـ PDF** نفسها؛ `sha256` هو hash البايتات.
- بصمة التشغيل اليومية (`OpsDigest`): التوقيع على الـ canonical JSON للحمولة
  (مفاتيح مرتبة أبجديًا، تواريخ ISO).
- المفتاح العام متاح للطرف المدقق عند الطلب (يُصدَّر من `SIGNING_PRIVATE_KEY_PEM`).

</div>
