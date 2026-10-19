"use client";
/**
 * "Download the media kit": a one-page A4 PDF made in the visitor's browser, with the live numbers
 * (site_impact), the partnership opportunities and tiers, and how to reach the team. Always current,
 * nothing to upload.
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/brand/icons";
import { impactItems, useImpact } from "@/components/live/impact";
import { BASE_PATH } from "@/lib/deploy";
import { nodesToPdf } from "@/lib/pdf-lite";

type L = { en: string; ar: string };
export type MediaKitProps = {
  locale: string;
  opportunities: { title: L; body: L }[];
  tiers: { t: string; d: string }[];
  contact: { email: string; phone: string; whatsapp: string };
};

const T = {
  en: {
    btn: "Download the media kit (PDF)",
    busy: "Preparing…",
    title: "Sponsorship media kit",
    about:
      "BuildX HUE is the student robotics and innovation community at Horus University, Egypt: students learning by building real machines, competing, and running workshops for their peers.",
    numbers: "By the numbers",
    ways: "Ways to partner",
    tiers: "Partnership tiers",
    reach: "Talk to us",
    made: "Updated",
  },
  ar: {
    btn: "نزّل ملف الرعاية (PDF)",
    busy: "بيتجهّز…",
    title: "ملف الرعاية والشراكة",
    about:
      "BuildX HUE مجتمع طلابي للروبوتكس والابتكار في جامعة حورس: طلاب بيتعلموا وهم بيبنوا مكن حقيقي، وبيشاركوا في مسابقات، وبيعملوا ورش لزمايلهم.",
    numbers: "بالأرقام",
    ways: "طرق الشراكة",
    tiers: "مستويات الشراكة",
    reach: "كلّمنا",
    made: "اتحدّث",
  },
};

function Page({
  locale,
  opportunities,
  tiers,
  contact,
  numbers,
}: MediaKitProps & { numbers: { label: string; value: number }[] }) {
  const ar = locale === "ar";
  const t = T[ar ? "ar" : "en"];
  const h2: React.CSSProperties = { fontSize: 17, fontWeight: 800, margin: "22px 0 10px", color: "#081634" };
  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      style={{
        width: 794,
        minHeight: 1123,
        padding: "44px 48px",
        boxSizing: "border-box",
        background: "#fff",
        color: "#081634",
        fontFamily: ar
          ? "var(--font-plex-arabic), system-ui, sans-serif"
          : "var(--font-inter), system-ui, sans-serif",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "3px solid #081634",
          paddingBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{t.title}</div>
          <div style={{ color: "#45526b", marginTop: 4 }}>buildxhue.com</div>
        </div>
        <img src={`${BASE_PATH}/brand/logo-horizontal-black.png`} alt="BuildX HUE" style={{ height: 34 }} />
      </div>
      <p style={{ marginTop: 16, fontSize: 14, color: "#26324a" }}>{t.about}</p>

      {!!numbers.length && (
        <>
          <div style={h2}>{t.numbers}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(numbers.length, 3)}, 1fr)`,
              gap: 10,
            }}
          >
            {numbers.map((n) => (
              <div
                key={n.label}
                style={{ border: "1px solid #e3e8f0", borderRadius: 12, padding: "12px 14px" }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    direction: "ltr",
                    textAlign: ar ? "right" : "left",
                  }}
                >
                  {n.value.toLocaleString(ar ? "ar-EG" : "en-US")}+
                </div>
                <div style={{ color: "#45526b", fontSize: 12 }}>{n.label}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={h2}>{t.ways}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {opportunities.map((o) => (
          <div
            key={o.title.en}
            style={{ border: "1px solid #e3e8f0", borderRadius: 12, padding: "10px 14px" }}
          >
            <div style={{ fontWeight: 700 }}>{o.title[ar ? "ar" : "en"]}</div>
            <div style={{ color: "#45526b", fontSize: 12 }}>{o.body[ar ? "ar" : "en"]}</div>
          </div>
        ))}
      </div>

      <div style={h2}>{t.tiers}</div>
      {tiers.map((tier) => (
        <div key={tier.t} style={{ padding: "8px 0", borderBottom: "1px solid #e3e8f0" }}>
          <b>{tier.t}</b>
          <span style={{ color: "#45526b" }}> · {tier.d}</span>
        </div>
      ))}

      <div style={{ ...h2, marginTop: 26 }}>{t.reach}</div>
      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          direction: "ltr",
          justifyContent: ar ? "flex-end" : "flex-start",
        }}
      >
        {contact.email && <span>✉ {contact.email}</span>}
        {contact.phone && <span>☎ {contact.phone}</span>}
        {contact.whatsapp && <span>WhatsApp +{contact.whatsapp.replace(/^\+/, "")}</span>}
        <span>buildxhue.com/sponsors</span>
      </div>
      <div
        style={{
          marginTop: 30,
          paddingTop: 12,
          borderTop: "1px solid #e3e8f0",
          color: "#45526b",
          fontSize: 11,
        }}
      >
        BuildX HUE · Horus University · {t.made}{" "}
        {new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", { dateStyle: "medium" }).format(new Date())}
      </div>
    </div>
  );
}

export function MediaKitButton(props: MediaKitProps) {
  const t = T[props.locale === "ar" ? "ar" : "en"];
  const impact = useImpact();
  const numbers = impactItems(impact, props.locale).map((n) => ({ label: n.label, value: n.value }));
  const [busy, setBusy] = useState(false);
  const [render, setRender] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const make = async () => {
    setBusy(true);
    setRender(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const node = box.current?.firstElementChild as HTMLElement | null;
      if (!node) return;
      const blob = await nodesToPdf([node], { widthPx: 1654 });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = props.locale === "ar" ? "BuildX-HUE-media-kit-ar.pdf" : "BuildX-HUE-media-kit.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally {
      setRender(false);
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void make()}
        disabled={busy}
        className="btn btn-lg"
        data-testid="media-kit"
      >
        <Icon name="arrowUpRight" size={16} className="rotate-90" />
        <span>{busy ? t.busy : t.btn}</span>
      </button>
      {render &&
        createPortal(
          <div ref={box} aria-hidden style={{ position: "fixed", top: 0, left: "-10000px" }}>
            <Page {...props} numbers={numbers} />
          </div>,
          document.body,
        )}
    </>
  );
}
