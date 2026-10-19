"use client";
/**
 * Printed team member cards, in the BuildX card design: the front with the photo, names and role, the
 * back with a big QR to the member's page on the website. Every card fills itself in from the member's
 * team profile (names, role, photo, page), plus the faculty and member code kept on the profile (made up
 * when empty, editable). The PDF for the print shop has one page per side, ID-card size (CR80, 54 × 85.6
 * mm) with 3 mm bleed on every edge, front then back for each member.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { teamImageUrl, type TeamGroup, type TeamProfile } from "@/lib/team-public";
import { BASE_PATH, can, errorText, must, sb, type StaffRow } from "./core";
import { imagesReady } from "./certificate";
import { saveNodesAsPdf } from "./pdf";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Sheet,
  TopBar,
  go,
  toast,
  useAsync,
} from "./ui";

/* ─── Geometry: the design is drawn at 994 × 1576 (the card), plus 55 px of bleed on each side ────── */
const W = 994;
const H = 1576;
const BLEED = 55; // 3 mm at 18.4 px/mm
const PAGE_MM = { w: 60, h: 91.6 }; // 54 × 85.6 mm + 3 mm bleed each side
const SITE = "https://buildxhue.com";
export const DEFAULT_FACULTY = "Faculty of Artificial Intelligence and Information";

type Profile = TeamProfile & { faculty?: string | null; card_code?: string | null };
export type CardData = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  titleEn: string;
  titleAr: string;
  kind: TeamGroup;
  photo: string | null;
  faculty: string;
  code: string;
  year: number;
  published: boolean;
};

const KIND: Record<TeamGroup, string> = { founder: "FOUNDER", lead: "LEAD", member: "TEAM" };

/** "Website manager" → WEB; the department part of a made-up member code. */
function dept(p: Profile) {
  const t = `${p.headline} ${p.track ?? ""}`.toLowerCase();
  const known: [RegExp, string][] = [
    [/web|site/, "WEB"],
    [/media|design|graphic|content/, "MED"],
    [/\bhr\b|human/, "HR"],
    [/found/, "FND"],
    [/robot|mechan|hardware|embedded/, "ROB"],
    [/\bai\b|machine|data/, "AI"],
    [/software|program|develop/, "SW"],
    [/event|organi/, "EVT"],
    [/market|sponsor|pr\b|relation/, "PR"],
  ];
  for (const [re, code] of known) if (re.test(t)) return code;
  const first = p.headline
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
  return first.length >= 2
    ? first
    : p.group_kind === "founder"
      ? "FND"
      : p.group_kind === "lead"
        ? "LEAD"
        : "TM";
}

/** Cards for the profiles, with a unique made-up code where none is saved yet. */
export function cardsOf(list: Profile[], year: number, faculty: string): CardData[] {
  const taken = new Set(list.map((p) => p.card_code).filter(Boolean) as string[]);
  return list.map((p) => {
    let code = p.card_code ?? "";
    if (!code) {
      const base = `BX-${dept(p)}-${year}`;
      code = base;
      for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
      taken.add(code);
    }
    return {
      id: p.id,
      slug: p.slug,
      nameEn: p.full_name,
      nameAr: p.full_name_ar ?? "",
      titleEn: p.headline || KIND[p.group_kind].toLowerCase().replace(/^./, (c) => c.toUpperCase()),
      titleAr: p.headline_ar ?? "",
      kind: p.group_kind,
      photo: p.photo_path ? teamImageUrl(p.photo_path) : null,
      faculty: p.faculty || faculty,
      code,
      year,
      published: p.published,
    };
  });
}

/* ─── Art ─────────────────────────────────────────────────────────────── */

const ink = {
  white: "#f2f5ff",
  soft: "#c9d2ee",
  label: "#8ea2e6",
  blue: "#5b8cff",
  violet: "#8b5cff",
  line: "rgba(92,128,255,0.45)",
};
const display = "var(--font-saira), var(--font-inter), system-ui, sans-serif";
const arabic = "var(--font-kufi), var(--font-plex-arabic), system-ui, sans-serif";
const at = (x: number, y: number, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  ...extra,
});
const spaced = (size: number, ls: number, color = ink.soft): CSSProperties => ({
  fontFamily: display,
  fontSize: size,
  letterSpacing: ls,
  color,
  textTransform: "uppercase",
  lineHeight: 1.65,
  whiteSpace: "nowrap",
});

function Svg({ d, size = 44, fill = false }: { d: string; size?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "#8fa4ff" : "none"}
      stroke="#8fa4ff"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
const ICON = {
  user: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5Z",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-1a3 3 0 1 0 0-6M2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6Zm13-5.4c2.7.3 4.6 2.1 5 5.4h-3.2",
  bank: "M3 9.5 12 4l9 5.5M4.5 10v8M9 10v8M15 10v8M19.5 10v8M3 20.5h18M3 18h18",
  cap: "M2 9l10-5 10 5-10 5Zm4 2.2V16c2 2 10 2 12 0v-4.8M21 9.5v5.5",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

/** The page around the card: background art that runs into the bleed, frame and brackets on the card. */
function Canvas({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div
      data-testid={testid}
      dir="ltr"
      style={{
        position: "relative",
        width: W + 2 * BLEED,
        height: H + 2 * BLEED,
        overflow: "hidden",
        background: "linear-gradient(180deg,#040818 0%,#06112e 48%,#030714 100%)",
        fontFamily: display,
        color: ink.white,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(70% 45% at 88% 26%, rgba(94,70,255,0.38), transparent 70%), radial-gradient(60% 40% at 8% 40%, rgba(47,123,255,0.22), transparent 70%), radial-gradient(80% 30% at 50% 100%, rgba(47,123,255,0.25), transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.18,
          backgroundImage:
            "linear-gradient(rgba(90,130,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(90,130,255,0.25) 1px, transparent 1px)",
          backgroundSize: "62px 62px",
        }}
      />
      <div style={{ position: "absolute", left: BLEED, top: BLEED, width: W, height: H }}>
        <BigX />
        <Building />
        <Skyline />
        {/* Frame and corner brackets */}
        <div style={{ position: "absolute", inset: 34, borderRadius: 44, border: `2px solid ${ink.line}` }} />
        {[
          { left: 34, top: 34, borderLeft: 1, borderTop: 1 },
          { right: 34, top: 34, borderRight: 1, borderTop: 1 },
          { left: 34, bottom: 34, borderLeft: 1, borderBottom: 1 },
          { right: 34, bottom: 34, borderRight: 1, borderBottom: 1 },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 70,
              height: 70,
              left: c.left,
              right: c.right,
              top: c.top,
              bottom: c.bottom,
              borderLeft: c.borderLeft ? "4px solid #6f7dff" : undefined,
              borderRight: c.borderRight ? "4px solid #8b5cff" : undefined,
              borderTop: c.borderTop ? "4px solid #5b8cff" : undefined,
              borderBottom: c.borderBottom ? "4px solid #8b5cff" : undefined,
              borderRadius:
                c.top !== undefined
                  ? c.left !== undefined
                    ? "44px 0 0 0"
                    : "0 44px 0 0"
                  : c.left !== undefined
                    ? "0 0 0 44px"
                    : "0 0 44px 0",
            }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

/** The big glowing X on the right. */
function BigX() {
  return (
    <svg width={340} height={520} viewBox="0 0 340 520" style={at(700, 210, { opacity: 0.95 })} aria-hidden>
      <defs>
        <linearGradient id="bx-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f7bff" />
          <stop offset="1" stopColor="#7c4dff" />
        </linearGradient>
        <filter id="bx-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#bx-glow)">
        <path d="M30 40 L120 40 L230 260 L120 480 L30 480 L140 260 Z" fill="url(#bx-a)" opacity="0.55" />
        <path d="M330 40 L250 40 L170 200 L210 280 Z" fill="url(#bx-a)" opacity="0.85" />
        <path d="M330 480 L250 480 L170 320 L210 240 Z" fill="url(#bx-a)" opacity="0.85" />
      </g>
      <path
        d="M30 40 L120 40 L230 260 L120 480 L30 480 L140 260 Z"
        fill="none"
        stroke="#9fb6ff"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
    </svg>
  );
}

/** A line drawing of the university building on the left. */
function Building() {
  const s = { stroke: "#3f6bff", strokeOpacity: 0.55, strokeWidth: 1.6, fill: "none" };
  return (
    <svg width={300} height={360} viewBox="0 0 300 360" style={at(0, 410)} aria-hidden>
      <path d="M10 340 V120 L150 70 L290 120 V340" {...s} />
      <path d="M40 340 V150 L150 110 L260 150 V340" {...s} />
      {Array.from({ length: 6 }, (_, r) => (
        <path key={`h${r}`} d={`M40 ${180 + r * 27} H260`} {...s} strokeOpacity={0.3} />
      ))}
      {Array.from({ length: 7 }, (_, c) => (
        <path key={`v${c}`} d={`M${70 + c * 28} 160 V340`} {...s} strokeOpacity={0.3} />
      ))}
      <path d="M0 340 H300" {...s} />
      {/* A palm */}
      <path
        d="M58 340 C60 300 64 270 70 240 M70 240 C50 230 36 236 24 250 M70 240 C80 222 100 220 112 230 M70 240 C60 222 46 214 30 218 M70 240 C86 236 98 244 106 258"
        {...s}
        strokeOpacity={0.7}
      />
    </svg>
  );
}

/** Dark hills along the bottom edge, into the bleed. */
function Skyline() {
  return (
    <svg width={W} height={240} viewBox={`0 0 ${W} 240`} style={at(0, H - 210)} aria-hidden>
      <path
        d={`M0 120 L60 90 L120 130 L190 80 L260 140 L340 150 L420 160 L${W - 420} 160 L${W - 330} 140 L${W - 250} 85 L${W - 170} 120 L${W - 100} 70 L${W} 110 V240 H0 Z`}
        fill="#040a1e"
        stroke="#2f5bd8"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
    </svg>
  );
}

function Logo() {
  return (
    <>
      <img
        src={`${BASE_PATH}/brand/logo-stacked-white.png`}
        alt="BuildX HUE"
        style={at(66, 62, { width: 340, height: 151, objectFit: "contain" })}
      />
      <div style={at(432, 76, { width: 2, height: 100, background: "rgba(160,180,255,0.4)" })} />
      <div style={at(456, 74, spaced(15, 5))}>
        Student
        <br />
        Community
        <br />
        For a brighter
        <br />
        Tomorrow
      </div>
    </>
  );
}

function Words({ x, y, words, right }: { x: number; y: number; words: string[]; right?: boolean }) {
  return (
    <div
      style={at(x, y, {
        ...spaced(15, 5, "#aebce9"),
        lineHeight: "28px",
        textAlign: right ? "right" : "left",
        width: 240,
        marginLeft: right ? -240 : 0,
      })}
    >
      {words.map((w) => (
        <div key={w}>{w}</div>
      ))}
      <div
        style={{
          width: 36,
          height: 4,
          marginTop: 14,
          marginLeft: right ? "auto" : 0,
          background: "linear-gradient(90deg,#2f7bff,#6f7dff)",
        }}
      />
    </div>
  );
}

function Tagline({ y }: { y: number }) {
  return (
    <div
      style={at(0, y, { width: W, textAlign: "center", ...spaced(22, 6, "#e3e8ff"), textTransform: "none" })}
    >
      Build. Learn. <span style={{ color: ink.violet }}>Compete.</span>
    </div>
  );
}

function IconBox({
  x,
  y,
  w = 96,
  h = 86,
  icon,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  icon: keyof typeof ICON;
}) {
  return (
    <div
      style={at(x, y, {
        width: w,
        height: h,
        borderRadius: 14,
        border: "2px solid rgba(110,125,255,0.55)",
        background: "rgba(40,50,140,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Svg d={ICON[icon]} size={Math.round(h * 0.55)} />
    </div>
  );
}

/** Font size that keeps a line inside its width (a rough fit by length). */
const fit = (text: string, size: number, maxChars: number, min: number) =>
  Math.max(min, Math.min(size, Math.floor((size * maxChars) / Math.max(1, text.length))));

function Qr({ value, size, dark = "#000" }: { value: string; size: number; dark?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode").then((QR) =>
      QR.toDataURL(value, {
        margin: 1,
        width: size * 2,
        errorCorrectionLevel: "M",
        color: { dark, light: "#ffffff" },
      }).then((u) => live && setSrc(u)),
    );
    return () => {
      live = false;
    };
  }, [value, size, dark]);
  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size }}
    />
  ) : (
    <div style={{ width: size, height: size, background: "#fff" }} />
  );
}

const profileUrl = (c: CardData) => `${SITE}/team/${c.slug}/`;

/* ─── Front: photo, names, role ───────────────────────────────────────── */

export function CardFront({ c }: { c: CardData }) {
  const chamfer = "polygon(7% 0, 93% 0, 100% 5%, 100% 95%, 93% 100%, 7% 100%, 0 95%, 0 5%)";
  return (
    <Canvas testid="card-front">
      <Logo />
      <div style={at(778, 80, spaced(21, 5, "#9fb0e8"))}>Member ID</div>
      <div
        style={at(778, 122, { width: 72, height: 4, background: "linear-gradient(90deg,#2f7bff,#6f7dff)" })}
      />
      <div style={at(778, 140, spaced(27, 4, ink.soft))}>ID · {c.year}</div>
      <Words x={82} y={262} words={["People", "Ideas", "Projects", "Impact"]} />
      <Words x={940} y={572} words={["Build", "Learn", "Compete", "Together"]} right />

      {/* Photo in a chamfered, glowing frame */}
      <div
        style={at(282, 213, {
          width: 428,
          height: 552,
          filter: "drop-shadow(0 0 18px rgba(91,110,255,0.65))",
        })}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            clipPath: chamfer,
            background: "linear-gradient(135deg,#4f86ff,#8b5cff)",
            padding: 5,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              clipPath: chamfer,
              background: "#11183a",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {c.photo ? (
              <img
                src={c.photo}
                alt=""
                crossOrigin="anonymous"
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 25%" }}
              />
            ) : (
              <span style={{ fontSize: 160, fontWeight: 700, color: "#3d4f99" }}>
                {c.nameEn.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        style={at(40, 800, {
          width: W - 80,
          textAlign: "center",
          fontSize: fit(c.nameEn, 58, 24, 38),
          fontWeight: 700,
          letterSpacing: 0.5,
          color: ink.white,
          whiteSpace: "nowrap",
        })}
      >
        {c.nameEn}
      </div>
      {c.nameAr && (
        <div
          dir="rtl"
          style={at(40, 872, {
            width: W - 80,
            textAlign: "center",
            fontFamily: arabic,
            fontSize: fit(c.nameAr, 38, 26, 28),
            color: "#e6eaff",
            whiteSpace: "nowrap",
          })}
        >
          {c.nameAr}
        </div>
      )}

      <IconBox x={68} y={943} w={122} h={115} icon="globe" />
      <div
        style={at(226, 950, {
          width: 480,
          fontSize: fit(c.titleEn, 42, 20, 28),
          fontWeight: 700,
          color: ink.blue,
          whiteSpace: "nowrap",
        })}
      >
        {c.titleEn}
      </div>
      {c.titleAr && (
        <div
          dir="rtl"
          style={at(226, 1008, {
            width: 480,
            textAlign: "left",
            fontFamily: arabic,
            fontSize: fit(c.titleAr, 30, 22, 22),
            color: "#d7def0",
            whiteSpace: "nowrap",
          })}
        >
          {c.titleAr}
        </div>
      )}
      <div
        style={at(724, 966, {
          width: 202,
          height: 70,
          borderRadius: 40,
          border: "2px solid #6a5cff",
          background: "rgba(60,50,160,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        })}
      >
        <Svg d={ICON.users} size={34} fill />
        <span style={spaced(24, 3, ink.white)}>{KIND[c.kind]}</span>
      </div>

      <div style={at(68, 1086, { width: 858, height: 2, background: ink.line })} />
      <div style={at(72, 1118)}>
        <Svg d={ICON.users} size={64} />
      </div>
      <div style={at(180, 1110, spaced(19, 4, ink.label))}>Organization</div>
      <div style={at(180, 1140, { fontSize: 31, color: ink.white })}>BuildX HUE</div>
      <div style={at(462, 1110, { width: 2, height: 72, background: ink.line })} />
      <div style={at(515, 1116)}>
        <Svg d={ICON.bank} size={66} />
      </div>
      <div style={at(620, 1110, spaced(19, 4, ink.label))}>University</div>
      <div style={at(620, 1140, { fontSize: 31, color: ink.white })}>Horus University</div>
      <div style={at(70, 1210)}>
        <Svg d={ICON.cap} size={74} />
      </div>
      <div style={at(182, 1212, spaced(19, 4, ink.label))}>Faculty</div>
      <div
        style={at(185, 1243, {
          width: 740,
          fontSize: fit(c.faculty, 29, 50, 20),
          color: ink.white,
          whiteSpace: "nowrap",
        })}
      >
        {c.faculty}
      </div>

      <div
        style={at(64, 1310, {
          width: 866,
          height: 140,
          borderRadius: 22,
          border: `2px solid ${ink.line}`,
          background: "rgba(10,18,50,0.6)",
        })}
      />
      <div style={at(112, 1330, { background: "#fff", padding: 6, borderRadius: 6 })}>
        <Qr value={profileUrl(c)} size={104} />
      </div>
      <div style={at(276, 1334, { width: 2, height: 96, background: ink.line })} />
      <div
        style={at(312, 1336, {
          width: 586,
          height: 104,
          borderRadius: 18,
          border: "2px solid rgba(110,125,255,0.6)",
          background: "rgba(30,40,110,0.35)",
        })}
      />
      <div style={at(340, 1350, spaced(17, 5, ink.label))}>Member code</div>
      <div
        style={at(340, 1376, {
          fontSize: fit(c.code, 44, 16, 28),
          fontWeight: 700,
          letterSpacing: 4,
          color: "#a9bcff",
          whiteSpace: "nowrap",
        })}
      >
        {c.code}
      </div>
      <div style={at(762, 1352, { width: 2, height: 72, background: ink.line })} />
      <div style={at(812, 1356, { fontSize: 54, color: "#8b7dff", lineHeight: 1 })}>»</div>
      <Tagline y={1478} />
    </Canvas>
  );
}

/* ─── Back: QR to the member's page and the details ───────────────────── */

export function CardBack({ c }: { c: CardData }) {
  const url = profileUrl(c).replace(/^https:\/\//, "");
  const host = "buildxhue.com/";
  const chamfer = "polygon(6% 0, 94% 0, 100% 5%, 100% 95%, 94% 100%, 6% 100%, 0 95%, 0 5%)";
  const row = (y: number, icon: keyof typeof ICON, main: ReactNode, sub: string, big = false) => (
    <>
      <IconBox x={105} y={y} w={95} h={big ? 84 : 72} icon={icon} />
      <div style={at(248, y - 2, { width: 640 })}>{main}</div>
      <div style={at(250, y + (big ? 52 : 44), spaced(16, 5, ink.label))}>{sub}</div>
    </>
  );
  return (
    <Canvas testid="card-back">
      <Logo />
      <div style={at(746, 76, { width: 2, height: 100, background: "rgba(160,180,255,0.4)" })} />
      <div
        style={at(940, 70, {
          ...spaced(23, 7, "#c9d2ee"),
          lineHeight: "36px",
          textAlign: "right",
          width: 220,
          marginLeft: -220,
        })}
      >
        Build.
        <br />
        Learn.
        <br />
        <span style={{ color: ink.violet }}>Compete.</span>
      </div>
      <div
        style={at(810, 188, { width: 54, height: 4, background: "linear-gradient(90deg,#2f7bff,#6f7dff)" })}
      />

      <div
        style={at(205, 230, {
          width: 80,
          height: 3,
          background: "linear-gradient(90deg,transparent,#5b8cff)",
        })}
      />
      <div style={at(0, 214, { width: W, textAlign: "center", ...spaced(22, 8, "#dfe5ff") })}>
        Team member card
      </div>
      <div
        style={at(709, 230, {
          width: 80,
          height: 3,
          background: "linear-gradient(90deg,#5b8cff,transparent)",
        })}
      />
      <Words x={82} y={270} words={["People", "Ideas", "Projects", "Impact"]} />
      <Words x={940} y={572} words={["Build", "Learn", "Compete", "Together"]} right />

      {/* QR panel */}
      <div
        style={at(232, 262, {
          width: 530,
          height: 560,
          filter: "drop-shadow(0 0 14px rgba(91,110,255,0.45))",
        })}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            clipPath: chamfer,
            background: "linear-gradient(135deg,rgba(79,134,255,0.8),rgba(139,92,255,0.8))",
            padding: 2,
            boxSizing: "border-box",
          }}
        >
          <div style={{ width: "100%", height: "100%", clipPath: chamfer, background: "#070d26" }} />
        </div>
      </div>
      <div style={at(232, 300, { width: 530, textAlign: "center", ...spaced(22, 6, "#c9d2ee") })}>
        Scan to view profile
      </div>
      <div style={at(470, 340, { width: 55, height: 4, background: "#4f86ff" })} />
      <div
        style={at(318, 362, {
          width: 358,
          height: 358,
          borderRadius: 26,
          border: "3px solid #6f7dff",
          boxShadow: "0 0 28px rgba(111,125,255,0.7)",
          background: "#0b1230",
        })}
      />
      <div
        style={at(333, 377, {
          width: 328,
          height: 328,
          borderRadius: 18,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <Qr value={profileUrl(c)} size={296} />
      </div>
      <div
        style={at(250, 732, {
          width: 494,
          height: 74,
          borderRadius: 20,
          border: "2px solid rgba(110,125,255,0.6)",
          background: "rgba(20,30,90,0.55)",
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "0 26px",
          boxSizing: "border-box",
        })}
      >
        <Svg d={ICON.link} size={40} />
        <span style={{ fontSize: fit(url, 30, 24, 20), whiteSpace: "nowrap" }}>
          <span style={{ color: "#7ea2ff" }}>{host}</span>
          <span style={{ color: ink.white }}>{url.slice(host.length)}</span>
        </span>
      </div>

      {/* Details */}
      <div
        style={at(68, 842, {
          width: 858,
          height: 420,
          borderRadius: 24,
          border: `2px solid ${ink.line}`,
          background: "rgba(8,14,42,0.7)",
        })}
      />
      {row(
        868,
        "user",
        <>
          <div
            style={{
              fontSize: fit(c.nameEn, 40, 26, 28),
              fontWeight: 700,
              color: ink.white,
              whiteSpace: "nowrap",
            }}
          >
            {c.nameEn}
          </div>
          <div
            style={{
              fontSize: fit(c.titleEn, 30, 30, 22),
              fontWeight: 600,
              color: ink.blue,
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {c.titleEn}
          </div>
        </>,
        "",
        true,
      )}
      <div style={at(105, 972, { width: 778, height: 2, background: ink.line })} />
      {row(984, "users", <div style={{ fontSize: 30, color: ink.white }}>BuildX HUE</div>, "Organization")}
      <div style={at(105, 1062, { width: 778, height: 2, background: ink.line })} />
      {row(
        1072,
        "bank",
        <div style={{ fontSize: 30, color: ink.white }}>Horus University</div>,
        "University",
      )}
      <div style={at(105, 1150, { width: 778, height: 2, background: ink.line })} />
      <IconBox x={105} y={1162} w={95} h={78} icon="cap" />
      <div
        style={at(248, 1158, {
          width: 620,
          fontSize: c.faculty.length > 50 ? 26 : c.faculty.length > 40 ? 28 : 30,
          lineHeight: 1.15,
          color: ink.white,
        })}
      >
        {c.faculty}
      </div>
      <div style={at(250, c.faculty.length > 52 ? 1232 : 1204, spaced(16, 5, ink.label))}>Faculty</div>

      <div
        style={at(68, 1283, {
          width: 858,
          height: 120,
          borderRadius: 22,
          border: `2px solid ${ink.line}`,
          background: "rgba(8,14,42,0.7)",
        })}
      />
      <div
        style={at(104, 1303, {
          width: 342,
          height: 82,
          borderRadius: 18,
          border: "2px solid rgba(110,125,255,0.65)",
          background: "rgba(30,40,110,0.35)",
        })}
      />
      <div style={at(130, 1311, spaced(17, 5, ink.label))}>Member code</div>
      <div
        style={at(130, 1336, {
          fontSize: fit(c.code, 40, 13, 24),
          fontWeight: 700,
          letterSpacing: 4,
          color: "#a9bcff",
          whiteSpace: "nowrap",
        })}
      >
        {c.code}
      </div>
      <div style={at(488, 1310, { width: 2, height: 68, background: ink.line })} />
      <div
        style={at(520, 1310, {
          width: 370,
          textAlign: "right",
          fontSize: 22,
          color: "#dfe5ff",
          lineHeight: "36px",
        })}
      >
        Community ID card for <b>BuildX HUE</b>
        <div dir="rtl" style={{ fontFamily: arabic, fontSize: 21 }}>
          بطاقة تعريف لمجتمع BuildX HUE
        </div>
      </div>
      <Tagline y={1508} />
    </Canvas>
  );
}

/* ─── Screen ──────────────────────────────────────────────────────────── */

const year = () => new Date().getFullYear();

export function TeamCardsScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload, set } = useAsync(
    async () =>
      (await sb()
        .from("team_profiles")
        .select("*")
        .order("sort_order")
        .order("full_name")
        .then(must)) as Profile[],
    [],
  );
  const [faculty, setFaculty] = useState(DEFAULT_FACULTY);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [printing, setPrinting] = useState<CardData[] | null>(null);
  const [busy, setBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const editor = can(me, "portfolios");
  const cards = useMemo(
    () => cardsOf(data ?? [], year(), faculty.trim() || DEFAULT_FACULTY),
    [data, faculty],
  );
  const chosen = picked ?? new Set(cards.map((c) => c.id));
  const shown = cards.find((c) => c.id === preview) ?? cards[0];

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const pdf = async () => {
    const list = cards.filter((c) => chosen.has(c.id));
    if (!list.length) return;
    setBusy(true);
    try {
      // Codes made up just now are kept, so a reprint carries the same ones.
      if (editor) {
        const fresh = list.filter((c) => !data.find((p) => p.id === c.id)?.card_code);
        for (const c of fresh)
          await sb().from("team_profiles").update({ card_code: c.code }).eq("id", c.id).then(must);
        if (fresh.length)
          set(
            data.map((p) => ({
              ...p,
              card_code: p.card_code ?? fresh.find((c) => c.id === p.id)?.code ?? null,
            })),
          );
      }
      setPrinting(list);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(
        printRef.current?.querySelectorAll<HTMLElement>("[data-testid=card-front],[data-testid=card-back]") ??
          [],
      );
      await imagesReady(nodes, 8000);
      await saveNodesAsPdf(nodes, `buildx-team-cards-${list.length}.pdf`, { widthPx: 1417, pageMm: PAGE_MM });
      toast(`${list.length} كارت جاهز للمطبعة`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setPrinting(null);
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar
        title="كروت الفريق للطباعة"
        sub="وش بالصورة وضهر بالـ QR، بيتملوا من صفحة كل عضو"
        back="/staff/more"
      />
      {!data.length ? (
        <Empty
          icon="users"
          title="مفيش أعضاء لسه"
          body="ضيف الأعضاء من «بورتفوليو الفريق» الأول."
          action={<Button onClick={() => go("/staff/portfolios")}>بورتفوليو الفريق</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-3">
            <Field label="الكلية (لأي حد ملوش كلية محفوظة)">
              <Input dir="ltr" value={faculty} maxLength={120} onChange={(e) => setFaculty(e.target.value)} />
            </Field>
            <div className="grid gap-2" data-testid="card-list">
              {cards.map((c) => {
                const p = data.find((x) => x.id === c.id)!;
                return (
                  <Card
                    key={c.id}
                    className={`flex items-center gap-3 ${preview === c.id ? "border-cyan/50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-[#2f7bff]"
                      checked={chosen.has(c.id)}
                      onChange={() => toggle(c.id)}
                      aria-label={`اطبع كارت ${c.nameEn}`}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-start"
                      onClick={() => setPreview(c.id)}
                    >
                      <p className="truncate font-semibold text-chalk" dir="ltr">
                        {c.nameEn}
                      </p>
                      <p className="truncate font-mono text-xs text-fog" dir="ltr">
                        {c.code} · {c.titleEn}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!c.photo && <Badge tone="warn">من غير صورة</Badge>}
                        {!c.published && <Badge tone="warn">صفحته مش منشورة: الـ QR مش هيفتح</Badge>}
                        {!c.nameAr && <Badge tone="muted">مفيش اسم عربي</Badge>}
                      </div>
                    </button>
                    {editor && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        تعديل
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
            <Button
              variant="primary"
              size="lg"
              icon="download"
              block
              loading={busy}
              disabled={!chosen.size}
              onClick={() => void pdf()}
            >
              PDF للمطبعة ({chosen.size} كارت، وش وضهر)
            </Button>
            <p className="text-xs leading-relaxed text-fog">
              مقاس كارت الـ ID العالمي 54 × 85.6 مم، وحوالين كل صفحة 3 مم زيادة للقص (bleed). كل عضو صفحتين:
              الوش وبعده الضهر. قول للمطبعة: «CR80، طباعة وشين، الملف فيه bleed 3 مم».
            </p>
          </div>
          {shown && (
            <div className="flex flex-wrap justify-center gap-3" data-testid="card-preview">
              {[CardFront, CardBack].map((Side, i) => (
                <div
                  key={i}
                  style={{ width: (W + 2 * BLEED) * 0.26, height: (H + 2 * BLEED) * 0.26 }}
                  className="overflow-hidden rounded-xl"
                >
                  <div dir="ltr" style={{ transform: "scale(0.26)", transformOrigin: "top left" }}>
                    <Side c={shown} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditSheet
          p={editing}
          card={cards.find((c) => c.id === editing.id)!}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            set(data.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
            setEditing(null);
          }}
        />
      )}

      {printing &&
        createPortal(
          <div ref={printRef} aria-hidden dir="ltr" style={{ position: "fixed", top: 0, left: "-20000px" }}>
            {printing.map((c) => (
              <div key={c.id}>
                <CardFront c={c} />
                <CardBack c={c} />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function EditSheet({
  p,
  card,
  onClose,
  onSaved,
}: {
  p: Profile;
  card: CardData;
  onClose: () => void;
  onSaved: (row: Partial<Profile> & { id: string }) => void;
}) {
  const [code, setCode] = useState(card.code);
  const [faculty, setFaculty] = useState(p.faculty ?? "");
  const [busy, setBusy] = useState(false);
  const clean = code.trim().toUpperCase().replace(/\s+/g, "-");
  const save = async () => {
    if (!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(clean))
      return toast("الكود حروف إنجليزي وأرقام وشرطة بس، زي BX-WEB-2026", "error");
    setBusy(true);
    try {
      const row = { card_code: clean, faculty: faculty.trim() || null };
      await sb().from("team_profiles").update(row).eq("id", p.id).then(must);
      onSaved({ id: p.id, ...row });
      toast("اتحفظ");
    } catch (e) {
      const msg = errorText(e);
      toast(/duplicate|unique/i.test(msg) ? "الكود ده متاخد لعضو تاني" : msg, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={p.full_name}>
      <div className="grid gap-3">
        <Field label="كود العضو" hint="بيتطبع على الوش والضهر. لازم يبقى مختلف لكل عضو.">
          <Input
            dir="ltr"
            value={code}
            maxLength={30}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="الكلية" hint="فاضي = الكلية الافتراضية اللي فوق.">
          <Input
            dir="ltr"
            value={faculty}
            maxLength={120}
            placeholder={DEFAULT_FACULTY}
            onChange={(e) => setFaculty(e.target.value)}
          />
        </Field>
        <p className="text-xs text-fog">الاسم والمسمى والصورة بيتعدّلوا من «بورتفوليو الفريق».</p>
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          احفظ
        </Button>
      </div>
    </Sheet>
  );
}
