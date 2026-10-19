"use client";
/**
 * Areas of the Lab that are not finished. They say so plainly instead of showing a mock-up: nothing
 * here pretends to work.
 */
import { useLang } from "../i18n";
import { navigate } from "../router";
import { Button, Card, Icon, type IconName } from "../ui";

const AREAS: Record<string, { icon: IconName; title: { en: string; ar: string }; plan: { en: string; ar: string } }> = {
  "3d": { icon: "cube", title: { en: "3D Studio", ar: "استوديو 3D" }, plan: { en: "Solid modelling in millimetres with real boolean operations, measurements, and STL / OBJ / GLB / 3MF export with manifold checks.", ar: "تصميم مجسمات بالمليمتر بعمليات Boolean حقيقية وقياسات، وتصدير STL / OBJ / GLB / 3MF مع فحص إن المجسم مقفول." } },
  codeblocks: { icon: "blocks", title: { en: "Block Code", ar: "البرمجة بالبلوكات" }, plan: { en: "Blocks that generate Arduino C++ and run in the same simulator as your circuits.", ar: "بلوكات بتطلع كود أردوينو C++ وبتشتغل في نفس محاكي الدواير." } },
  learn: { icon: "learn", title: { en: "Academy", ar: "الأكاديمية" }, plan: { en: "Learning paths with lessons and quizzes that open straight into the editor, with your progress saved.", ar: "مسارات تعلّم بدروس وكويزات بتفتح في المحرر على طول، وتقدّمك بيتحفظ." } },
  challenges: { icon: "trophy", title: { en: "Challenges", ar: "التحديات" }, plan: { en: "Tasks checked automatically from what the simulation actually does (e.g. the LED blinks at 1 Hz).", ar: "مهام بتتصحح أوتوماتيك من اللي المحاكاة بتعمله فعلًا (مثلًا الليد بيرمش مرة كل ثانية)." } },
  classrooms: { icon: "users", title: { en: "Classrooms", ar: "الفصول" }, plan: { en: "Instructors create classes and assignments; students submit Lab projects for review.", ar: "المدربين يعملوا فصول وتاسكات، والطلاب يسلّموا مشاريع اللاب للمراجعة." } },
  admin: { icon: "shield", title: { en: "Admin", ar: "الإدارة" }, plan: { en: "Moderation of public projects and Lab usage analytics from real activity.", ar: "مراجعة المشاريع العامة وإحصائيات استخدام اللاب من النشاط الحقيقي." } },
  missing: { icon: "alert", title: { en: "Not found", ar: "مش موجودة" }, plan: { en: "This page doesn't exist.", ar: "الصفحة دي مش موجودة." } },
};

export function Coming({ area }: { area: string }) {
  const { t, l } = useLang();
  const a = AREAS[area] ?? AREAS.missing;
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="font-display text-2xl font-bold">{l(a.title)}</h1>
      <Card className="grid gap-4">
        <span className="grid size-12 place-items-center rounded-xl bg-panel text-cyan">
          <Icon name={a.icon} size={24} />
        </span>
        {area !== "missing" && <p className="text-sm font-semibold text-warn">{t("comingNext")}</p>}
        {area !== "missing" && <p className="text-mist">{t("comingBody")}</p>}
        <p className="text-sm text-fog">{l(a.plan)}</p>
        <div>
          <Button icon="circuit" onClick={() => navigate("circuits")}>
            {t("navCircuits")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
