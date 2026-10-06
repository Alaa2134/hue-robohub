import { sql, type SQL } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────────
 * Custom types
 * ──────────────────────────────────────────────────────────────────────────── */

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Weighted full-text vector built from text columns. */
function searchVector(parts: Array<[SQL, "A" | "B" | "C" | "D"]>) {
  const body = parts
    .map(([col, w]) => sql`setweight(to_tsvector('simple', coalesce(${col}, '')), '${sql.raw(w)}')`)
    .reduce((acc, cur) => sql`${acc} || ${cur}`);
  return tsvector("search").generatedAlwaysAs(body);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Enums
 * ──────────────────────────────────────────────────────────────────────────── */

export const userRole = pgEnum("user_role", ["owner", "admin", "lead", "member", "trainee"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);

/** Organisational hierarchy — drives badges and the public org chart. */
export const memberRank = pgEnum("member_rank", [
  "founder",
  "team_leader",
  "vice_leader",
  "technical_lead",
  "competition_lead",
  "media",
  "pr",
  "member",
  "trainee",
]);
export const department = pgEnum("department", [
  "leadership",
  "hardware",
  "embedded",
  "mechanical",
  "software",
  "competition",
  "media",
  "pr",
  "events",
]);
export const memberStatus = pgEnum("member_status", ["active", "inactive", "alumni"]);

export const applicationStatus = pgEnum("application_status", [
  "pending",
  "interview",
  "accepted",
  "waitlist",
  "rejected",
  "trainee",
  "converted",
]);

export const projectStatus = pgEnum("project_status", [
  "idea",
  "research",
  "design",
  "prototype",
  "testing",
  "competition_ready",
  "completed",
  "archived",
]);

export const taskStatus = pgEnum("task_status", ["backlog", "todo", "in_progress", "review", "done"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high", "critical"]);

export const bomStatus = pgEnum("bom_status", [
  "needed",
  "ordered",
  "received",
  "installed",
  "failed",
  "replacement_needed",
]);

export const inventoryCondition = pgEnum("inventory_condition", ["new", "good", "worn", "damaged", "retired"]);

export const eventType = pgEnum("event_type", [
  "meeting",
  "workshop",
  "training",
  "competition",
  "deadline",
  "presentation",
  "maintenance",
  "bootcamp",
]);

export const attendanceStatus = pgEnum("attendance_status", ["present", "late", "absent", "excused"]);
export const attendanceMethod = pgEnum("attendance_method", ["manual", "qr"]);

export const competitionStatus = pgEnum("competition_status", [
  "planned",
  "registered",
  "competing",
  "completed",
  "withdrawn",
]);

export const achievementKind = pgEnum("achievement_kind", ["win", "ranking", "certificate", "milestone", "award"]);

export const assetKind = pgEnum("asset_kind", ["image", "document", "other"]);
export const assetVisibility = pgEnum("asset_visibility", ["public", "private"]);
export const scanStatus = pgEnum("scan_status", ["pending", "clean", "infected", "skipped"]);

export const galleryCategory = pgEnum("gallery_category", [
  "workshop",
  "competition",
  "robot_build",
  "behind_the_scenes",
  "events",
  "awards",
]);

export const videoProvider = pgEnum("video_provider", ["mux", "cloudflare", "hls", "youtube"]);
export const videoKind = pgEnum("video_kind", [
  "hero",
  "story",
  "showreel",
  "recap",
  "promo",
  "interview",
  "reel",
  "testing",
]);

export const sponsorTier = pgEnum("sponsor_tier", ["strategic", "gold", "silver", "technical"]);
export const articleKind = pgEnum("article_kind", ["news", "blog"]);
export const resourceKind = pgEnum("resource_kind", ["guide", "datasheet", "video", "repository", "course", "tool"]);
export const progressStatus = pgEnum("progress_status", ["not_started", "in_progress", "submitted", "passed", "failed"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);
export const messageStatus = pgEnum("message_status", ["new", "read", "archived"]);

/* ────────────────────────────────────────────────────────────────────────────
 * Media assets (object storage pointers — never binary data)
 * ──────────────────────────────────────────────────────────────────────────── */

export type ImageVariant = { w: number; h: number; format: "avif" | "webp" | "jpeg"; key: string; bytes: number };

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    kind: assetKind("kind").notNull(),
    visibility: assetVisibility("visibility").notNull(),
    /** Storage key of the original upload (always private for images that get re-encoded). */
    originalKey: text("original_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    /** Generated responsive renditions. Metadata only. */
    variants: jsonb("variants").$type<ImageVariant[]>().notNull().default([]),
    /** Tiny inline blur placeholder (≈200 bytes). */
    placeholder: text("placeholder"),
    dominantColor: text("dominant_color"),
    alt: text("alt"),
    folder: text("folder"),
    scanStatus: scanStatus("scan_status").notNull().default("skipped"),
    uploadedBy: uuid("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_assets_folder_idx").on(t.folder),
    index("media_assets_created_idx").on(t.createdAt),
    check("media_assets_bytes_positive", sql`${t.bytes} > 0`),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Organisation structure
 * ──────────────────────────────────────────────────────────────────────────── */

export const tracks = pgTable(
  "tracks",
  {
    id: id(),
    slug: text("slug").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    tagline: text("tagline").notNull().default(""),
    taglineAr: text("tagline_ar"),
    description: text("description").notNull().default(""),
    descriptionAr: text("description_ar"),
    tools: text("tools").array().notNull().default(sql`'{}'::text[]`),
    technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
    competitions: text("competitions").array().notNull().default(sql`'{}'::text[]`),
    illustration: text("illustration").notNull().default("embedded"),
    coverId: uuid("cover_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    published: boolean("published").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tracks_slug_key").on(t.slug)],
);

export const trackRoadmapSteps = pgTable(
  "track_roadmap_steps",
  {
    id: id(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("roadmap_track_idx").on(t.trackId, t.position)],
);

export const competitionTeams = pgTable(
  "competition_teams",
  {
    id: id(),
    slug: text("slug").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    discipline: text("discipline").notNull(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    accent: text("accent").notNull().default("#2F7BFF"),
    robotName: text("robot_name"),
    robotDescription: text("robot_description"),
    captainId: uuid("captain_id"),
    coverId: uuid("cover_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    published: boolean("published").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("teams_slug_key").on(t.slug)],
);

export const teamSpecs = pgTable(
  "team_specs",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => competitionTeams.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("team_specs_team_idx").on(t.teamId, t.position)],
);

export const members = pgTable(
  "members",
  {
    id: id(),
    slug: text("slug").notNull(),
    fullName: text("full_name").notNull(),
    fullNameAr: text("full_name_ar"),
    rank: memberRank("rank").notNull().default("member"),
    department: department("department"),
    /** Free-form public title, e.g. "Embedded Systems Lead". */
    title: text("title"),
    trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    academicYear: integer("academic_year"),
    bio: text("bio").notNull().default(""),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    photoId: uuid("photo_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    /** Crop rectangle (0..1 fractions of the original) used for photo renditions. */
    photoCrop: jsonb("photo_crop").$type<{ x: number; y: number; w: number; h: number }>(),
    linkedin: text("linkedin"),
    github: text("github"),
    instagram: text("instagram"),
    facebook: text("facebook"),
    youtube: text("youtube"),
    website: text("website"),
    publicProfile: boolean("public_profile").notNull().default(false),
    status: memberStatus("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(100),
    joinedAt: date("joined_at"),
    /* Private — never selected by public queries. */
    phone: text("phone"),
    privateEmail: text("private_email"),
    adminNotes: text("admin_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    search: searchVector([
      [sql`full_name`, "A"],
      [sql`title`, "B"],
      [sql`rh_array_to_text(skills)`, "B"],
      [sql`bio`, "C"],
    ]),
  },
  (t) => [
    uniqueIndex("members_slug_key").on(t.slug),
    index("members_public_idx").on(t.publicProfile, t.status, t.rank, t.sortOrder),
    index("members_track_idx").on(t.trackId),
    index("members_team_idx").on(t.teamId),
    index("members_search_idx").using("gin", t.search),
    check("members_year_range", sql`${t.academicYear} is null or (${t.academicYear} between 1 and 7)`),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Identity & access
 * ──────────────────────────────────────────────────────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: citext("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("member"),
    status: userStatus("status").notNull().default("active"),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email), uniqueIndex("users_member_key").on(t.memberId)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the opaque session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Pending sessions await a second factor and grant no access. */
    pendingMfa: boolean("pending_mfa").notNull().default(false),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expiry_idx").on(t.absoluteExpiresAt)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("reset_user_idx").on(t.userId)],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Recruitment
 * ──────────────────────────────────────────────────────────────────────────── */

export const applications = pgTable(
  "applications",
  {
    id: id(),
    fullName: text("full_name").notNull(),
    email: citext("email").notNull(),
    phone: text("phone").notNull(),
    academicYear: integer("academic_year").notNull(),
    trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    experience: text("experience").notNull().default(""),
    portfolioUrl: text("portfolio_url"),
    githubUrl: text("github_url"),
    motivation: text("motivation").notNull(),
    availability: text("availability").notNull(),
    status: applicationStatus("status").notNull().default("pending"),
    interviewAt: timestamp("interview_at", { withTimezone: true }),
    reviewerNotes: text("reviewer_notes"),
    score: integer("score"),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("applications_status_idx").on(t.status, t.createdAt),
    index("applications_email_idx").on(t.email),
    check("applications_score_range", sql`${t.score} is null or (${t.score} between 0 and 10)`),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Projects
 * ──────────────────────────────────────────────────────────────────────────── */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: projectStatus("status").notNull().default("idea"),
    progress: integer("progress").notNull().default(0),
    managerId: uuid("manager_id").references(() => members.id, { onDelete: "set null" }),
    trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    problem: text("problem").notNull().default(""),
    solution: text("solution").notNull().default(""),
    electronics: text("electronics").notNull().default(""),
    mechanical: text("mechanical").notNull().default(""),
    software: text("software").notNull().default(""),
    challenges: text("challenges").notNull().default(""),
    testing: text("testing").notNull().default(""),
    results: text("results").notNull().default(""),
    technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
    githubUrl: text("github_url"),
    demoUrl: text("demo_url"),
    budget: numeric("budget", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("EGP"),
    notes: text("notes"),
    heroId: uuid("hero_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    videoId: uuid("video_id"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    published: boolean("published").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    search: searchVector([
      [sql`title`, "A"],
      [sql`summary`, "B"],
      [sql`rh_array_to_text(technologies)`, "B"],
      [sql`problem`, "C"],
      [sql`solution`, "C"],
    ]),
  },
  (t) => [
    uniqueIndex("projects_slug_key").on(t.slug),
    index("projects_public_idx").on(t.published, t.featured, t.updatedAt),
    index("projects_status_idx").on(t.status),
    index("projects_search_idx").using("gin", t.search),
    check("projects_progress_range", sql`${t.progress} between 0 and 100`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("Engineer"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.memberId] }), index("project_members_member_idx").on(t.memberId)],
);

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("milestones_project_idx").on(t.projectId, t.position)],
);

export const bomItems = pgTable(
  "bom_items",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    part: text("part").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    vendor: text("vendor"),
    url: text("url"),
    status: bomStatus("status").notNull().default("needed"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bom_project_idx").on(t.projectId),
    check("bom_quantity_positive", sql`${t.quantity} > 0`),
    check("bom_price_nonneg", sql`${t.unitPrice} >= 0`),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    sku: text("sku"),
    quantity: integer("quantity").notNull().default(0),
    /** Restock threshold — the Overview flags items at or below it. */
    minQuantity: integer("min_quantity").notNull().default(0),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
    datasheetUrl: text("datasheet_url"),
    location: text("location"),
    condition: inventoryCondition("condition").notNull().default("good"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inventory_category_idx").on(t.category),
    check("inventory_quantity_nonneg", sql`${t.quantity} >= 0`),
    check("inventory_min_nonneg", sql`${t.minQuantity} >= 0`),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Tasks
 * ──────────────────────────────────────────────────────────────────────────── */

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("backlog"),
    priority: taskPriority("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => members.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Fractional ordering inside a column; allows O(1) reorders. */
    position: real("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_board_idx").on(t.status, t.position),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_team_idx").on(t.teamId),
    index("tasks_due_idx").on(t.dueDate),
  ],
);

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("checklist_task_idx").on(t.taskId)],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_task_idx").on(t.taskId, t.createdAt)],
);

export const taskAttachments = pgTable(
  "task_attachments",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.assetId] })],
);

export const taskActivity = pgTable(
  "task_activity",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("task_activity_task_idx").on(t.taskId, t.createdAt)],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Calendar, attendance, competitions
 * ──────────────────────────────────────────────────────────────────────────── */

export const events = pgTable(
  "events",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    type: eventType("type").notNull(),
    description: text("description").notNull().default(""),
    location: text("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    coverId: uuid("cover_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    bootcampModuleId: uuid("bootcamp_module_id"),
    public: boolean("public").notNull().default(false),
    registrationUrl: text("registration_url"),
    ctaLabel: text("cta_label"),
    /** Random secret embedded in the attendance QR code; rotate to invalidate printed codes. */
    attendanceCode: text("attendance_code"),
    attendanceOpen: boolean("attendance_open").notNull().default(false),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    search: searchVector([
      [sql`title`, "A"],
      [sql`location`, "B"],
      [sql`description`, "C"],
    ]),
  },
  (t) => [
    uniqueIndex("events_slug_key").on(t.slug),
    index("events_time_idx").on(t.startsAt),
    index("events_public_idx").on(t.public, t.startsAt),
    index("events_search_idx").using("gin", t.search),
    check("events_time_order", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
  ],
);

export const attendance = pgTable(
  "attendance",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    status: attendanceStatus("status").notNull(),
    method: attendanceMethod("method").notNull().default("manual"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.memberId] }), index("attendance_member_idx").on(t.memberId)],
);

export const competitions = pgTable(
  "competitions",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    organizer: text("organizer"),
    location: text("location"),
    category: text("category"),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    registrationDeadline: timestamp("registration_deadline", { withTimezone: true }),
    status: competitionStatus("status").notNull().default("planned"),
    result: text("result"),
    rank: integer("rank"),
    notes: text("notes"),
    url: text("url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competitions_slug_key").on(t.slug),
    index("competitions_time_idx").on(t.startsAt),
    index("competitions_team_idx").on(t.teamId),
  ],
);

export const competitionMembers = pgTable(
  "competition_members",
  {
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("Team member"),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.memberId] })],
);

export const achievements = pgTable(
  "achievements",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: achievementKind("kind").notNull(),
    achievedOn: date("achieved_on").notNull(),
    rank: integer("rank"),
    competitionId: uuid("competition_id").references(() => competitions.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    imageId: uuid("image_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    public: boolean("public").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("achievements_date_idx").on(t.public, t.achievedOn)],
);

export const achievementMembers = pgTable(
  "achievement_members",
  {
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.achievementId, t.memberId] }), index("ach_members_member_idx").on(t.memberId)],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Bootcamp
 * ──────────────────────────────────────────────────────────────────────────── */

export const bootcampModules = pgTable(
  "bootcamp_modules",
  {
    id: id(),
    week: integer("week").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    outcomes: text("outcomes").array().notNull().default(sql`'{}'::text[]`),
    published: boolean("published").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("bootcamp_week_key").on(t.week)],
);

export const bootcampLessons = pgTable(
  "bootcamp_lessons",
  {
    id: id(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => bootcampModules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    materialUrl: text("material_url"),
    durationMinutes: integer("duration_minutes"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("lessons_module_idx").on(t.moduleId, t.position)],
);

export const bootcampAssignments = pgTable(
  "bootcamp_assignments",
  {
    id: id(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => bootcampModules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    brief: text("brief").notNull().default(""),
    dueDate: date("due_date"),
    maxScore: integer("max_score").notNull().default(100),
  },
  (t) => [index("assignments_module_idx").on(t.moduleId)],
);

export const bootcampProgress = pgTable(
  "bootcamp_progress",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => bootcampModules.id, { onDelete: "cascade" }),
    status: progressStatus("status").notNull().default("not_started"),
    score: integer("score"),
    feedback: text("feedback"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.moduleId] }), index("progress_module_idx").on(t.moduleId)],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Gallery, video, sponsors, publishing
 * ──────────────────────────────────────────────────────────────────────────── */

export const galleryAlbums = pgTable(
  "gallery_albums",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: galleryCategory("category").notNull(),
    takenOn: date("taken_on"),
    coverId: uuid("cover_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    published: boolean("published").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("albums_slug_key").on(t.slug), index("albums_public_idx").on(t.published, t.takenOn)],
);

export const galleryItems = pgTable(
  "gallery_items",
  {
    id: id(),
    albumId: uuid("album_id").references(() => galleryAlbums.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    caption: text("caption"),
    category: galleryCategory("category").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    featured: boolean("featured").notNull().default(false),
    takenOn: date("taken_on"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
    published: boolean("published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("gallery_album_idx").on(t.albumId, t.sortOrder),
    index("gallery_public_idx").on(t.published, t.category, t.createdAt),
    index("gallery_project_idx").on(t.projectId),
    index("gallery_team_idx").on(t.teamId),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: videoKind("kind").notNull(),
    provider: videoProvider("provider").notNull(),
    /** Mux playback id / Cloudflare uid / HLS URL / YouTube id depending on provider. */
    source: text("source").notNull(),
    posterId: uuid("poster_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    durationSeconds: integer("duration_seconds"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => competitionTeams.id, { onDelete: "set null" }),
    published: boolean("published").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    recordedOn: date("recorded_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("videos_public_idx").on(t.published, t.kind, t.createdAt)],
);

export const sponsors = pgTable(
  "sponsors",
  {
    id: id(),
    name: text("name").notNull(),
    tier: sponsorTier("tier").notNull(),
    logoId: uuid("logo_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    website: text("website"),
    description: text("description").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sponsors_tier_idx").on(t.active, t.tier, t.sortOrder)],
);

export const articles = pgTable(
  "articles",
  {
    id: id(),
    slug: text("slug").notNull(),
    kind: articleKind("kind").notNull().default("news"),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    coverId: uuid("cover_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    authorId: uuid("author_id").references(() => members.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    search: searchVector([
      [sql`title`, "A"],
      [sql`excerpt`, "B"],
      [sql`body`, "D"],
    ]),
  },
  (t) => [
    uniqueIndex("articles_slug_key").on(t.slug),
    index("articles_pub_idx").on(t.publishedAt),
    index("articles_search_idx").using("gin", t.search),
  ],
);

export const resources = pgTable(
  "resources",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: resourceKind("kind").notNull(),
    url: text("url").notNull(),
    trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
    published: boolean("published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    search: searchVector([
      [sql`title`, "A"],
      [sql`description`, "C"],
    ]),
  },
  (t) => [index("resources_track_idx").on(t.trackId), index("resources_search_idx").using("gin", t.search)],
);

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: id(),
    name: text("name").notNull(),
    email: citext("email").notNull(),
    organization: text("organization"),
    topic: text("topic").notNull(),
    message: text("message").notNull(),
    status: messageStatus("status").notNull().default("new"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("contact_status_idx").on(t.status, t.createdAt)],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Platform
 * ──────────────────────────────────────────────────────────────────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

/** CMS key/value store for site-wide configuration (hero copy, contact, socials…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    summary: text("summary"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_actor_idx").on(t.actorId, t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
    index("audit_action_idx").on(t.action),
  ],
);

/** Durable Postgres-backed job queue consumed with FOR UPDATE SKIP LOCKED. */
export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatus("status").notNull().default("queued"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("jobs_ready_idx").on(t.status, t.runAt),
    uniqueIndex("jobs_dedupe_key").on(t.dedupeKey).where(sql`${t.dedupeKey} is not null and ${t.status} in ('queued','running')`),
  ],
);
