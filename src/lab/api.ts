"use client";
/**
 * The Lab's data: who is signed in (a student's token or a team member's Supabase session, shared
 * with the BuildX App on this site) and projects — in the account when signed in, on this device for
 * guests. Every account call goes through the lab_* database functions, which enforce ownership,
 * sharing and visibility; nothing here is trusted by the server.
 */
import { sb, studentStore } from "@/portal/core";
import { create } from "./store";

export type Kind = "circuit" | "code" | "blocks" | "cad";
export type Visibility = "private" | "unlisted" | "public";
export type Me = { kind: "student" | "staff"; id: string; name: string; instructor: boolean; admin: boolean };
export type Card = {
  id: string;
  kind: Kind;
  title: string;
  description: string;
  tags: string[];
  category: string | null;
  visibility: Visibility;
  thumbnail: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  mine: boolean;
  owner: string | null;
  favorite: boolean;
  favorites: number;
  hidden?: boolean;
  local?: boolean;
};
export type Project = Card & { data: unknown; share_token: string | null; role: "owner" | "editor" | "viewer"; updated_by?: string | null };
export type SaveResult = { ok: true; revision: number } | { ok: false; error: "conflict"; revision: number; by: string | null; at: string } | { ok: false; error: string };

/* ─── Identity ─────────────────────────────────────────────────────────── */

export const meStore = create<Me | null | undefined>(undefined);

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = studentStore.get()?.token ?? null;
  const { data, error } = await sb().rpc(fn, { p_token: token, ...args });
  if (error) {
    if (error.message === "session_invalid") {
      studentStore.set(null);
      meStore.set(null);
    }
    throw error;
  }
  return data as T;
}

export async function loadMe(): Promise<Me | null> {
  try {
    const student = studentStore.get();
    if (!student) {
      const { data } = await sb().auth.getSession();
      if (!data.session) {
        meStore.set(null);
        return null;
      }
    }
    const me = await rpc<Me>("lab_me");
    meStore.set(me);
    return me;
  } catch {
    meStore.set(null);
    return null;
  }
}

export async function studentSignIn(code: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb().rpc("student_login", { p_code: code.trim(), p_pin: pin.trim() });
  if (error) return { ok: false, error: "network" };
  const r = data as { ok: boolean; error?: string; token?: string; student?: { name: string; code: string; group: string } };
  if (r.ok && r.token && r.student) {
    studentStore.set({ token: r.token, ...r.student });
    await loadMe();
    return { ok: true };
  }
  return { ok: false, error: r.error };
}

export async function signOut() {
  if (studentStore.get()) {
    const token = studentStore.get()?.token;
    studentStore.set(null);
    await sb().rpc("student_logout", { p_token: token }).then(
      () => {},
      () => {},
    );
  } else await sb().auth.signOut();
  meStore.set(null);
}

/* ─── Projects on this device (guests) ─────────────────────────────────── */

const LOCAL_KEY = "bx-lab-local-projects";
type LocalProject = Omit<Project, "role">;
function localAll(): LocalProject[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as LocalProject[];
  } catch {
    return [];
  }
}
function localPut(list: LocalProject[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}
const isLocal = (id: string) => id.startsWith("local-");
const stripData = ({ data: _d, share_token: _s, ...card }: LocalProject): Card => (void _d, void _s, card);

/* ─── Projects (account or device) ─────────────────────────────────────── */

export type ListFilter = { kind?: Kind; q?: string; favorites?: boolean; deleted?: boolean; shared?: boolean; sort?: "updated" | "title" | "created" };

export const projects = {
  async list(f: ListFilter = {}): Promise<Card[]> {
    if (!meStore.get()) {
      const q = f.q?.trim().toLowerCase();
      return localAll()
        .filter((p) => (f.deleted ? p.deleted_at : !p.deleted_at) && (!f.kind || p.kind === f.kind) && (!f.favorites || p.favorite) && !f.shared)
        .filter((p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
        .sort((a, b) => (f.sort === "title" ? a.title.localeCompare(b.title) : b.updated_at.localeCompare(a.updated_at)))
        .map(stripData);
    }
    return rpc<Card[]>("lab_projects_list", { p_filter: f });
  },

  async get(id: string, share?: string | null): Promise<Project | null> {
    if (isLocal(id)) {
      const p = localAll().find((x) => x.id === id);
      return p ? { ...p, role: "owner" } : null;
    }
    const r = await rpc<{ ok: boolean; role?: Project["role"]; project?: Omit<Project, "role"> }>("lab_project_get", { p_id: id, p_share: share ?? null });
    return r.ok && r.project ? { ...r.project, role: r.role! } : null;
  },

  async create(kind: Kind, title: string, data: unknown, meta: { description?: string; tags?: string[]; thumbnail?: string } = {}): Promise<string> {
    if (!meStore.get()) {
      const now = new Date().toISOString();
      const id = `local-${crypto.randomUUID()}`;
      localPut([
        { id, kind, title, description: meta.description ?? "", tags: meta.tags ?? [], category: null, visibility: "private", thumbnail: meta.thumbnail ?? null, revision: 1, created_at: now, updated_at: now, deleted_at: null, mine: true, owner: null, favorite: false, favorites: 0, local: true, data, share_token: null },
        ...localAll(),
      ]);
      return id;
    }
    const r = await rpc<{ ok: boolean; id?: string; error?: string }>("lab_project_create", { p_kind: kind, p_title: title, p_data: data, p_meta: meta });
    if (!r.ok || !r.id) throw new Error(r.error ?? "create_failed");
    return r.id;
  },

  async save(id: string, base: number, data: unknown, meta: { title?: string; thumbnail?: string } = {}, snapshot?: string): Promise<SaveResult> {
    if (isLocal(id)) {
      const list = localAll();
      const p = list.find((x) => x.id === id);
      if (!p) return { ok: false, error: "not_found" };
      Object.assign(p, { data, revision: p.revision + 1, updated_at: new Date().toISOString() }, meta.title ? { title: meta.title } : {}, meta.thumbnail ? { thumbnail: meta.thumbnail } : {});
      localPut(list);
      return { ok: true, revision: p.revision };
    }
    return rpc<SaveResult>("lab_project_save", { p_id: id, p_base: base, p_data: data, p_meta: meta, p_snapshot: snapshot ?? null });
  },

  async settings(id: string, patch: { title?: string; description?: string; tags?: string[]; visibility?: Visibility }): Promise<{ ok: boolean; share_token?: string | null }> {
    if (isLocal(id)) {
      const list = localAll();
      const p = list.find((x) => x.id === id);
      if (p) Object.assign(p, patch.title ? { title: patch.title } : {}, patch.description !== undefined ? { description: patch.description } : {}, patch.tags ? { tags: patch.tags } : {}, { updated_at: new Date().toISOString() });
      localPut(list);
      return { ok: !!p };
    }
    return rpc("lab_project_settings", { p_id: id, p_patch: patch });
  },

  async trash(id: string, on: boolean) {
    if (isLocal(id)) {
      const list = localAll();
      const p = list.find((x) => x.id === id);
      if (p) p.deleted_at = on ? new Date().toISOString() : null;
      localPut(list);
      return;
    }
    await rpc("lab_project_trash", { p_id: id, p_trash: on });
  },

  /** Removes a device-only project for good (account projects only go to the trash). */
  purgeLocal(id: string) {
    localPut(localAll().filter((p) => p.id !== id));
  },

  async clone(id: string, share?: string | null): Promise<string> {
    if (isLocal(id) || !meStore.get()) {
      const src = await projects.get(id, share);
      if (!src) throw new Error("not_found");
      return projects.create(src.kind, `${src.title} (2)`.slice(0, 120), src.data, { description: src.description, tags: src.tags });
    }
    const r = await rpc<{ ok: boolean; id?: string; error?: string }>("lab_project_clone", { p_id: id, p_share: share ?? null });
    if (!r.ok || !r.id) throw new Error(r.error ?? "clone_failed");
    return r.id;
  },

  async versions(id: string): Promise<{ id: string; revision: number; title: string; note: string | null; at: string; by: string | null }[]> {
    if (isLocal(id)) return [];
    return rpc("lab_versions", { p_id: id });
  },

  async restoreVersion(id: string, version: string): Promise<SaveResult> {
    return rpc("lab_version_restore", { p_id: id, p_version: version });
  },

  async favorite(id: string, on: boolean) {
    if (isLocal(id)) {
      const list = localAll();
      const p = list.find((x) => x.id === id);
      if (p) p.favorite = on;
      localPut(list);
      return;
    }
    await rpc("lab_favorite", { p_id: id, p_on: on });
  },

  localCount: () => localAll().filter((p) => !p.deleted_at).length,

  /** After signing in: copy this device's projects into the account (the device copies are then removed). */
  async moveLocalToAccount(): Promise<number> {
    let n = 0;
    for (const p of localAll().filter((x) => !x.deleted_at)) {
      await projects.create(p.kind, p.title, p.data, { description: p.description, tags: p.tags });
      projects.purgeLocal(p.id);
      n++;
    }
    return n;
  },
};

export type Dashboard = {
  projects: Partial<Record<Kind, number>> | null;
  activity: Record<string, number> | null;
  sim_seconds: number;
  days: number;
  recent: Card[];
  public: Card[];
};
export const dashboard = () => rpc<Dashboard>("lab_dashboard");
export const gallery = (f: { q?: string; kind?: Kind; sort?: "new" | "popular" } = {}) => rpc<Card[]>("lab_gallery", { p_filter: f });

/** Something real happened in the editor (counted on the dashboard). Guests aren't counted. */
export function labEvent(kind: "compile_ok" | "compile_error" | "sim_run" | "export", project: string | null, detail: Record<string, unknown> = {}) {
  if (!meStore.get()) return;
  void rpc("lab_event", { p_project: project && !isLocal(project) ? project : null, p_kind: kind, p_detail: detail }).catch(() => {});
}

/* ─── Academy ──────────────────────────────────────────────────────────── */

export type LessonKind = "read" | "material" | "quiz" | "session" | "lab";
export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  summary: string;
  summary_en: string | null;
  level: 1 | 2 | 3;
  hours: number | null;
  group: string | null;
  lessons: number;
  kinds: Partial<Record<LessonKind, number>>;
  mine: boolean;
  percent: number | null;
};
export type Lesson = {
  id: string;
  kind: LessonKind;
  title: string;
  title_en: string | null;
  body: string;
  body_en: string | null;
  minutes: number | null;
  required: boolean;
  pass: number;
  challenge: string | null;
  /** Only for a student of the course; null otherwise. */
  done: boolean | null;
  material: { id: string; title: string; kind: "file" | "link"; url: string | null; path: string | null } | null;
  quiz: { id: string; title: string; opens: string | null; closes: string | null; best: number | null } | null;
  session: { title: string; at: string } | null;
};
export type Course = Omit<CourseCard, "lessons" | "kinds" | "mine" | "percent"> & {
  published: boolean;
  enrolled: boolean;
  certificate: { code: string; on: string } | null;
  lessons: Lesson[];
};

export const academy = {
  catalog: () => rpc<CourseCard[]>("academy_catalog"),
  course: (slug: string) => rpc<Course | null>("academy_course", { p_slug: slug }),
  read: (lesson: string) => rpc<{ ok: boolean }>("academy_read", { p_lesson: lesson }),
  materialSeen: (material: string) => rpc("student_material_seen", { p_material: material }).catch(() => undefined),
  /** Challenges this student passed (slug → when). Empty for guests and the team. */
  passed: async (): Promise<Record<string, string>> => (meStore.get()?.kind === "student" ? rpc<Record<string, string>>("lab_challenge_passes_mine").catch(() => ({})) : {}),
  pass: (slug: string, project: string | null, checks: { label: { en: string; ar: string }; ok: boolean; got?: string }[], seconds: number) =>
    rpc<{ ok: boolean }>("lab_challenge_pass", { p_slug: slug, p_project: project && !isLocal(project) ? project : null, p_checks: checks, p_seconds: seconds }),
  /** Challenge points and the leaderboards (students only). */
  board: async (): Promise<Board | null> => (meStore.get()?.kind === "student" ? rpc<Board>("lab_challenge_board").catch(() => null) : null),
};

export type BoardRow = { name: string; points: number; passed: number; me: boolean };
export type Board = { me: { points: number; passed: number; rank: number; group_rank: number } | null; group: string | null; group_top: BoardRow[]; top: BoardRow[] };

/* ─── Classrooms (Lab tasks from the team) ─────────────────────────────── */

export type LabCheck = { label: { en: string; ar: string }; ok: boolean; got?: string };
export type LabTask = {
  id: string;
  title: string;
  description: string;
  due: string | null;
  max_points: number;
  allow_late: boolean;
  challenge: string | null;
  template: { title: string; kind: Kind; data: unknown } | null;
  submission: { at: string; late: boolean; project: string | null; passed: boolean | null; checks: LabCheck[] | null; grade: number | null; feedback: string | null; graded_at: string | null } | null;
};

export const classroom = {
  tasks: () => rpc<LabTask[]>("lab_assignments"),
  submit: (assignment: string, project: string, checks: LabCheck[] | null, passed: boolean | null) =>
    rpc<{ ok: boolean; late?: boolean; error?: string }>("lab_assignment_submit", { p_assignment: assignment, p_project: project, p_checks: checks, p_passed: passed }),
};
