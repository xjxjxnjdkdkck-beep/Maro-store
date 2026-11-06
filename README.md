# متجر مارو — حزمة النشر الآمنة

متجر رقمي عربي RTL متجاوب للهاتف، يتكون من متجر في `index.html`، ولوحة إدارة منفصلة في `admin.html`، وخادم Node.js/Express في `server.mjs`، وقاعدة بيانات MySQL.

## ماذا يعمل؟

- تسجيل العملاء عبر Firebase Email/Password وGoogle.
- حماية لوحة الإدارة عبر Firebase ID Token وبريد `ADMIN_EMAIL` الموثق فقط.
- منتجات وتصنيفات وطلبات وأكواد رقمية.
- شراء مباشر من دون سلة.
- PayPal من الخادم، ولا تظهر المفاتيح السرية في المتصفح.
- استيراد منتج من رابط من لوحة الإدارة.
- MySQL مع معاملات لحجز وتسليم الأكواد بعد التقاط الدفع.
- Docker و`/api/health` جاهزان لـ Render.
- `render.yaml` يعرّف الخدمة، و`.env.example` يوضح أسماء المتغيرات من دون أي أسرار.

## تنبيه مهم عن المجانية

Render يشغّل خدمة Node/Express مجاناً، لكنه يوقف الخدمة بعد 15 دقيقة من عدم الاستخدام وقد يستغرق أول طلب بعد ذلك نحو دقيقة. نظام الملفات في الخطة المجانية مؤقت، لذلك لا نحفظ المنتجات أو الأكواد في ملفات محلية؛ كل البيانات الدائمة في MySQL.

Aiven يوفر MySQL مجاناً بلا مدة انتهاء، مع 1 GB RAM و1 GB تخزين و76 اتصالاً كحد أقصى، لكنه قد يوقف الخدمة المجانية إذا لم يكن عليها نشاط مستمر. هذه الخطة مناسبة للتجربة والمشروع الصغير، وليست ضماناً لتوافر تجاري دائم. راجع حدود حسابك قبل استقبال مبيعات كثيرة.

## الملفات التي ترفعها إلى GitHub

ارفع ملفات المشروع الأساسية كما هي:

```text
index.html
admin.html
server.mjs
package.json
package-lock.json
Dockerfile
render.yaml
.env.example
.gitignore
README.md
TODO.md
manus-routes.json
app.config.ts
```

لا ترفع:

```text
.env
node_modules/
maro-store-final.zip
nova-store-phone.zip
```

ولا تضع أبداً `DATABASE_URL` أو كلمات مرور Aiven أو مفاتيح PayPal أو كلمة مرور Firebase في GitHub. ملف Firebase الموجود في الواجهة يحتوي إعدادات عامة للمتصفح، أما الأسرار الحقيقية فتبقى في Render.

## إعداد Aiven من Safari

1. افتح `https://console.aiven.io` وأنشئ حساباً.
2. أنشئ مشروعاً جديداً.
3. اختر **MySQL** ثم الخطة **Free** والمنطقة الأقرب لك.
4. بعد تشغيل الخدمة افتح صفحة **Connection information**.
5. انسخ **Service URI** كما هو. يجب أن يكون بالشكل التالي تقريباً:

```text
mysql://اسم_المستخدم:كلمة_المرور@المضيف:المنفذ/اسم_القاعدة?ssl=true
```

لا ترسل هذا الرابط في المحادثة ولا تضعه في GitHub؛ ستلصقه لاحقاً داخل Render فقط.

## رفع المشروع إلى GitHub من الآيفون

1. افتح GitHub في Safari، ثم أنشئ Repository جديداً خاصاً أو عاماً.
2. اختر **Add file → Upload files**.
3. ارفع الملفات المذكورة أعلاه فقط. لا ترفع ملفات ZIP أو `node_modules`.
4. اكتب رسالة مثل `Prepare Maro Store for Render` ثم اضغط Commit.
5. إذا كان Safari يعرض واجهة مبسطة، اضغط `aA` ثم **طلب موقع سطح المكتب**.

GitHub يسمح بالرفع من المتصفح للملفات حتى 25 MiB للملف الواحد، لكن ملفات هذا المشروع أصغر من ذلك عادةً.

## نشر الخادم على Render من Safari

1. افتح `https://dashboard.render.com` وسجّل الدخول عبر GitHub.
2. اختر **New → Web Service** ثم اربط Repository متجر مارو.
3. إذا طلب نوع الخدمة اختر **Docker**. يمكن أيضاً استخدام ملف `render.yaml` عبر **New → Blueprint**.
4. استخدم الإعدادات التالية إذا ظهرت الحقول:

```text
Name: maro-store
Branch: main
Dockerfile: Dockerfile
Health Check Path: /api/health
Plan: Free
```

5. افتح **Environment Variables** وأضف:

```text
DATABASE_URL       = Service URI من Aiven
ADMIN_EMAIL        = بريد حساب المدير في Firebase فقط
PAYPAL_CLIENT_ID  = Client ID من تطبيق PayPal
PAYPAL_CLIENT_SECRET = Secret من نفس التطبيق
PAYPAL_API_BASE    = https://api-m.sandbox.paypal.com
PUBLIC_APP_URL     = رابط Render بعد إنشائه، مثل https://maro-store.onrender.com
```

لا تضع علامات اقتباس حول القيم. استخدم PayPal Sandbox للاختبار. عند الإطلاق الحقيقي، غيّر `PAYPAL_API_BASE` إلى `https://api-m.paypal.com` واستبدل المفتاحين بمفاتيح Live.

6. اضغط **Create Web Service** وانتظر انتهاء البناء.
7. افتح رابط `onrender.com`، ثم اختبر:

```text
https://رابط-render.onrender.com/api/health
```

يجب أن تظهر استجابة JSON فيها `ok: true` و`database: true`.

## Firebase بعد تغيير الرابط

في Firebase Console افتح **Authentication → Settings → Authorized domains** وأضف نطاق Render، مثل:

```text
maro-store.onrender.com
```

ثم فعّل Email/Password. فعّل Google فقط إذا أردت تسجيل Google. لا تضف `https://` داخل خانة Authorized domains.

## PayPal والاختبار الكامل

قبل البيع الحقيقي اختبر بحسابات PayPal Sandbox:

1. سجل دخول العميل.
2. أضف كوداً متاحاً للمنتج من لوحة الإدارة.
3. اشترِ المنتج من المتجر.
4. أكمل الدفع في Sandbox.
5. تأكد من ظهور الطلب في الإدارة وتحول الكود إلى sold وتسليم الكود للعميل.
6. اختبر إلغاء الدفع أيضاً.

لا تعتبر المتجر جاهزاً لاستقبال أموال حقيقية قبل نجاح هذه الدورة كاملة. لا ترسل مفاتيح PayPal أو بيانات Aiven لأي شخص.

## تشغيل محلي اختياري

```bash
npm ci
npm start
```

يتطلب التشغيل وجود `DATABASE_URL` في متغيرات البيئة. لا تضع القيمة داخل `server.mjs`.

## الدعم والصيانة

- بيانات المنتجات والأكواد والطلبات في MySQL، وليست في ملفات Render المؤقتة.
- احتفظ بنسخة احتياطية من Aiven قبل أي تغيير كبير.
- راقب `/api/health` وسجلات Render عند ظهور خطأ.
- GitHub يحفظ الكود فقط، وRender يشغل Node.js، وAiven يحفظ MySQL؛ كل خدمة لها وظيفة مختلفة.
