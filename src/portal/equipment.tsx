"use client";
/**
 * Equipment Library, on top of the store: QR labels to stick on each item (printed as an A4 sheet),
 * a scanner that opens the item you point at (to lend or take back), and the student side — what
 * students may borrow and their requests.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { APP_PATH, fileUrl, fmt, publicOrigin, studentRpc } from "./core";
import { saveNodesAsPdf } from "./pdf";
import { Scanner } from "./scanner";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Icon,
  Input,
  List,
  Loading,
  Row,
  Sheet,
  Textarea,
  TopBar,
  toast,
  useAsync,
} from "./ui";

export const CONDITION: Record<string, { label: string; tone: "ok" | "muted" | "warn" | "danger" }> = {
  good: { label: "سليمة", tone: "ok" },
  worn: { label: "مستعملة", tone: "muted" },
  repair: { label: "محتاجة صيانة", tone: "warn" },
  broken: { label: "عطلانة", tone: "danger" },
};

/** What a label's QR holds: the store screen opened on that item (any phone camera can read it). */
export const labelUrl = (code: string) => `${publicOrigin()}${APP_PATH}#/staff/inventory?item=${code}`;
/** The item code in whatever a scanner read (the label's link or the bare code). */
export const codeIn = (raw: string) => raw.toUpperCase().match(/BXE-[0-9A-F]{6}/)?.[0] ?? null;

export function QrImg({ value, size }: { value: string; size: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode").then((QR) =>
      QR.toDataURL(value, { margin: 1, width: size * 3, errorCorrectionLevel: "M" }).then(
        (u) => live && setSrc(u),
      ),
    );
    return () => {
      live = false;
    };
  }, [value, size]);
  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, display: "block" }}
    />
  ) : (
    <div style={{ width: size, height: size, background: "#fff" }} />
  );
}

/** Point the camera at a label; the store opens that item. */
export function ScanSheet({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const [paused, setPaused] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <Sheet open onClose={onClose} title="امسح ملصق القطعة">
      <div className="grid gap-3">
        <Scanner
          paused={paused}
          onDetect={(raw) => {
            const c = codeIn(raw);
            if (!c) return;
            setPaused(true);
            onCode(c);
          }}
          className="aspect-square w-full overflow-hidden rounded-2xl"
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = codeIn(typed);
            if (c) onCode(c);
            else toast("الكود شكله BXE-XXXXXX", "error");
          }}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="أو اكتب الكود: BXE-…"
            dir="ltr"
            aria-label="كود القطعة"
          />
          <Button type="submit">افتح</Button>
        </form>
      </div>
    </Sheet>
  );
}

type LabelItem = { id: string; name: string; code: string; location: string };
const PER_PAGE = 24;

/** A4 sheets of labels (3 × 8): QR, name, code and shelf. */
export function LabelsSheet({ items, onClose }: { items: LabelItem[]; onClose: () => void }) {
  const pages = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const chunks: LabelItem[][] = [];
  for (let i = 0; i < items.length; i += PER_PAGE) chunks.push(items.slice(i, i + PER_PAGE));
  const save = async () => {
    setBusy(true);
    try {
      // Give the QR images a moment to render.
      await new Promise((r) => setTimeout(r, 400));
      const nodes = [...(pages.current?.querySelectorAll<HTMLElement>("[data-label-page]") ?? [])];
      await saveNodesAsPdf(nodes, `buildx-equipment-labels-${items.length}.pdf`, { widthPx: 794 });
    } catch {
      toast("محصلش حفظ", "error");
    }
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose} title={`ملصقات QR (${items.length})`} wide>
      <div className="grid gap-3">
        <p className="text-sm text-mist">
          اطبعها على ورق لاصق A4 (3 × 8) وحط كل ملصق على قطعته. أي موبايل بيقرا الـ QR بيفتح القطعة في المخزن.
        </p>
        <Button variant="primary" icon="download" loading={busy} onClick={save} disabled={!items.length}>
          حفظ PDF
        </Button>
        <div ref={pages} className="grid gap-4 overflow-x-auto">
          {chunks.map((chunk, p) => (
            <div
              key={p}
              data-label-page
              style={{
                width: 794,
                height: 1123,
                background: "#fff",
                padding: "38px 26px",
                boxSizing: "border-box",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gridAutoRows: "131px",
                gap: 0,
              }}
            >
              {chunk.map((i) => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 8,
                    border: "1px dashed #ccc",
                    color: "#111",
                    fontFamily: "system-ui, sans-serif",
                    direction: "rtl",
                  }}
                >
                  <QrImg value={labelUrl(i.code)} size={96} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        lineHeight: 1.25,
                        maxHeight: 50,
                        overflow: "hidden",
                      }}
                    >
                      {i.name}
                    </div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", marginTop: 4, direction: "ltr" }}>
                      {i.code}
                    </div>
                    {i.location && (
                      <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{i.location}</div>
                    )}
                    <div style={{ fontSize: 9, color: "#777", marginTop: 4 }}>BuildX HUE</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/* ─── Students ─────────────────────────────────────────────────────────── */

type StudentItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  photo: string | null;
  available: number;
  condition: string;
};
type StudentReq = {
  id: string;
  item: string;
  quantity: number;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  until: string | null;
  at: string;
};
const REQ: Record<StudentReq["status"], { label: string; tone: "info" | "ok" | "danger" }> = {
  pending: { label: "مستني", tone: "info" },
  approved: { label: "اتوافق", tone: "ok" },
  rejected: { label: "اترفض", tone: "danger" },
};
const ASK_ERRORS: Record<string, string> = {
  pending: "عندك طلب للحاجة دي لسه مستني رد.",
  too_many: "عندك 5 طلبات مستنية؛ استنى ردهم الأول.",
  quantity: "الكمية دي مش متاحة.",
  until: "اختار ميعاد ترجيع خلال الشهرين الجايين.",
  purpose: "اكتب هتستخدمها في إيه.",
  not_found: "القطعة دي مبقتش متاحة للاستعارة.",
};

/** /me/equipment — what students may borrow, and their requests. */
export function StudentEquipment() {
  const { data, error, loading, reload } = useAsync(
    () => studentRpc<{ items: StudentItem[]; requests: StudentReq[] }>("student_equipment"),
    [],
  );
  const [asking, setAsking] = useState<StudentItem | null>(null);
  const [q, setQ] = useState("");
  const items = (data?.items ?? []).filter(
    (i) =>
      !q.trim() || `${i.name} ${i.category} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <>
      <TopBar title="استعارة المعدات" sub="القطع والأدوات اللي تقدر تستلفها من المخزن" back="/me" />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <div className="grid gap-4">
          {!!data?.requests.length && (
            <Card className="grid gap-2">
              <p className="text-sm font-semibold text-chalk">طلباتك</p>
              {data.requests.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-mist">{`${r.item} × ${r.quantity}${r.until ? ` · لحد ${fmt.short(r.until)}` : ""}`}</span>
                  {r.note && r.status === "rejected" && (
                    <span className="truncate text-xs text-fog">{r.note}</span>
                  )}
                  <Badge tone={REQ[r.status].tone}>{REQ[r.status].label}</Badge>
                </div>
              ))}
            </Card>
          )}
          {(data?.items.length ?? 0) > 6 && (
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="دوّر…"
              aria-label="دوّر في المعدات"
            />
          )}
          {!data?.items.length ? (
            <Empty
              icon="box"
              title="مفيش معدات متاحة للطلبة دلوقتي"
              body="أمين المخزن بيحدد القطع اللي الطلبة يقدروا يستلفوها."
            />
          ) : (
            <List>
              {items.map((i) => (
                <Row key={i.id} onClick={() => setAsking(i)}>
                  <div className="flex items-center gap-3">
                    {i.photo ? (
                      <img
                        src={fileUrl(i.photo)}
                        alt=""
                        className="size-11 shrink-0 rounded-2xl object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                          i.available ? "bg-cyan/10 text-cyan" : "bg-white/[0.04] text-fog",
                        )}
                      >
                        <Icon name="box" size={22} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-chalk">{i.name}</p>
                      <p className="truncate text-xs text-fog">
                        {[i.category, CONDITION[i.condition]?.label].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge tone={i.available ? "ok" : "muted"}>
                      {i.available ? `متاح ${i.available}` : "مش متاح"}
                    </Badge>
                  </div>
                </Row>
              ))}
            </List>
          )}
        </div>
      )}
      {asking && (
        <AskSheet
          item={asking}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function AskSheet({ item, onClose, onDone }: { item: StudentItem; onClose: () => void; onDone: () => void }) {
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [qty, setQty] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [until, setUntil] = useState(week);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await studentRpc<{ ok: boolean; error?: string }>("student_equipment_request", {
        p_item: item.id,
        p_qty: Number(qty) || 1,
        p_purpose: purpose,
        p_until: new Date(`${until}T20:00:00`).toISOString(),
      });
      if (!r.ok) toast(ASK_ERRORS[r.error ?? ""] ?? "محصلش إرسال", "error");
      else {
        toast("الطلب اتبعت لأمين المخزن");
        onDone();
      }
    } catch {
      toast("محصلش إرسال", "error");
    }
    setBusy(false);
  };
  return (
    <Sheet open onClose={onClose} title={item.name}>
      <div className="grid gap-3">
        {item.photo && (
          <img src={fileUrl(item.photo)} alt="" className="max-h-56 w-full rounded-2xl object-contain" />
        )}
        {item.description && <p className="whitespace-pre-line text-sm text-mist">{item.description}</p>}
        {!item.available ? (
          <p className="text-sm text-warn">مش متاحة دلوقتي. جرّب تاني بعدين.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`الكمية (متاح ${item.available})`}>
                <Input
                  type="number"
                  min={1}
                  max={item.available}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </Field>
              <Field label="هترجعها لحد">
                <Input
                  type="date"
                  value={until}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </Field>
            </div>
            <Field label="هتستخدمها في إيه؟">
              <Textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                maxLength={300}
                className="min-h-16"
                placeholder="مشروع التخرج، تجربة في البيت، مسابقة…"
              />
            </Field>
            <Button
              variant="primary"
              block
              loading={busy}
              onClick={send}
              disabled={purpose.trim().length < 2}
            >
              اطلب الاستعارة
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
