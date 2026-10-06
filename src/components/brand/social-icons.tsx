import type { SocialConfig } from "@/lib/site-config";

const paths: Record<keyof SocialConfig | "website", string> = {
  linkedin: "M4.5 8.5h3v10h-3zM6 4a1.75 1.75 0 1 1 0 3.5A1.75 1.75 0 0 1 6 4Zm3.5 4.5h2.9v1.4h.04c.4-.76 1.38-1.56 2.85-1.56 3.05 0 3.61 2 3.61 4.6v5.56h-3v-4.93c0-1.18-.02-2.69-1.64-2.69-1.64 0-1.9 1.28-1.9 2.6v5.02h-2.96z",
  github: "M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.44v-1.54c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.11.98 2.62.75.08-.58.32-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.14.08-2.38 0 0 .76-.24 2.48.93a8.6 8.6 0 0 1 4.5 0c1.72-1.17 2.48-.93 2.48-.93.49 1.24.18 2.15.09 2.38.58.63.92 1.44.92 2.42 0 3.46-2.1 4.22-4.1 4.44.32.28.61.83.61 1.67v2.48c0 .24.16.52.62.44A9 9 0 0 0 12 3Z",
  instagram: "M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2ZM17 6a1.1 1.1 0 1 0 0 2.2A1.1 1.1 0 0 0 17 6ZM8.2 3h7.6A5.2 5.2 0 0 1 21 8.2v7.6a5.2 5.2 0 0 1-5.2 5.2H8.2A5.2 5.2 0 0 1 3 15.8V8.2A5.2 5.2 0 0 1 8.2 3Zm0 1.7a3.5 3.5 0 0 0-3.5 3.5v7.6a3.5 3.5 0 0 0 3.5 3.5h7.6a3.5 3.5 0 0 0 3.5-3.5V8.2a3.5 3.5 0 0 0-3.5-3.5z",
  facebook: "M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.86.25-1.45 1.48-1.45h1.57V4.47A21 21 0 0 0 14.27 4.3c-2.27 0-3.82 1.39-3.82 3.93v2.27H7.9v3h2.55V21z",
  youtube: "M21.6 7.2a2.5 2.5 0 0 0-1.77-1.77C18.27 5 12 5 12 5s-6.27 0-7.83.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.77 1.77C5.73 19 12 19 12 19s6.27 0 7.83-.43a2.5 2.5 0 0 0 1.77-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3z",
  website: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm6.9 8h-3a14 14 0 0 0-1.2-5.2A7.2 7.2 0 0 1 18.9 11ZM12 4.8c.8 1 1.8 3.1 2.1 6.2H9.9c.3-3.1 1.3-5.2 2.1-6.2Zm-2.7 1A14 14 0 0 0 8.1 11h-3a7.2 7.2 0 0 1 4.2-5.2ZM5.1 13h3a14 14 0 0 0 1.2 5.2A7.2 7.2 0 0 1 5.1 13Zm6.9 6.2c-.8-1-1.8-3.1-2.1-6.2h4.2c-.3 3.1-1.3 5.2-2.1 6.2Zm2.7-1a14 14 0 0 0 1.2-5.2h3a7.2 7.2 0 0 1-4.2 5.2Z",
};

export function SocialIcon({ name, className = "size-4" }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}

export const SOCIAL_LABEL: Record<keyof typeof paths, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  website: "Website",
};

/** Only http(s) links are rendered — guards against javascript: URLs stored in the CMS. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
