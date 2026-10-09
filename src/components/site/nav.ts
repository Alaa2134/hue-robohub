import type { Dictionary } from "@/i18n";
import type { IconName } from "@/components/brand/icons";

export type NavKey = keyof Dictionary["nav"];
export type NavItem = { key: NavKey; href: string; icon?: IconName };

/** Desktop header links. */
export const PRIMARY_NAV: NavItem[] = [
  { key: "about", href: "/about" },
  { key: "tracks", href: "/tracks" },
  { key: "competitions", href: "/competitions" },
  { key: "team", href: "/team" },
  { key: "events", href: "/events" },
  { key: "bootcamp", href: "/bootcamp" },
  { key: "contact", href: "/contact" },
];

/** Full menu, grouped. */
export const MENU_GROUPS: { key: NavKey; items: NavItem[] }[] = [
  {
    key: "explore",
    items: [
      { key: "tracks", href: "/tracks", icon: "layers" },
      { key: "competitions", href: "/competitions", icon: "flag" },
      { key: "bootcamp", href: "/bootcamp", icon: "rocket" },
      { key: "projects", href: "/projects", icon: "cpu" },
    ],
  },
  {
    key: "organisation",
    items: [
      { key: "about", href: "/about", icon: "target" },
      { key: "team", href: "/team", icon: "users" },
      { key: "sponsors", href: "/sponsors", icon: "handshake" },
      { key: "brand", href: "/brand", icon: "diamond" },
    ],
  },
  {
    key: "community",
    items: [
      { key: "events", href: "/events", icon: "calendar" },
      { key: "expo", href: "/robotex", icon: "robot" },
      { key: "news", href: "/news", icon: "news" },
      { key: "gallery", href: "/gallery", icon: "image" },
      { key: "achievements", href: "/achievements", icon: "award" },
      { key: "stories", href: "/stories", icon: "rocket" },
      { key: "join", href: "/join", icon: "plus" },
      { key: "faq", href: "/faq", icon: "idea" },
      { key: "contact", href: "/contact", icon: "mail" },
    ],
  },
];

/** App-style bottom bar on phones. `join` renders as the raised centre action. */
export const TAB_BAR: NavItem[] = [
  { key: "home", href: "/", icon: "home" },
  { key: "tracks", href: "/tracks", icon: "layers" },
  { key: "join", href: "/join", icon: "plus" },
  { key: "teamsShort", href: "/competitions", icon: "flag" },
  { key: "menu", href: "#menu", icon: "menu" },
];

export function isActive(current: string, href: string) {
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}
