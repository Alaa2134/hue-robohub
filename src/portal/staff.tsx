"use client";
/** Staff side of the BuildX App: tabs, home dashboard and the "more" menu. */
import { useState } from "react";
import { ROLE_LABEL, can, fmt, must, sb, type Area, type Session, type StaffRow } from "./core";
import { InstallCard, AppShell, BrandLine, SiteButton, SiteCard, type Tab } from "./shell";
import { ApplicationDetail, ApplicationsScreen, newApplicationsCount } from "./staff-applications";
import { SessionScreen, SessionSheet, SessionsScreen } from "./staff-attendance";
import { PortfolioScreen, PortfoliosAdmin } from "./staff-portfolio";
import { ErrorsScreen, SecurityAlert, SecurityScreen, SiteStatsScreen, UsageCard } from "./staff-insights";
import { SiteContentScreen } from "./staff-site";
import { SiteSettingsScreen } from "./staff-settings";
import { TwoFactorScreen } from "./staff-2fa";
import { CertificatesPrintScreen, CertificatesScreen } from "./staff-certificates";
import { EventRegistrations, EventsScreen } from "./staff-events";
import { LeaderboardScreen } from "./points";
import { BackupsScreen } from "./staff-backups";
import { NotifyScreen, PushCard } from "./push";
import { StaffContent } from "./staff-content";
import { useStudents } from "./staff-data";
import { QuizEditor, QuizResults, QuizzesScreen } from "./staff-quizzes";
import { StudentsScreen } from "./staff-students";
import { AccountScreen, AuditScreen, ReportsScreen, TeamScreen } from "./staff-team";
import { DeletionsScreen, pendingDeletions } from "./account-deletion";
import { AppsSettingsScreen } from "./app-update";
import { TaskSubmissions, TasksScreen } from "./tasks";
import { AnnouncementsScreen } from "./schedule";
import { InboxScreen, newMessagesCount } from "./staff-inbox";
import { FormEditor, FormResponses, FormsScreen } from "./staff-forms";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  List,
  Row,
  Section,
  Stat,
  go,
  useAsync,
  type IconKey,
} from "./ui";

const TABS: Tab[] = [
  { href: "/staff", label: "الرئيسية", icon: "home", match: (p) => p.length === 0 },
  { href: "/staff/attendance", label: "الحضور", icon: "scan", match: (p) => p[0] === "attendance" },
  { href: "/staff/students", label: "الطلاب", icon: "users", match: (p) => p[0] === "students" },
  { href: "/staff/content", label: "المحتوى", icon: "book", match: (p) => p[0] === "content" },
  { href: "/staff/quizzes", label: "الكويزات", icon: "quiz", match: (p) => p[0] === "quizzes" },
];
const MORE_TAB: Tab = { href: "/staff/more", label: "المزيد", icon: "list", match: (p) => p[0] === "more" };

/** The area each section belongs to (sections not listed are open to every staff member). */
const AREA_OF: Record<string, Area> = {
  attendance: "students",
  students: "students",
  content: "students",
  quizzes: "students",
  tasks: "students",
  announcements: "students",
  leaderboard: "students",
  reports: "students",
  applications: "applications",
  events: "events",
  site: "content",
  forms: "content",
  inbox: "inbox",
  certificates: "certificates",
  settings: "settings",
  apps: "settings",
  portfolios: "portfolios",
  notify: "notify",
};

/** A section outside this person's permissions. */
function NotAllowed() {
  return (
    <>
      <header className="flex items-center justify-between pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <BrandLine />
      </header>
      <Card className="mt-6 grid justify-items-center gap-3 py-8 text-center">
        <Icon name="lock" size={28} className="text-warn" />
        <p className="font-semibold text-chalk">القسم ده مش من صلاحياتك</p>
        <p className="max-w-xs text-sm text-fog">
          لو محتاجه في شغلك، اطلب من المالك يضيفه لصلاحياتك من «الفريق والصلاحيات».
        </p>
        <Button onClick={() => go("/staff")}>الرئيسية</Button>
      </Card>
    </>
  );
}

export function StaffApp({
  me,
  path,
  query,
  onProfile,
}: {
  me: StaffRow;
  path: string[];
  query: URLSearchParams;
  onProfile: (s: StaffRow) => void;
}) {
  const [section, id, sub] = path;
  const area = section ? AREA_OF[section] : undefined;
  const tabs = TABS.filter(
    (t) => !AREA_OF[t.href.split("/")[2] ?? ""] || can(me, AREA_OF[t.href.split("/")[2]]),
  );
  if (tabs.length < TABS.length) tabs.push(MORE_TAB);
  if (area && !can(me, area))
    return (
      <AppShell tabs={tabs} path={path}>
        <NotAllowed />
      </AppShell>
    );
  // The print view is a bare page (no tab bar) so it prints as clean A4 sheets.
  if (section === "certificates" && id === "print")
    return <CertificatesPrintScreen ids={(query.get("ids") ?? "").split(",").filter(Boolean)} />;
  let screen: React.ReactNode;
  switch (section) {
    case "attendance":
      screen = id ? <SessionScreen key={id} id={id} /> : <SessionsScreen />;
      break;
    case "students":
      screen = <StudentsScreen me={me} query={query} />;
      break;
    case "content":
      screen = <StaffContent me={me} />;
      break;
    case "quizzes":
      screen = id ? (
        sub === "results" ? (
          <QuizResults key={id} id={id} />
        ) : (
          <QuizEditor key={id} id={id} me={me} />
        )
      ) : (
        <QuizzesScreen />
      );
      break;
    case "applications":
      screen = id ? <ApplicationDetail key={id} id={id} me={me} /> : <ApplicationsScreen me={me} />;
      break;
    case "site":
      screen = <SiteContentScreen me={me} query={query} />;
      break;
    case "portfolio":
      screen = <PortfolioScreen me={me} />;
      break;
    case "portfolios":
      screen = id ? <PortfolioScreen key={id} me={me} id={id} /> : <PortfoliosAdmin me={me} />;
      break;
    case "team":
      screen = <TeamScreen me={me} />;
      break;
    case "account":
      screen = <AccountScreen me={me} onProfile={onProfile} />;
      break;
    case "audit":
      screen = <AuditScreen />;
      break;
    case "reports":
      screen = <ReportsScreen />;
      break;
    case "settings":
      screen = <SiteSettingsScreen me={me} />;
      break;
    case "notify":
      screen = <NotifyScreen me={me} />;
      break;
    case "backups":
      screen = <BackupsScreen me={me} />;
      break;
    case "leaderboard":
      screen = <LeaderboardScreen />;
      break;
    case "events":
      screen = id ? <EventRegistrations key={id} id={id} /> : <EventsScreen />;
      break;
    case "certificates":
      screen = <CertificatesScreen me={me} />;
      break;
    case "2fa":
      screen = <TwoFactorScreen me={me} />;
      break;
    case "security":
      screen = <SecurityScreen me={me} />;
      break;
    case "stats":
      screen = <SiteStatsScreen />;
      break;
    case "errors":
      screen = <ErrorsScreen />;
      break;
    case "announcements":
      screen = <AnnouncementsScreen me={me} />;
      break;
    case "tasks":
      screen = id ? <TaskSubmissions key={id} id={id} me={me} /> : <TasksScreen me={me} />;
      break;
    case "apps":
      screen = <AppsSettingsScreen me={me} />;
      break;
    case "deletions":
      screen = me.role === "owner" ? <DeletionsScreen /> : <StaffHome me={me} />;
      break;
    case "inbox":
      screen = <InboxScreen me={me} />;
      break;
    case "forms":
      screen = id ? (
        sub === "responses" ? (
          <FormResponses key={id} id={id} />
        ) : (
          <FormEditor key={id} id={id} me={me} />
        )
      ) : (
        <FormsScreen />
      );
      break;
    case "more":
      screen = <MoreScreen me={me} />;
      break;
    default:
      screen = <StaffHome me={me} />;
  }
  return (
    <AppShell tabs={tabs} path={path}>
      {screen}
    </AppShell>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "صباح الخير" : h < 18 ? "مساء الخير" : "مساء النور";
}

type OpenSession = Session & { attendance: { count: number }[] };

function StaffHome({ me }: { me: StaffRow }) {
  const students = useStudents();
  const [creating, setCreating] = useState(false);
  const { data } = useAsync(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [open, week, materials, quizzes, applications, messages] = await Promise.all([
      sb()
        .from("attendance_sessions")
        .select("*, attendance(count)")
        .is("closed_at", null)
        .order("starts_at", { ascending: false })
        .limit(5)
        .then(must),
      sb().from("attendance_sessions").select("id", { count: "exact", head: true }).gte("starts_at", weekAgo),
      sb().from("materials").select("id", { count: "exact", head: true }),
      sb().from("quizzes").select("id", { count: "exact", head: true }).eq("published", true),
      newApplicationsCount().catch(() => 0),
      newMessagesCount().catch(() => 0),
    ]);
    const deletions = me.role === "owner" ? await pendingDeletions().catch(() => 0) : 0;
    return {
      open: open as OpenSession[],
      week: week.count ?? 0,
      materials: materials.count ?? 0,
      quizzes: quizzes.count ?? 0,
      applications,
      messages,
      deletions,
    };
  }, []);
  const active = students.list?.filter((s) => s.active) ?? [];
  const noPin = active.filter((s) => !s.hasPin).length;
  const first = (me.full_name || me.email).split(/\s+/)[0];

  return (
    <>
      <header className="flex items-center justify-between pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <BrandLine />
        <div className="flex">
          <SiteButton />
          <IconButton icon="user" label="حسابي" onClick={() => go("/staff/more")} />
        </div>
      </header>
      <div className="mt-4">
        <p className="text-sm text-fog">{fmt.day(new Date())}</p>
        <h1 className="mt-1 text-2xl font-bold text-chalk">
          {greeting()}، {first}
        </h1>
        <Badge tone="volt" className="mt-2">
          {me.title || ROLE_LABEL[me.role]}
        </Badge>
      </div>

      {can(me, "students") && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-5 flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-volt/40 bg-gradient-to-l from-[#1f57e6] to-[#0c2f8a] p-5 text-start shadow-[0_20px_60px_-25px_rgb(43_109_255/0.9)] transition active:scale-[0.99]"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
            <Icon name="scan" size={30} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-white">تسجيل حضور جديد</span>
            <span className="block text-sm text-white/75">
              امسح باركود كارنيه الطلاب بالكاميرا أو بقارئ USB
            </span>
          </span>
          <Icon name="chevron" size={20} className="rotate-180 text-white/80" />
        </button>
      )}

      {me.role !== "lead" && <SecurityAlert />}

      {!!data?.applications && (
        <Card className="mt-4 flex items-center gap-3 border-cyan/30 bg-cyan/[0.06]">
          <Icon name="users" size={22} className="shrink-0 text-cyan" />
          <p className="flex-1 text-sm text-mist">
            {data.applications === 1
              ? "فيه طلب انضمام جديد مستني المراجعة."
              : `فيه ${data.applications} طلبات انضمام جديدة مستنية المراجعة.`}
          </p>
          <Button size="sm" variant="primary" onClick={() => go("/staff/applications")}>
            راجِع
          </Button>
        </Card>
      )}

      {!!data?.messages && (
        <Card className="mt-4 flex items-center gap-3 border-volt/30 bg-volt/[0.06]">
          <Icon name="bell" size={22} className="shrink-0 text-cyan" />
          <p className="flex-1 text-sm text-mist">
            {data.messages === 1
              ? "فيه رسالة جديدة من الموقع."
              : `فيه ${data.messages} رسايل جديدة من الموقع.`}
          </p>
          <Button size="sm" variant="primary" onClick={() => go("/staff/inbox")}>
            افتح
          </Button>
        </Card>
      )}

      {!!data?.deletions && (
        <Card className="mt-4 flex items-center gap-3 border-danger/30 bg-danger/[0.06]">
          <Icon name="trash" size={22} className="shrink-0 text-[#ff9aa5]" />
          <p className="flex-1 text-sm text-mist">
            {data.deletions === 1
              ? "فيه طلب حذف حساب مستني. المتاجر بتطلب تنفيذه خلال 30 يوم."
              : `فيه ${data.deletions} طلبات حذف حسابات مستنية. المتاجر بتطلب تنفيذها خلال 30 يوم.`}
          </p>
          <Button size="sm" onClick={() => go("/staff/deletions")}>
            راجِع
          </Button>
        </Card>
      )}

      {!!data?.open.length && (
        <Section title="جلسات مفتوحة">
          <List>
            {data.open.map((s) => (
              <Row key={s.id} onClick={() => go(`/staff/attendance/${s.id}`)}>
                <div className="flex items-center gap-3">
                  <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-ok" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{s.title}</p>
                    <p className="text-xs text-fog">
                      {fmt.dateTime(s.starts_at)} · {s.group_name || "كل المجموعات"}
                    </p>
                  </div>
                  <span className="font-mono text-lg text-chalk">{s.attendance?.[0]?.count ?? 0}</span>
                </div>
              </Row>
            ))}
          </List>
        </Section>
      )}

      {can(me, "students") && (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="طالب نشط" value={students.list ? active.length : "…"} icon="users" />
          <Stat label="جلسات الأسبوع" value={data?.week ?? "…"} icon="calendar" />
          <Stat label="ملفات وروابط" value={data?.materials ?? "…"} icon="book" />
          <Stat label="كويزات منشورة" value={data?.quizzes ?? "…"} icon="quiz" />
        </div>
      )}

      {noPin > 0 && can(me, "students") && (
        <Card className="mt-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
          <Icon name="key" size={20} className="shrink-0 text-warn" />
          <p className="flex-1 text-sm text-mist">{noPin} طالب بدون رمز دخول للتطبيق.</p>
          <Button size="sm" onClick={() => go("/staff/students?pins=1")}>
            إنشاء
          </Button>
        </Card>
      )}

      <Section title="اختصارات">
        <div className="grid grid-cols-3 gap-2">
          {can(me, "students") && <Shortcut icon="plus" label="إضافة طلاب" to="/staff/students?bulk=1" />}
          {can(me, "content") && <Shortcut icon="globe" label="محتوى الموقع" to="/staff/site" />}
          {can(me, "students") && <Shortcut icon="quiz" label="كويز جديد" to="/staff/quizzes" />}
          {can(me, "students") && <Shortcut icon="upload" label="التاسكات" to="/staff/tasks" />}
          {can(me, "content") && <Shortcut icon="list" label="الفورمات" to="/staff/forms" />}
          {can(me, "events") && <Shortcut icon="calendar" label="الفعاليات" to="/staff/events" />}
          {can(me, "inbox") && <Shortcut icon="bell" label="الرسائل" to="/staff/inbox" />}
          <Shortcut icon="settings" label="المزيد" to="/staff/more" />
        </div>
      </Section>
      <div className="mt-6">
        <InstallCard />
      </div>
      <SessionSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => go(`/staff/attendance/${id}`)}
      />
    </>
  );
}

function Shortcut({ icon, label, to }: { icon: IconKey; label: string; to: string }) {
  return (
    <a
      href={`#${to}`}
      className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--line)] bg-panel/60 px-2 py-4 text-center transition hover:border-cyan/40"
    >
      <Icon name={icon} size={24} className="text-cyan" />
      <span className="text-[13px] font-medium text-mist">{label}</span>
    </a>
  );
}

function MoreScreen({ me }: { me: StaffRow }) {
  const allowed = (to: string) => {
    const a = AREA_OF[to.split("/")[2] ?? ""];
    return !a || can(me, a);
  };
  const items: { icon: IconKey; label: string; to: string; show?: boolean }[] = [
    { icon: "bell", label: "إرسال إشعار للطلاب أو الفريق", to: "/staff/notify" },
    { icon: "upload", label: "التاسكات (تسليم وتصحيح)", to: "/staff/tasks" },
    { icon: "bell", label: "إعلانات للطلاب (بتظهر في التطبيق)", to: "/staff/announcements" },
    { icon: "globe", label: "محتوى الموقع (فعاليات، أخبار، جاليري…)", to: "/staff/site" },
    {
      icon: "settings",
      label: "إعدادات الموقع (التواصل، الواجهة، الإعلان، الأهداف)",
      to: "/staff/settings",
    },
    { icon: "user", label: "البورتفوليو بتاعي", to: "/staff/portfolio" },
    { icon: "star", label: "بورتفوليو الفريق", to: "/staff/portfolios" },
    { icon: "users", label: "طلبات الانضمام", to: "/staff/applications" },
    { icon: "bell", label: "رسائل الموقع وطلبات الرعاية", to: "/staff/inbox" },
    { icon: "list", label: "الفورمات (اختبارات الفرق، تجديد، متطوعين…)", to: "/staff/forms" },
    { icon: "calendar", label: "تسجيل الفعاليات والدخول بالـ QR", to: "/staff/events" },
    { icon: "star", label: "النقاط والأوسمة (ترتيب الطلاب)", to: "/staff/leaderboard" },
    { icon: "award", label: "الشهادات (إصدار وطباعة وتحقق بالـ QR)", to: "/staff/certificates" },
    { icon: "chart", label: "تقارير الحضور", to: "/staff/reports" },
    { icon: "chart", label: "زيارات الموقع (مين بيزور وبيشوف إيه)", to: "/staff/stats" },
    { icon: "shield", label: "الأمان والهجمات", to: "/staff/security", show: me.role !== "lead" },
    { icon: "alert", label: "أخطاء الموقع", to: "/staff/errors" },
    { icon: "users", label: "الفريق والصلاحيات", to: "/staff/team" },
    { icon: "list", label: "سجل النشاط", to: "/staff/audit", show: me.role !== "lead" },
    { icon: "download", label: "النسخ الاحتياطية", to: "/staff/backups", show: me.role === "owner" },
    { icon: "trash", label: "طلبات حذف الحسابات", to: "/staff/deletions", show: me.role === "owner" },
    {
      icon: "install",
      label: "التطبيقات (التحديث الإجباري ولينكات المتاجر)",
      to: "/staff/apps",
    },
    { icon: "user", label: "حسابي وكلمة المرور", to: "/staff/account" },
    { icon: "lock", label: "التحقق بخطوتين (كود من الموبايل)", to: "/staff/2fa" },
  ];
  return (
    <>
      <header className="flex items-center justify-between pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <BrandLine />
      </header>
      <Card className="mt-4 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-volt/50 to-cyan/30 text-lg font-bold text-chalk">
          {(me.full_name || me.email)[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-chalk">{me.full_name || "—"}</p>
          <p className="truncate font-mono text-xs text-fog" dir="ltr">
            {me.email}
          </p>
        </div>
        <Badge tone="volt">{ROLE_LABEL[me.role]}</Badge>
      </Card>
      <List className="mt-4">
        {items
          .filter((i) => i.show !== false && allowed(i.to))
          .map((i) => (
            <Row key={i.to} onClick={() => go(i.to)}>
              <span className="flex items-center gap-3 text-[15px] text-chalk">
                <Icon name={i.icon} size={20} className="text-cyan" />
                {i.label}
              </span>
            </Row>
          ))}
      </List>
      {me.role !== "lead" && <UsageCard />}
      <SiteCard className="mt-4" />
      <PushCard kind="staff" />
      <div className="mt-4">
        <InstallCard />
      </div>
      <Button variant="danger" icon="logout" className="mt-6" block onClick={() => sb().auth.signOut()}>
        تسجيل الخروج
      </Button>
    </>
  );
}
