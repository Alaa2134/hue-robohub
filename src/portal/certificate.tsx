"use client";
/**
 * The printed certificate: one A4 landscape page per certificate, with a QR code that opens
 * buildxhue.com/verify/?c=<code>. Sizes use container units, so the same page scales on a phone
 * screen and prints at exactly 297 × 210 mm.
 *
 * Certificates use the BuildX HUE artworks in public/certificates (Appreciation, and Achievement for
 * each track): the name, the date and the QR are drawn on top. The artworks were exported without
 * their sample date; their layout (where the gold line under the name and the date line sit) is in
 * CERT_DESIGNS, in pixels of the 1491 × 1055 artwork. "classic" is the original drawn design.
 */
import { useEffect, useRef, useState } from "react";
import { BASE_PATH, errorText, isNative } from "./core";
import { saveNodesAsPdf } from "./pdf";
import { Button, Icon, toast } from "./ui";

export type Certificate = {
  id: string;
  code: string;
  name: string;
  kind: "completion" | "participation" | "achievement" | "appreciation";
  title: string;
  title_ar: string | null;
  details: string | null;
  details_ar: string | null;
  hours: number | null;
  issued_on: string;
  design?: string | null;
};

export const CERT_KINDS: {
  key: Certificate["kind"];
  ar: string;
  en: string;
  lead: string;
  leadAr: string;
}[] = [
  {
    key: "completion",
    ar: "شهادة إتمام",
    en: "Certificate of Completion",
    lead: "has successfully completed",
    leadAr: "أتمّ بنجاح",
  },
  {
    key: "participation",
    ar: "شهادة مشاركة",
    en: "Certificate of Participation",
    lead: "has taken part in",
    leadAr: "شارك في",
  },
  {
    key: "achievement",
    ar: "شهادة تميّز",
    en: "Certificate of Achievement",
    lead: "is recognised for",
    leadAr: "تقديرًا لتميّزه في",
  },
  {
    key: "appreciation",
    ar: "شهادة تقدير",
    en: "Certificate of Appreciation",
    lead: "is thanked for their contribution to",
    leadAr: "شكرًا على مساهمته في",
  },
];

export const verifyUrl = (code: string) => `https://buildxhue.com/verify/?c=${code}`;

export type CertDesign = { key: string; en: string; ar: string; rule: number; dateLine: number; dateX: number; match?: RegExp };

const ART = { w: 1491, h: 1055 };

/** The artworks (order = order in the picker). `match` guesses the track from a certificate title. */
export const CERT_DESIGNS: CertDesign[] = [
  { key: "appreciation", en: "Appreciation", ar: "شكر وتقدير", rule: 613, dateLine: 890, dateX: 349 },
  { key: "robotics", en: "Robotics", ar: "روبوتكس", rule: 602, dateLine: 886, dateX: 392, match: /robot|روبوت/i },
  { key: "ai", en: "Artificial Intelligence", ar: "ذكاء اصطناعي", rule: 611, dateLine: 890, dateX: 349, match: /\bai\b|artificial|machine learning|deep learning|ذكاء|تعلم الآلة/i },
  { key: "iot", en: "IoT", ar: "إنترنت الأشياء", rule: 610, dateLine: 891, dateX: 348, match: /\biot\b|internet of things|الأشياء|الاشياء/i },
  { key: "cybersecurity", en: "Cybersecurity", ar: "أمن سيبراني", rule: 612, dateLine: 891, dateX: 348, match: /cyber|security|سيبران|أمن المعلومات/i },
  { key: "hardware", en: "Hardware", ar: "هاردوير", rule: 602, dateLine: 891, dateX: 335.5, match: /hardware|embedded|electronic|هارد|إلكترون|الكترون|امبيدد/i },
  { key: "software", en: "Software", ar: "برمجيات", rule: 619, dateLine: 897, dateX: 350.5, match: /software|programming|coding|developer|web|برمج|سوفت/i },
  { key: "design", en: "Design", ar: "تصميم", rule: 611, dateLine: 890, dateX: 351, match: /design|\bui\b|\bux\b|graphic|media|تصميم|جرافيك|ميديا/i },
  { key: "entrepreneurship", en: "Entrepreneurship", ar: "ريادة أعمال", rule: 613, dateLine: 892, dateX: 349, match: /entrepreneur|business|startup|ريادة|بيزنس|أعمال/i },
];

/** The design to use: the one saved on the certificate, else Appreciation or the track in its title. */
export function designKeyFor(c: Pick<Certificate, "design" | "kind" | "title" | "title_ar">): string {
  if (c.design && (c.design === "classic" || CERT_DESIGNS.some((d) => d.key === c.design))) return c.design;
  if (c.kind === "appreciation") return "appreciation";
  const text = `${c.title} ${c.title_ar ?? ""}`;
  return CERT_DESIGNS.find((d) => d.match?.test(text))?.key ?? "classic";
}

export const certArt = (key: string) => `${BASE_PATH}/certificates/${key}.webp`;

function useQr(text: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((QR) =>
        QR.toDataURL(text, {
          margin: 0,
          width: 360,
          errorCorrectionLevel: "M",
          color: { dark: "#081634", light: "#ffffff" },
        }),
      )
      .then((u) => alive && setSrc(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [text]);
  return src;
}

const fmtDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${iso}T12:00:00`),
  );

const NAVY = "#081634";
const GOLD = "#b8892f";
const GOLD_LIGHT = "#e8c77a";
const INK = "#3d4a63";
const AR = "var(--font-kufi), var(--font-plex-arabic), var(--font-saira), system-ui, sans-serif";
const EN = "var(--font-saira), var(--font-inter), system-ui, sans-serif";

/** Gold line with a diamond in the middle. */
function Rule({ width }: { width: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "0.8em", width }}>
      <span style={{ flex: 1, height: "0.12em", background: `linear-gradient(to left, ${GOLD}, transparent)` }} />
      <span style={{ width: "0.7em", height: "0.7em", transform: "rotate(45deg)", background: GOLD }} />
      <span style={{ flex: 1, height: "0.12em", background: `linear-gradient(to right, ${GOLD}, transparent)` }} />
    </span>
  );
}

/** A4 landscape certificate. Sizes are in em with 1em = 1% of the page width, so it scales anywhere. */
export function CertificateSheet({ c }: { c: Certificate }) {
  const design = CERT_DESIGNS.find((d) => d.key === designKeyFor(c));
  return design ? <ArtworkSheet c={c} d={design} /> : <ClassicSheet c={c} />;
}

/** One of the BuildX HUE artworks with the name, date and QR drawn in their places. */
function ArtworkSheet({ c, d }: { c: Certificate; d: CertDesign }) {
  const qr = useQr(verifyUrl(c.code));
  const arabic = /[\u0600-\u06FF]/.test(c.name);
  // Long names get smaller so they stay on one line between the frame's ornaments.
  const max = arabic ? 3.7 : 4.1;
  const size = Math.max(2.2, Math.min(max, (max * 24) / Math.max(24, [...c.name].length)));
  const pctX = (x: number) => `${(x / ART.w) * 100}%`;
  const fromBottom = (y: number) => `${((ART.h - y) / ART.h) * 100}%`;
  return (
    <div className="cert-page mx-auto w-full max-w-[297mm] [container-type:inline-size] print:max-w-none">
      <div className="relative aspect-[297/210] w-full overflow-hidden" style={{ fontSize: "1cqw", background: "#fbfaf7", color: NAVY }}>
        <img src={certArt(d.key)} alt="" className="absolute inset-0 block size-full" draggable={false} />
        <p
          dir="auto"
          style={{
            position: "absolute",
            left: "14%",
            right: "14%",
            bottom: fromBottom(d.rule - 11),
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            fontFamily: arabic ? "var(--font-cert-ar), var(--font-kufi), serif" : "var(--font-cert), Georgia, 'Times New Roman', serif",
            fontWeight: 700,
            fontSize: `${size}em`,
            lineHeight: 1.25,
            letterSpacing: arabic ? 0 : "0.01em",
          }}
        >
          {c.name}
        </p>
        <p
          dir="ltr"
          style={{
            position: "absolute",
            left: pctX(d.dateX),
            bottom: fromBottom(d.dateLine - 9),
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-cert), Georgia, 'Times New Roman', serif",
            fontWeight: 700,
            fontSize: "1.85em",
            lineHeight: 1.2,
          }}
        >
          {fmtDate(c.issued_on, "en-GB")}
        </p>
        {/* Verification, right of the signature inside the frame. */}
        <div className="absolute flex flex-col items-center" style={{ left: pctX(1284), top: `${(876 / ART.h) * 100}%`, width: "6.6em", gap: "0.3em" }}>
          <div style={{ background: "#fff", padding: "0.35em", borderRadius: "0.45em", boxShadow: `0 0 0 0.09em ${GOLD}` }}>
            {qr ? <img src={qr} alt={`QR ${c.code}`} style={{ width: "5.3em", height: "5.3em", display: "block" }} /> : <span style={{ width: "5.3em", height: "5.3em", display: "block" }} />}
          </div>
          <span dir="ltr" style={{ fontFamily: "var(--font-jbmono), ui-monospace, monospace", fontWeight: 700, fontSize: "0.7em", letterSpacing: "0.05em", color: NAVY }}>
            {c.code}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The original drawn design (for titles that match no artwork, or when chosen). */
function ClassicSheet({ c }: { c: Certificate }) {
  const kind = CERT_KINDS.find((k) => k.key === c.kind) ?? CERT_KINDS[0];
  const qr = useQr(verifyUrl(c.code));
  const year = c.issued_on.slice(0, 4);
  // Arabic names in Kufi, Latin names in Saira (Kufi has no Latin letters).
  const nameFont = /[\u0600-\u06FF]/.test(c.name) ? AR : EN;
  return (
    <div className="cert-page mx-auto w-full max-w-[297mm] [container-type:inline-size] print:max-w-none">
      <div className="relative aspect-[297/210] w-full overflow-hidden" style={{ fontSize: "1cqw", background: "#fdfbf6", color: NAVY }} dir="rtl">
        {/* ── Side panel: logo, seal, verification ── */}
        <div
          className="absolute inset-y-0 right-0 flex flex-col items-center justify-between"
          style={{
            width: "27em",
            padding: "4.2em 2.6em 3.6em",
            background: `repeating-linear-gradient(135deg, rgb(255 255 255 / 0.025) 0 0.35em, transparent 0.35em 1.1em), linear-gradient(160deg, #13306b 0%, ${NAVY} 55%, #050e24 100%)`,
            boxShadow: "inset 0.4em 0 0 rgb(232 199 122 / 0.9), inset 0.9em 0 0 rgb(8 22 52 / 1), inset 1.05em 0 0 rgb(232 199 122 / 0.45)",
          }}
        >
          <img src={`${BASE_PATH}/brand/logo-stacked-white.svg`} alt="BuildX HUE" style={{ width: "13em", height: "auto" }} />

          {/* Seal */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              width: "15.5em",
              height: "15.5em",
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, #f6dfa0, ${GOLD} 55%, #8a6420 100%)`,
              boxShadow: "0 0.6em 1.6em rgb(0 0 0 / 0.35), inset 0 0 0 0.35em rgb(255 255 255 / 0.25)",
              padding: "1.1em",
            }}
          >
            <div
              className="flex size-full flex-col items-center justify-center"
              style={{ borderRadius: "50%", border: `0.18em dashed rgb(8 22 52 / 0.55)`, gap: "0.4em" }}
            >
              <img src={`${BASE_PATH}/brand/mark-black.svg`} alt="" style={{ width: "5.2em", height: "auto", opacity: 0.9 }} />
              <span style={{ fontFamily: EN, fontWeight: 800, fontSize: "1.25em", letterSpacing: "0.18em", color: NAVY }}>BUILDX HUE</span>
              <span style={{ fontFamily: EN, fontWeight: 600, fontSize: "0.95em", letterSpacing: "0.3em", color: "rgb(8 22 52 / 0.75)" }}>{year}</span>
            </div>
          </div>

          {/* Verification */}
          <div className="flex flex-col items-center" style={{ gap: "0.8em" }}>
            <div style={{ background: "#fff", padding: "0.7em", borderRadius: "0.9em", boxShadow: `0 0 0 0.15em ${GOLD_LIGHT}` }}>
              {qr ? <img src={qr} alt={`QR ${c.code}`} style={{ width: "8.4em", height: "8.4em", display: "block" }} /> : <span style={{ width: "8.4em", height: "8.4em", display: "block" }} />}
            </div>
            <span dir="ltr" style={{ fontFamily: "var(--font-jbmono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.25em", letterSpacing: "0.12em", color: "#fff" }}>
              {c.code}
            </span>
            <span style={{ fontFamily: AR, fontSize: "0.95em", color: GOLD_LIGHT }}>
              تحقق من الشهادة · <span dir="ltr">buildxhue.com/verify</span>
            </span>
          </div>
        </div>

        {/* ── Main area ── */}
        <div className="absolute inset-y-0 left-0" style={{ right: "27em" }}>
          {/* Watermark and frame */}
          <img
            src={`${BASE_PATH}/brand/mark-black.svg`}
            alt=""
            className="pointer-events-none absolute"
            style={{ width: "44em", left: "50%", top: "52%", transform: "translate(-50%, -50%)", opacity: 0.022 }}
          />
          <div className="absolute" style={{ inset: "2.6em", border: `0.28em solid ${NAVY}` }} />
          <div className="absolute" style={{ inset: "3.35em", border: `0.1em solid ${GOLD}` }} />
          {[
            { top: "2.95em", left: "2.95em" },
            { top: "2.95em", right: "2.95em" },
            { bottom: "2.95em", left: "2.95em" },
            { bottom: "2.95em", right: "2.95em" },
          ].map((pos, i) => (
            <span key={i} className="absolute" style={{ ...pos, width: "0.9em", height: "0.9em", background: GOLD, transform: "rotate(45deg)" }} />
          ))}

          <div className="absolute flex flex-col items-center text-center" style={{ inset: "5.6em 6em 5em" }}>
            <p dir="ltr" style={{ fontFamily: EN, fontWeight: 700, fontSize: "1.2em", letterSpacing: "0.5em", color: GOLD, textTransform: "uppercase" }}>
              {kind.en}
            </p>
            <p style={{ fontFamily: AR, fontWeight: 800, fontSize: "4.4em", lineHeight: 1.15, marginTop: "0.12em" }}>{kind.ar}</p>
            <div style={{ marginTop: "1em" }}>
              <Rule width="22em" />
            </div>

            <div className="flex w-full flex-1 flex-col items-center justify-center">
              <p style={{ fontFamily: AR, fontSize: "1.35em", color: INK }}>
                نشهد بأن <span style={{ color: "rgb(61 74 99 / 0.55)" }}>·</span> <span dir="ltr" style={{ fontFamily: EN }}>This certifies that</span>
              </p>
              <p dir="auto" className="text-balance" style={{ fontFamily: nameFont, fontWeight: 800, fontSize: "4.6em", lineHeight: 1.2, marginTop: "0.18em", maxWidth: "92%" }}>
                {c.name}
              </p>
              <span style={{ display: "block", width: "40em", height: "0.16em", marginTop: "0.6em", background: `linear-gradient(to right, transparent, ${GOLD}, transparent)` }} />
              <p style={{ fontFamily: AR, fontSize: "1.35em", color: INK, marginTop: "1.1em" }}>
                {kind.leadAr} <span style={{ color: "rgb(61 74 99 / 0.55)" }}>·</span> <span dir="ltr" style={{ fontFamily: EN }}>{kind.lead}</span>
              </p>
              {c.title_ar && (
                <p className="text-balance" style={{ fontFamily: AR, fontWeight: 700, fontSize: "2.6em", lineHeight: 1.25, marginTop: "0.35em", maxWidth: "90%" }}>
                  {c.title_ar}
                </p>
              )}
              <p dir="ltr" className="text-balance" style={{ fontFamily: EN, fontWeight: 700, fontSize: c.title_ar ? "1.9em" : "2.6em", lineHeight: 1.25, marginTop: "0.2em", maxWidth: "90%", color: c.title_ar ? INK : NAVY }}>
                {c.title}
              </p>
              {(c.details || c.details_ar) && (
                <p style={{ fontSize: "1.15em", lineHeight: 1.5, color: INK, marginTop: "0.8em", maxWidth: "80%" }}>
                  {c.details_ar && <span style={{ fontFamily: AR, display: "block" }}>{c.details_ar}</span>}
                  {c.details && (
                    <span dir="ltr" style={{ fontFamily: EN, display: "block" }}>
                      {c.details}
                    </span>
                  )}
                </p>
              )}
              {c.hours ? (
                <span style={{ marginTop: "1em", display: "inline-flex", gap: "0.7em", alignItems: "center", border: `0.12em solid ${GOLD}`, borderRadius: "999em", padding: "0.35em 1.4em", fontSize: "1.15em" }}>
                  <span style={{ fontFamily: AR, fontWeight: 700 }}>{c.hours} ساعة تدريبية</span>
                  <span style={{ width: "0.35em", height: "0.35em", borderRadius: "50%", background: GOLD }} />
                  <span dir="ltr" style={{ fontFamily: EN, fontWeight: 600 }}>
                    {c.hours} training hours
                  </span>
                </span>
              ) : null}
            </div>

            {/* Date and signature */}
            <div className="flex w-full items-end justify-between" style={{ gap: "4em" }}>
              <div className="text-center">
                <p style={{ fontFamily: AR, fontWeight: 700, fontSize: "1.4em" }}>{fmtDate(c.issued_on, "ar-EG")}</p>
                <p dir="ltr" style={{ fontFamily: EN, fontWeight: 600, fontSize: "1.05em", color: INK }}>
                  {fmtDate(c.issued_on, "en-GB")}
                </p>
                <span style={{ display: "block", width: "18em", height: "0.1em", background: "rgb(8 22 52 / 0.35)", margin: "0.6em auto 0.5em" }} />
                <p style={{ fontFamily: AR, fontSize: "1em", color: INK }}>
                  تاريخ الإصدار · <span dir="ltr" style={{ fontFamily: EN }}>Date of issue</span>
                </p>
              </div>
              <div className="text-center">
                <p style={{ fontFamily: EN, fontWeight: 800, fontSize: "1.6em", letterSpacing: "0.08em" }}>BuildX HUE</p>
                <p style={{ fontFamily: AR, fontSize: "1.05em", color: INK }}>مجتمع الروبوتات والابتكار · جامعة حورس</p>
                <span style={{ display: "block", width: "18em", height: "0.1em", background: "rgb(8 22 52 / 0.35)", margin: "0.6em auto 0.5em" }} />
                <p style={{ fontFamily: AR, fontSize: "1em", color: INK }}>
                  قائد المجتمع · <span dir="ltr" style={{ fontFamily: EN }}>Community Lead</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Waits until every image inside the nodes has loaded (QR codes are drawn asynchronously). */
export async function imagesReady(nodes: HTMLElement[], timeoutMs = 4000) {
  const until = Date.now() + timeoutMs;
  const done = () => nodes.every((n) => Array.from(n.querySelectorAll("img")).every((i) => i.complete && i.naturalWidth > 0));
  while (!done() && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
}

/** Full-screen print view for one or more certificates (no app chrome; one page each when printed). */
export function CertificatePrint({ certs, onBack }: { certs: Certificate[]; onBack: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const native = isNative();
  const savePdf = async () => {
    const nodes = Array.from(box.current?.querySelectorAll<HTMLElement>(".cert-page > div") ?? []);
    if (!nodes.length) return;
    setBusy(true);
    try {
      await imagesReady(nodes);
      await saveNodesAsPdf(nodes, `certificate-${certs.length === 1 ? certs[0].code : certs.length}.pdf`, { landscape: true, widthPx: 2480 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-dvh bg-abyss px-3 pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))] print:min-h-0 print:bg-white print:p-0">
      <style>
        {
          "@page{size:A4 landscape;margin:0}@media print{html,body{background:#fff!important;margin:0;padding:0}.cert-page{width:297mm;height:209.5mm;overflow:hidden;break-inside:avoid;break-after:page}.cert-page:last-child{break-after:auto}}"
        }
      </style>
      <div className="mx-auto mb-3 flex max-w-[297mm] items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-mist hover:text-chalk"
        >
          <Icon name="chevron" size={16} />
          رجوع
        </button>
        <span className="flex-1 text-center text-sm text-fog">
          {certs.length > 1 ? `${certs.length} شهادة` : certs[0]?.code}
        </span>
        {!native && (
          <Button size="sm" icon="printer" onClick={() => window.print()}>
            طباعة
          </Button>
        )}
        <Button size="sm" variant="primary" icon="download" loading={busy} onClick={savePdf}>
          {native ? "حفظ / مشاركة PDF" : "تحميل PDF"}
        </Button>
      </div>
      <p className="mx-auto mb-3 max-w-[297mm] text-xs text-fog print:hidden">
        {native ? "الـ PDF بيتعمل على الموبايل، وتقدر تبعته واتساب أو تحفظه في الملفات." : "PDF جاهز تبعته للطالب، أو اطبعها على A4 بالعرض."}
      </p>
      <div ref={box} className="grid gap-4 print:block">
        {certs.map((c) => (
          <CertificateSheet key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}
