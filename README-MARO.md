# MARO Global Store

مشروع متجر عالمي للمنتجات الرقمية مع واجهة متجر عامة ولوحة تحكم وخادم Express وقاعدة MySQL عبر Drizzle.

## التشغيل محليًا

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

يفتح الخادم على المنفذ الموجود في `PORT` أو `3000` افتراضيًا.

## بناء الإنتاج

```bash
pnpm check
pnpm build
pnpm start
```

## متغيرات البيئة

لا يوجد ملف أسرار داخل المشروع. عند التشغيل الحقيقي أضف:

```text
DATABASE_URL
MANUS_PROJECT_ID
MANUS_JWT_SECRET
MANUS_OAUTH_API_URL
MANUS_OAUTH_PORTAL_URL
OWNER_OPEN_ID
NODE_ENV=production
PORT
```

## Render

- Build Command: `pnpm install --frozen-lockfile && pnpm build`
- Start Command: `pnpm start`
- Health Check Path: `/api/health`
- يجب ربط MySQL خارجي وإضافة متغيرات البيئة.

## المسارات

- `/` المتجر العام.
- `/admin` لوحة التحكم المحمية.
- `/api/health` فحص الخادم.
- `/manus-routes.json` تعريف المسارات.

## الصور

صور المنتجات الثلاثية الأبعاد مربوطة بمسارات Manus Storage في `server/db.ts`. عند نقل المشروع إلى Render مستقل، انقل الصور إلى Cloudinary أو S3 أو Cloudflare R2 ثم حدّث `imageUrl` للمنتجات.

## الدفع

مسار إنشاء الطلب وقاعدة البيانات جاهزان. لم تتم إضافة مفاتيح PayPal أو Stripe داخل المشروع، لذلك يجب ربط مزود الدفع قبل البيع الحقيقي، ثم تغيير الحالة إلى `paid` عبر webhook موثوق.

## ملاحظات التسليم

لا يحتوي هذا المشروع على كلمات مرور أو مفاتيح سرية أو `node_modules`. لا تستخدم بيانات دخول النسخة القديمة في الإنتاج؛ أضف مديرًا من حساب OAuth المالك أو نفّذ مزود مصادقة تجاريًا واضحًا قبل الإطلاق.
