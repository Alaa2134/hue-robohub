/**
 * The bus request letter (طلب توفير أتوبيس) as printable A4 pages: the Students' Welfare letterhead,
 * the request with the event, date, venue and head count, and an optional list of names for the
 * gate. Official Arabic: kept out of the app's translation (translate="no"); the app's sheet that
 * fills it in is src/portal/trip-letter.tsx.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type TripPerson = { id: string; name: string; phone?: string | null; extra?: string | null };

export type Settings = {
  to_title: string;
  to_name: string;
  to_role: string;
  sign1_role: string;
  sign1_name: string;
  sign2_role: string;
  sign2_name: string;
  from_place: string;
  seats: number;
  header_ar1: string;
  header_ar2: string;
  header_en1: string;
  header_en2: string;
};
export type Letter = { event: string; date: string; venue: string; city: string; purpose: string; leave: string; back: string; supervisors: number };

export const SETTINGS: Settings = {
  to_title: "السيد الأستاذ الدكتور/",
  to_name: "",
  to_role: "عميد كلية الذكاء الاصطناعي والمعلومات",
  sign1_role: "عميد الكلية",
  sign1_name: "",
  sign2_role: "المشرف المساعد",
  sign2_name: "",
  from_place: "مقر جامعة حورس بدمياط",
  seats: 50,
  header_ar1: "قطاع شؤون التعليم والطلاب",
  header_ar2: "الإدارة العامة لرعاية الطلاب",
  header_en1: "Education & Students’ Affairs Sector",
  header_en2: "Students’ Welfare Department",
};
export const LEAVE = "صباحًا";
export const BACK = "والعودة في نفس اليوم بعد انتهاء الفعاليات";
export const PURPOSE =
  "وتهدف الزيارة إلى مشاركة الطلاب في الفعالية، والتعرف على أحدث التطورات في مجالات الروبوتات والذكاء الاصطناعي، بما يسهم في دعم العملية التعليمية وتنمية مهارات الطلاب وتوسيع مداركهم العلمية.";

export const arDay = (d: string) => new Intl.DateTimeFormat("ar-EG", { weekday: "long", timeZone: "Africa/Cairo" }).format(new Date(`${d}T12:00:00Z`));
export const arDate = (d: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }).format(new Date(`${d}T12:00:00Z`));
/** «أتوبيس»، «أتوبيسين»، «عدد (3) أتوبيسات». */
export const busesAr = (n: number) => (n <= 1 ? "أتوبيس" : n === 2 ? "أتوبيسين" : `عدد (${n}) أتوبيسات`);
export const busesFor = (people: number, seats: number) => Math.max(1, Math.ceil(people / Math.max(10, seats || 50)));
const localPhone = (p?: string | null) => (p && /^\+20(1\d{9})$/.test(p) ? `0${p.slice(3)}` : (p ?? ""));

const INK = "#111827";
const page: React.CSSProperties = { width: 794, height: 1123, padding: "34px 56px 30px", boxSizing: "border-box", background: "#fff", color: INK, fontFamily: "'Times New Roman', 'Traditional Arabic', 'Amiri', Tahoma, serif", display: "flex", flexDirection: "column", position: "relative" };

function Letterhead({ s }: { s: Settings }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
      <div style={{ textAlign: "center", fontWeight: 700, lineHeight: 1.45 }}>
        <div style={{ fontSize: 16 }}>{s.header_ar1}</div>
        <div style={{ fontSize: 16 }}>{s.header_ar2}</div>
        <div dir="ltr" style={{ fontSize: 14.5, fontFamily: "Arial, Helvetica, sans-serif" }}>
          {s.header_en1}
        </div>
        <div dir="ltr" style={{ fontSize: 14.5, fontFamily: "Arial, Helvetica, sans-serif" }}>
          {s.header_en2}
        </div>
      </div>
      <img src={`${BASE_PATH}/brand/hue-logo.png`} alt="Horus University – Egypt" style={{ width: 230, height: "auto" }} />
    </div>
  );
}

function Signatures({ s }: { s: Settings }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: 34, fontSize: 18 }}>
      {[
        [s.sign1_role, s.sign1_name],
        [s.sign2_role, s.sign2_name],
      ].map(([role, name], i) => (
        <div key={i} style={{ minWidth: 250, textAlign: "center", lineHeight: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 19 }}>{role}</div>
          <div>{name}</div>
          <div>التوقيع: ...........................</div>
        </div>
      ))}
    </div>
  );
}

export function LetterPage({ s, l, students, supervisors, buses }: { s: Settings; l: Letter; students: number; supervisors: number; buses: number }) {
  const total = students + supervisors;
  const p: React.CSSProperties = { fontSize: 19, lineHeight: 1.9, margin: 0 };
  return (
    <div dir="rtl" lang="ar" translate="no" data-testid="trip-letter-page" style={page}>
      <Letterhead s={s} />
      <h1 style={{ textAlign: "center", fontSize: 32, fontWeight: 800, margin: "34px 0 26px" }}>{buses > 1 ? "طلب توفير أتوبيسات" : "طلب توفير أتوبيس"}</h1>
      <p style={{ ...p, fontWeight: 700 }}>
        {s.to_title} {s.to_name}
      </p>
      <p style={{ ...p, fontWeight: 700 }}>{s.to_role}</p>
      <p style={{ ...p, textAlign: "center", margin: "14px 0" }}>تحية طيبة وبعد،،،</p>
      <p style={{ ...p, textAlign: "center" }}>
        برجاء التكرم بالموافقة على توفير {busesAr(buses)} لنقل طلاب جامعة حورس من أسرة <b dir="ltr" style={{ whiteSpace: "nowrap", unicodeBidi: "isolate" }}>BuildX HUE</b> لحضور فعاليات
      </p>
      <p dir="ltr" style={{ ...p, textAlign: "center", fontWeight: 800, fontSize: 22, fontFamily: "Arial, Helvetica, sans-serif", margin: "4px 0" }}>
        {l.event}
      </p>
      {l.date && (
        <p style={{ ...p, textAlign: "center" }}>
          والمقرر عقدها يوم <b>{arDay(l.date)}</b> الموافق <b>{arDate(l.date)}</b>،
        </p>
      )}
      {(l.venue || l.city) && (
        <p style={{ ...p, textAlign: "center" }}>
          {l.venue && <>ب{l.venue.replace(/^ب(?=[\u0621-\u064A])/, "")}</>}
          {l.city && <> بمدينة {l.city.replace(/^مدينة\s*/, "")}</>}.
        </p>
      )}
      <p style={{ ...p, textAlign: "center", marginTop: 14 }}>
        وذلك لعدد (<b>{students}</b>) طالبًا وطالبة{supervisors > 0 && <>، بالإضافة إلى (<b>{supervisors}</b>) من المشرفين، بإجمالي (<b>{total}</b>) فردًا</>}.
      </p>
      {l.purpose && <p style={{ ...p, textAlign: "justify", marginTop: 14 }}>{l.purpose}</p>}
      <p style={{ ...p, textAlign: "center", marginTop: 14 }}>
        على أن يكون التحرك من <b>{s.from_place}</b> إلى مقر الفعالية {l.leave || LEAVE}، {l.back || BACK}.
      </p>
      <p style={{ ...p, textAlign: "center", marginTop: 16 }}>وتفضلوا بقبول وافر التحية والتقدير،،،</p>
      <Signatures s={s} />
      <div style={{ marginTop: "auto", textAlign: "center", fontSize: 13, color: "#4b5563" }}>تحريرًا في {arDate(new Date().toISOString().slice(0, 10))}</div>
    </div>
  );
}

export const PER_PAGE = 28;
/** Names in pages of 28, with the last page short enough to leave room for the signatures. */
export function listChunks<T>(all: T[]): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < all.length; i += PER_PAGE) pages.push(all.slice(i, i + PER_PAGE));
  const last = pages[pages.length - 1];
  if (last && last.length > 20) pages.splice(pages.length - 1, 1, last.slice(0, last.length - 6), last.slice(last.length - 6));
  return pages.length ? pages : [[]];
}

export function ListPage({ s, l, people, from, pageNo, pages, extraLabel, last }: { s: Settings; l: Letter; people: TripPerson[]; from: number; pageNo: number; pages: number; extraLabel?: string; last: boolean }) {
  const th: React.CSSProperties = { border: "1px solid #111827", padding: "6px 8px", background: "#eef1f6", fontWeight: 700, fontSize: 14, textAlign: "center" };
  const td: React.CSSProperties = { border: "1px solid #111827", padding: "5px 8px", fontSize: 14, textAlign: "start", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 };
  return (
    <div dir="rtl" lang="ar" translate="no" data-testid="trip-letter-page" style={page}>
      <Letterhead s={s} />
      <h2 style={{ textAlign: "center", fontSize: 22, fontWeight: 800, margin: "22px 0 4px" }}>كشف بأسماء الطلاب المشاركين</h2>
      <p dir="ltr" style={{ textAlign: "center", margin: "0 0 12px", fontSize: 16, fontWeight: 700, fontFamily: "Arial, Helvetica, sans-serif" }}>
        {l.event}
        {l.date ? ` · ${l.date.split("-").reverse().join("/")}` : ""}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 44 }} />
          <col />
          <col style={{ width: 150 }} />
          {extraLabel && <col style={{ width: 170 }} />}
        </colgroup>
        <thead>
          <tr>
            <th style={th}>م</th>
            <th style={th}>الاسم</th>
            <th style={th}>رقم الموبايل</th>
            {extraLabel && <th style={th}>{extraLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {people.map((x, i) => (
            <tr key={x.id}>
              <td style={{ ...td, textAlign: "center" }}>{from + i + 1}</td>
              <td style={{ ...td, fontWeight: 600 }}>{x.name}</td>
              <td style={{ ...td, textAlign: "center" }} dir="ltr">
                {localPhone(x.phone)}
              </td>
              {extraLabel && <td style={td}>{x.extra ?? ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {last && <Signatures s={s} />}
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4b5563" }}>
        <span>BuildX HUE · Horus University – Egypt</span>
        <span>
          صفحة {pageNo} من {pages}
        </span>
      </div>
    </div>
  );
}

