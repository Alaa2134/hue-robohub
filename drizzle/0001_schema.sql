CREATE TYPE "public"."achievement_kind" AS ENUM('win', 'ranking', 'certificate', 'milestone', 'award');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'interview', 'accepted', 'waitlist', 'rejected', 'converted');--> statement-breakpoint
CREATE TYPE "public"."article_kind" AS ENUM('news', 'blog');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('image', 'document', 'other');--> statement-breakpoint
CREATE TYPE "public"."asset_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."attendance_method" AS ENUM('manual', 'qr');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."bom_status" AS ENUM('needed', 'ordered', 'received', 'installed', 'failed', 'replacement_needed');--> statement-breakpoint
CREATE TYPE "public"."competition_status" AS ENUM('planned', 'registered', 'competing', 'completed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."department" AS ENUM('leadership', 'hardware', 'embedded', 'mechanical', 'software', 'competition', 'media', 'pr', 'events');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('meeting', 'workshop', 'training', 'competition', 'deadline', 'presentation', 'maintenance', 'bootcamp');--> statement-breakpoint
CREATE TYPE "public"."gallery_category" AS ENUM('workshop', 'competition', 'robot_build', 'behind_the_scenes', 'events', 'awards');--> statement-breakpoint
CREATE TYPE "public"."inventory_condition" AS ENUM('new', 'good', 'worn', 'damaged', 'retired');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."member_rank" AS ENUM('founder', 'team_leader', 'vice_leader', 'technical_lead', 'competition_lead', 'media', 'pr', 'member', 'trainee');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'inactive', 'alumni');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('new', 'read', 'archived');--> statement-breakpoint
CREATE TYPE "public"."progress_status" AS ENUM('not_started', 'in_progress', 'submitted', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('idea', 'research', 'design', 'prototype', 'testing', 'competition_ready', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('guide', 'datasheet', 'video', 'repository', 'course', 'tool');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'clean', 'infected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."sponsor_tier" AS ENUM('strategic', 'gold', 'silver', 'technical');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('backlog', 'todo', 'in_progress', 'review', 'done');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'lead', 'member', 'trainee');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."video_kind" AS ENUM('hero', 'story', 'showreel', 'recap', 'promo', 'interview', 'reel', 'testing');--> statement-breakpoint
CREATE TYPE "public"."video_provider" AS ENUM('mux', 'cloudflare', 'hls', 'youtube');--> statement-breakpoint
CREATE TABLE "achievement_members" (
	"achievement_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "achievement_members_achievement_id_member_id_pk" PRIMARY KEY("achievement_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "achievement_kind" NOT NULL,
	"achieved_on" date NOT NULL,
	"rank" integer,
	"competition_id" uuid,
	"team_id" uuid,
	"project_id" uuid,
	"image_id" uuid,
	"public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text NOT NULL,
	"academic_year" integer NOT NULL,
	"track_id" uuid,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"portfolio_url" text,
	"github_url" text,
	"motivation" text NOT NULL,
	"availability" text NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"interview_at" timestamp with time zone,
	"reviewer_notes" text,
	"score" integer,
	"member_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_score_range" CHECK ("applications"."score" is null or ("applications"."score" between 0 and 10))
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "article_kind" DEFAULT 'news' NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cover_id" uuid,
	"author_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') || setweight(to_tsvector('simple', coalesce(body, '')), 'D')) STORED
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"method" "attendance_method" DEFAULT 'manual' NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_event_id_member_id_pk" PRIMARY KEY("event_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"summary" text,
	"meta" jsonb,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"part" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vendor" text,
	"url" text,
	"status" "bom_status" DEFAULT 'needed' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bom_quantity_positive" CHECK ("bom_items"."quantity" > 0),
	CONSTRAINT "bom_price_nonneg" CHECK ("bom_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bootcamp_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"due_date" date,
	"max_score" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bootcamp_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"material_url" text,
	"duration_minutes" integer,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bootcamp_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"outcomes" text[] DEFAULT '{}'::text[] NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bootcamp_progress" (
	"member_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"status" "progress_status" DEFAULT 'not_started' NOT NULL,
	"score" integer,
	"feedback" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootcamp_progress_member_id_module_id_pk" PRIMARY KEY("member_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "competition_members" (
	"competition_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text DEFAULT 'Team member' NOT NULL,
	CONSTRAINT "competition_members_competition_id_member_id_pk" PRIMARY KEY("competition_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "competition_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"discipline" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"accent" text DEFAULT '#2F7BFF' NOT NULL,
	"robot_name" text,
	"robot_description" text,
	"captain_id" uuid,
	"cover_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"organizer" text,
	"location" text,
	"category" text,
	"team_id" uuid,
	"starts_at" timestamp with time zone,
	"registration_deadline" timestamp with time zone,
	"status" "competition_status" DEFAULT 'planned' NOT NULL,
	"result" text,
	"rank" integer,
	"notes" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"organization" text,
	"topic" text NOT NULL,
	"message" text NOT NULL,
	"status" "message_status" DEFAULT 'new' NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" "event_type" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"cover_id" uuid,
	"team_id" uuid,
	"bootcamp_module_id" uuid,
	"public" boolean DEFAULT false NOT NULL,
	"registration_url" text,
	"cta_label" text,
	"attendance_code" text,
	"attendance_open" boolean DEFAULT false NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(location, '')), 'B') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')) STORED,
	CONSTRAINT "events_time_order" CHECK ("events"."ends_at" is null or "events"."ends_at" >= "events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "gallery_albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "gallery_category" NOT NULL,
	"taken_on" date,
	"cover_id" uuid,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid,
	"asset_id" uuid NOT NULL,
	"caption" text,
	"category" "gallery_category" NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"taken_on" date,
	"project_id" uuid,
	"team_id" uuid,
	"track_id" uuid,
	"published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"location" text,
	"condition" "inventory_condition" DEFAULT 'good' NOT NULL,
	"project_id" uuid,
	"member_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_quantity_nonneg" CHECK ("inventory_items"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"visibility" "asset_visibility" NOT NULL,
	"original_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placeholder" text,
	"dominant_color" text,
	"alt" text,
	"folder" text,
	"scan_status" "scan_status" DEFAULT 'skipped' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_bytes_positive" CHECK ("media_assets"."bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"full_name" text NOT NULL,
	"full_name_ar" text,
	"rank" "member_rank" DEFAULT 'member' NOT NULL,
	"department" "department",
	"title" text,
	"track_id" uuid,
	"team_id" uuid,
	"academic_year" integer,
	"bio" text DEFAULT '' NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"photo_id" uuid,
	"photo_crop" jsonb,
	"linkedin" text,
	"github" text,
	"instagram" text,
	"facebook" text,
	"youtube" text,
	"website" text,
	"public_profile" boolean DEFAULT false NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"joined_at" date,
	"phone" text,
	"private_email" text,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(full_name, '')), 'A') || setweight(to_tsvector('simple', coalesce(title, '')), 'B') || setweight(to_tsvector('simple', coalesce(rh_array_to_text(skills), '')), 'B') || setweight(to_tsvector('simple', coalesce(bio, '')), 'C')) STORED,
	CONSTRAINT "members_year_range" CHECK ("members"."academic_year" is null or ("members"."academic_year" between 1 and 7))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text DEFAULT 'Engineer' NOT NULL,
	CONSTRAINT "project_members_project_id_member_id_pk" PRIMARY KEY("project_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "project_status" DEFAULT 'idea' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"manager_id" uuid,
	"track_id" uuid,
	"team_id" uuid,
	"problem" text DEFAULT '' NOT NULL,
	"solution" text DEFAULT '' NOT NULL,
	"electronics" text DEFAULT '' NOT NULL,
	"mechanical" text DEFAULT '' NOT NULL,
	"software" text DEFAULT '' NOT NULL,
	"challenges" text DEFAULT '' NOT NULL,
	"testing" text DEFAULT '' NOT NULL,
	"results" text DEFAULT '' NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"github_url" text,
	"demo_url" text,
	"budget" numeric(12, 2),
	"currency" text DEFAULT 'EGP' NOT NULL,
	"notes" text,
	"hero_id" uuid,
	"video_id" uuid,
	"start_date" date,
	"end_date" date,
	"published" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(summary, '')), 'B') || setweight(to_tsvector('simple', coalesce(rh_array_to_text(technologies), '')), 'B') || setweight(to_tsvector('simple', coalesce(problem, '')), 'C') || setweight(to_tsvector('simple', coalesce(solution, '')), 'C')) STORED,
	CONSTRAINT "projects_progress_range" CHECK ("projects"."progress" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "resource_kind" NOT NULL,
	"url" text NOT NULL,
	"track_id" uuid,
	"published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"pending_mfa" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tier" "sponsor_tier" NOT NULL,
	"logo_id" uuid,
	"website" text,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"task_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_attachments_task_id_asset_id_pk" PRIMARY KEY("task_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "task_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"label" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "task_status" DEFAULT 'backlog' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"assignee_id" uuid,
	"team_id" uuid,
	"project_id" uuid,
	"due_date" date,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_roadmap_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"tagline" text DEFAULT '' NOT NULL,
	"tagline_ar" text,
	"description" text DEFAULT '' NOT NULL,
	"description_ar" text,
	"tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"competitions" text[] DEFAULT '{}'::text[] NOT NULL,
	"illustration" text DEFAULT 'embedded' NOT NULL,
	"cover_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"member_id" uuid,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "video_kind" NOT NULL,
	"provider" "video_provider" NOT NULL,
	"source" text NOT NULL,
	"poster_id" uuid,
	"duration_seconds" integer,
	"project_id" uuid,
	"team_id" uuid,
	"published" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"recorded_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievement_members" ADD CONSTRAINT "achievement_members_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_members" ADD CONSTRAINT "achievement_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_image_id_media_assets_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_assignments" ADD CONSTRAINT "bootcamp_assignments_module_id_bootcamp_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."bootcamp_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_lessons" ADD CONSTRAINT "bootcamp_lessons_module_id_bootcamp_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."bootcamp_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_progress" ADD CONSTRAINT "bootcamp_progress_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_progress" ADD CONSTRAINT "bootcamp_progress_module_id_bootcamp_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."bootcamp_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_members" ADD CONSTRAINT "competition_members_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_members" ADD CONSTRAINT "competition_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_teams" ADD CONSTRAINT "competition_teams_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_album_id_gallery_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."gallery_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_photo_id_media_assets_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_members_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_hero_id_media_assets_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_logo_id_media_assets_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_specs" ADD CONSTRAINT "team_specs_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_roadmap_steps" ADD CONSTRAINT "track_roadmap_steps_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_poster_id_media_assets_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_team_id_competition_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ach_members_member_idx" ON "achievement_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "achievements_date_idx" ON "achievements" USING btree ("public","achieved_on");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "applications_email_idx" ON "applications" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_slug_key" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "articles_pub_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "articles_search_idx" ON "articles" USING gin ("search");--> statement-breakpoint
CREATE INDEX "attendance_member_idx" ON "attendance" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "bom_project_idx" ON "bom_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assignments_module_idx" ON "bootcamp_assignments" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "lessons_module_idx" ON "bootcamp_lessons" USING btree ("module_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "bootcamp_week_key" ON "bootcamp_modules" USING btree ("week");--> statement-breakpoint
CREATE INDEX "progress_module_idx" ON "bootcamp_progress" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_slug_key" ON "competition_teams" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_slug_key" ON "competitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "competitions_time_idx" ON "competitions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "competitions_team_idx" ON "competitions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "contact_status_idx" ON "contact_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_time_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_public_idx" ON "events" USING btree ("public","starts_at");--> statement-breakpoint
CREATE INDEX "events_search_idx" ON "events" USING gin ("search");--> statement-breakpoint
CREATE UNIQUE INDEX "albums_slug_key" ON "gallery_albums" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "albums_public_idx" ON "gallery_albums" USING btree ("published","taken_on");--> statement-breakpoint
CREATE INDEX "gallery_album_idx" ON "gallery_items" USING btree ("album_id","sort_order");--> statement-breakpoint
CREATE INDEX "gallery_public_idx" ON "gallery_items" USING btree ("published","category","created_at");--> statement-breakpoint
CREATE INDEX "gallery_project_idx" ON "gallery_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gallery_team_idx" ON "gallery_items" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "inventory_category_idx" ON "inventory_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "jobs_ready_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."dedupe_key" is not null and "jobs"."status" in ('queued','running');--> statement-breakpoint
CREATE INDEX "media_assets_folder_idx" ON "media_assets" USING btree ("folder");--> statement-breakpoint
CREATE INDEX "media_assets_created_idx" ON "media_assets" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "members_slug_key" ON "members" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "members_public_idx" ON "members" USING btree ("public_profile","status","rank","sort_order");--> statement-breakpoint
CREATE INDEX "members_track_idx" ON "members" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "members_team_idx" ON "members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "members_search_idx" ON "members" USING gin ("search");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_members_member_idx" ON "project_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "milestones_project_idx" ON "project_milestones" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_key" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "projects_public_idx" ON "projects" USING btree ("published","featured","updated_at");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_search_idx" ON "projects" USING gin ("search");--> statement-breakpoint
CREATE INDEX "resources_track_idx" ON "resources" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "resources_search_idx" ON "resources" USING gin ("search");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE INDEX "sponsors_tier_idx" ON "sponsors" USING btree ("active","tier","sort_order");--> statement-breakpoint
CREATE INDEX "task_activity_task_idx" ON "task_activity" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "checklist_task_idx" ON "task_checklist_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "comments_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_board_idx" ON "tasks" USING btree ("status","position");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_team_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "team_specs_team_idx" ON "team_specs" USING btree ("team_id","position");--> statement-breakpoint
CREATE INDEX "roadmap_track_idx" ON "track_roadmap_steps" USING btree ("track_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_slug_key" ON "tracks" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_member_key" ON "users" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "videos_public_idx" ON "videos" USING btree ("published","kind","created_at");