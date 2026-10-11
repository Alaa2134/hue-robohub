# حماية الموقع بـ Cloudflare (مجاني)

الموقع (buildxhue.com) مستضاف على GitHub Pages. GitHub Pages ما عندهوش جدار حماية ولا بيقدر يحط security headers. لما نحط Cloudflare قدامه بنكسب الحاجات دي:

- صد هجمات الإغراق (DDoS) قبل ما توصل للموقع.
- حظر البوتات والطلبات المشبوهة.
- كاش قريب من الزوار، فالموقع يبقى أسرع ويستحمل زيارات أكتر بكتير.
- security headers حقيقية: HSTS، ومنع فتح الموقع جوه iframe، وغيرهم.

قاعدة البيانات (Supabase) ليها حماية لوحدها اتعملت قبل كده. فيها حد لعدد الطلبات، وحظر تلقائي للعناوين اللي بتهاجم، وبوابة قدام الـ API كلها. يعني الخطوات اللي هنا خاصة بالموقع نفسه بس.

> كل ده بيتعمل من حسابك على Cloudflare وعند مزوّد الدومين. محدش بيحتاج يبعتلك أو يبعتله أي باسورد.

## الطريقة السريعة: زرار واحد بيعمل كل الإعدادات

فيه workflow اسمه **Cloudflare** بيعمل الخطوات من 2 لـ 6 لوحده عن طريق الـ API. مش بيمسح أي سجل DNS، ولو فيه قاعدة إنت عاملها بإيدك بيسيبها زي ما هي. اللي عليك:

1. **ضيف الدومين** على Cloudflare (الخطوة 1 تحت).
2. **غيّر الـ Nameservers** عند مزوّد الدومين للاتنين اللي Cloudflare بيديهوملك.
3. **اعمل توكن:** من **My Profile ← API Tokens ← Create Token ← Create Custom Token**:
   - Permissions (كلهم **Zone**):
     - Zone → Read
     - DNS → Edit
     - Zone Settings → Edit
     - Zone WAF → Edit
     - Cache Rules → Edit
     - Transform Rules → Edit
     - Bot Management → Edit
     - Cache Purge → Purge
   - Zone Resources: **Include ← Specific zone ← buildxhue.com**
4. **حط التوكن في GitHub:** من الـ repo افتح **Settings ← Secrets and variables ← Actions ← New repository secret**، الاسم `CLOUDFLARE_API_TOKEN` والقيمة هي التوكن. متبعتهوش لحد ومتحطهوش في أي ملف.
5. **دوس الزرار:** من **Actions ← Cloudflare ← Run workflow**. هيكتبلك تقرير بالعربي بكل اللي عمله، ولو التوكن ناقصه صلاحية هيقولك اسمها بالظبط.
6. **بعد ما الدومين يبقى Active** (Cloudflare بيبعتلك إيميل) وشهادة HTTPS في **Settings ← Pages** تشتغل، دوس الزرار تاني. المرة دي هيشغّل الحماية (السحابة البرتقاني).

لو عايز تشوف هيعمل إيه من غير ما يغيّر حاجة، اختار **check** بدل **apply**.

الخطوات اللي تحت هي نفس اللي الزرار بيعمله، لو حبيت تعملها بإيدك أو تراجعها.

## 1. ضيف الدومين على Cloudflare

1. اعمل حساب على [dash.cloudflare.com](https://dash.cloudflare.com)، وبعدين **Add a domain** واكتب `buildxhue.com` واختار الخطة **Free**.
2. Cloudflare هيقرا سجلات الـ DNS الحالية. اتأكد إن السجلات دي موجودة:

   | Type | Name | Content |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `<اسم-حساب-GitHub>.github.io` |

   وأي سجلات تانية للإيميل (MX/TXT) سيبها زي ما هي.
3. خلّي سجلات الـ A والـ www **DNS only** (السحابة رمادي) في الأول. السبب إن GitHub لازم يجدد شهادة الـ HTTPS وهو شايف الدومين مباشرة.
4. Cloudflare هيديك اتنين **Nameservers**. ادخل عند مزوّد الدومين وغيّر الـ Nameservers للاتنين دول. التغيير بياخد من دقايق لحد 24 ساعة.

## 2. شغّل الحماية

بعد ما Cloudflare يقولك إن الدومين **Active**:

1. في GitHub افتح **Settings ← Pages** وتأكد إن **Enforce HTTPS** متعلّم والشهادة شغالة.
2. في Cloudflare افتح **DNS** وحوّل سجلات الـ A والـ www لـ **Proxied** (السحابة برتقاني).
3. **SSL/TLS ← Overview**: اختار **Full (strict)**.
4. **SSL/TLS ← Edge Certificates**: شغّل **Always Use HTTPS** و**Automatic HTTPS Rewrites**. شغّل كمان **HSTS** بالإعدادات دي: `max-age 6 months`، و`includeSubDomains`، و`No-Sniff`.
5. **Security ← Settings**: خلّي **Security level** على **Medium**، وشغّل **Browser Integrity Check**. سيب **Bot Fight Mode** مقفول. في الخطة المجانية مفيش قاعدة تقدر تعدّي حاجة منه، وبيصدّ أي طلب جاي من سيرفر. ده معناه إنه بيقفل الموقع على المراقبة اللي بتشتغل كل ساعة، وعلى بقلظ وهو بيقرا ملف معلومات الموقع.
6. **Speed ← Optimization**: اقفل **Rocket Loader** واقفل **Email Address Obfuscation**. الاتنين بيعدّلوا في سكريبتات الصفحة وبيبوّظوا تحميلها.

## 3. قواعد الحظر (Security ← WAF ← Custom rules)

الخطة المجانية بتسمح بـ 5 قواعد. ضيف دول:

1. **حظر مسارات بيدوّر عليها المهاجمين** (الموقع ما فيهوش أي حاجة منها):
   - Expression:
     ```
     (http.request.uri.path contains "/wp-") or (http.request.uri.path contains "xmlrpc") or (http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "phpmyadmin") or (ends_with(http.request.uri.path, ".php"))
     ```
   - Action: **Block**
2. **تحدي للطلبات اللي شكلها بوت** (من غير ما يأثر على جوجل):
   - Expression: `(cf.threat_score gt 14 and not cf.client.bot)`
   - Action: **Managed Challenge**
3. **طرق مش مستخدمة**: الموقع ثابت وبيستقبل GET بس.
   - Expression: `not http.request.method in {"GET" "HEAD" "OPTIONS"}`
   - Action: **Block**

## 4. حد لعدد الطلبات (Security ← WAF ← Rate limiting rules)

قاعدة واحدة مجانية:

- If (الصفحات بس، مش الصور والملفات):
  ```
  not starts_with(http.request.uri.path, "/_next/") and not starts_with(http.request.uri.path, "/media/") and not starts_with(http.request.uri.path, "/voice/")
  ```
- العدد: **60 طلب في 10 ثواني لنفس الـ IP**
- Action: **Block** لمدة 10 ثواني

الزائر العادي بيفتح صفحة أو اتنين في الـ 10 ثواني. يعني حتى لو 20 طالب في الجامعة طالعين من نفس الـ IP، القاعدة دي مش هتوقفهم، لكنها بتوقف أي سكريبت بيضرب الموقع.

## 5. الكاش (Caching ← Cache Rules)

1. **ملفات البناء** (اسمها بيتغير مع كل تحديث، فممكن تتخزن لمدة طويلة):
   - If: `starts_with(http.request.uri.path, "/_next/static/")` أو `starts_with(http.request.uri.path, "/media/")`
   - **Eligible for cache**، و**Edge TTL**: سنة، و**Browser TTL**: سنة.
2. **الصفحات**: عشان تستحمل الزحمة.
   - If: كل الطلبات (`http.request.uri.path wildcard "/*"`)
   - **Eligible for cache**، و**Edge TTL**: دقيقتين.

الموقع بيمسح كاش Cloudflare لوحده بعد كل تحديث (شوف الخطوة 7)، فأي تعديل بيظهر علطول.

## 6. Security headers (Rules ← Transform Rules ← Modify Response Header)

اعمل قاعدة واحدة لكل الطلبات وضيف فيها:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

الكاميرا والمايك مسموحين للموقع نفسه بس. السبب إن الـ QR وتسجيل صوت بقلظ محتاجينهم.

## 7. مسح الكاش لوحده بعد كل تحديث

1. في Cloudflare افتح **My Profile ← API Tokens ← Create Token ← Custom token**:
   - Permissions: **Zone ← Cache Purge ← Purge**
   - Zone Resources: **Include ← Specific zone ← buildxhue.com**
2. في GitHub افتح الـ repo، وبعدين **Settings ← Secrets and variables ← Actions**:
   - **Secrets**: ضيف `CLOUDFLARE_API_TOKEN` وحط فيه التوكن.
   - **Variables**: ضيف `CLOUDFLARE_ZONE_ID`. هتلاقيه في صفحة الدومين على Cloudflare، على اليمين تحت **API**.

بعد كده الـ workflow اللي اسمه «Deploy site» بيمسح الكاش لوحده بعد كل نشر. لو السيكرت مش موجود، الخطوة دي بتتخطّى ومفيش حاجة بتتأثر.

## 8. وقت الهجوم

لو الموقع اتضرب ضرب جامد، شغّل من **Overview** في Cloudflare زرار **Under Attack Mode**. كل زائر هيعدّي على فحص سريع لمدة كام ثانية. اقفله لما الهجوم يخلص.
