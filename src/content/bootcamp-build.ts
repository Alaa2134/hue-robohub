/** What gets bolted onto the bootcamp robot ("BX-T1") each week — drives the assembly sequence. */
export const BUILD_STAGES = [
  { stage: "Chassis & power", parts: ["Laser-cut chassis plate", "Battery holder + switch", "Breadboard"], ar: { stage: "الهيكل والطاقة", parts: ["هيكل مقطوع بالليزر", "حامل بطارية ومفتاح", "لوحة تجارب"] } },
  { stage: "Brain & senses", parts: ["Microcontroller board", "IR line array", "Ultrasonic sensor"], ar: { stage: "العقل والحواس", parts: ["لوحة متحكم دقيق", "مصفوفة حساسات خط", "حساس فوق صوتي"] } },
  { stage: "Drivetrain", parts: ["2× gear motors", "Wheels + caster", "Dual H-bridge driver"], ar: { stage: "منظومة الحركة", parts: ["محركان بتروس", "عجلات + عجلة حرة", "مشغّل محركات"] } },
  { stage: "Wireless", parts: ["ESP32 module", "Telemetry link", "Status LEDs"], ar: { stage: "الاتصال اللاسلكي", parts: ["وحدة ESP32", "قناة قياس عن بُعد", "مؤشرات LED"] } },
  { stage: "Body", parts: ["3D-printed shell", "Sensor mounts", "Front bumper"], ar: { stage: "الجسم", parts: ["غلاف مطبوع ثلاثي الأبعاد", "حوامل حساسات", "مصدّ أمامي"] } },
  { stage: "Integration", parts: ["Wiring harness", "LiPo pack", "Tuned PID"], ar: { stage: "التكامل", parts: ["حزمة أسلاك", "بطارية ليثيوم", "ضبط PID"] } },
  { stage: "BuildX Challenge", parts: ["Track run", "Judging", "Awards"], ar: { stage: "تحدّي BuildX", parts: ["جولة على المضمار", "التحكيم", "الجوائز"] } },
] as const;
