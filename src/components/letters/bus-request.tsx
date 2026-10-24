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
  /** Who the lecture excuse letter goes to (usually the vice dean for students). */
  ex_title?: string;
  ex_name?: string;
  ex_role?: string;
};
export type Letter = {
  event: string;
  date: string;
  venue: string;
  city: string;
  purpose: string;
  leave: string;
  back: string;
  supervisors: number;
  /** Who's in charge on each bus (bus 1 first), for the per-bus lists. */
  bus_sups?: { name: string; phone: string }[];
  /** The event report: what happened, and which album its photos come from. */
  summary?: string;
  album?: string;
  /** The event's money: what came in besides the fees (sponsors…), and what was spent. */
  income?: { label: string; amount: number }[];
  expenses?: { label: string; amount: number }[];
};

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

export function ListPage({ s, l, people, from, pageNo, pages, extraLabel, last, bus }: {
  s: Settings;
  l: Letter;
  people: TripPerson[];
  from: number;
  pageNo: number;
  pages: number;
  extraLabel?: string;
  last: boolean;
  /** One bus's list: its name, how many are on it, and who's in charge. */
  bus?: { name: string; count: number; sup?: { name: string; phone: string } };
}) {
  const th: React.CSSProperties = { border: "1px solid #111827", padding: "6px 8px", background: "#eef1f6", fontWeight: 700, fontSize: 14, textAlign: "center" };
  const td: React.CSSProperties = { border: "1px solid #111827", padding: "5px 8px", fontSize: 14, textAlign: "start", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 };
  return (
    <div dir="rtl" lang="ar" translate="no" data-testid="trip-letter-page" style={page}>
      <Letterhead s={s} />
      <h2 style={{ textAlign: "center", fontSize: 22, fontWeight: 800, margin: "22px 0 4px" }}>{bus ? `كشف ${bus.name} (${bus.count} طالب)` : "كشف بأسماء الطلاب المشاركين"}</h2>
      {bus?.sup?.name && (
        <p style={{ textAlign: "center", margin: "0 0 4px", fontSize: 15 }}>
          المشرف: <b>{bus.sup.name}</b>
          {bus.sup.phone && (
            <>
              {" "}
              · <span dir="ltr">{bus.sup.phone}</span>
            </>
          )}
        </p>
      )}
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



/** The lecture excuse letter: these students were at the event that day, please count it as excused. */
export function ExcuseLetterPage({ s, l, count }: { s: Settings; l: Letter; count: number }) {
  const p: React.CSSProperties = { fontSize: 19, lineHeight: 1.9, margin: 0 };
  return (
    <div dir="rtl" lang="ar" translate="no" data-testid="trip-letter-page" style={page}>
      <Letterhead s={s} />
      <h1 style={{ textAlign: "center", fontSize: 30, fontWeight: 800, margin: "34px 0 26px" }}>طلب احتساب غياب بعذر</h1>
      <p style={{ ...p, fontWeight: 700 }}>
        {s.ex_title || s.to_title} {s.ex_name || ""}
      </p>
      <p style={{ ...p, fontWeight: 700 }}>{s.ex_role || "وكيل الكلية لشؤون التعليم والطلاب"}</p>
      <p style={{ ...p, textAlign: "center", margin: "14px 0" }}>تحية طيبة وبعد،،،</p>
      <p style={{ ...p, textAlign: "justify" }}>
        نحيط سيادتكم علمًا بأن الطلاب الموضحة أسماؤهم بالكشف المرفق، وعددهم (<b>{count}</b>) طالبًا وطالبة من أسرة{" "}
        <b dir="ltr" style={{ whiteSpace: "nowrap", unicodeBidi: "isolate" }}>
          BuildX HUE
        </b>
        ، قد شاركوا في فعاليات <b dir="ltr" style={{ unicodeBidi: "isolate" }}>{l.event}</b>
        {l.date && (
          <>
            {" "}
            يوم <b>{arDay(l.date)}</b> الموافق <b>{arDate(l.date)}</b>
          </>
        )}
        {l.venue && <> ب{l.venue.replace(/^ب(?=[\u0621-\u064A])/, "")}</>}
        {l.city && <> بمدينة {l.city.replace(/^مدينة\s*/, "")}</>}، وقد تم تسجيل حضورهم بالفعل.
      </p>
      <p style={{ ...p, textAlign: "justify", marginTop: 14 }}>
        برجاء التكرم بالموافقة على احتساب غيابهم عن المحاضرات والسكاشن في هذا اليوم بعذر، وإخطار السادة أعضاء هيئة التدريس بذلك.
      </p>
      <p style={{ ...p, textAlign: "center", marginTop: 16 }}>وتفضلوا بقبول وافر التحية والتقدير،،،</p>
      <Signatures s={s} />
      <div style={{ marginTop: "auto", textAlign: "center", fontSize: 13, color: "#4b5563" }}>مرفق: كشف بأسماء الطلاب · تحريرًا في {arDate(new Date().toISOString().slice(0, 10))}</div>
    </div>
  );
}

export type ReportStats = { registered: number; accepted?: number; attended?: number; paid?: number; collected?: number };
export type ReportFeedback = { avg: number; count: number; comments: string[] };
export const egpAr = (n: number) => `${Math.round(n).toLocaleString("en-US")} جنيه`;

/** After the event: what happened, the numbers, photos, what people said, and the money. */
export function ReportPage({ s, l, stats, photos, feedback }: { s: Settings; l: Letter; stats: ReportStats; photos: string[]; feedback?: ReportFeedback | null }) {
  const box: React.CSSProperties = { flex: 1, border: "1px solid #d5dbe5", borderRadius: 12, padding: "10px 8px", textAlign: "center", background: "#f6f8fc" };
  const income = (stats.collected ?? 0) + (l.income ?? []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const spent = (l.expenses ?? []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const nums: [string, number | undefined][] = [
    ["سجّلوا", stats.registered],
    ["اتقبلوا", stats.accepted],
    ["حضروا فعلًا", stats.attended],
    ["دفعوا", stats.paid],
  ];
  return (
    <div dir="rtl" lang="ar" translate="no" data-testid="trip-letter-page" style={page}>
      <Letterhead s={s} />
      <h1 style={{ textAlign: "center", fontSize: 28, fontWeight: 800, margin: "24px 0 4px" }}>تقرير فعالية</h1>
      <p dir="ltr" style={{ textAlign: "center", margin: 0, fontSize: 20, fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif" }}>
        {l.event}
      </p>
      <p style={{ textAlign: "center", margin: "4px 0 14px", fontSize: 15, color: "#374151" }}>
        {l.date ? `${arDay(l.date)} ${arDate(l.date)}` : ""}
        {l.venue ? ` · ${l.venue}` : ""}
        {l.city ? ` · ${l.city}` : ""}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {nums
          .filter(([, n]) => n !== undefined)
          .map(([k, n]) => (
            <div key={k} style={box}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{n}</div>
              <div style={{ fontSize: 13, color: "#4b5563" }}>{k}</div>
            </div>
          ))}
        {feedback && feedback.count > 0 && (
          <div style={box}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{feedback.avg.toFixed(1)} / 5</div>
            <div style={{ fontSize: 13, color: "#4b5563" }}>تقييم الحضور ({feedback.count})</div>
          </div>
        )}
      </div>
      {l.summary?.trim() && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "16px 0 4px" }}>اللي حصل في الفعالية</h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.8, margin: 0, whiteSpace: "pre-line", textAlign: "justify" }}>{l.summary.trim()}</p>
        </>
      )}
      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${photos.length > 4 ? 3 : 2}, 1fr)`, gap: 6, marginTop: 14 }}>
          {photos.map((src) => (
            <img key={src} src={src} alt="" crossOrigin="anonymous" style={{ width: "100%", height: photos.length > 4 ? 150 : 190, objectFit: "cover", borderRadius: 8 }} />
          ))}
        </div>
      )}
      {feedback && feedback.comments.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "14px 0 4px" }}>من كلام الحضور</h2>
          {feedback.comments.slice(0, 3).map((c, i) => (
            <p key={i} style={{ fontSize: 14.5, margin: "2px 0", color: "#374151" }}>
              «{c.length > 180 ? `${c.slice(0, 180)}…` : c}»
            </p>
          ))}
        </>
      )}
      {(income > 0 || spent > 0) && (
        <p style={{ fontSize: 15, margin: "14px 0 0", padding: "8px 12px", background: "#f6f8fc", border: "1px solid #d5dbe5", borderRadius: 10 }}>
          الحسابات: الدخل <b>{egpAr(income)}</b> · المصروفات <b>{egpAr(spent)}</b> · الفرق <b>{egpAr(income - spent)}</b>
        </p>
      )}
      <Signatures s={s} />
    </div>
  );
}
