"use client";
/**
 * The achievements page's numbers and map, from the records (public.achievements_stats): achievements
 * and podium results, events held with real check-ins, the people who attended, members, projects and
 * certificates — and a map of Egypt with a pin for every place an event or achievement took place.
 * Places are matched to a city by name; anything not matched is still listed under the map.
 */
import { useEffect, useMemo, useState } from "react";
import { arNorm } from "@/lib/fuzzy";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Stats = {
  achievements: number;
  podiums: number;
  events: number;
  attendees: number;
  members: number;
  projects: number;
  certificates: number;
  places: { name: string; name_en: string | null; n: number }[];
};

const T = {
  ar: {
    title: "بالأرقام",
    note: "كل الأرقام دي محسوبة لوحدها من سجلاتنا — مفيش رقم مكتوب باليد.",
    where: "الأماكن اللي شاركنا فيها",
    labels: {
      achievements: "إنجاز",
      podiums: "مركز ونتيجة",
      events: "فعالية اتعملت",
      attendees: "حضروا فعالياتنا",
      members: "عضو نشط",
      projects: "مشروع اتنشر",
      certificates: "شهادة اتصدرت",
    },
  },
  en: {
    title: "In numbers",
    note: "Every number here is counted from our records — none is typed in by hand.",
    where: "Where we've taken part",
    labels: {
      achievements: "achievements",
      podiums: "placements & results",
      events: "events held",
      attendees: "people attended our events",
      members: "active members",
      projects: "projects published",
      certificates: "certificates issued",
    },
  },
};

/** Cities by the words their places use (normalized Arabic and English), with longitude and latitude. */
const CITIES: { keys: string[]; ar: string; en: string; lon: number; lat: number }[] = [
  {
    keys: ["حورس", "دمياط", "horus", "damietta"],
    ar: "دمياط الجديدة",
    en: "New Damietta",
    lon: 31.81,
    lat: 31.42,
  },
  { keys: ["القاهره الجديده", "new cairo"], ar: "القاهرة الجديدة", en: "New Cairo", lon: 31.47, lat: 30.03 },
  {
    keys: ["العاصمه الاداريه", "new capital"],
    ar: "العاصمة الإدارية",
    en: "New Capital",
    lon: 31.75,
    lat: 30.02,
  },
  { keys: ["القاهره", "cairo"], ar: "القاهرة", en: "Cairo", lon: 31.24, lat: 30.04 },
  { keys: ["الجيزه", "giza"], ar: "الجيزة", en: "Giza", lon: 31.21, lat: 30.01 },
  { keys: ["الاسكندريه", "alexandria"], ar: "الإسكندرية", en: "Alexandria", lon: 29.92, lat: 31.2 },
  { keys: ["المنصوره", "mansoura"], ar: "المنصورة", en: "Mansoura", lon: 31.38, lat: 31.04 },
  { keys: ["بورسعيد", "port said"], ar: "بورسعيد", en: "Port Said", lon: 32.3, lat: 31.26 },
  { keys: ["الاسماعيليه", "ismailia"], ar: "الإسماعيلية", en: "Ismailia", lon: 32.27, lat: 30.6 },
  { keys: ["السويس", "suez"], ar: "السويس", en: "Suez", lon: 32.55, lat: 29.97 },
  { keys: ["طنطا", "tanta"], ar: "طنطا", en: "Tanta", lon: 31.0, lat: 30.79 },
  { keys: ["الزقازيق", "zagazig"], ar: "الزقازيق", en: "Zagazig", lon: 31.5, lat: 30.59 },
  { keys: ["اسيوط", "assiut"], ar: "أسيوط", en: "Assiut", lon: 31.18, lat: 27.18 },
  { keys: ["الاقصر", "luxor"], ar: "الأقصر", en: "Luxor", lon: 32.64, lat: 25.69 },
  { keys: ["اسوان", "aswan"], ar: "أسوان", en: "Aswan", lon: 32.9, lat: 24.09 },
  { keys: ["الغردقه", "hurghada"], ar: "الغردقة", en: "Hurghada", lon: 33.81, lat: 27.26 },
  { keys: ["شرم", "sharm"], ar: "شرم الشيخ", en: "Sharm El-Sheikh", lon: 34.33, lat: 27.92 },
];

// Egypt's outline (simplified), longitude/latitude.
const EGYPT: [number, number][] = [
  [25.0, 31.6],
  [27.3, 31.4],
  [29.0, 30.9],
  [30.4, 31.5],
  [31.9, 31.5],
  [32.3, 31.3],
  [34.2, 31.3],
  [34.9, 29.5],
  [34.25, 27.7],
  [33.7, 28.6],
  [32.6, 29.9],
  [32.75, 29.4],
  [33.6, 27.3],
  [34.9, 25.2],
  [35.7, 23.9],
  [36.9, 22.0],
  [31.4, 22.0],
  [25.0, 22.0],
];
const W = 360;
const H = 330;
const x = (lon: number) => ((lon - 24.6) / (37.2 - 24.6)) * W;
const y = (lat: number) => ((32.0 - lat) / (32.0 - 21.7)) * H;

export function AchievementsImpact({ locale }: { locale: string }) {
  const l = locale === "en" ? "en" : "ar";
  const t = T[l];
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/achievements_stats`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Stats | null) => d && setS(d))
      .catch(() => undefined);
  }, []);
  const pins = useMemo(() => {
    const out = new Map<string, { city: (typeof CITIES)[number]; n: number; places: string[] }>();
    for (const p of s?.places ?? []) {
      const hay = arNorm(`${p.name} ${p.name_en ?? ""}`);
      const city = CITIES.find((c) => c.keys.some((k) => hay.includes(arNorm(k))));
      if (!city) continue;
      const cur = out.get(city.en) ?? { city, n: 0, places: [] };
      cur.n += p.n;
      cur.places.push(l === "en" ? (p.name_en ?? p.name) : p.name);
      out.set(city.en, cur);
    }
    return [...out.values()];
  }, [s, l]);
  if (!s) return null;
  const tiles = (
    ["achievements", "podiums", "events", "attendees", "members", "projects", "certificates"] as const
  ).filter((k) => s[k] > 0);
  return (
    <section className="mx-auto mb-10 grid max-w-5xl gap-5" data-testid="achievements-impact">
      <div>
        <h2 className="t-headline text-2xl text-chalk">{t.title}</h2>
        <p className="mt-1 text-sm text-fog">{t.note}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((k) => (
          <div key={k} className="frame p-4 text-center">
            <p className="font-display text-3xl font-bold text-gold">
              {s[k].toLocaleString(l === "ar" ? "ar-EG" : "en-US")}
            </p>
            <p className="mt-1 text-xs text-mist">{t.labels[k]}</p>
          </div>
        ))}
      </div>
      {s.places.length > 0 && (
        <div className="frame grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full max-w-sm justify-self-center"
            role="img"
            aria-label={t.where}
            data-testid="places-map"
          >
            <polygon
              points={EGYPT.map(([lo, la]) => `${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join(" ")}
              fill="rgb(var(--edge-rgb, 120 160 255) / 0.08)"
              stroke="var(--color-cyan)"
              strokeOpacity="0.5"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* The Nile, roughly. */}
            <path
              d={`M${x(32.9)} ${y(24.1)} L${x(32.6)} ${y(25.7)} L${x(31.2)} ${y(27.2)} L${x(31.0)} ${y(29.0)} L${x(31.24)} ${y(30.04)} L${x(30.9)} ${y(31.2)} M${x(31.24)} ${y(30.04)} L${x(31.8)} ${y(31.4)}`}
              fill="none"
              stroke="var(--color-cyan)"
              strokeOpacity="0.35"
              strokeWidth="1.2"
            />
            {pins.map((p) => (
              <g
                key={p.city.en}
                transform={`translate(${x(p.city.lon)} ${y(p.city.lat)})`}
                data-testid="map-pin"
              >
                <circle r={7 + Math.min(p.n, 6)} fill="var(--color-volt)" opacity="0.18" />
                <circle r="6" fill="#e8b45c" stroke="white" strokeWidth="2" />
                <text
                  x="-11"
                  y="4"
                  textAnchor="end"
                  direction="ltr"
                  fontSize="12"
                  fill="currentColor"
                  className="text-chalk"
                  style={{ paintOrder: "stroke", stroke: "var(--color-void)", strokeWidth: 3 }}
                >
                  {p.city[l]}
                </text>
              </g>
            ))}
          </svg>
          <div>
            <p className="font-semibold text-chalk">{t.where}</p>
            <ul className="mt-2 grid gap-1.5 text-sm text-mist" data-testid="places-list">
              {s.places.map((p) => (
                <li key={p.name} className="flex items-center gap-2">
                  <span aria-hidden className="size-1.5 rounded-full bg-volt" />
                  {l === "en" ? (p.name_en ?? p.name) : p.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
