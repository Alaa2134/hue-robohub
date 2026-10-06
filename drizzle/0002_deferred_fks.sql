-- Foreign keys that would create circular references in the TypeScript schema.
ALTER TABLE "competition_teams" ADD CONSTRAINT "competition_teams_captain_id_fk" FOREIGN KEY ("captain_id") REFERENCES "members"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_bootcamp_module_id_fk" FOREIGN KEY ("bootcamp_module_id") REFERENCES "bootcamp_modules"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Trigram indexes for fuzzy name search in the Command Center.
CREATE INDEX IF NOT EXISTS "members_name_trgm_idx" ON "members" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_title_trgm_idx" ON "projects" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_name_trgm_idx" ON "applications" USING gin ("full_name" gin_trgm_ops);
