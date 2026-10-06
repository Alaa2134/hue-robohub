"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/server/action";
import { deleteMember, saveMember } from "@/server/actions/members";
import { Field, FormError, Input, Select, Textarea } from "./field";
import { PhotoCropper } from "./photo-cropper";

type Opt = { id: string; name: string };
export type MemberFormValue = {
  id?: string;
  fullName?: string;
  fullNameAr?: string | null;
  rank?: string;
  department?: string | null;
  title?: string | null;
  trackId?: string | null;
  teamId?: string | null;
  academicYear?: number | null;
  bio?: string;
  skills?: string[];
  linkedin?: string | null;
  github?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  website?: string | null;
  joinedAt?: string | null;
  status?: string;
  sortOrder?: number;
  publicProfile?: boolean;
  phone?: string | null;
  privateEmail?: string | null;
  adminNotes?: string | null;
  slug?: string;
  photoUrl?: string | null;
  originalUrl?: string | null;
  photoCrop?: { x: number; y: number; w: number; h: number } | null;
};

const RANKS = [
  ["member", "Member"],
  ["trainee", "Trainee"],
  ["technical_lead", "Technical lead"],
  ["competition_lead", "Competition lead"],
  ["team_leader", "Team leader"],
  ["vice_leader", "Vice leader"],
  ["media", "Media"],
  ["pr", "Public relations"],
  ["founder", "Founder"],
];
const DEPTS = [
  ["", "—"],
  ["leadership", "Leadership"],
  ["hardware", "Hardware"],
  ["embedded", "Embedded"],
  ["mechanical", "Mechanical"],
  ["software", "Software / ROS"],
  ["competition", "Competition"],
  ["media", "Media & design"],
  ["pr", "PR & sponsorships"],
  ["events", "Events"],
];

function Section({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-[var(--line)] py-8 lg:grid-cols-[14rem_1fr]">
      <div>
        <p className="font-mono text-[0.62rem] text-cyan">{n}</p>
        <h2 className="mt-1 font-display text-base font-semibold text-chalk">{title}</h2>
        {hint && <p className="mt-1 text-xs leading-relaxed text-fog">{hint}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** "+ Add member" flow: photo with crop, identity, role, links, private data, PUBLIC PROFILE toggle, PUBLISH. */
export function MemberForm({ value, tracks, teams }: { value: MemberFormValue; tracks: Opt[]; teams: Opt[] }) {
  const [state, action, pending] = useActionState(saveMember, null as ActionResult<{ id: string }> | null);
  const [pub, setPub] = useState(!!value.publicProfile);
  const [confirm, setConfirm] = useState(false);
  const [deleting, startDelete] = useTransition();
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const err = state && !state.ok ? state : null;

  return (
    <form action={action} className="relative">
      {value.id && <input type="hidden" name="id" value={value.id} />}
      <input type="hidden" name="publicProfile" value={pub ? "on" : ""} />

      <div className="grid gap-8 pb-8 lg:grid-cols-[18rem_1fr]">
        <div>
          <PhotoCropper currentUrl={value.photoUrl} originalUrl={value.originalUrl} initialCrop={value.photoCrop} />
        </div>
        <div className="grid content-start gap-5 sm:grid-cols-2">
          <Field label="Full name" name="fullName" error={fe.fullName} className="sm:col-span-2">
            <Input name="fullName" defaultValue={value.fullName} required minLength={2} maxLength={120} error={fe.fullName} />
          </Field>
          <Field label="Name in Arabic" name="fullNameAr" optional>
            <Input name="fullNameAr" defaultValue={value.fullNameAr ?? ""} dir="rtl" />
          </Field>
          <Field label="Public title" name="title" hint="e.g. Embedded Systems Lead" optional>
            <Input name="title" defaultValue={value.title ?? ""} maxLength={120} />
          </Field>
          <Field label="Rank" name="rank">
            <Select name="rank" defaultValue={value.rank ?? "member"}>
              {RANKS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department" name="department">
            <Select name="department" defaultValue={value.department ?? ""}>
              {DEPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <div className={cn("sm:col-span-2 flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors", pub ? "border-ok/40 bg-ok/[0.06]" : "border-[var(--line-2)] bg-deep/60")}>
            <div>
              <p className="font-display text-sm font-semibold text-chalk">PUBLIC PROFILE</p>
              <p className="text-xs text-fog">{pub ? "Visible on the website team page and profile." : "Hidden from the public website."}</p>
            </div>
            <button type="button" role="switch" aria-checked={pub} onClick={() => setPub((v) => !v)} className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", pub ? "bg-ok" : "bg-steel")}>
              <span className={cn("absolute top-1 size-5 rounded-full bg-white transition-all", pub ? "start-6" : "start-1")} />
              <span className="sr-only">Public profile</span>
            </button>
          </div>
        </div>
      </div>

      <Section n="02" title="Team placement" hint="Drives the org map, track pages and team rosters.">
        <Field label="Track" name="trackId">
          <Select name="trackId" defaultValue={value.trackId ?? ""}>
            <option value="">—</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Competition team" name="teamId">
          <Select name="teamId" defaultValue={value.teamId ?? ""}>
            <option value="">—</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Academic year" name="academicYear" error={fe.academicYear}>
          <Select name="academicYear" defaultValue={value.academicYear ? String(value.academicYear) : ""}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6, 7].map((y) => (
              <option key={y} value={y}>
                {y <= 5 ? `Year ${y}` : y === 6 ? "Postgraduate" : "Graduate"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Joined" name="joinedAt" optional>
          <Input name="joinedAt" type="date" defaultValue={value.joinedAt ?? ""} />
        </Field>
        <Field label="Status" name="status">
          <Select name="status" defaultValue={value.status ?? "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="alumni">Alumni</option>
          </Select>
        </Field>
        <Field label="Sort order" name="sortOrder" hint="Lower numbers appear first within a rank.">
          <Input name="sortOrder" type="number" min={0} max={10000} defaultValue={value.sortOrder ?? 100} />
        </Field>
      </Section>

      <Section n="03" title="Public profile" hint="Shown on the website when the profile is public.">
        <Field label="Bio" name="bio" className="sm:col-span-2" optional>
          <Textarea name="bio" defaultValue={value.bio ?? ""} maxLength={4000} rows={5} />
        </Field>
        <Field label="Skills" name="skills" hint="Comma separated — e.g. STM32, PID, Fusion 360" className="sm:col-span-2" optional>
          <Input name="skills" defaultValue={(value.skills ?? []).join(", ")} maxLength={600} />
        </Field>
        {(["linkedin", "github", "instagram", "facebook", "youtube", "website"] as const).map((k) => (
          <Field key={k} label={k === "linkedin" ? "LinkedIn" : k === "github" ? "GitHub" : k[0]!.toUpperCase() + k.slice(1)} name={k} error={fe[k]} optional>
            <Input name={k} type="url" inputMode="url" defaultValue={value[k] ?? ""} placeholder="https://" error={fe[k]} dir="ltr" />
          </Field>
        ))}
      </Section>

      <Section n="04" title="Private" hint="Never shown on the website. Visible to admins only.">
        <Field label="Phone / WhatsApp" name="phone" optional>
          <Input name="phone" type="tel" defaultValue={value.phone ?? ""} dir="ltr" />
        </Field>
        <Field label="Private email" name="privateEmail" error={fe.privateEmail} optional>
          <Input name="privateEmail" type="email" defaultValue={value.privateEmail ?? ""} error={fe.privateEmail} />
        </Field>
        <Field label="Admin notes" name="adminNotes" className="sm:col-span-2" optional>
          <Textarea name="adminNotes" defaultValue={value.adminNotes ?? ""} maxLength={4000} rows={3} />
        </Field>
      </Section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-abyss/90 px-4 py-4 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-xl lg:border">
        <button type="submit" disabled={pending} className="btn btn-primary">
          <span aria-hidden className="btn-sheen" />
          <Icon name="check" size={15} />
          <span>{pending ? "Publishing…" : value.id ? "Save & publish" : "Publish member"}</span>
        </button>
        <Link href="/command/members" className="btn">
          <span>Cancel</span>
        </Link>
        {value.id && value.slug && pub && (
          <Link href={`/team/${value.slug}`} target="_blank" className="ms-auto text-sm text-cyan hover:underline">
            View public profile ↗
          </Link>
        )}
        {value.id &&
          (confirm ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-danger">Delete permanently?</span>
              <button type="button" disabled={deleting} onClick={() => startDelete(async () => void (await deleteMember(value.id!)))} className="btn btn-sm text-danger">
                <span>{deleting ? "Deleting…" : "Yes, delete"}</span>
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="btn btn-sm">
                <span>Keep</span>
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className={cn("btn btn-sm text-danger", !(value.slug && pub) && "ms-auto")}>
              <Icon name="close" size={14} />
              <span>Delete</span>
            </button>
          ))}
        <div className="w-full">
          <FormError message={err?.error} requestId={err?.requestId} />
        </div>
      </div>
    </form>
  );
}
