-- Internal management namespace; accessed only by Command Center's server connection.
CREATE SCHEMA bms;
--> statement-breakpoint
REVOKE ALL ON SCHEMA bms FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE bms.units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK (kind IN ('technical','nontechnical','competition','sector','group','project','responsibility')),
 parent_id uuid REFERENCES bms.units(id) ON DELETE RESTRICT,
 competition_id uuid REFERENCES public.competitions(id) ON DELETE RESTRICT,
 applications_open boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (parent_id IS DISTINCT FROM id), CHECK (NOT applications_open OR kind='competition')
);
--> statement-breakpoint
CREATE TABLE bms.memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 unit_id uuid NOT NULL REFERENCES bms.units(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK (role IN ('member','head','co_head','leader','supervisor','captain','coordinator','reviewer','watcher','instructor')),
 starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz, revoked_at timestamptz,
 reason text NOT NULL DEFAULT '', assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 CHECK (ends_at IS NULL OR ends_at > starts_at)
);
--> statement-breakpoint
CREATE INDEX bms_membership_scope ON bms.memberships(unit_id,member_id);
--> statement-breakpoint
CREATE INDEX bms_membership_person ON bms.memberships(member_id,unit_id);
--> statement-breakpoint
CREATE TABLE bms.tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 unit_id uuid NOT NULL REFERENCES bms.units(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '', priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
 due_date date, created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE bms.deliveries (
 task_id uuid NOT NULL REFERENCES bms.tasks(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'todo' CHECK(state IN ('todo','in_progress','review','changes','done')),
 submission text NOT NULL DEFAULT '', feedback text NOT NULL DEFAULT '',
 score integer CHECK(score BETWEEN 0 AND 100), reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,member_id)
);
--> statement-breakpoint
CREATE INDEX bms_delivery_member ON bms.deliveries(member_id);
--> statement-breakpoint
CREATE TABLE bms.applications (
 unit_id uuid NOT NULL REFERENCES bms.units(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
 motivation text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(unit_id,member_id)
);
--> statement-breakpoint
CREATE TABLE bms.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
 unit_id uuid REFERENCES bms.units(id) ON DELETE RESTRICT,
 action text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE bms.units ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bms.memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bms.tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bms.deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bms.applications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bms.audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO bms.units(name,kind) VALUES ('Technical Division','technical'),('Non-Technical Division','nontechnical'),('Competitions & Innovation','competition');
