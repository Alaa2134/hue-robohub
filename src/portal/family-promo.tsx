"use client";
/**
 * Promotion kit for the family sign-up, made on the device from the live link:
 *  - an A4 poster (PDF) for the faculty walls and labs: Baqloz, what the family is, a big QR to the
 *    sign-up and a small one to the team application;
 *  - an Instagram post (1080×1080) and a story (1080×1920) as PNG, same message, brand colours.
 * Every QR points at buildxhue.com (never the address the app happens to run on).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BASE_PATH, SITE_ORIGIN, download, errorText } from "./core";
import { imagesReady } from "./certificate";
import { saveNodesAsPdf } from "./pdf";
import { Button, toast } from "./ui";

const FAMILY_URL = `${SITE_ORIGIN}/ar/family/`;
const JOIN_URL = `${SITE_ORIGIN}/ar/join/`;
const NAVY = "#081634";
const BLUE = "#2b6dff";
const CYAN = "#38dcff";
const display = "var(--font-saira), var(--font-inter), system-ui, sans-serif";
const arabic = "var(--font-kufi), var(--font-plex-arabic), system-ui, sans-serif";
const BAQLOZ = `${BASE_PATH}/mascot/poster-wave.webp`;

type Kind = "poster" | "post" | "story";
type Art = { family: string; year: string; qr: string; joinQr: string };

const PERKS = ["رحلات وفعاليات طول السنة", "ورش ومسابقات روبوتكس", "مشاريع حقيقية وشهادات"];

function QrCard({ src, size, label }: { src: string; size: number; label?: string }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: size * 0.08,
        padding: size * 0.06,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        boxShadow: "0 18px 50px rgb(0 0 0 / 0.25)",
      }}
    >
      <img src={src} alt="" style={{ width: size, height: size, display: "block" }} />
      {label && (
        <div
          style={{
            marginTop: size * 0.04,
            fontSize: size * 0.075,
            fontWeight: 700,
            color: NAVY,
            fontFamily: arabic,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function Chip({ children, size }: { children: ReactNode; size: number }) {
  return (
    <span
      dir="ltr"
      style={{
        display: "inline-block",
        border: `2px solid ${CYAN}66`,
        background: `${CYAN}1a`,
        color: CYAN,
        borderRadius: 999,
        padding: `${size * 0.3}px ${size * 0.9}px`,
        fontSize: size,
        fontWeight: 700,
        fontFamily: display,
      }}
    >
      {children}
    </span>
  );
}

/** A4 portrait (794 × 1123), white, for printing. */
function Poster({ a }: { a: Art }) {
  return (
    <div
      dir="rtl"
      style={{
        width: 794,
        height: 1123,
        background: "#fff",
        color: NAVY,
        fontFamily: arabic,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${NAVY}, #0e2a63)`,
          padding: "34px 48px 96px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <img src={`${BASE_PATH}/brand/logo-horizontal-white.png`} alt="BuildX HUE" style={{ height: 40 }} />
          <Chip size={15}>{a.year}</Chip>
        </div>
        <div
          style={{
            marginTop: 30,
            color: "#fff",
            fontSize: 23,
            fontWeight: 600,
            opacity: 0.85,
            whiteSpace: "nowrap",
          }}
        >
          الأسرة الطلابية للروبوتكس والابتكار · جامعة حورس
        </div>
        <div style={{ marginTop: 6, color: "#fff", fontSize: 76, fontWeight: 800, lineHeight: 1.15 }}>
          سجّل في أسرة{" "}
          <span dir="ltr" style={{ color: CYAN, fontFamily: display }}>
            {a.family}
          </span>
        </div>
        <img
          src={BAQLOZ}
          alt=""
          style={{ position: "absolute", insetInlineEnd: 36, bottom: -120, width: 250 }}
        />
      </div>
      <div style={{ padding: "40px 48px 0", display: "flex", gap: 36, alignItems: "flex-start" }}>
        <div style={{ flex: 1, paddingInlineEnd: 250 }}>
          {PERKS.map((p) => (
            <div
              key={p}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontSize: 26,
                fontWeight: 700,
                margin: "0 0 18px",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: BLUE,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                }}
              >
                ✓
              </span>
              {p}
            </div>
          ))}
          <div style={{ marginTop: 14, fontSize: 19, color: "#45526b", lineHeight: 1.6 }}>
            الاسم، الرقم القومي، العنوان، التليفون والمستوى. دقيقتين بس وتبقى رسمي في كشف رعاية الطلاب.
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: "auto",
          padding: "24px 48px 34px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <QrCard src={a.qr} size={230} />
          <div style={{ marginTop: 14, fontSize: 26, fontWeight: 800 }}>امسح الكود وسجّل 👆</div>
          <div dir="ltr" style={{ fontSize: 19, color: BLUE, fontWeight: 700, fontFamily: display }}>
            buildxhue.com/family
          </div>
        </div>
        <div style={{ textAlign: "center", paddingBottom: 6 }}>
          <QrCard src={a.joinQr} size={120} />
          <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, color: "#45526b" }}>
            عايز تنضم لفريق؟
          </div>
        </div>
      </div>
      <div style={{ height: 12, background: `linear-gradient(90deg, ${BLUE}, ${CYAN}, #ff7a45)` }} />
    </div>
  );
}

const darkBg: CSSProperties = {
  background: `radial-gradient(60% 45% at 80% 15%, ${BLUE}55, transparent 70%), radial-gradient(50% 40% at 10% 90%, ${CYAN}33, transparent 70%), linear-gradient(160deg, ${NAVY}, #0b1f4d)`,
  color: "#fff",
  fontFamily: arabic,
  position: "relative",
  overflow: "hidden",
};

/** Instagram post, 1080 × 1080. */
function Post({ a }: { a: Art }) {
  return (
    <div
      dir="rtl"
      style={{
        ...darkBg,
        width: 1080,
        height: 1080,
        padding: 72,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <img src={`${BASE_PATH}/brand/logo-horizontal-white.png`} alt="" style={{ height: 52 }} />
        <Chip size={24}>{a.year}</Chip>
      </div>
      <div style={{ marginTop: 70, fontSize: 40, fontWeight: 600, opacity: 0.85 }}>التسجيل مفتوح 🎉</div>
      <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.1, marginTop: 8 }}>
        سجّل في أسرة
        <br />
        <span dir="ltr" style={{ color: CYAN, fontFamily: display }}>
          {a.family}
        </span>
      </div>
      <div style={{ marginTop: 26, fontSize: 34, opacity: 0.85 }}>رحلات · ورش · مسابقات · مشاريع</div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", gap: 34 }}>
        <QrCard src={a.qr} size={250} />
        <div style={{ paddingBottom: 18 }}>
          <div style={{ fontSize: 38, fontWeight: 800 }}>دقيقتين بس 👆</div>
          <div
            dir="ltr"
            style={{ fontSize: 32, color: CYAN, fontWeight: 700, fontFamily: display, marginTop: 6 }}
          >
            buildxhue.com/family
          </div>
        </div>
      </div>
      <img src={BAQLOZ} alt="" style={{ position: "absolute", insetInlineEnd: 20, bottom: -24, width: 320 }} />
    </div>
  );
}

/** Instagram / WhatsApp story, 1080 × 1920. */
function Story({ a }: { a: Art }) {
  return (
    <div
      dir="rtl"
      style={{
        ...darkBg,
        width: 1080,
        height: 1920,
        padding: "100px 80px 110px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <img src={`${BASE_PATH}/brand/logo-horizontal-white.png`} alt="" style={{ height: 64 }} />
      <div style={{ marginTop: 26 }}>
        <Chip size={28}>{a.year}</Chip>
      </div>
      <div style={{ marginTop: 56, fontSize: 52, fontWeight: 600, opacity: 0.85 }}>التسجيل مفتوح 🎉</div>
      <div style={{ fontSize: 112, fontWeight: 800, lineHeight: 1.1, marginTop: 10, whiteSpace: "nowrap" }}>
        سجّل في أسرة
        <br />
        <span dir="ltr" style={{ color: CYAN, fontFamily: display }}>
          {a.family}
        </span>
      </div>
      <img
        src={BAQLOZ}
        alt=""
        style={{ flex: "1 1 0", minHeight: 0, width: "100%", objectFit: "contain", margin: "24px 0" }}
      />
      <QrCard src={a.qr} size={330} />
      <div style={{ marginTop: 34, fontSize: 46, fontWeight: 800 }}>امسح وسجّل في دقيقتين 👆</div>
      <div
        dir="ltr"
        style={{ fontSize: 40, color: CYAN, fontWeight: 700, fontFamily: display, marginTop: 8 }}
      >
        buildxhue.com/family
      </div>
    </div>
  );
}

const FILES: Record<Kind, { name: string; w: number; h: number }> = {
  poster: { name: "buildx-family-poster-A4.pdf", w: 794, h: 1123 },
  post: { name: "buildx-family-post.png", w: 1080, h: 1080 },
  story: { name: "buildx-family-story.png", w: 1080, h: 1920 },
};

/** The three buttons; each makes its file on the device. */
export function FamilyPromoKit({ family, year }: { family: string; year: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [qr, setQr] = useState<{ qr: string; joinQr: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void import("qrcode").then(async (QR) => {
      const [a, b] = await Promise.all([
        QR.toDataURL(FAMILY_URL, { margin: 1, width: 900, errorCorrectionLevel: "M", color: { dark: NAVY } }),
        QR.toDataURL(JOIN_URL, { margin: 1, width: 500, errorCorrectionLevel: "M", color: { dark: NAVY } }),
      ]);
      if (live) setQr({ qr: a, joinQr: b });
    });
    return () => {
      live = false;
    };
  }, []);

  const make = async (k: Kind) => {
    if (!qr || kind) return;
    setKind(k);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const node = box.current?.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("render");
      await imagesReady([node]);
      await document.fonts?.ready;
      const f = FILES[k];
      if (k === "poster") await saveNodesAsPdf([node], f.name, { widthPx: 1588 });
      else {
        const { toBlob } = await import("html-to-image");
        const blob = await toBlob(node, { width: f.w, height: f.h, pixelRatio: 1, cacheBust: true });
        if (!blob) throw new Error("render");
        download(blob, f.name);
      }
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setKind(null);
    }
  };

  const art: Art | null = qr ? { family, year, ...qr } : null;
  return (
    <div className="grid gap-2 text-start" data-testid="family-promo">
      <p className="text-sm font-semibold text-chalk">مواد دعاية جاهزة (الكود فيها بيفتح الفورم)</p>
      <Button
        icon="printer"
        variant="primary"
        loading={kind === "poster"}
        disabled={!qr || !!kind}
        onClick={() => void make("poster")}
        block
      >
        بوستر A4 للطباعة (PDF)
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          icon="download"
          loading={kind === "post"}
          disabled={!qr || !!kind}
          onClick={() => void make("post")}
        >
          بوست إنستجرام
        </Button>
        <Button
          icon="download"
          loading={kind === "story"}
          disabled={!qr || !!kind}
          onClick={() => void make("story")}
        >
          ستوري
        </Button>
      </div>
      {kind &&
        art &&
        createPortal(
          <div
            ref={box}
            aria-hidden
            style={{ position: "fixed", top: 0, left: "-10000px", width: FILES[kind].w }}
          >
            {kind === "poster" ? <Poster a={art} /> : kind === "post" ? <Post a={art} /> : <Story a={art} />}
          </div>,
          document.body,
        )}
    </div>
  );
}
