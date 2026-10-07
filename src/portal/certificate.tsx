"use client";
/**
 * The printed certificate: one A4 landscape page per certificate, with a QR code that opens
 * buildxhue.com/verify/?c=<code>. Sizes use container units, so the same page scales on a phone
 * screen and prints at exactly 297 × 210 mm.
 */
import { useEffect, useState } from "react";
import { BASE_PATH } from "./core";
import { Button, Icon } from "./ui";

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

export function CertificateSheet({ c }: { c: Certificate }) {
  const kind = CERT_KINDS.find((k) => k.key === c.kind) ?? CERT_KINDS[0];
  const qr = useQr(verifyUrl(c.code));
  return (
    <div className="cert-page mx-auto w-full max-w-[297mm] [container-type:inline-size] print:max-w-none">
      <div
        className="relative aspect-[297/210] w-full overflow-hidden bg-white text-[#081634]"
        style={{ fontSize: "1cqw" }}
      >
        {/* Frame */}
        <div className="absolute inset-[2.2em] rounded-[0.6em] border-[0.35em] border-[#081634]" />
        <div className="absolute inset-[3.1em] rounded-[0.35em] border-[0.12em] border-[#2b6dff]/60" />
        <div className="absolute -end-[9em] -top-[9em] size-[24em] rounded-full bg-[#2b6dff]/[0.07]" />
        <div className="absolute -bottom-[11em] -start-[8em] size-[26em] rounded-full bg-[#38dcff]/[0.08]" />

        <div className="absolute inset-[5.5em] flex flex-col items-center text-center" dir="ltr">
          <img
            src={`${BASE_PATH}/brand/logo-horizontal-black.svg`}
            alt="BuildX HUE"
            className="h-[3.2em] w-auto"
          />
          <div className="flex w-full flex-1 flex-col items-center justify-center">
            <p className="text-[1.25em] font-semibold uppercase tracking-[0.42em] text-[#2b6dff]">
              {kind.en}
            </p>
            <p className="mt-[0.3em] text-[1.6em] font-bold" dir="rtl">
              {kind.ar}
            </p>
            <p className="mt-[1.8em] text-[1.25em] text-[#45526b]">This certifies that · نشهد بأن</p>
            <p
              className="mt-[0.5em] max-w-[90%] text-balance text-[3.6em] font-extrabold leading-[1.1]"
              dir="auto"
            >
              {c.name}
            </p>
            <span className="mt-[0.9em] h-[0.18em] w-[28em] bg-gradient-to-r from-transparent via-[#2b6dff] to-transparent" />
            <p className="mt-[1.2em] text-[1.25em] text-[#45526b]">
              {kind.lead} · <span dir="rtl">{kind.leadAr}</span>
            </p>
            <p className="mt-[0.5em] max-w-[85%] text-balance text-[2.2em] font-bold leading-tight">
              {c.title}
            </p>
            {c.title_ar && (
              <p
                className="mt-[0.2em] max-w-[85%] text-balance text-[1.9em] font-bold leading-tight"
                dir="rtl"
              >
                {c.title_ar}
              </p>
            )}
            {(c.details || c.details_ar || c.hours) && (
              <p className="mt-[0.8em] max-w-[75%] text-[1.15em] leading-snug text-[#45526b]">
                {[c.details, c.hours ? `${c.hours} training hours` : null].filter(Boolean).join(" · ")}
                {c.details_ar && (
                  <span className="block" dir="rtl">
                    {c.details_ar}
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="flex w-full items-end justify-between gap-[2em] text-start">
            <div>
              <p className="text-[1em] uppercase tracking-[0.2em] text-[#45526b]">Issued · تاريخ الإصدار</p>
              <p className="mt-[0.3em] text-[1.35em] font-bold">{fmtDate(c.issued_on, "en-GB")}</p>
            </div>
            <div className="text-center">
              <span className="block h-[0.12em] w-[16em] bg-[#081634]/50" />
              <p className="mt-[0.5em] text-[1.05em] font-semibold">BuildX HUE · Horus University</p>
            </div>
            <div className="flex items-end gap-[0.9em]">
              <div className="text-end">
                <p className="text-[0.95em] text-[#45526b]">Verify · تحقق</p>
                <p className="font-mono text-[1.15em] font-bold tracking-wider">{c.code}</p>
                <p className="text-[0.85em] text-[#45526b]">buildxhue.com/verify</p>
              </div>
              {qr ? (
                <img src={qr} alt={`QR ${c.code}`} className="size-[7.5em]" />
              ) : (
                <span className="size-[7.5em]" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-screen print view for one or more certificates (no app chrome; one page each when printed). */
export function CertificatePrint({ certs, onBack }: { certs: Certificate[]; onBack: () => void }) {
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
        <Button size="sm" variant="primary" icon="download" onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <p className="mx-auto mb-3 max-w-[297mm] text-xs text-fog print:hidden">
        من نافذة الطباعة اختار «حفظ كـ PDF» عشان تبعتها للطالب، أو اطبعها على A4 بالعرض.
      </p>
      <div className="grid gap-4 print:block">
        {certs.map((c) => (
          <CertificateSheet key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}
