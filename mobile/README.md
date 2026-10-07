# تطبيقات BuildX على المتاجر

| | BuildX HUE (الطلاب) | BuildX Team (فريق التدريب) |
|---|---|---|
| المعرّف (Bundle ID / Package) | `com.buildxhue.student` | `com.buildxhue.team` |
| المجلد | `mobile/student` | `mobile/team` |
| بيفتح على | دخول الطلاب ← `#/me` | دخول الفريق ← `#/staff` |

التطبيقان هما نفس BuildX App (`/app/`) متغلّف بـ [Capacitor](https://capacitorjs.com): الملفات جوه التطبيق نفسه، والبيانات من نفس قاعدة Supabase. أي تعديل في `src/portal` بيوصل للتطبيقات في الإصدار الجاي.

جوه التطبيقات:
- كل تطبيق بيعرض جانبه بس: تطبيق الطلاب مفيهوش دخول الفريق، والعكس.
- الكاميرا شغالة على طول (مش محتاجة https)، والتصدير (CSV والنسخ الاحتياطية) بيفتح قائمة المشاركة.
- الطباعة (الشهادات وكروت الطلاب) بتفتح نفس الشاشة في المتصفح، لأن التطبيقات مبتطبعش.
- إشعارات الويب مش شغالة جوه التطبيقات لسه. الإشعارات اللي بتتبعت بتوصل للي مفعّلها من المتصفح.

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
- **Android**: من صفحة الـ run نزّل `android-student` و `android-team`. جوا كل واحد ملف `.aab` (للرفع على Play) وملف `.apk` (تجربه على موبايلك مباشرة).
  لو أسرار Android لسه مش متحطة، بيطلع بس `…-test.apk` تقدر تثبّته على أي موبايل أندرويد عشان تجرب (فعّل «التثبيت من مصادر غير معروفة»)، بس مينفعش يترفع على Play.
- **iOS**: بيترفع لوحده على App Store Connect، ويظهر في **TestFlight** بعد ما Apple تعالجه (5–30 دقيقة).

كل تشغيل بيدي رقم بناء أكبر من اللي قبله لوحده (100 + رقم التشغيل). لإصدار جديد بعدين: شغّل نفس الـ workflow برقم إصدار أكبر (`1.0.1`، `1.1.0`…).

## 3. Google Play Console

لكل تطبيق: **Create app** ← الاسم (`BuildX HUE` / `BuildX Team`)، اللغة الافتراضية العربية، App، Free.

1. **Testing ← Internal testing ← Create release** ← ارفع الـ `.aab` ← Save ← Review ← Start rollout. (أول رفع لازم يتعمل يدوي من الصفحة دي.)
   - وافق على **Play App Signing** لما يسألك (Google بيحفظ مفتاح التوقيع النهائي، وإحنا معانا مفتاح الرفع بس).
2. **Store presence ← Main store listing**: النصوص تحت، و `mobile/store/<app>/play-icon.png` و `feature-graphic.png` وصور `mobile/store/<app>/play/*.png`.
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

1. **developer.apple.com ← Identifiers ← +** سجّل `com.buildxhue.student` و `com.buildxhue.team` (App IDs, بدون Capabilities إضافية). (البناء من GitHub بيسجلهم لوحده لو نسيت، بس الأحسن تعملها الأول.)
2. **App Store Connect ← Apps ← + New App** لكل واحد: iOS، الاسم، اللغة الأساسية Arabic، الـ Bundle ID، و SKU (مثلاً `buildx-student`).
3. شغّل الـ workflow (خطوة 2). البناء هيظهر في **TestFlight**. جرّبه على موبايلك من تطبيق TestFlight.
4. صفحة الإصدار **1.0.0**:
   - الصور: `mobile/store/<app>/appstore/*.png` (مقاس 6.9 بوصة، 1290×2796). التطبيق للآيفون بس، فمحتاجش صور آيباد.
   - النصوص تحت. Category: **Education**. Age rating: املأ الاستبيان (كله None) فيطلع **4+**.
   - Support URL: `https://github.com/Alaa2134/hue-robohub/blob/main/SUPPORT.md`
   - Privacy Policy URL: `https://github.com/Alaa2134/hue-robohub/blob/main/PRIVACY.md` (أو `https://buildxhue.com/ar/privacy/` بعد ما https يشتغل)
   - **App Privacy**: الإجابات تحت.
   - **App Review Information**: Sign-in required ✓ وبيانات الحساب والملاحظات تحت.
   - Build: اختار البناء من TestFlight ← **Add for Review** ← Submit.
5. **تطبيق الفريق**: لو Apple رفضته على أساس إنه لجهة معيّنة بس (Guideline 3.2 / 2.1)، اطلب **Unlisted App Distribution** من `developer.apple.com/contact/request/unlisted-app` بعد الموافقة. التطبيق ساعتها بيتنزل بلينك مباشر بس ومش بيظهر في البحث.

> **https للموقع**: لحد ما شهادة buildxhue.com تتفعل، استخدم لينك الخصوصية اللي على GitHub (فوق)، لأنه بيفتح بـ https دلوقتي ومحتواه هو نفس صفحة الموقع. ولما تصلّح الشهادة تقدر تغيّر اللينك. صلّحها من **Settings ← Pages** في الريبو: امسح الـ Custom domain واحفظ، وبعدين اكتب `buildxhue.com` تاني واحفظ، واستنى لحد ما يظهر ✓ وفعّل **Enforce HTTPS**.

---

## حسابات المراجعة (للمراجعين في Apple و Google)

**تطبيق الطلاب**: حساب طالب تجريبي جاهز في مجموعة «تجريبي — مراجعة المتاجر» (فيها محتوى مثال).
- رقم الطالب: `900100`
- الرمز (PIN): اتبعتلك في الشات (مش مكتوب هنا عشان الريبو عام).

**تطبيق الفريق**: اعمل حساب من تطبيق الفريق ← **الفريق ← إضافة** بإيميل زي `review@buildxhue.com` وصلاحية **مدرّب** (أقل صلاحية). واكتب الإيميل وكلمة المرور المؤقتة في خانة المراجعة. بعد الموافقة عطّل الحسابين (الطالب التجريبي من شاشة الطلاب، وحساب المراجعة من شاشة الفريق)، وفعّلهم تاني قبل أي تحديث جاي.

**ملاحظات للمراجع (بالإنجليزي، انسخها زي ما هي):**

> BuildX HUE is the app of a student robotics & innovation community at Horus University (Egypt). Accounts are created by the community's training team; there is no in-app sign-up. Sign in with the demo account above. The camera is used only to scan attendance barcodes and event tickets (team app). Account deletion: users request it by email (see the privacy policy) because accounts are issued by the organisation.

---

## نصوص المتجر

### BuildX HUE (الطلاب)

**الاسم**: BuildX HUE
**وصف قصير / Subtitle (30 حرف للـ App Store، 80 لـ Play)**: المحتوى والكويزات والحضور والنقاط
**الكلمات المفتاحية (App Store)**: روبوتات,طلاب,كويز,حضور,جامعة حورس,BuildX,robotics,quiz,attendance,STEM

**الوصف (عربي)**:
> تطبيق طلاب مجتمع BuildX HUE للروبوتات والابتكار في جامعة حورس.
>
> • كل المحاضرات والملفات والفيديوهات اللي المدرب بيرفعها لمجموعتك، أول بأول.
> • كويزات بتتصحح لوحدها، وتعرف درجتك على طول.
> • سجل حضورك كامل: حاضر، متأخر، أو بعذر، ونسبة حضورك.
> • نقاط وأوسمة على الحضور والكويزات والفعاليات، وترتيبك في مجموعتك.
> • شهاداتك بكود تحقق يقدر أي حد يتأكد منه.
>
> الدخول برقمك الجامعي والرمز اللي المدرب بيديهولك.

**Description (English)**:
> The student app of BuildX HUE, the robotics & innovation community at Horus University.
>
> • Every lecture, file and video your coach shares with your group.
> • Auto-graded quizzes with instant scores.
> • Your full attendance record: present, late or excused.
> • Points and badges for attending, quizzes and events, and your rank in your group.
> • Your certificates, each with a verification code.
>
> Sign in with your student number and the PIN from your coach.

### BuildX Team (فريق التدريب)

**الاسم**: BuildX Team
**وصف قصير / Subtitle**: الحضور بالباركود وإدارة الطلاب
**الكلمات المفتاحية**: حضور,باركود,طلاب,مدرب,كويز,BuildX,attendance,barcode,coach,LMS

**الوصف (عربي)**:
> تطبيق فريق التدريب في مجتمع BuildX HUE.
>
> • سجّل الحضور بمسح باركود كارنيه الطالب بالكاميرا، حتى لو النت ضعيف.
> • الطلاب والمجموعات وأكواد الدخول وكروت الطلاب.
> • ارفع المحاضرات والملفات واعمل كويزات بتتصحح لوحدها.
> • النقاط والأوسمة وترتيب الطلاب، ونقاط تقدير للمتميزين.
> • الشهادات، الفعاليات وتسجيل الدخول بالتذاكر، طلبات الانضمام، ومحتوى الموقع.
> • زيارات الموقع والأمان والنسخ الاحتياطية للمالك والمشرفين.
>
> للأعضاء اللي عندهم حساب في فريق BuildX HUE فقط.

**Description (English)**:
> The training team's app for BuildX HUE.
>
> • Take attendance by scanning student ID barcodes with the camera, even on a weak connection.
> • Students, groups, sign-in codes and printable cards.
> • Share lectures and files and create auto-graded quizzes.
> • Points, badges and rankings, plus bonus points for standout students.
> • Certificates, events with ticket check-in, applications and website content.
> • Site visits, security and backups for owners and admins.
>
> For BuildX HUE team members with an account.

---

## Google Play: Data safety

| السؤال | الإجابة |
|---|---|
| Does your app collect or share user data? | **Yes** (collect), **No** sharing |
| Is all data encrypted in transit? | **Yes** |
| Do you provide a way to request data deletion? | **Yes** (بالإيميل، مذكور في سياسة الخصوصية) |

البيانات اللي بنجمعها (كلها: Collected، مش Shared، Required، الغرض **App functionality** وللأخطاء **Analytics/App functionality**):

| النوع | الطلاب | الفريق |
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
node scripts/build-native.mjs            # ← mobile/student/www و mobile/team/www
cd mobile && npm ci && npm run sync      # ينسخهم لمشاريع Android و iOS
node scripts/configure.mjs               # (بعد أي `npx cap add`) الأذونات والتوقيع وآيفون بس
node scripts/icons.mjs                   # مصادر الأيقونات والـ splash وصور Play، وبعدين في كل تطبيق:
npx @capacitor/assets generate --android --ios
node scripts/screenshots.mjs             # صور المتاجر ببيانات وهمية ← mobile/store/
```

- `src/portal/core.ts`: `isNative()`، `appMode()` (طلاب/فريق، من صفحة البداية)، `publicOrigin()` للينكات اللي بتتشارك، و `download()` اللي جوه التطبيق بيستخدم Filesystem + Share.
- فتح المشروع على Mac: `cd mobile/student && npx cap open ios` (Xcode 26+) أو `npx cap open android`.
