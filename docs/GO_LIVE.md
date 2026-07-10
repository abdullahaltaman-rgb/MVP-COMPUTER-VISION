<div dir="rtl">

# دليل الإطلاق من الصفر — أبيض فيجن v1.0

هذا الدليل مكتوب لغير المختص: نفّذ الخطوات **بالترتيب** وستنتقل من لا شيء إلى
منظومة تعمل في الفرع. كل خطوة تنتهي بعلامة «تحقّق» تخبرك أنها نجحت.

**ما ستحتاجه قبل البدء:** حاسوب عليه Node.js 20+ و git · بطاقة بنكية لإنشاء
الحسابات السحابية (أغلبها بمستوى مجاني يكفي للطيار) · صندوق N100 في الفرع
مركّب عليه Ubuntu 22.04+ و Docker · ثلاث كاميرات RTSP موصولة بشبكة الفرع.

---

## المرحلة الأولى: الحسابات والمفاتيح (مرة واحدة)

### 1) قاعدة البيانات Postgres المُدارة → `DATABASE_URL`
1. أنشئ حسابًا في [Neon](https://neon.tech) أو [Supabase](https://supabase.com) (كلاهما يكفي مجانًا للطيار).
2. أنشئ مشروعًا باسم `abyad-vision` — اختر أقرب منطقة متاحة للسعودية (أوروبا/الشرق الأوسط).
3. انسخ رابط الاتصال (Connection string) — يبدأ بـ `postgresql://` وينتهي عادة بـ `?sslmode=require`.

> **تحقّق:** الرابط يعمل: `psql "<الرابط>" -c "SELECT 1"` (أو من لوحة المزود).

### 2) مخزن الأدلة S3 (منطقة سعودية) → متغيرات `S3_*`
الخيار الموصى به: **AWS S3 منطقة الرياض/البحرين** (`me-central-1` أو `me-south-1`)،
أو أي مزود S3-متوافق داخل السعودية (STC Cloud وغيره).
1. أنشئ Bucket باسم `abyad-vision-evidence` (خاص — Block all public access).
2. أنشئ مستخدم IAM بصلاحية على هذا الـ Bucket فقط (GetObject/PutObject/DeleteObject).
3. أنشئ له Access Key — ستحصل على `Access Key ID` و `Secret Access Key`.

> **تحقّق:** `aws s3 ls s3://abyad-vision-evidence` يعمل بلا أخطاء.

### 3) مفتاح Gemini → `GEMINI_API_KEY`
1. ادخل [Google AI Studio](https://aistudio.google.com/apikey) بحساب Google.
2. أنشئ API Key وانسخه. (يشغّل الفحوصات المجدولة والتحقق الدلالي وإعادة كشف التصحيح.)

### 4) Firebase للإشعارات → `FIREBASE_SERVICE_ACCOUNT_B64`
1. أنشئ مشروعًا في [Firebase Console](https://console.firebase.google.com) باسم `abyad-vision`.
2. الإعدادات ⚙ ← Service accounts ← **Generate new private key** — سيُنزَّل ملف JSON.
3. حوّله إلى base64 (سطر واحد):
   ```bash
   base64 -w0 serviceAccount.json    # على ماك: base64 -i serviceAccount.json
   ```
   الناتج هو قيمة المتغير. (فريق تطبيق المالك يستخدم نفس المشروع للاشتراك في المواضيع —
   انظر docs/INTEGRATION.md.)

### 5) مفتاح توقيع التقارير → `SIGNING_PRIVATE_KEY_PEM`
ولّده مرة واحدة واحفظه في مدير كلمات مرور (فقدانه يعني تعذر التحقق من توقيعات قديمة):
```bash
node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519');console.log(k.privateKey.export({type:'pkcs8',format:'pem'}))"
```
انسخ الناتج كاملًا (من `-----BEGIN PRIVATE KEY-----` إلى `-----END PRIVATE KEY-----`).

### 6) سرّان عشوائيان → `AUTH_SECRET` و `CRON_SECRET`
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # نفّذه مرتين
```

---

## المرحلة الثانية: نشر السحابة على Vercel

### 7) ربط المشروع
1. أنشئ حسابًا في [Vercel](https://vercel.com) واربطه بحساب GitHub الذي فيه المستودع.
2. **Add New → Project** ← اختر مستودع `mvp-computer-vision`.
3. **مهم:** في إعداد المشروع اضبط **Root Directory = `cloud`**.

### 8) متغيرات البيئة (Production)
أدخل في Settings → Environment Variables كل ما جمعته:

| المتغير | القيمة | إلزامي؟ |
|---|---|---|
| `DATABASE_URL` | رابط Postgres من خطوة 1 | ✅ |
| `AUTH_SECRET` | من خطوة 6 | ✅ |
| `CRON_SECRET` | من خطوة 6 (تستخدمه Vercel Cron تلقائيًا) | ✅ |
| `SIGNING_PRIVATE_KEY_PEM` | من خطوة 5 (الصق الأسطر كاملة) | ✅ للتوقيع الرسمي |
| `S3_ENDPOINT` | مثال `https://s3.me-central-1.amazonaws.com` | ✅ |
| `S3_REGION` | مثال `me-central-1` | ✅ |
| `S3_BUCKET` | `abyad-vision-evidence` | ✅ |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | من خطوة 2 | ✅ |
| `S3_FORCE_PATH_STYLE` | `false` (اجعلها `true` لمزودات غير AWS مثل MinIO) | — |
| `GEMINI_API_KEY` | من خطوة 3 | ✅ |
| `GEMINI_MODE` | `batch` (نصف التكلفة) أو `sync` | — |
| `FIREBASE_SERVICE_ACCOUNT_B64` | من خطوة 4 | ✅ للإشعارات |
| `APP_BASE_URL` | رابط النشر مثل `https://abyad-vision.vercel.app` | — |

4. اضغط **Deploy** وانتظر اكتمال البناء.

> **تحقّق:** افتح `https://<رابطك>/api/chain/verify` — يجب أن ترى JSON فيه `"ok": true, "total": 0`.
> وفي تبويب **Cron Jobs** بلوحة Vercel تظهر 6 جداول (health، lifecycle، semantic،
> semantic-poll، daily، weekly).

### 9) تهيئة القاعدة والبذر (من حاسوبك — مرة واحدة)
```bash
git clone <رابط المستودع> && cd MVP-COMPUTER-VISION
npm install
export DATABASE_URL="<رابط Postgres من خطوة 1>"
npm run db:push      # ينشئ الجداول
npm run db:seed      # يزرع الفرع والجهاز والقواعد والمستخدمين
```
**سيطبع البذر أسرارًا تظهر مرة واحدة فقط — انسخها فورًا:**
- `رمز الجهاز (CLOUD_DEVICE_TOKEN)` ← يذهب إلى صندوق الحافة (خطوة 11).
- أربعة رموز دخول: **مشغّل** و**كفيل** و**عمليات** و**أمانة** ← تُسلَّم لأصحابها يدويًا.

> **تحقّق:** ادخل على `https://<رابطك>/` برمز العمليات → تفتح لوحة `/ops` وفي
> «الإعدادات» تظهر **6 بنود** (منها 10/4/1/1 بفحصين متتاليين) وشارة
> «الوضع الصامت مفعّل».

---

## المرحلة الثالثة: صندوق الحافة داخل الفرع

### 10) تجهيز الكاميرات
ثبّت الكاميرات الثلاث (المعالجة، الاستقبال، النفايات)، فعّل RTSP من إعدادات كل
كاميرا، وسجّل: عنوان IP لكل كاميرا + اسم المستخدم وكلمة المرور.

### 11) تشغيل الحزمة
على صندوق N100 (يتطلب Docker + Docker Compose):
```bash
git clone <رابط المستودع> && cd MVP-COMPUTER-VISION/edge
cp .env.example .env
nano .env    # عبّئ القيم التالية:
```
| المتغير | القيمة |
|---|---|
| `RTSP_USER` / `RTSP_PASSWORD` | بيانات دخول الكاميرات |
| `CAM_PROCESSING_IP` / `CAM_RECEPTION_IP` / `CAM_WASTE_IP` | عناوين الكاميرات الثلاث |
| `CLOUD_BASE_URL` | رابط Vercel مثل `https://abyad-vision.vercel.app` |
| `CLOUD_DEVICE_TOKEN` | الرمز المطبوع في خطوة 9 |

ثم:
```bash
docker compose up -d
docker compose logs -f bridge   # يجب أن ترى «متصل بـ MQTT» ونبضات تُرسل
```

> **تحقّق:** خلال دقيقة، في `/ops` ← «صحة الأجهزة» يظهر الصندوق **متصل**
> والكاميرات الثلاث خضراء بقيم fps.

### 12) ضبط المناطق ميدانيًا (مهم لدقة الرصد)
1. من داخل شبكة الفرع افتح واجهة Frigate: `http://<IP-الصندوق>:5000`.
2. لكل كاميرا: Settings ← Zone editor ← ارسم المنطقة على الصورة الفعلية
   (منطقة المعالجة، كاونتر الاستقبال + المدخل، نقطة النفايات).
3. انسخ الإحداثيات الناتجة إلى `edge/frigate/config.yml` ثم `docker compose restart frigate`.

---

## المرحلة الرابعة: أسبوع المعايرة ثم الإطلاق

### 13) أسبوع المعايرة (SILENT_MODE مفعّل — لا إشعارات للعميل)
- يوميًا في `/ops`: راجع طابور الرصدات (**اعتماد/استبعاد**) وصنّف كل حدث
  **صحيح/خاطئ** — كل تصنيف يغذي مقاييس الدقة تلقائيًا.
- تابع تبويب «المعايرة»: منحنى الدقة اليومي، ودقة كل بند، وشريط بوابة الإطلاق.
- اضبط العتبات من «الإعدادات» إن كان بند يكثر إنذاره الكاذب (تصل الحافة خلال ≤60 ثانية).

### 14) go-live
عند بلوغ **دقة ≥ 90% على 200+ حدث مصنَّف**:
1. `/ops` ← الإعدادات ← **إيقاف الوضع الصامت (go-live)**. (يُرفض تلقائيًا قبل اجتياز البوابة.)
2. أبلغ المشغّل والكفيل بتثبيت الـ PWA (فتح الرابط ← «إضافة إلى الشاشة الرئيسية») ودخولهما برمزيهما.

> **تحقّق النهائي:** افتعل مخالفة تجريبية (كوب قهوة في منطقة المعالجة 30 ثانية) —
> يصل إشعار للمشغّل خلال ثوانٍ، تظهر حالة بعدّاد 48 ساعة، رفع لقطة تصحيح يغلقها،
> والتقرير الأسبوعي الموقّع يصل الكفيل الخميس 17:00.

---

## الصيانة الدورية

| متى | ماذا |
|---|---|
| يوميًا (آلي 00:30) | مقاييس المعايرة + بصمة تشغيل موقّعة + إتلاف الأدلة >90 يومًا |
| أسبوعيًا (آلي الخميس 17:00) | تقرير موقّع PDF للكفيل |
| عند انقطاع جهاز ≥5 دقائق | تنبيه آلي في `/ops` (تحقق من كهرباء/إنترنت الفرع) |
| كل تغيير إعدادات | يُدوَّن في سجل التدقيق ويصل الحافة خلال ≤60 ثانية |

**استكشاف الأخطاء السريع:** الجهاز «منقطع» → `docker compose logs bridge` على الصندوق ·
لا أحداث رغم الحركة → راجع رسم المناطق (خطوة 12) · لا إشعارات →
تأكد من `FIREBASE_SERVICE_ACCOUNT_B64` وأن الوضع الصامت مُطفأ · فحوصات Gemini
لا تعمل → تأكد من `GEMINI_API_KEY` وراقب سجل cron في Vercel.

</div>
