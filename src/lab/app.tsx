"use client";
/** BuildX Lab: shell (navigation, sign-in, language) and the screens behind each /lab route. */
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { loadMe, meStore } from "./api";
import { CircuitEditor } from "./circuit/editor";
import { LangProvider, useLang, type TKey } from "./i18n";
import { BASE, href, navigate, restoreDeepLink, useRoute } from "./router";
import { Icon, IconButton, Spinner, Toasts, cn, type IconName } from "./ui";
import { Dashboard } from "./pages/dashboard";
import { ProjectList, NewProject } from "./pages/projects";
import { Gallery } from "./pages/gallery";
import { ComponentsPage } from "./pages/components";
import { SettingsPage, ProfilePage } from "./pages/settings";
import { Coming } from "./pages/coming";
import { Academy, ChallengesPage, CoursePage } from "./pages/learn";

/** The 3D Studio (three.js + the geometry kernel) loads only when a design is opened. */
const CadStudio = lazy(() => import("./cad/studio"));

const NAV: { path: string; key: TKey; icon: IconName; group?: "build" | "learn" | "you" }[] = [
  { path: "", key: "navHome", icon: "home" },
  { path: "circuits", key: "navCircuits", icon: "circuit", group: "build" },
  { path: "code", key: "navCode", icon: "code", group: "build" },
  { path: "codeblocks", key: "navBlocks", icon: "blocks", group: "build" },
  { path: "3d", key: "nav3d", icon: "cube", group: "build" },
  { path: "projects", key: "navProjects", icon: "folder", group: "build" },
  { path: "gallery", key: "navGallery", icon: "gallery", group: "learn" },
  { path: "learn", key: "navLearn", icon: "learn", group: "learn" },
  { path: "challenges", key: "navChallenges", icon: "trophy", group: "learn" },
  { path: "components", key: "navComponents", icon: "chip", group: "learn" },
  { path: "classrooms", key: "navClassrooms", icon: "users", group: "you" },
  { path: "profile", key: "navProfile", icon: "user", group: "you" },
  { path: "settings", key: "navSettings", icon: "settings", group: "you" },
];

function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t, lang, setLang } = useLang();
  const { segments } = useRoute();
  const me = meStore.use();
  const [open, setOpen] = useState(false);
  const active = segments[0] ?? "";
  const nav = me?.admin || me?.instructor ? [...NAV, { path: "admin", key: "navAdmin" as TKey, icon: "shield" as IconName, group: "you" as const }] : NAV;
  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className={cn("fixed inset-y-0 start-0 z-40 w-64 border-e border-[var(--line)] bg-deep/95 backdrop-blur transition-transform lg:sticky lg:top-0 lg:h-[100dvh] lg:w-auto lg:translate-x-0", open ? "translate-x-0" : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full")}>
        <div className="flex h-full flex-col">
          <a href={href("")} onClick={(e) => (e.preventDefault(), navigate(""), setOpen(false))} className="flex items-center gap-2.5 px-4 py-4">
            <img src={`${BASE}/brand/logo-badge-160.png`} alt="" className="size-9" />
            <span className="leading-tight">
              <span className="block font-display text-lg font-bold tracking-wide">BUILDX LAB</span>
              <span className="block text-[11px] text-fog">BuildX HUE</span>
            </span>
          </a>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2" aria-label="Lab">
            {nav.map((n, i) => (
              <div key={n.path}>
                {i > 0 && nav[i - 1].group !== n.group && <div className="mx-3 my-2 h-px bg-[var(--line)]" />}
                <a
                  href={href(n.path)}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(n.path);
                    setOpen(false);
                  }}
                  aria-current={active === n.path ? "page" : undefined}
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", active === n.path ? "bg-volt/15 text-frost ring-1 ring-volt/40" : "text-mist hover:bg-panel hover:text-frost")}
                >
                  <Icon name={n.icon} />
                  {t(n.key)}
                </a>
              </div>
            ))}
          </nav>
          <div className="grid gap-2 border-t border-[var(--line)] p-3">
            {me ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="grid size-8 place-items-center rounded-full bg-volt/25 font-semibold text-ice">{me.name?.slice(0, 1)}</span>
                <span className="min-w-0 flex-1 truncate">{me.name}</span>
              </div>
            ) : (
              <button type="button" onClick={() => (navigate("profile"), setOpen(false))} className="rounded-lg bg-volt px-3 py-2 text-sm font-medium text-white hover:bg-volt-hi">
                {t("signIn")}
              </button>
            )}
            <div className="flex items-center justify-between text-xs text-fog">
              <button type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="rounded px-2 py-1 hover:bg-panel hover:text-frost" data-testid="lang-toggle">
                {lang === "ar" ? "English" : "العربية"}
              </button>
              <a href={`${BASE}${lang === "ar" ? "/ar/" : "/"}`} className="rounded px-2 py-1 hover:bg-panel hover:text-frost">
                {t("backToSite")}
              </a>
            </div>
          </div>
        </div>
      </aside>
      {open && <button type="button" aria-label="close" className="fixed inset-0 z-30 bg-void/60 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--line)] bg-void/85 px-3 py-2 backdrop-blur lg:hidden">
          <IconButton icon="menu" label="Menu" onClick={() => setOpen(true)} />
          <span className="font-display font-bold tracking-wide">BUILDX LAB</span>
        </header>
        <main className={cn("mx-auto w-full px-4 py-6 sm:px-6 lg:py-8", wide ? "max-w-[96rem]" : "max-w-6xl")}>{children}</main>
      </div>
    </div>
  );
}

function Routes() {
  const { segments, query } = useRoute();
  const [a, b] = segments;
  const share = query.get("share");
  // Editors take the whole screen.
  if ((a === "circuits" || a === "code") && b && b !== "new") return <CircuitEditor key={b} id={b} share={share} layout={a === "code" ? "code" : "circuit"} />;
  if (a === "3d" && b && b !== "new")
    return (
      <Suspense
        fallback={
          <div className="grid min-h-[100dvh] place-items-center">
            <Spinner size={28} />
          </div>
        }
      >
        <CadStudio key={b} id={b} share={share} />
      </Suspense>
    );
  let page: ReactNode;
  switch (a ?? "") {
    case "":
      page = <Dashboard />;
      break;
    case "circuits":
      page = b === "new" ? <NewProject kind="circuit" /> : <ProjectList kind="circuit" />;
      break;
    case "code":
      page = <ProjectList kind="code" />;
      break;
    case "projects":
      page = <ProjectList />;
      break;
    case "gallery":
      page = <Gallery />;
      break;
    case "components":
      page = <ComponentsPage />;
      break;
    case "settings":
      page = <SettingsPage />;
      break;
    case "profile":
      page = <ProfilePage />;
      break;
    case "3d":
      page = b === "new" ? <NewProject kind="cad" /> : <ProjectList kind="cad" />;
      break;
    case "learn":
      page = b ? <CoursePage key={b} slug={b} /> : <Academy />;
      break;
    case "challenges":
      page = <ChallengesPage />;
      break;
    case "codeblocks":
    case "classrooms":
    case "admin":
      page = <Coming area={a} />;
      break;
    default:
      page = <Coming area="missing" />;
  }
  return <Shell>{page}</Shell>;
}

export default function LabApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      document.documentElement.classList.toggle("bx-reduce-motion", localStorage.getItem("bx-lab-motion") === "reduce");
    } catch {
      /* default motion */
    }
    restoreDeepLink();
    void loadMe().finally(() => setReady(true));
  }, []);
  return (
    <LangProvider>
      {ready ? (
        <Routes />
      ) : (
        <div className="grid min-h-[100dvh] place-items-center">
          <Spinner size={28} />
        </div>
      )}
      <Toasts />
    </LangProvider>
  );
}
