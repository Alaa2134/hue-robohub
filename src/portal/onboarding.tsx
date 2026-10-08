"use client";
/**
 * First launch of the store app: four short screens (what the app is, for students, for the team,
 * notifications), then the sign-in form. Shown once per phone.
 */
import { useEffect, useState } from "react";
import { isNative } from "./core";
import { askNativePermission, nativePushReady } from "./native-push";
import { noteLaunch } from "./review";
import { BrandLine } from "./shell";
import { Button, Icon, type IconKey } from "./ui";

const KEY = "rh-onboarded";

export function needsOnboarding() {
  if (!isNative()) return false;
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

const SLIDES: { icon: IconKey; title: string; body: string }[] = [
  { icon: "star", title: "أهلاً بيك في BuildX HUE", body: "تطبيق مجتمع الروبوتات والابتكار في جامعة حورس، للطلاب ولفريق التدريب." },
  { icon: "book", title: "لو إنت طالب", body: "المحاضرات والملفات، كويزات بتتصحح لوحدها، حضورك ونقاطك وشهاداتك. كله أول بأول." },
  { icon: "scan", title: "لو إنت في فريق التدريب", body: "سجّل الحضور بباركود الكارنيه، وتابع الطلاب، وارفع المحتوى والكويزات من الموبايل." },
  { icon: "bell", title: "خليك عارف كل جديد", body: "كويز جديد، تذكير قبل السيشن، أو إعلان مهم: يوصلك إشعار على طول." },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [push, setPush] = useState(false);
  useEffect(() => {
    noteLaunch();
    nativePushReady().then(setPush, () => setPush(false));
  }, []);
  const finish = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    onDone();
  };
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i]!;
  return (
    <div className="flex min-h-dvh flex-col bg-abyss bg-[radial-gradient(100%_55%_at_50%_0%,rgb(43_109_255/0.22),transparent_65%)] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <BrandLine />
        {!last && (
          <button type="button" onClick={finish} className="text-sm text-fog hover:text-mist">
            تخطّي
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite">
        <span className="flex size-24 items-center justify-center rounded-[2rem] bg-volt/15 text-cyan">
          <Icon name={s.icon} size={48} />
        </span>
        <h1 className="mt-8 text-[26px] font-bold leading-tight text-chalk">{s.title}</h1>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-mist">{s.body}</p>
      </div>
      <div className="mb-6 flex justify-center gap-2" aria-hidden>
        {SLIDES.map((_, n) => (
          <span key={n} className={n === i ? "h-2 w-6 rounded-full bg-cyan" : "size-2 rounded-full bg-white/20"} />
        ))}
      </div>
      {last && push ? (
        <div className="grid gap-2">
          <Button variant="primary" size="lg" icon="bell" block onClick={() => askNativePermission().finally(finish)}>
            شغّل الإشعارات
          </Button>
          <Button size="lg" block onClick={finish}>
            بعدين
          </Button>
        </div>
      ) : (
        <Button variant="primary" size="lg" block onClick={() => (last ? finish() : setI(i + 1))}>
          {last ? "يلا نبدأ" : "التالي"}
        </Button>
      )}
    </div>
  );
}
