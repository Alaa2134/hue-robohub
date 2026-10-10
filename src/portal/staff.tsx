"use client";
/** Staff side of the BuildX App: tabs, home dashboard and the "more" menu. */
import { useEffect, useMemo, useState } from "react";
import { isFull, ROLE_LABEL, can, canSee, fmt, holdViewOnly, must, rpc, sb, type Area, type Session, type StaffRow } from "./core";
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
import { AccessRequestsScreen, pendingAccessRequests } from "./access-requests";
import { StudentProjectsReview, pendingStudentProjects } from "./student-projects";
import { AtRiskScreen, atRiskCount } from "./at-risk";
import { AppsSettingsScreen } from "./app-update";
import { TaskSubmissions, TasksScreen } from "./tasks";
import { AnnouncementsScreen } from "./schedule";
import { InboxScreen, newMessagesCount } from "./staff-inbox";
import { FormEditor, FormResponses, FormsScreen } from "./staff-forms";
import { VoiceStudio } from "./staff-voice";
import { PermissionsScreen } from "./staff-permissions";
import { WhatsAppScreen } from "./whatsapp";
import { PageEditor, PagesScreen } from "./staff-pages";
import { BansScreen, DelegationCheckin } from "./expo-delegation";
import { MyTasksScreen, SectorScreen, SectorsScreen, TeamTaskScreen, TeamTasksHome, WarningsScreen, teamSummary } from "./staff-sectors";
import { AwardBanner, BellButton, NotificationsScreen, OverviewScreen } from "./team";
import { BaqlozBuddy, BaqlozCoach, useStaffReminders, type Reminder } from "./baqloz";
import { MeetingScreen, MeetingsScreen } from "./team-meetings";
import { InventoryScreen } from "./inventory";
import { XpHomeCard, XpScreen } from "./team-xp";
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

/** The areas each section belongs to (any one opens it; sections not listed are open to every staff member). */
const AREA_OF: Record<string, Area | Area[]> = {
  attendance: "attendance",
  reports: "attendance",
  students: "roster",
  "at-risk": "roster",
  access: "roster",
  content: "materials",
  quizzes: "quizzes",
  tasks: "tasks",
  announcements: "announcements",
  leaderboard: "points",
  applications: "applications",
  events: "events",
  site: "site",
  projects: "site",
  forms: ["forms", "expo"],
  inbox: "inbox",
  certificates: "certificates",
  settings: "settings",
  apps: "settings",
  portfolios: "portfolios",
  notify: "notify",
  security: "security",
  warnings: "sectors",
  overview: "sectors",
  audit: "security",
  stats: "security",
  errors: "security",
  voice: "voice",
  bans: ["forms", "expo", "roster"],
  pages: "pages",
  whatsapp: "whatsapp",
};
const areasOf = (section: string | undefined): Area[] => {
  const a = section ? AREA_OF[section] : undefined;
  return a ? (Array.isArray(a) ? a : [a]) : [];
};
/** Opens the section (in full or to look at). */
const sees = (me: StaffRow, section: string | undefined) => {
  const a = areasOf(section);
  return !a.length || a.some((x) => canSee(me, x));
};

/** What a view-only person can't change on each area's screens (the database refuses it anyway). */
const AREA_TABLES: Partial<Record<Area, string[]>> = {
  roster: ["students", "access_requests"],
  attendance: ["attendance", "attendance_sessions"],
  quizzes: ["quizzes", "quiz_questions", "quiz_attempts"],
  tasks: ["assignments", "assignment_submissions"],
  materials: ["materials"],
  announcements: ["announcements"],
  points: ["student_bonus"],
  site: ["site_content", "student_projects"],
  pages: ["site_pages"],
  forms: ["forms", "form_responses", "community_bans"],
  expo: ["forms", "form_responses", "community_bans"],
  settings: ["site_settings"],
  voice: ["voice_clips"],
  applications: ["applications", "waitlist"],
  events: ["event_registrations", "event_feedback"],
  inbox: ["inbox_messages"],
  certificates: ["certificates"],
  whatsapp: ["whatsapp_messages"],
};

/** A screen this person may only look at: a note at the top, and changes stopped with a clear message. */
function ViewOnly({ areas, children }: { areas: Area[]; children: React.ReactNode }) {
  const key = areas.join();
  useEffect(() => holdViewOnly(areas.flatMap((a) => AREA_TABLES[a] ?? [])), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <p data-testid="view-only" className="mt-3 flex items-center gap-2 rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs text-cyan">
        <Icon name="eye" size={16} />
        مشاهدة بس: تقدر تشوف كل حاجة هنا، والتعديل مقفول عليك.
      </p>
      {children}
    </>
  );
}

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
  const areas = areasOf(section);
  const tabs = TABS.filter((t) => sees(me, t.href.split("/")[2]));
  if (tabs.length < TABS.length) tabs.push(MORE_TAB);
  const viewOnly = areas.length > 0 && !areas.some((a) => can(me, a));
  if (!sees(me, section))
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
    case "at-risk":
      screen = <AtRiskScreen me={me} />;
      break;
    case "projects":
      screen = <StudentProjectsReview me={me} />;
      break;
    case "access":
      screen = <AccessRequestsScreen me={me} />;
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
          <FormResponses key={id} id={id} me={me} />
        ) : sub === "checkin" ? (
          <DelegationCheckin key={id} id={id} />
        ) : (
          <FormEditor key={id} id={id} me={me} />
        )
      ) : (
        <FormsScreen />
      );
      break;
    case "mytasks":
      screen = <MyTasksScreen key={query.get("t") ?? ""} openId={query.get("t")} />;
      break;
    case "sectors":
      screen = id ? sub ? <TeamTaskScreen key={sub} sectorId={id} id={sub} me={me} /> : <SectorScreen key={`${id}${query.get("task") ?? ""}`} id={id} me={me} query={query} /> : <SectorsScreen />;
      break;
    case "meetings":
      screen = id ? (
        <MeetingScreen key={id} id={id} query={query} onTask={(m, text) => m.sector_id && go(`/staff/sectors/${m.sector_id}?task=${encodeURIComponent(text)}`)} />
      ) : (
        <MeetingsScreen />
      );
      break;
    case "xp":
      screen = <XpScreen />;
      break;
    case "inventory":
      screen = <InventoryScreen key={query.get("tab") ?? ""} me={me.user_id} query={query} />;
      break;
    case "notifications":
      screen = <NotificationsScreen />;
      break;
    case "overview":
      screen = <OverviewScreen me={me} />;
      break;
    case "warnings":
      screen = <WarningsScreen />;
      break;
    case "pages":
      screen = id ? <PageEditor key={id} id={id} me={me} /> : <PagesScreen me={me} />;
      break;
    case "bans":
      screen = <BansScreen />;
      break;
    case "voice":
      screen = <VoiceStudio />;
      break;
    case "whatsapp":
      screen = <WhatsAppScreen me={me} />;
      break;
    case "permissions":
      screen = isFull(me) ? <PermissionsScreen /> : <StaffHome me={me} />;
      break;
    case "more":
      screen = <MoreScreen me={me} />;
      break;
    default:
      screen = <StaffHome me={me} />;
  }
  const first = (me.full_name || me.email).split(/\s+/)[0];
  return (
    <AppShell tabs={tabs} path={path}>
      {viewOnly ? <ViewOnly areas={areas}>{screen}</ViewOnly> : screen}
      {section && section !== "more" && <BaqlozBuddy first={first} path={path.join("/")} />}
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
    const access = can(me, "roster") || isFull(me) ? await pendingAccessRequests().catch(() => 0) : 0;
    const projects = can(me, "site") ? await pendingStudentProjects().catch(() => 0) : 0;
    const atRisk = can(me, "roster") ? await atRiskCount().catch(() => 0) : 0;
    const team = await teamSummary().catch(() => null);
    const award = await rpc<{ name: string; month: string; note: string | null } | null>("staff_award_latest").catch(() => null);
    return {
      open: open as OpenSession[],
      week: week.count ?? 0,
      materials: materials.count ?? 0,
      quizzes: quizzes.count ?? 0,
      applications,
      messages,
      deletions,
      access,
      projects,
      atRisk,
      team,
      award,
    };
  }, []);
  const active = students.list?.filter((s) => s.active) ?? [];
  const noPin = active.filter((s) => !s.hasPin).length;
  const first = (me.full_name || me.email).split(/\s+/)[0];
  const reminders = useStaffReminders();
  // What Baqloz reminds about: the team's list, then this person's areas (applications, messages…).
  const coach = useMemo<Reminder[] | null>(() => {
    if (!reminders.list) return null;
    const extra: Reminder[] = [];
    const n = (x: number | undefined) => x ?? 0;
    if (n(data?.applications)) extra.push({ kind: "applications", to: "/staff/applications", line: data!.applications === 1 ? "فيه طلب انضمام جديد مستني حد يراجعه 📝" : `فيه ${data!.applications} طلبات انضمام جديدة مستنية حد يراجعها 📝` });
    if (n(data?.messages)) extra.push({ kind: "messages", to: "/staff/inbox", line: data!.messages === 1 ? "فيه رسالة جديدة من الموقع ✉️ حد يرد عليها؟" : `فيه ${data!.messages} رسايل جديدة من الموقع ✉️` });
    if (n(data?.access)) extra.push({ kind: "access", to: "/staff/access", line: "فيه حد نسي رمز الدخول أو كلمة المرور ومستنيك 🔑" });
    if (n(data?.projects)) extra.push({ kind: "projects", to: "/staff/projects", line: "طالب بعت مشروع للموقع، بص عليه ⭐" });
    if (n(data?.atRisk)) extra.push({ kind: "at-risk", to: "/staff/at-risk", line: `${data!.atRisk === 1 ? "فيه طالب" : `فيه ${data!.atRisk} طلاب`} محتاجين متابعة (غابوا أو اختفوا) 👀` });
    if (n(data?.deletions)) extra.push({ kind: "deletions", to: "/staff/deletions", line: "فيه طلب حذف حساب، والمتاجر بتطلب تنفيذه خلال 30 يوم 🗑️" });
    const list = reminders.list;
    const unread = list.filter((r) => r.kind === "unread");
    return [...list.filter((r) => r.kind !== "unread"), ...extra, ...unread];
  }, [reminders.list, data]);

  return (
    <>
      <header className="flex items-center justify-between pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <BrandLine />
        <div className="flex">
          <BellButton unread={data?.team?.unread ?? 0} />
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

      <BaqlozCoach first={first} items={coach} />

      {can(me, "attendance") && (
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

      {can(me, "security") && <SecurityAlert />}

      {data?.team?.oversees && (
        <button
          type="button"
          onClick={() => go("/staff/overview")}
          className="mt-4 flex w-full items-center gap-4 rounded-3xl border border-gold/40 bg-gold/[0.06] p-4 text-start transition active:scale-[0.99]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <Icon name="chart" size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-chalk">لوحة المؤسس</span>
            <span className="block text-xs text-fog">الفريق كله: الالتزام، المتأخرين، الإنذارات، عضو الشهر، والقواعد</span>
          </span>
          <Icon name="chevron" size={18} className="rotate-180 text-fog" />
        </button>
      )}

      <XpHomeCard />
      <TeamTasksHome summary={data?.team} />
      <AwardBanner award={data?.award} />

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

      {!!data?.access && (
        <Card className="mt-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
          <Icon name="key" size={22} className="shrink-0 text-warn" />
          <p className="flex-1 text-sm text-mist">
            {data.access === 1 ? "فيه حد نسي رمز الدخول أو كلمة المرور ومستني." : `فيه ${data.access} طلبات دخول مستنية (نسيوا الرمز أو كلمة المرور).`}
          </p>
          <Button size="sm" variant="primary" onClick={() => go("/staff/access")}>
            افتح
          </Button>
        </Card>
      )}

      {!!data?.atRisk && (
        <Card className="mt-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
          <Icon name="users" size={22} className="shrink-0 text-warn" />
          <p className="flex-1 text-sm text-mist">{data.atRisk === 1 ? "فيه طالب محتاج متابعة (غاب أو اختفى)." : `فيه ${data.atRisk} طلاب محتاجين متابعة (غابوا أو اختفوا).`}</p>
          <Button size="sm" onClick={() => go("/staff/at-risk")}>
            شوفهم
          </Button>
        </Card>
      )}

      {!!data?.projects && (
        <Card className="mt-4 flex items-center gap-3 border-gold/30 bg-gold/[0.06]">
          <Icon name="star" size={22} className="shrink-0 text-gold" />
          <p className="flex-1 text-sm text-mist">{data.projects === 1 ? "طالب بعت مشروع للموقع ومستني المراجعة." : `فيه ${data.projects} مشاريع طلاب مستنية المراجعة.`}</p>
          <Button size="sm" variant="primary" onClick={() => go("/staff/projects")}>
            راجِع
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

      {can(me, "training") && (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="طالب نشط" value={students.list ? active.length : "…"} icon="users" />
          <Stat label="جلسات الأسبوع" value={data?.week ?? "…"} icon="calendar" />
          <Stat label="ملفات وروابط" value={data?.materials ?? "…"} icon="book" />
          <Stat label="كويزات منشورة" value={data?.quizzes ?? "…"} icon="quiz" />
        </div>
      )}

      {noPin > 0 && can(me, "roster") && (
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
          <Shortcut icon="flag" label="تاسكاتي" to="/staff/mytasks" />
          {(!!data?.team?.sectors || !!data?.team?.oversees) && <Shortcut icon="users" label="السيكتورات" to="/staff/sectors" />}
          {(!!data?.team?.sectors || !!data?.team?.oversees) && <Shortcut icon="calendar" label="الاجتماعات" to="/staff/meetings" />}
          <Shortcut icon="box" label="المخزن" to="/staff/inventory" />
          {can(me, "roster") && <Shortcut icon="plus" label="إضافة طلاب" to="/staff/students?bulk=1" />}
          {can(me, "site") && <Shortcut icon="globe" label="محتوى الموقع" to="/staff/site" />}
          {canSee(me, "pages") && <Shortcut icon="layers" label="صفحات الموقع" to="/staff/pages" />}
          {can(me, "quizzes") && <Shortcut icon="quiz" label="كويز جديد" to="/staff/quizzes" />}
          {can(me, "tasks") && <Shortcut icon="upload" label="التاسكات" to="/staff/tasks" />}
          {(canSee(me, "forms") || canSee(me, "expo")) && <Shortcut icon="list" label={canSee(me, "forms") ? "الفورمات" : "وفد المعرض"} to="/staff/forms" />}
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
  const allowed = (to: string) => sees(me, to.split("/")[2]);
  const items: { icon: IconKey; label: string; to: string; show?: boolean }[] = [
    { icon: "bell", label: "الإشعارات", to: "/staff/notifications" },
    { icon: "chart", label: "لوحة المؤسس (الفريق كله، القواعد، عضو الشهر)", to: "/staff/overview" },
    { icon: "flag", label: "تاسكاتي وإنذاراتي", to: "/staff/mytasks" },
    { icon: "star", label: "نقطي ومستواي (ترتيب الفريق والأوسمة)", to: "/staff/xp" },
    { icon: "calendar", label: "الاجتماعات", to: "/staff/meetings" },
    { icon: "users", label: "السيكتورات وتاسكات الفريق", to: "/staff/sectors" },
    { icon: "box", label: "المخزن (القطع والأدوات، السلف والطلبات)", to: "/staff/inventory" },
    { icon: "alert", label: "إنذارات الفريق (كل السيكتورات)", to: "/staff/warnings" },
    { icon: "bell", label: "إرسال إشعار للطلاب أو الفريق", to: "/staff/notify" },
    { icon: "upload", label: "التاسكات (تسليم وتصحيح)", to: "/staff/tasks" },
    { icon: "bell", label: "إعلانات للطلاب (بتظهر في التطبيق)", to: "/staff/announcements" },
    { icon: "globe", label: "محتوى الموقع (فعاليات، أخبار، جاليري…)", to: "/staff/site" },
    { icon: "layers", label: "صفحات الموقع (صفحة المعرض وصفحات جديدة بالسحب والإفلات)", to: "/staff/pages" },
    { icon: "star", label: "مشاريع الطلاب (للنشر على الموقع)", to: "/staff/projects" },
    { icon: "mic", label: "صوت بقلظ (سجّل كلامه بصوتك أو ارفع ملف)", to: "/staff/voice" },
    {
      icon: "settings",
      label: "إعدادات الموقع (التواصل، الواجهة، الإعلان، الأهداف)",
      to: "/staff/settings",
    },
    { icon: "user", label: "البورتفوليو بتاعي", to: "/staff/portfolio" },
    { icon: "star", label: "بورتفوليو الفريق", to: "/staff/portfolios" },
    { icon: "users", label: "طلبات الانضمام", to: "/staff/applications" },
    { icon: "bell", label: "رسائل الموقع وطلبات الرعاية", to: "/staff/inbox" },
    { icon: "chat", label: "واتساب (الربط والرسايل)", to: "/staff/whatsapp", show: isFull(me) || canSee(me, "whatsapp") },
    { icon: "list", label: "الفورمات (اختبارات الفرق، تجديد، متطوعين…)", to: "/staff/forms" },
    { icon: "shield", label: "الحظر من الكميونيتي (اللي اتقبلوا ومجوش)", to: "/staff/bans" },
    { icon: "calendar", label: "تسجيل الفعاليات والدخول بالـ QR", to: "/staff/events" },
    { icon: "star", label: "النقاط والأوسمة (ترتيب الطلاب)", to: "/staff/leaderboard" },
    { icon: "award", label: "الشهادات (إصدار وطباعة وتحقق بالـ QR)", to: "/staff/certificates" },
    { icon: "chart", label: "تقارير الحضور", to: "/staff/reports" },
    { icon: "users", label: "طلاب محتاجين متابعة (غياب أو اختفاء)", to: "/staff/at-risk" },
    { icon: "chart", label: "زيارات الموقع (مين بيزور وبيشوف إيه)", to: "/staff/stats" },
    { icon: "shield", label: "الأمان والهجمات", to: "/staff/security" },
    { icon: "alert", label: "أخطاء الموقع", to: "/staff/errors" },
    { icon: "users", label: "الفريق والصلاحيات", to: "/staff/team" },
    { icon: "eye", label: "مين عنده إيه (مقارنة صلاحيات الفريق)", to: "/staff/permissions", show: isFull(me) },
    { icon: "list", label: "سجل النشاط", to: "/staff/audit" },
    { icon: "download", label: "النسخ الاحتياطية", to: "/staff/backups", show: me.role === "owner" },
    { icon: "key", label: "طلبات الدخول (نسيوا الرمز أو كلمة المرور)", to: "/staff/access" },
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
      {can(me, "security") && <UsageCard />}
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
