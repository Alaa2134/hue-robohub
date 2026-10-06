import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { SettingsSection, type SettingField } from "@/components/command/settings-section";
import { PageHeader, Panel } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { getSiteConfig } from "@/server/queries/public";

export const metadata: Metadata = { title: "Website content" };

const SECTIONS = [
  ["recruitment", "Recruitment"],
  ["contact", "Contact"],
  ["socials", "Social links"],
  ["hero", "Homepage hero"],
  ["homepage", "Homepage sections"],
  ["about", "About"],
  ["seo", "Search & sharing"],
] as const;

export default async function ContentPage() {
  await requirePage("content.manage");
  const config = await getSiteConfig();
  const about = config["site.about"];
  const valueFields: SettingField[] = about.values.flatMap((_, i) => [
    { kind: "heading" as const, label: `Value ${i + 1}` },
    { name: `values.${i}.title`, label: "Title", localized: true },
    { name: `values.${i}.body`, label: "Text", localized: true },
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker="Website"
        title="Website content"
        description="Everything visitors read on the public site. Each section publishes on save — no developer needed. Arabic is optional; English shows when it is empty."
        actions={
          <Link href="/" target="_blank" className="btn btn-sm">
            <Icon name="external" size={14} />
            <span>View site</span>
          </Link>
        }
      />
      <nav aria-label="Sections" className="sticky top-16 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-[var(--line)] bg-abyss/90 px-4 py-2 backdrop-blur lg:top-[4.5rem] lg:mx-0 lg:px-0">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-fog hover:bg-panel hover:text-chalk">
            {label}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-6 [&>section]:scroll-mt-32">
        <Panel id="recruitment" title="Recruitment" kicker="Join page">
          <SettingsSection
            settingKey="site.recruitment"
            value={config["site.recruitment"]}
            fields={[
              { kind: "switch", name: "open", label: "Applications open", hint: "When off, the Join page shows the closed message and the form is hidden." },
              { name: "headline", label: "Join page headline", localized: true },
              { name: "closedMessage", label: "Message when closed", localized: true, textarea: true, rows: 2 },
            ]}
          />
        </Panel>

        <Panel id="contact" title="Contact" kicker="Footer · Contact page">
          <SettingsSection
            settingKey="site.contact"
            value={config["site.contact"]}
            fields={[
              { name: "email", label: "Public email", type: "email", hint: "Shown on the website. Use the club's shared inbox, not a personal address." },
              { name: "phone", label: "Public phone", type: "tel", hint: "Optional. Leave empty to hide." },
              { name: "whatsapp", label: "WhatsApp number", type: "tel", hint: "Optional — e.g. +20 10 0000 0000" },
              { name: "mapUrl", label: "Map link", type: "url", placeholder: "https://maps.google.com/…" },
              { name: "address", label: "Address", localized: true },
              { name: "hours", label: "Lab hours", localized: true },
            ]}
          />
        </Panel>

        <Panel id="socials" title="Social links" kicker="Footer · Team pages">
          <SettingsSection
            settingKey="site.socials"
            value={config["site.socials"]}
            fields={(["instagram", "facebook", "linkedin", "youtube", "github"] as const).map((k) => ({ name: k, label: k === "linkedin" ? "LinkedIn" : k === "github" ? "GitHub" : k === "youtube" ? "YouTube" : k[0]!.toUpperCase() + k.slice(1), type: "url" as const, placeholder: "https://" }))}
          />
        </Panel>

        <Panel id="hero" title="Homepage hero" kicker="First screen">
          <SettingsSection
            settingKey="site.hero"
            value={config["site.hero"]}
            fields={[
              { name: "eyebrow", label: "Small line above the title", localized: true, hint: "Keep it factual — don't imply official university endorsement unless approved." },
              { kind: "heading", label: "Three title lines" },
              { name: "lines.0", label: "Line 1", localized: true },
              { name: "lines.1", label: "Line 2", localized: true },
              { name: "lines.2", label: "Line 3", localized: true },
              { name: "subtitle", label: "Paragraph", localized: true, textarea: true, rows: 3 },
              { kind: "heading", label: "Buttons" },
              { name: "primaryCta.label", label: "Main button", localized: true },
              { name: "primaryCta.href", label: "Main button link", ltr: true, hint: "A page path like /join" },
              { name: "secondaryCta.href", label: "Second button link", ltr: true },
              { name: "secondaryCta.label", label: "Second button", localized: true },
            ]}
          />
        </Panel>

        <Panel id="homepage" title="Homepage sections" kicker="Show or hide">
          <SettingsSection
            settingKey="site.homepage"
            value={config["site.homepage"]}
            fields={[
              { kind: "switch", name: "sections.anatomy", label: "Story — idea to achieving" },
              { kind: "switch", name: "sections.tracks", label: "Engineering tracks" },
              { kind: "switch", name: "sections.teams", label: "Competition teams" },
              { kind: "switch", name: "sections.bootcamp", label: "Bootcamp build" },
              { kind: "switch", name: "sections.projects", label: "Projects" },
              { kind: "switch", name: "sections.achievements", label: "Achievements" },
              { kind: "switch", name: "sections.events", label: "Upcoming events" },
              { kind: "switch", name: "sections.sponsors", label: "Sponsors" },
              { name: "manifesto", label: "Manifesto line", localized: true },
            ]}
          />
        </Panel>

        <Panel id="about" title="About" kicker="About page">
          <SettingsSection
            settingKey="site.about"
            value={about}
            fields={[
              { name: "vision", label: "Vision", localized: true, textarea: true },
              { name: "mission", label: "Mission", localized: true, textarea: true },
              { name: "story", label: "Our story", localized: true, textarea: true, rows: 5 },
              ...valueFields,
            ]}
          />
        </Panel>

        <Panel id="seo" title="Search & sharing" kicker="Google · WhatsApp previews">
          <SettingsSection
            settingKey="site.seo"
            value={{ ...config["site.seo"], keywords: config["site.seo"].keywords.join(", ") }}
            fields={[
              { name: "description", label: "Site description", textarea: true, wide: true, hint: "50–300 characters. Used by search engines and link previews." },
              { name: "keywords", label: "Keywords", wide: true, hint: "Comma separated" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
