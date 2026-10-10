-- "مواقع هتفيدك" from the app: the team adds, edits, orders and hides sites (the "site" area), and visitors
-- suggest sites from the page (rate-limited, with the bot trap); the team reviews suggestions and adds
-- the good ones. The site shows the published list (read at build time and refreshed in the browser).
-- Starts with the 48 sites that were in the code.

create table if not exists public.directory_sites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  url text not null check (char_length(url) <= 300 and url ~ '^https://[^[:space:]<>"]{4,}$'),
  cat text not null check (cat in ('electronics', 'cad', 'ai', 'robotics', 'iot', 'code', 'ideas', 'learn', 'tools')),
  price text not null default 'free' check (price in ('free', 'freemium', 'student')),
  idea_ar text not null check (char_length(idea_ar) between 5 and 400),
  tip_ar text not null default '' check (char_length(tip_ar) <= 300),
  idea_en text not null default '' check (char_length(idea_en) <= 400),
  tip_en text not null default '' check (char_length(tip_en) <= 300),
  sort_order int not null default 0,
  published boolean not null default true,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.directory_sites enable row level security;
create policy directory_sites_public on public.directory_sites for select to anon, authenticated using (published);
create policy directory_sites_staff_read on public.directory_sites for select to authenticated using ((select private.can_read('site')));
create policy directory_sites_insert on public.directory_sites for insert to authenticated with check ((select private.can('site')));
create policy directory_sites_update on public.directory_sites for update to authenticated
  using ((select private.can('site'))) with check ((select private.can('site')));
grant select on public.directory_sites to anon;
grant select, insert, update on public.directory_sites to authenticated;

create table if not exists public.directory_suggestions (
  id uuid primary key default gen_random_uuid(),
  url text not null check (char_length(url) <= 300 and url ~ '^https?://[^[:space:]<>"]{4,}$'),
  name text check (name is null or char_length(name) <= 60),
  why text not null check (char_length(btrim(why)) between 5 and 500),
  contact text check (contact is null or char_length(contact) <= 120),
  locale text not null default 'ar',
  status text not null default 'new' check (status in ('new', 'added', 'declined')),
  created_at timestamptz not null default now()
);
alter table public.directory_suggestions enable row level security;
create policy directory_suggestions_read on public.directory_suggestions for select to authenticated using ((select private.can_read('site')));
create policy directory_suggestions_update on public.directory_suggestions for update to authenticated
  using ((select private.can('site'))) with check ((select private.can('site')));
revoke all on public.directory_suggestions from anon;
grant select, update on public.directory_suggestions to authenticated;

/** Public: suggest a site (5 an hour per address; bots get a quiet "ok"). */
create or replace function public.suggest_site(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.throttle('suggest_site', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p ->> 'website', '') <> '' or private.form_ms(p ->> 'elapsed') < 1500 then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'suggest_site'));
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.directory_suggestions where created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  begin
    insert into public.directory_suggestions (url, name, why, contact, locale)
    values (btrim(p ->> 'url'), nullif(left(btrim(p ->> 'name'), 60), ''), btrim(p ->> 'why'),
            nullif(left(btrim(p ->> 'contact'), 120), ''), case when p ->> 'locale' = 'en' then 'en' else 'ar' end);
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.suggest_site(jsonb) from public;
grant execute on function public.suggest_site(jsonb) to anon, authenticated;

insert into public.directory_sites (slug, name, url, cat, price, idea_ar, tip_ar, idea_en, tip_en, sort_order) values
  ($q$wokwi$q$, $q$Wokwi$q$, $q$https://wokwi.com/$q$, $q$electronics$q$, $q$freemium$q$, $q$محاكي Arduino و ESP32 و Raspberry Pi Pico في المتصفح: توصّل الدايرة وتكتب الكود وتشغّله من غير ما تشتري ولا قطعة.$q$, $q$جرّب مشروع «ESP32 + شاشة OLED» وغيّر في الكود وشوف النتيجة علطول.$q$, $q$Arduino, ESP32 and Pico simulator in the browser: wire the circuit, write the code and run it without buying a part.$q$, $q$Open an ESP32 + OLED example and change the code live.$q$, 10),
  ($q$tinkercad$q$, $q$Tinkercad$q$, $q$https://www.tinkercad.com/$q$, $q$electronics$q$, $q$free$q$, $q$من Autodesk: دواير Arduino بالسحب والإفلات ومحاكاة بالبريدبورد، وكمان تصميم 3D بسيط. أحسن بداية لأي حد جديد.$q$, $q$ادخل Circuits واعمل LED بيرعش بـ Arduino في 5 دقايق.$q$, $q$Autodesk's visual Arduino circuits with a breadboard simulator, plus simple 3D design. The best first step.$q$, $q$In Circuits, blink an LED with an Arduino in five minutes.$q$, 20),
  ($q$falstad$q$, $q$Falstad Circuit Simulator$q$, $q$https://www.falstad.com/circuit/$q$, $q$electronics$q$, $q$free$q$, $q$محاكي دواير بيوريك التيار وهو ماشي في الأسلاك. أحلى حاجة تفهم بيها الترانزستور والمكثف والـ op-amp.$q$, $q$افتح Circuits ← Transistors وغيّر قيم المقاومات وشوف إيه اللي بيحصل.$q$, $q$A circuit simulator that animates current flowing through the wires: the clearest way to understand transistors, capacitors and op-amps.$q$, $q$Open Circuits → Transistors and change the resistor values.$q$, 30),
  ($q$easyeda$q$, $q$EasyEDA$q$, $q$https://easyeda.com/$q$, $q$electronics$q$, $q$free$q$, $q$ترسم الـ schematic وتعمل PCB من المتصفح، ومربوط بمكتبة قطع LCSC وبتطلب البوردة مصنّعة بكام دولار.$q$, $q$اعمل بوردة صغيرة لحساس واطلبها من JLCPCB.$q$, $q$Schematics and PCB layout in the browser, linked to the LCSC parts library, and you can order the board for a few dollars.$q$, $q$Design a small sensor board and order it from JLCPCB.$q$, 40),
  ($q$kicad$q$, $q$KiCad$q$, $q$https://www.kicad.org/$q$, $q$electronics$q$, $q$free$q$, $q$برنامج تصميم PCB احترافي ومفتوح المصدر، بتستخدمه شركات حقيقية. لو هتكمّل في الإلكترونيات اتعلّمه.$q$, $q$ابدأ بـ «Getting Started» واعمل بوردة LED بمقاومة.$q$, $q$Professional open-source PCB design used by real companies. Learn it if you're going deep into electronics.$q$, $q$Follow Getting Started and make an LED + resistor board.$q$, 50),
  ($q$octopart$q$, $q$Octopart$q$, $q$https://octopart.com/$q$, $q$electronics$q$, $q$free$q$, $q$محرك بحث للقطع الإلكترونية: الداتاشيت والأسعار والبدائل من كل الموزعين في مكان واحد.$q$, $q$دوّر على L298N وشوف الداتاشيت والبدائل الأحدث منه.$q$, $q$A search engine for electronic parts: datasheets, prices and alternatives from every distributor in one place.$q$, $q$Search L298N and compare it with newer alternatives.$q$, 60),
  ($q$randomnerd$q$, $q$Random Nerd Tutorials$q$, $q$https://randomnerdtutorials.com/$q$, $q$electronics$q$, $q$free$q$, $q$شروحات خطوة بخطوة لـ ESP32 و ESP8266 و Arduino بالكود والتوصيل، تقريبًا لأي حساس هتحتاجه.$q$, $q$اعمل «ESP32 Web Server» تتحكم منه في LED من الموبايل.$q$, $q$Step-by-step ESP32, ESP8266 and Arduino guides with code and wiring for almost any sensor.$q$, $q$Build the ESP32 web server and switch an LED from your phone.$q$, 70),
  ($q$adafruit$q$, $q$Adafruit Learning System$q$, $q$https://learn.adafruit.com/$q$, $q$electronics$q$, $q$free$q$, $q$آلاف المشاريع والشروحات المرتبة من Adafruit، من أول اللحام لحد الـ CircuitPython والـ wearables.$q$, $q$اقرا «Adafruit Guide to Excellent Soldering» قبل أول لحام.$q$, $q$Thousands of tidy projects and guides from Adafruit, from soldering to CircuitPython and wearables.$q$, $q$Read the Guide to Excellent Soldering before your first joint.$q$, 80),
  ($q$platformio$q$, $q$PlatformIO$q$, $q$https://platformio.org/$q$, $q$electronics$q$, $q$free$q$, $q$إضافة لـ VS Code بتخليك تبرمج Arduino و ESP32 و STM32 زي المحترفين: مكتبات، autocomplete، وdebugging.$q$, $q$انقل مشروع Arduino IDE بتاعك لـ PlatformIO وشوف الفرق.$q$, $q$A VS Code extension to program Arduino, ESP32 and STM32 like a pro: libraries, autocomplete and debugging.$q$, $q$Move one Arduino IDE sketch into PlatformIO.$q$, 90),
  ($q$onshape$q$, $q$Onshape$q$, $q$https://www.onshape.com/$q$, $q$cad$q$, $q$student$q$, $q$CAD احترافي بيشتغل في المتصفح وحتى على الموبايل، والفريق كله يعدّل في نفس التصميم في نفس الوقت. مجاني للطلبة.$q$, $q$اعمل حساب Education وصمّم chassis لروبوت صغير مع زمايلك.$q$, $q$Professional CAD in the browser (even on a phone) where the whole team edits one design together. Free for students.$q$, $q$Get an Education account and design a small robot chassis as a team.$q$, 100),
  ($q$fusion$q$, $q$Autodesk Fusion$q$, $q$https://www.autodesk.com/products/fusion-360/personal$q$, $q$cad$q$, $q$student$q$, $q$تصميم ميكانيكي وتجميعات ومحاكاة إجهاد وكمان CAM للـ CNC، في برنامج واحد. مجاني للطلبة وللاستخدام الشخصي.$q$, $q$صمّم bracket لموتور واعمله stress analysis قبل ما تطبعه.$q$, $q$Mechanical design, assemblies, stress simulation and CAM in one program. Free for students and personal use.$q$, $q$Design a motor bracket and run a stress study before printing it.$q$, 110),
  ($q$freecad$q$, $q$FreeCAD$q$, $q$https://www.freecad.org/$q$, $q$cad$q$, $q$free$q$, $q$CAD مفتوح المصدر ومجاني بالكامل من غير اشتراك، بيشتغل على أي جهاز ومن غير نت.$q$, $q$جرّب الـ Part Design workbench واعمل علبة لمشروعك.$q$, $q$Fully free open-source CAD with no subscription; works on any computer, offline.$q$, $q$Use the Part Design workbench to make an enclosure.$q$, 120),
  ($q$printables$q$, $q$Printables$q$, $q$https://www.printables.com/$q$, $q$cad$q$, $q$free$q$, $q$مكتبة ضخمة لموديلات جاهزة للطباعة 3D من Prusa: قطع روبوتات، أدوات، علب، وحاجات للمعمل.$q$, $q$دوّر على «robot arm» ونزّل واحدة اطبعها في المعمل.$q$, $q$Prusa's huge library of print-ready models: robot parts, tools, enclosures and lab helpers.$q$, $q$Search “robot arm” and print one in the lab.$q$, 130),
  ($q$thingiverse$q$, $q$Thingiverse$q$, $q$https://www.thingiverse.com/$q$, $q$cad$q$, $q$free$q$, $q$أقدم وأكبر مكتبة تصميمات 3D مجانية. فيها تقريبًا قطعة جاهزة لأي فكرة في دماغك.$q$, $q$دوّر على «servo mount» قبل ما تصمم واحد من الأول.$q$, $q$The oldest and largest free library of 3D designs, with a ready part for almost any idea.$q$, $q$Look for a “servo mount” before designing your own.$q$, 140),
  ($q$grabcad$q$, $q$GrabCAD Library$q$, $q$https://grabcad.com/library$q$, $q$cad$q$, $q$free$q$, $q$موديلات CAD لقطع حقيقية (موتورات، حساسات، بوردات) عشان تحطها في تجميعة الروبوت بمقاساتها الصح.$q$, $q$نزّل موديل Arduino Uno وحطه في تصميمك عشان تظبط أماكن المسامير.$q$, $q$CAD models of real parts (motors, sensors, boards) to place in your robot assembly at the right size.$q$, $q$Download an Arduino Uno model to place your mounting holes.$q$, 150),
  ($q$colab$q$, $q$Google Colab$q$, $q$https://colab.research.google.com/$q$, $q$ai$q$, $q$freemium$q$, $q$Python في المتصفح ومعاه GPU مجاني. تدرّب موديلات ذكاء اصطناعي من غير ما يكون عندك جهاز قوي.$q$, $q$افتح notebook جديد وشغّل «Runtime ← Change runtime type ← GPU».$q$, $q$Python in the browser with a free GPU: train AI models without a powerful computer.$q$, $q$Open a notebook and switch the runtime to GPU.$q$, 160),
  ($q$kaggle$q$, $q$Kaggle$q$, $q$https://www.kaggle.com/$q$, $q$ai$q$, $q$free$q$, $q$داتاسيتس جاهزة ومسابقات وكورسات قصيرة في الـ ML، وتقدر تشوف حلول الناس وتتعلم منها.$q$, $q$خلّص كورس «Intro to Machine Learning» وادخل مسابقة Titanic.$q$, $q$Ready datasets, competitions and short ML courses, with other people's solutions to learn from.$q$, $q$Finish Intro to Machine Learning, then try the Titanic competition.$q$, 170),
  ($q$huggingface$q$, $q$Hugging Face$q$, $q$https://huggingface.co/$q$, $q$ai$q$, $q$freemium$q$, $q$أكبر مكان للموديلات المفتوحة: نصوص وصور وصوت. تجرب أي موديل من المتصفح وتستخدمه في مشروعك بكام سطر.$q$, $q$ادخل Spaces وجرب موديل بيوصف الصور، وبعدين استخدمه في Colab.$q$, $q$The home of open models for text, images and audio: try any of them in the browser and use it in a few lines.$q$, $q$Try an image-captioning Space, then call it from Colab.$q$, 180),
  ($q$teachable$q$, $q$Teachable Machine$q$, $q$https://teachablemachine.withgoogle.com/$q$, $q$ai$q$, $q$free$q$, $q$تدرّب موديل يتعرف على صور أو أصوات أو حركات من الكاميرا في دقايق، من غير كود، وتصدّره لمشروعك.$q$, $q$علّمه يفرق بين 3 حركات بإيدك وشغّل بيها روبوت.$q$, $q$Train an image, sound or pose classifier from your webcam in minutes with no code, then export it.$q$, $q$Teach it three hand gestures and drive a robot with them.$q$, 190),
  ($q$roboflow$q$, $q$Roboflow$q$, $q$https://roboflow.com/$q$, $q$ai$q$, $q$freemium$q$, $q$تجهيز داتاسيت للرؤية بالكمبيوتر: تعليم الصور (labeling) وتدريب YOLO وتصدير الموديل، كله من مكان واحد.$q$, $q$صوّر 100 صورة لقطعة ودرّب موديل يكتشفها.$q$, $q$Computer-vision datasets end to end: labeling, YOLO training and export in one place.$q$, $q$Shoot 100 photos of a part and train a detector.$q$, 200),
  ($q$edgeimpulse$q$, $q$Edge Impulse$q$, $q$https://edgeimpulse.com/$q$, $q$ai$q$, $q$freemium$q$, $q$ذكاء اصطناعي صغير يشتغل جوه الميكروكنترولر (TinyML): صوت، حركة، صور، على ESP32 أو Arduino Nano 33.$q$, $q$اعمل موديل يسمع كلمة «يلا» ويولّع LED.$q$, $q$TinyML: small AI models that run on microcontrollers like the ESP32 or Nano 33 for sound, motion and images.$q$, $q$Make a keyword spotter that lights an LED.$q$, 210),
  ($q$ultralytics$q$, $q$Ultralytics YOLO$q$, $q$https://docs.ultralytics.com/$q$, $q$ai$q$, $q$free$q$, $q$شرح YOLO الرسمي: اكتشاف الأجسام والتتبع والتقسيم بالكاميرا، بكام سطر Python.$q$, $q$شغّل YOLO على كاميرا اللابتوب وعدّ الناس اللي قدامها.$q$, $q$The official YOLO docs: object detection, tracking and segmentation from a camera in a few lines of Python.$q$, $q$Run YOLO on your webcam and count people in view.$q$, 220),
  ($q$ros$q$, $q$ROS 2 Docs$q$, $q$https://docs.ros.org/$q$, $q$robotics$q$, $q$free$q$, $q$نظام تشغيل الروبوتات اللي بتستخدمه الشركات والجامعات. الشروحات الرسمية من أول التثبيت لحد الملاحة.$q$, $q$خلّص «Beginner: CLI tools» وشغّل turtlesim.$q$, $q$The robot operating system used by companies and universities; official tutorials from install to navigation.$q$, $q$Finish Beginner: CLI tools and drive turtlesim.$q$, 230),
  ($q$webots$q$, $q$Webots$q$, $q$https://cyberbotics.com/$q$, $q$robotics$q$, $q$free$q$, $q$محاكي روبوتات مفتوح المصدر فيه روبوتات جاهزة وحساسات وفيزياء. تجرب الخوارزمية قبل ما تبني.$q$, $q$افتح مثال e-puck واكتب line follower بالـ Python.$q$, $q$Open-source robot simulator with ready robots, sensors and physics: test your algorithm before building.$q$, $q$Open the e-puck example and write a Python line follower.$q$, 240),
  ($q$gazebo$q$, $q$Gazebo$q$, $q$https://gazebosim.org/$q$, $q$robotics$q$, $q$free$q$, $q$المحاكي اللي بيشتغل مع ROS: عوالم ثلاثية الأبعاد وحساسات LiDAR وكاميرات لروبوتك.$q$, $q$شغّل TurtleBot في Gazebo وخليه يرسم خريطة للأوضة.$q$, $q$The simulator that works with ROS: 3D worlds, LiDAR and cameras for your robot.$q$, $q$Run a TurtleBot in Gazebo and map a room.$q$, 250),
  ($q$matlab$q$, $q$MATLAB Onramp$q$, $q$https://matlabacademy.mathworks.com/$q$, $q$robotics$q$, $q$free$q$, $q$كورسات قصيرة مجانية من MathWorks بشهادة: MATLAB و Simulink والتحكم ومعالجة الإشارات.$q$, $q$خلّص «Simulink Onramp» واعمل موديل لموتور DC.$q$, $q$Free short MathWorks courses with certificates: MATLAB, Simulink, control and signal processing.$q$, $q$Finish Simulink Onramp and model a DC motor.$q$, 260),
  ($q$nodered$q$, $q$Node-RED$q$, $q$https://nodered.org/$q$, $q$iot$q$, $q$free$q$, $q$توصّل الأجهزة والـ APIs ببعض بالسحب والإفلات: حساس يبعت قراءة، تتخزن، وتعمل dashboard وتنبيه.$q$, $q$شغّله على Raspberry Pi واعمل لوحة لقراءات حساس حرارة.$q$, $q$Wire devices and APIs together visually: read a sensor, store it, build a dashboard and alerts.$q$, $q$Run it on a Raspberry Pi and chart a temperature sensor.$q$, 270),
  ($q$thingspeak$q$, $q$ThingSpeak$q$, $q$https://thingspeak.mathworks.com/$q$, $q$iot$q$, $q$freemium$q$, $q$تبعت قراءات الحساسات من ESP32 للنت وتشوفها رسوم بيانية علطول، ومعاها تحليل بـ MATLAB.$q$, $q$ابعت درجة الحرارة كل دقيقة وشوف الرسم من الموبايل.$q$, $q$Send sensor readings from an ESP32 to the cloud and see live charts, with MATLAB analysis.$q$, $q$Post the temperature every minute and watch it on your phone.$q$, 280),
  ($q$blynk$q$, $q$Blynk$q$, $q$https://blynk.io/$q$, $q$iot$q$, $q$freemium$q$, $q$تعمل أبلكيشن موبايل يتحكم في جهازك (زراير، سلايدر، قراءات) من غير ما تكتب كود موبايل.$q$, $q$تحكم في ريلاي من الموبايل وانت بره البيت.$q$, $q$Build a phone app that controls your device (buttons, sliders, readings) without writing mobile code.$q$, $q$Switch a relay from your phone while you're out.$q$, 290),
  ($q$arduinocloud$q$, $q$Arduino Cloud$q$, $q$https://cloud.arduino.cc/$q$, $q$iot$q$, $q$freemium$q$, $q$محرر Arduino أونلاين ولوحات تحكم ومتغيرات متزامنة بين البوردة والنت، ومعاه مكتبة كل مشاريع Arduino.$q$, $q$اربط ESP32 واعمل dashboard فيها زرار وقراءة حساس.$q$, $q$Online Arduino editor, dashboards and variables synced between the board and the cloud.$q$, $q$Connect an ESP32 and build a dashboard with a switch and a sensor.$q$, 300),
  ($q$github$q$, $q$GitHub$q$, $q$https://github.com/$q$, $q$code$q$, $q$student$q$, $q$مكان كودك ومشاريع الفريق، وبورتفوليو بيشوفه أي حد هيوظفك. و«Student Developer Pack» بيديك أدوات مدفوعة ببلاش.$q$, $q$اعمل repo لمشروعك واكتب README فيه صور وطريقة التشغيل.$q$, $q$Home for your code and team projects, and the portfolio employers look at. The Student Developer Pack unlocks paid tools for free.$q$, $q$Create a repo for your project with a README, photos and how to run it.$q$, 310),
  ($q$roadmap$q$, $q$roadmap.sh$q$, $q$https://roadmap.sh/$q$, $q$code$q$, $q$free$q$, $q$خرايط تعلم واضحة لأي مسار: Backend و AI و Embedded و DevOps، تعرف تبدأ بإيه وبعدها إيه.$q$, $q$افتح roadmap اللي تخص مسارك وعلّم اللي خلّصته.$q$, $q$Clear learning maps for every path (backend, AI, embedded, DevOps): what to learn first and next.$q$, $q$Open your track's roadmap and tick what you've done.$q$, 320),
  ($q$freecodecamp$q$, $q$freeCodeCamp$q$, $q$https://www.freecodecamp.org/$q$, $q$code$q$, $q$free$q$, $q$كورسات برمجة مجانية بالكامل بشهادات: ويب و Python وتحليل بيانات و ML، كلها بتمارين عملية.$q$, $q$ابدأ «Scientific Computing with Python».$q$, $q$Completely free programming courses with certificates: web, Python, data analysis and ML, all hands-on.$q$, $q$Start Scientific Computing with Python.$q$, 330),
  ($q$cs50$q$, $q$CS50 (Harvard)$q$, $q$https://cs50.harvard.edu/x/$q$, $q$code$q$, $q$free$q$, $q$أشهر كورس أساسيات علوم حاسب في العالم، من C لحد Python و SQL والويب، ومجاني بشهادة.$q$, $q$شوف المحاضرة الأولى وحل Problem Set 1.$q$, $q$The world's best-known intro to computer science, from C to Python, SQL and the web, free with a certificate.$q$, $q$Watch lecture 0 and solve Problem Set 1.$q$, 340),
  ($q$leetcode$q$, $q$LeetCode$q$, $q$https://leetcode.com/$q$, $q$code$q$, $q$freemium$q$, $q$مسائل خوارزميات وهياكل بيانات بتتطلب في انترفيوهات الشركات. تمرين يومي بيفرق جدًا.$q$, $q$حل مسألة واحدة Easy كل يوم لمدة شهر.$q$, $q$Algorithm and data-structure problems asked in company interviews; daily practice makes the difference.$q$, $q$Solve one Easy problem a day for a month.$q$, 350),
  ($q$exercism$q$, $q$Exercism$q$, $q$https://exercism.org/$q$, $q$code$q$, $q$free$q$, $q$تمارين في أكتر من 70 لغة، وفيه mentors بيراجعوا كودك ويقولولك تكتبه أحسن إزاي.$q$, $q$اختار Python أو C وحل أول 5 تمارين واطلب مراجعة.$q$, $q$Exercises in 70+ languages with volunteer mentors who review your code.$q$, $q$Pick Python or C, solve five exercises and ask for a review.$q$, 360),
  ($q$hackster$q$, $q$Hackster.io$q$, $q$https://www.hackster.io/$q$, $q$ideas$q$, $q$free$q$, $q$آلاف مشاريع الهاردوير الكاملة بالقطع والكود والتوصيل، ومسابقات بجوايز من شركات كبيرة.$q$, $q$دوّر على مسابقة مفتوحة واعرضها على الفريق.$q$, $q$Thousands of complete hardware projects with parts, code and wiring, plus sponsored contests.$q$, $q$Find an open contest and pitch it to the team.$q$, 370),
  ($q$instructables$q$, $q$Instructables$q$, $q$https://www.instructables.com/$q$, $q$ideas$q$, $q$free$q$, $q$شروحات «اعملها بنفسك» بالصور خطوة بخطوة: روبوتات وإلكترونيات وتصنيع وحاجات للبيت.$q$, $q$ابحث عن «obstacle avoiding robot» واعمله بقطع المعمل.$q$, $q$Step-by-step photo guides for making things: robots, electronics, fabrication and home builds.$q$, $q$Build an obstacle-avoiding robot from lab parts.$q$, 380),
  ($q$hackaday$q$, $q$Hackaday.io$q$, $q$https://hackaday.io/$q$, $q$ideas$q$, $q$free$q$, $q$مجتمع بيوثق مشاريع هاردوير مجنونة ومفتوحة، ومسابقة Hackaday Prize السنوية.$q$, $q$اعمل صفحة لمشروع الفريق ووثّق فيها كل مرحلة.$q$, $q$A community documenting ambitious open hardware projects, home of the yearly Hackaday Prize.$q$, $q$Make a page for a team project and log every stage.$q$, 390),
  ($q$mitocw$q$, $q$MIT OpenCourseWare$q$, $q$https://ocw.mit.edu/$q$, $q$learn$q$, $q$free$q$, $q$مواد كورسات MIT الحقيقية مجانًا: محاضرات وامتحانات ومشاريع في الروبوتكس والإلكترونيات والـ AI.$q$, $q$دوّر على «Introduction to Robotics» وشوف أول محاضرتين.$q$, $q$Real MIT course materials for free: lectures, exams and projects in robotics, electronics and AI.$q$, $q$Find Introduction to Robotics and watch the first two lectures.$q$, 400),
  ($q$coursera$q$, $q$Coursera$q$, $q$https://www.coursera.org/$q$, $q$learn$q$, $q$freemium$q$, $q$كورسات من جامعات وشركات زي Stanford و Google. تقدر تحضر ببلاش (Audit) أو تطلب منحة للشهادة.$q$, $q$حضّر «Machine Learning Specialization» لأندرو إنج بنظام Audit.$q$, $q$Courses from universities and companies like Stanford and Google; audit for free or apply for financial aid.$q$, $q$Audit Andrew Ng's Machine Learning Specialization.$q$, 410),
  ($q$edx$q$, $q$edX$q$, $q$https://www.edx.org/$q$, $q$learn$q$, $q$freemium$q$, $q$كورسات جامعات زي MIT و Harvard في الإلكترونيات والبرمجة والهندسة، وأغلبها تتحضر مجانًا.$q$, $q$دوّر على «Circuits and Electronics» من MIT.$q$, $q$University courses from MIT, Harvard and more in electronics, programming and engineering, mostly free to audit.$q$, $q$Look up MIT's Circuits and Electronics.$q$, 420),
  ($q$figma$q$, $q$Figma$q$, $q$https://www.figma.com/$q$, $q$tools$q$, $q$student$q$, $q$تصميم واجهات تطبيقات ومواقع وبوسترات مع الفريق في نفس الوقت. مجاني للطلبة.$q$, $q$صمّم شاشة أبلكيشن التحكم في روبوتك قبل ما تبرمجها.$q$, $q$Design app and web screens and posters with your team in real time. Free for students.$q$, $q$Design your robot's control app before coding it.$q$, 430),
  ($q$canva$q$, $q$Canva$q$, $q$https://www.canva.com/$q$, $q$tools$q$, $q$freemium$q$, $q$بوسترات وبريزنتيشنز وبوستات سوشيال ميديا بقوالب جاهزة، حتى لو مالكش في التصميم.$q$, $q$اعمل بوستر لمشروعك للمعرض في 15 دقيقة.$q$, $q$Posters, presentations and social posts from templates, even with no design background.$q$, $q$Make an expo poster for your project in 15 minutes.$q$, 440),
  ($q$notion$q$, $q$Notion$q$, $q$https://www.notion.so/$q$, $q$tools$q$, $q$freemium$q$, $q$مكان واحد لملاحظات المشروع والتاسكات والتوثيق للفريق. مجاني للطلبة بإيميل الجامعة.$q$, $q$اعمل صفحة للمشروع فيها تاسكات وقطع وروابط.$q$, $q$One place for project notes, tasks and docs for the team; free for students with a university email.$q$, $q$Set up a project page with tasks, parts and links.$q$, 450),
  ($q$overleaf$q$, $q$Overleaf$q$, $q$https://www.overleaf.com/$q$, $q$tools$q$, $q$freemium$q$, $q$تكتب تقارير وأبحاث بـ LaTeX في المتصفح مع زمايلك، بقوالب جاهزة للمؤتمرات والجامعة.$q$, $q$استخدم قالب IEEE واكتب تقرير مشروعك.$q$, $q$Write reports and papers in LaTeX in the browser with your team, using conference and university templates.$q$, $q$Write your project report in the IEEE template.$q$, 460),
  ($q$drawio$q$, $q$draw.io$q$, $q$https://app.diagrams.net/$q$, $q$tools$q$, $q$free$q$, $q$رسم مخططات (flowcharts، block diagrams، معمارية السيستم) مجانًا ومن غير حساب.$q$, $q$ارسم block diagram لمشروعك: الحساسات ← المتحكم ← الموتورات.$q$, $q$Free diagrams (flowcharts, block diagrams, system architecture) with no account.$q$, $q$Draw your project's block diagram: sensors → controller → motors.$q$, 470),
  ($q$excalidraw$q$, $q$Excalidraw$q$, $q$https://excalidraw.com/$q$, $q$tools$q$, $q$free$q$, $q$سبورة أونلاين بشكل مرسوم بالإيد، تشرح فيها فكرة مع الفريق وانتوا أونلاين.$q$, $q$افتح جلسة مشتركة وارسموا فكرة المشروع الجاي.$q$, $q$A hand-drawn style online whiteboard to sketch ideas with your team live.$q$, $q$Start a shared session and sketch the next project.$q$, 480)
on conflict (slug) do nothing;
