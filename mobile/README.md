# تطبيق BuildX HUE على المتاجر

تطبيق واحد للطلاب وفريق التدريب، بشاشة دخول واحدة:
- **الطالب** يكتب رقم الكارنيه ورمز الدخول (PIN) ← يدخل على لوحته (`#/me`).
- **عضو الفريق** يكتب الإيميل وكلمة المرور ← يدخل على لوحة الفريق (`#/staff`).

التطبيق بيعرف مين بيدخل من علامة `@`: لو فيه `@` يبقى إيميل فريق، ولو مفيش يبقى رقم طالب.

| | BuildX HUE |
|---|---|
| المعرّف (Bundle ID / Package) | `com.buildxhue.student` (سايبينه زي ما هو عشان ميتغيرش بعد ما اتسجّل) |
| المجلد | `mobile/app` |

التطبيق هو نفس BuildX App (`/app/`) متغلّف بـ [Capacitor](https://capacitorjs.com): الملفات جوه التطبيق نفسه، والبيانات من نفس قاعدة Supabase. أي تعديل في `src/portal` بيوصل للتطبيق في الإصدار الجاي. وشاشة الدخول الموحّدة نفسها موجودة على الموقع في `buildxhue.com/app`.

جوه التطبيق:
- الكاميرا شغالة على طول (مش محتاجة https)، والتصدير (CSV والنسخ الاحتياطية) بيفتح قائمة المشاركة.
- الطباعة (الشهادات وكروت الطلاب) بتفتح نفس الشاشة في المتصفح، لأن التطبيقات مبتطبعش.
- قفل البصمة / Face ID لأعضاء الفريق (اختياري، من «حسابي»).
- إشعارات الويب مش شغالة جوه التطبيق لسه. الإشعارات اللي بتتبعت بتوصل للي مفعّلها من المتصفح.

---

## 1. الأسرار في GitHub (مرة واحدة)

من **Settings → Secrets and variables → Actions → New repository secret** في الريبو:

| السر | منين |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | محتوى ملف `ANDROID_KEYSTORE_BASE64.txt` اللي اتبعتلك |
| `ANDROID_KEYSTORE_PASSWORD` | محتوى `ANDROID_KEYSTORE_PASSWORD.txt` |
| `ANDROID_KEY_ALIAS` | `buildx-upload` |
| `APPLE_TEAM_ID` | developer.apple.com ← Membership details ← Team ID (10 حروف) |
| `ASC_KEY_ID` | App Store Connect ← Users and Access ← Integrations ← App Store Connect API ← مفتاح جديد بصلاحية **Admin** ← Key ID |
| `ASC_ISSUER_ID` | نفس الصفحة، فوق: Issuer ID |
| `ASC_KEY_P8` | افتح ملف `AuthKey_XXXX.p8` اللي نزل (بيتنزل مرة واحدة بس) وانسخ كل محتواه |

> احتفظ بملف `buildx-upload.jks` والباسورد في مكان آمن برّه الريبو (مثلاً Google Drive خاص). ده مفتاح الرفع على Google Play. لو ضاع، Google بيقدر يغيّره، بس بياخد أيام.

## 2. البناء

**Actions ← Mobile apps ← Run workflow** واكتب رقم الإصدار (مثلاً `1.0.0`). بعد حوالي 20 دقيقة:
- **Android**: من صفحة الـ run نزّل `android`. جواه ملف `.aab` (للرفع على Play) وملف `.apk` (تجربه على موبايلك مباشرة).
  لو أسرار Android لسه مش متحطة، بيطلع بس `…-test.apk` تقدر تثبّته على أي موبايل أندرويد عشان تجرب (فعّل «التثبيت من مصادر غير معروفة»)، بس مينفعش يترفع على Play.
- **iOS**: بيترفع لوحده على App Store Connect، ويظهر في **TestFlight** بعد ما Apple تعالجه (5–30 دقيقة).

كل تشغيل بيدي رقم بناء أكبر من اللي قبله لوحده (100 + رقم التشغيل). لإصدار جديد بعدين: شغّل نفس الـ workflow برقم إصدار أكبر (`1.0.1`، `1.1.0`…).

## 3. Google Play Console

**Create app** ← الاسم `BuildX HUE`، اللغة الافتراضية العربية، App، Free.

1. **Testing ← Internal testing ← Create release** ← ارفع الـ `.aab` ← Save ← Review ← Start rollout. (أول رفع لازم يتعمل يدوي من الصفحة دي.)
   - وافق على **Play App Signing** لما يسألك (Google بيحفظ مفتاح التوقيع النهائي، وإحنا معانا مفتاح الرفع بس).
2. **Store presence ← Main store listing**: النصوص تحت، و `mobile/store/play-icon.png` و `feature-graphic.png` وصور `mobile/store/play/*.png`.
3. **Policy ← App content**:
   - Privacy policy: `https://github.com/Alaa2134/hue-robohub/blob/main/PRIVACY.md` (أو `https://buildxhue.com/ar/privacy/` بعد ما https يشتغل)
   - App access: **All or some functionality is restricted** ← أضف بيانات حساب المراجعة (تحت).
   - Ads: **No**
   - Content rating: املأ الاستبيان. التصنيف Education، والإجابة "لا" على كل حاجة (عنف، محتوى جنسي، مقامرة…)، فيطلع **Everyone / 3+**.
   - Target audience: **18 and over** (طلاب جامعة، وده بيبعد التطبيق عن قواعد تطبيقات الأطفال).
   - Data safety: الإجابات تحت.
   - Government app: No. Financial features: None. Health: None.
4. **حسابات شخصية اتعملت بعد نوفمبر 2023**: Google بتطلب **Closed testing** بـ 12 مختبر على الأقل لمدة 14 يوم قبل ما تقدر تنشر Production. اعمل Closed testing وضيف إيميلات 12 طالب/عضو، وابعتلهم لينك الاشتراك. حسابات الشركات (Organization) مش محتاجة ده.
5. بعد كده: **Production ← Create release** بنفس الـ `.aab` (أو أحدث) ← Send for review.

## 4. App Store Connect

1. **developer.apple.com ← Identifiers ← +** سجّل `com.buildxhue.student` (App ID، بدون Capabilities إضافية). (البناء من GitHub بيسجله لوحده لو نسيت، بس الأحسن تعملها الأول.)
2. **App Store Connect ← Apps ← + New App**: iOS، الاسم `BuildX HUE`، اللغة الأساسية Arabic، الـ Bundle ID، و SKU (مثلاً `buildx-hue`).
3. شغّل الـ workflow (خطوة 2). البناء هيظهر في **TestFlight**. جرّبه على موبايلك من تطبيق TestFlight.
4. صفحة الإصدار **1.0.0**:
   - الصور: `mobile/store/appstore/*.png` (مقاس 6.9 بوصة، 1290×2796). التطبيق للآيفون بس، فمحتاجش صور آيباد.
   - النصوص تحت. Category: **Education**. Age rating: املأ الاستبيان (كله None) فيطلع **4+**.
   - Support URL: `https://github.com/Alaa2134/hue-robohub/blob/main/SUPPORT.md`
   - Privacy Policy URL: `https://github.com/Alaa2134/hue-robohub/blob/main/PRIVACY.md` (أو `https://buildxhue.com/ar/privacy/` بعد ما https يشتغل)
   - **App Privacy**: الإجابات تحت.
   - **App Review Information**: Sign-in required ✓ وبيانات الحساب والملاحظات تحت.
   - Build: اختار البناء من TestFlight ← **Add for Review** ← Submit.
5. لو Apple سألت ليه في دخول للفريق: التطبيق لمجتمع جامعي، والحسابات (طلاب وفريق) بيعملها فريق المجتمع؛ ده مكتوب في ملاحظات المراجع تحت.
> **https للموقع**: لحد ما شهادة buildxhue.com تتفعل، استخدم لينك الخصوصية اللي على GitHub (فوق)، لأنه بيفتح بـ https دلوقتي ومحتواه هو نفس صفحة الموقع. ولما تصلّح الشهادة تقدر تغيّر اللينك. صلّحها من **Settings ← Pages** في الريبو: امسح الـ Custom domain واحفظ، وبعدين اكتب `buildxhue.com` تاني واحفظ، واستنى لحد ما يظهر ✓ وفعّل **Enforce HTTPS**.

---

## حسابات المراجعة (للمراجعين في Apple و Google)

**حساب طالب**: حساب تجريبي جاهز في مجموعة «تجريبي — مراجعة المتاجر» (فيها محتوى مثال).
- رقم الطالب: `900100`
- الرمز (PIN): اتبعتلك في الشات (مش مكتوب هنا عشان الريبو عام).

**حساب فريق (اختياري، عشان المراجع يشوف لوحة الفريق)**: من **الفريق ← إضافة** اعمل حساب بإيميل زي `review@buildxhue.com` وصلاحية **مدرّب** (أقل صلاحية). واكتب الإيميل وكلمة المرور المؤقتة في خانة المراجعة جنب حساب الطالب. بعد الموافقة عطّل الحسابين (الطالب التجريبي من شاشة الطلاب، وحساب المراجعة من شاشة الفريق)، وفعّلهم تاني قبل أي تحديث جاي.

**ملاحظات للمراجع (بالإنجليزي، انسخها زي ما هي):**

> BuildX HUE is the app of a student robotics & innovation community at Horus University (Egypt), for its students and its training team. Accounts are created by the community's training team; there is no in-app sign-up. One sign-in screen: students use their student number and PIN, team members their email and password; each lands on their own dashboard. Sign in with the demo accounts above. The camera is used only to scan attendance barcodes and event tickets. Account deletion: in the app, Account → "حذف حسابي" (Delete my account) sends a deletion request; the owner carries it out within 30 days (accounts are issued by the organisation).

---

## نصوص المتجر

### BuildX HUE

**الاسم**: BuildX HUE
**وصف قصير / Subtitle (30 حرف للـ App Store، 80 لـ Play)**: الكويزات والحضور والنقاط
**الوصف القصير لـ Play (80 حرف)**: المحتوى والكويزات والحضور للطلاب، والحضور بالباركود وإدارة الطلاب للفريق
**الكلمات المفتاحية (App Store)**: روبوتات,طلاب,كويز,حضور,باركود,جامعة حورس,BuildX,robotics,quiz,attendance

**الوصف (عربي)**:
> تطبيق مجتمع BuildX HUE للروبوتات والابتكار في جامعة حورس، للطلاب وفريق التدريب. دخول واحد: الطالب برقم الكارنيه ورمز الدخول، وعضو الفريق بالإيميل، وكل واحد بيدخل على لوحته على طول.
>
> للطلاب:
> • كل المحاضرات والملفات والفيديوهات اللي المدرب بيرفعها لمجموعتك، أول بأول.
> • كويزات بتتصحح لوحدها، وتعرف درجتك على طول.
> • سجل حضورك كامل: حاضر، متأخر، أو بعذر، ونسبة حضورك.
> • نقاط وأوسمة على الحضور والكويزات والفعاليات، وترتيبك في مجموعتك.
> • شهاداتك بكود تحقق يقدر أي حد يتأكد منه.
>
> لفريق التدريب:
> • سجّل الحضور بمسح باركود كارنيه الطالب بالكاميرا، حتى لو النت ضعيف.
> • الطلاب والمجموعات وأكواد الدخول والكروت.
> • ارفع المحاضرات والملفات واعمل كويزات بتتصحح لوحدها.
> • النقاط والشهادات والفعاليات وطلبات الانضمام ومحتوى الموقع.
>
> الحسابات بيعملها فريق BuildX HUE.

**Description (English)**:
> The app of BuildX HUE, the robotics & innovation community at Horus University, for its students and its training team. One sign-in: students use their student number and PIN, team members their email, and each lands on their own dashboard.
>
> For students:
> • Every lecture, file and video your coach shares with your group.
> • Auto-graded quizzes with instant scores.
> • Your full attendance record: present, late or excused.
> • Points and badges for attending, quizzes and events, and your rank in your group.
> • Your certificates, each with a verification code.
>
> For the training team:
> • Take attendance by scanning student ID barcodes with the camera, even on a weak connection.
> • Students, groups, sign-in codes and printable cards.
> • Share lectures and files and create auto-graded quizzes.
> • Points, certificates, events, applications and website content.
>
> Accounts are created by the BuildX HUE team.

---

## Google Play: Data safety

| السؤال | الإجابة |
|---|---|
| Does your app collect or share user data? | **Yes** (collect), **No** sharing |
| Is all data encrypted in transit? | **Yes** |
| Do you provide a way to request data deletion? | **Yes** (بالإيميل، مذكور في سياسة الخصوصية) |

البيانات اللي بنجمعها (كلها: Collected، مش Shared، Required، الغرض **App functionality** وللأخطاء **Analytics/App functionality**):

| النوع | للطلاب | للفريق |
|---|---|---|
| Personal info ← Name | ✓ | ✓ |
| Personal info ← Email address | – | ✓ |
| Personal info ← User IDs (رقم الطالب) | ✓ | ✓ |
| Photos and videos ← Photos | – | ✓ (اللي بيختار يرفعها) |
| Files and docs | – | ✓ (المحاضرات اللي بيرفعها) |
| App activity ← Other user-generated content (إجابات الكويزات) | ✓ | ✓ |
| App activity ← App interactions (الحضور) | ✓ | ✓ |
| App info and performance ← Crash logs / Diagnostics | ✓ | ✓ |

الكاميرا: مش "data collection" لأن الصورة مبتتخزنش ولا بتتبعت.

## App Store: App Privacy

- **Data Used to Track You**: لا شيء.
- **Data Linked to You** (الغرض **App Functionality**):
  - Contact Info ← Name (الاتنين)، Email Address (الفريق)
  - Identifiers ← User ID (الاتنين)
  - User Content ← Photos or Videos، Other User Content (الفريق: الصور والملفات؛ الطلاب: إجابات الكويزات)
  - Usage Data ← Product Interaction (الحضور)
- **Data Not Linked to You**: Diagnostics ← Crash Data (رسائل الأخطاء)

---

## للمطوّرين

```bash
node scripts/build-static.mjs            # الموقع + BuildX App ← out-static/
node scripts/build-native.mjs            # ← mobile/app/www
cd mobile && npm ci && npm run sync      # ينسخهم لمشاريع Android و iOS
node scripts/configure.mjs               # (بعد أي `npx cap add`) الأذونات والتوقيع وآيفون بس
node scripts/icons.mjs                   # مصادر الأيقونات والـ splash وصور Play، وبعدين في mobile/app:
npx @capacitor/assets generate --android --ios
node scripts/screenshots.mjs             # صور المتاجر ببيانات وهمية ← mobile/store/
```

- `src/portal/core.ts`: `isNative()`، `publicOrigin()` للينكات اللي بتتشارك، و `download()` اللي جوه التطبيق بيستخدم Filesystem + Share.
- فتح المشروع على Mac: `cd mobile/app && npx cap open ios` (Xcode 26+) أو `npx cap open android`.
