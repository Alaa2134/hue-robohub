"use client";
/**
 * «الموقع ناقصه إيه؟» on the staff home: what visitors (and the printed cards, and the sponsor report)
 * miss right now: team pages not published or missing a photo, role or Arabic name; no partners; no
 * upcoming event; no news this month; applications closed; no WhatsApp channel link. Each line goes
 * to where it's fixed. A line can be put aside ("بعدين") for a week; the card hides when nothing's left.
 */
import { useState } from "react";
import { can, isFull, must, sb, type StaffRow } from "./core";
import { Button, Card, Icon, go, useAsync } from "./ui";

type Gap = { key: string; line: string; to: string };
const SNOOZE = "bx-gaps-snoozed";
const WEEK = 7 * 864e5;

function snoozed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export async function siteGaps(me: StaffRow): Promise<Gap[]> {
  const gaps: Gap[] = [];
  const now = new Date().toISOString();
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  const [profiles, partners, upcoming, news, settings] = await Promise.all([
    sb()
      .from("team_profiles")
      .select("full_name,full_name_ar,headline,photo_path,published")
      .then(must) as Promise<
      {
        full_name: string;
        full_name_ar: string | null;
        headline: string;
        photo_path: string | null;
        published: boolean;
      }[]
    >,
    sb()
      .from("site_content")
      .select("id", { count: "exact", head: true })
      .eq("kind", "partner")
      .eq("published", true),
    sb()
      .from("site_content")
      .select("id", { count: "exact", head: true })
      .eq("kind", "event")
      .eq("published", true)
      .gte("starts_at", now),
    sb()
      .from("site_content")
      .select("id", { count: "exact", head: true })
      .in("kind", ["post", "achievement", "story"])
      .eq("published", true)
      .gte("created_at", monthAgo),
    sb().from("site_settings").select("key,value").in("key", ["applications", "site"]).then(must) as Promise<
      { key: string; value: Record<string, unknown> }[]
    >,
  ]);
  const team = isFull(me) || can(me, "portfolios");
  const site = isFull(me) || can(me, "site");
  if (team) {
    const hidden = profiles.filter((p) => !p.published).length;
    const noPhoto = profiles.filter((p) => !p.photo_path).length;
    const noRole = profiles.filter((p) => !p.headline?.trim()).length;
    const noAr = profiles.filter((p) => !p.full_name_ar?.trim()).length;
    if (hidden)
      gaps.push({
        key: "team-hidden",
        line: `${hidden} من صفحات الفريق مش منشورة (والـ QR على كروتهم مش هيفتح)`,
        to: "/staff/portfolios",
      });
    if (noPhoto)
      gaps.push({ key: "team-photo", line: `${noPhoto} في الفريق من غير صورة`, to: "/staff/portfolios" });
    if (noRole)
      gaps.push({
        key: "team-role",
        line: `${noRole} في الفريق من غير مسمى (Website manager، Media…)`,
        to: "/staff/portfolios",
      });
    if (noAr)
      gaps.push({ key: "team-ar", line: `${noAr} في الفريق من غير اسم بالعربي`, to: "/staff/portfolios" });
  }
  if (site) {
    if (!partners.count)
      gaps.push({
        key: "partners",
        line: "مفيش رعاة أو شركاء على الموقع (بيبانوا في الصفحة الرئيسية وفي تقرير الرعاة)",
        to: "/staff/site",
      });
    if (!upcoming.count)
      gaps.push({
        key: "events",
        line: "مفيش فعالية جاية منشورة، فالعدّاد وصفحة الفعاليات فاضيين",
        to: "/staff/site",
      });
    if (!news.count)
      gaps.push({ key: "news", line: "مفيش أخبار ولا إنجازات اتنشرت الشهر ده", to: "/staff/site" });
  }
  if (isFull(me) || can(me, "settings")) {
    const apps = settings.find((s) => s.key === "applications")?.value;
    const socials = (settings.find((s) => s.key === "site")?.value?.socials ?? {}) as Record<string, string>;
    if (apps && apps.open === false)
      gaps.push({ key: "apps-closed", line: "التقديم في الفريق مقفول دلوقتي", to: "/staff/settings" });
    if (!socials.whatsapp)
      gaps.push({
        key: "channel",
        line: "مفيش لينك قناة واتساب، فزرار «تابعنا على واتساب» مش ظاهر",
        to: "/staff/settings",
      });
  }
  if (me.role === "owner")
    gaps.push({
      key: "leaked-pw",
      line: "في Supabase: Authentication ← Password security ← فعّل Leaked password protection",
      to: "",
    });
  return gaps;
}

export function SiteGapsCard({ me }: { me: StaffRow }) {
  const show = isFull(me) || can(me, "site") || can(me, "portfolios") || can(me, "settings");
  const { data } = useAsync(async () => (show ? siteGaps(me) : []), [show]);
  const [hidden, setHidden] = useState(snoozed);
  const [open, setOpen] = useState(false);
  const list = (data ?? []).filter((g) => !(hidden[g.key] && Date.now() - hidden[g.key] < WEEK));
  if (!list.length) return null;
  const later = (key: string) => {
    const next = { ...hidden, [key]: Date.now() };
    setHidden(next);
    try {
      localStorage.setItem(SNOOZE, JSON.stringify(next));
    } catch {
      /* the card just shows it again */
    }
  };
  return (
    <Card className="mt-4 border-warn/30 bg-warn/[0.05]" data-testid="site-gaps">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-start"
      >
        <Icon name="flag" size={22} className="shrink-0 text-warn" />
        <span className="flex-1">
          <span className="block font-semibold text-chalk">
            الموقع ناقصه {list.length === 1 ? "حاجة" : `${list.length} حاجات`}
          </span>
          <span className="block text-xs text-fog">اللي الزوار والرعاة مش شايفينه دلوقتي</span>
        </span>
        <Icon name="chevronDown" size={18} className={`text-fog transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-3 grid gap-2">
          {list.map((g) => (
            <li key={g.key} className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-2.5">
              <span className="flex-1 text-sm text-mist">{g.line}</span>
              {g.to && (
                <Button size="sm" onClick={() => go(g.to)}>
                  ظبطه
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => later(g.key)}>
                بعدين
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
