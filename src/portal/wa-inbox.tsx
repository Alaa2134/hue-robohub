/**
 * The WhatsApp inbox: what people write to the team's number, one conversation per person (named from
 * the students, forms and applications we know them from), with our own messages to them in between
 * and whether they were delivered and read. Within 24 hours of their last message Meta lets us answer
 * in plain words; after that only an approved template goes, from the WhatsApp screen. The owner
 * points Meta at our webhook from here (one tap, or the address and token to paste by hand).
 */
import { useEffect, useRef, useState } from "react";
import { can, fmt, isFull, rpc, type StaffRow } from "./core";
import { sendOnWhatsApp } from "./wa-handoff";
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Row, List, Textarea, TopBar, copyText, go, toast, useAsync } from "./ui";

type Convo = { phone: string; name: string | null; profile: string | null; last_at: string; last: { kind: string; body: string | null } | null; unread: number; total: number };
type Item = { dir: "in" | "out"; id: number; kind: string; body: string | null; at: string; media?: boolean; template?: string | null; status?: string; error?: string | null; delivered?: boolean; read?: boolean };
type Thread = { phone: string; last_in: string | null; items: Item[] };
type Setup = { url: string; token: string; connecting: boolean; connected_at: string | null; error: string | null; last_hit_at: string | null; received: number };

const KIND: Record<string, string> = { image: "📷 صورة", audio: "🎤 رسالة صوتية", voice: "🎤 رسالة صوتية", video: "🎬 فيديو", document: "📄 ملف", sticker: "ستيكر", location: "📍 مكان", contacts: "👤 جهة اتصال", reaction: "تفاعل", button: "ضغط زرار", interactive: "اختار من القايمة", unsupported: "رسالة مش مدعومة" };
const preview = (kind: string, body: string | null) => body || KIND[kind] || "رسالة";
const DAY = 24 * 60 * 60 * 1000;

export function WaInboxScreen({ me, phone }: { me: StaffRow; phone?: string }) {
  return phone ? <ThreadView me={me} phone={phone} /> : <InboxList me={me} />;
}

function InboxList({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Convo[]>("staff_wa_inbox"), []);
  // New messages show up without pulling down.
  useEffect(() => {
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);
  const unread = (data ?? []).reduce((a, c) => a + c.unread, 0);
  return (
    <>
      <TopBar title="رسايل الواتساب" sub={unread ? `${unread} رسالة جديدة` : "اللي الناس بعتوه لرقم الفريق"} back="/staff/whatsapp" actions={<Button size="sm" icon="refresh" onClick={reload} aria-label="تحديث" />} />
      {isFull(me) && <SetupCard empty={!data?.length} />}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="chat" title="مفيش رسايل وصلت لسه" body="أول ما حد يبعت رسالة لرقم الفريق على واتساب هتظهر هنا، ويوصلك إشعار." />
      ) : (
        <List className="mt-3" >
          {data.map((c) => (
            <Row key={c.phone} onClick={() => go(`/staff/wa-inbox/${c.phone}`)}>
              <div className="flex items-center gap-3" data-testid="wa-convo">
                <div className="min-w-0 flex-1">
                  <p className={c.unread ? "truncate font-bold text-chalk" : "truncate font-semibold text-chalk"}>
                    {c.name || <span dir="ltr">+{c.phone}</span>}
                  </p>
                  <p className="truncate text-xs text-fog" dir="auto">
                    {preview(c.last?.kind ?? "", c.last?.body ?? null)}
                  </p>
                </div>
                <div className="grid shrink-0 justify-items-end gap-1">
                  <span className="text-[11px] text-fog">{fmt.rel(c.last_at)}</span>
                  {c.unread > 0 && <Badge tone="ok">{c.unread}</Badge>}
                </div>
              </div>
            </Row>
          ))}
        </List>
      )}
    </>
  );
}

function ThreadView({ me, phone }: { me: StaffRow; phone: string }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Thread>("staff_wa_thread", { p_phone: phone }), [phone]);
  const names = useAsync(() => rpc<Convo[]>("staff_wa_inbox"), []);
  const who = names.data?.find((c) => c.phone === phone);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [data?.items.length]);
  const open = !!data?.last_in && Date.now() - new Date(data.last_in).getTime() < DAY;
  const canSend = can(me, "whatsapp");
  const name = who?.name || who?.profile || "";
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await rpc("staff_whatsapp_send", { p_people: [{ phone, name }], p_text: body, p_context: `inbox:${phone}` });
      setText("");
      reload();
      setTimeout(reload, 4000);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar title={name || <span dir="ltr">+{phone}</span>} sub={name ? <span dir="ltr">+{phone}</span> : undefined} back="/staff/wa-inbox" />
      {loading && !data ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <>
          <div className="grid gap-2 pb-4" data-testid="wa-thread">
            {data.items.map((m) => (
              <div key={`${m.dir}${m.id}`} className={m.dir === "in" ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={
                    m.dir === "in"
                      ? "max-w-[85%] rounded-2xl rounded-ss-sm border border-[var(--line-2)] bg-white/[0.04] px-3 py-2"
                      : `max-w-[85%] rounded-2xl rounded-se-sm px-3 py-2 ${m.status === "failed" ? "border border-danger/40 bg-danger/10" : "bg-[#1fa855]/20"}`
                  }
                  data-testid={m.dir === "in" ? "wa-in" : "wa-out"}
                >
                  {m.dir === "out" && m.template && <p className="text-[11px] text-fog">{`قالب ${m.template}`}</p>}
                  <p className="whitespace-pre-line break-words text-sm text-chalk" dir="auto">
                    {m.dir === "in" ? preview(m.kind, m.body) : m.body || "—"}
                  </p>
                  {m.dir === "in" && m.media && <p className="mt-1 text-[11px] text-fog">افتحها من واتساب على موبايل الفريق</p>}
                  {m.error && (
                    <p className="mt-1 text-[11px] text-danger" dir="auto">
                      {m.error}
                    </p>
                  )}
                  <p className="mt-1 text-end text-[10px] text-fog">
                    {fmt.dateTime(m.at)}
                    {m.dir === "out" && (m.status === "failed" ? " · فشلت" : m.read ? " · اتقرت ✓✓" : m.delivered ? " · وصلت ✓✓" : m.status === "sent" ? " · اتبعتت ✓" : " · في الطريق")}
                  </p>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          {canSend &&
            (open ? (
              <Card className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 grid gap-2" data-testid="wa-reply">
                <Field label="ردّك">
                  <Textarea rows={2} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب الرد…" />
                </Field>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[11px] text-fog">{`ممكن ترد بكلام عادي لحد ${fmt.time(new Date(new Date(data.last_in!).getTime() + DAY).toISOString())} (24 ساعة من آخر رسالة منه).`}</p>
                  <Button variant="primary" icon="chat" loading={busy} disabled={!text.trim()} onClick={() => void send()} data-testid="wa-reply-send">
                    ابعت
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="grid gap-2" data-testid="wa-reply-closed">
                <p className="text-sm text-mist">عدّى أكتر من 24 ساعة على آخر رسالة منه، فميتا بتسمح نبعتله قالب متوافق عليه بس.</p>
                <Button icon="chat" onClick={() => sendOnWhatsApp([{ phone, name }], { label: name || `+${phone}`, context: `inbox:${phone}` })}>
                  ابعتله قالب
                </Button>
              </Card>
            ))}
        </>
      )}
    </>
  );
}

/** For the owner: tell Meta to send the number's messages here, and see that they're arriving. */
function SetupCard({ empty }: { empty: boolean }) {
  const { data, error, reload, set } = useAsync(() => rpc<Setup>("staff_wa_inbox_setup"), []);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  // While Meta answers, look again every few seconds.
  useEffect(() => {
    if (!data?.connecting) return;
    const t = setTimeout(reload, 3000);
    return () => clearTimeout(t);
  }, [data, reload]);
  if (error || !data) return null;
  const working = !!data.last_hit_at;
  if (working && !empty && !manual) return null;
  const connect = async () => {
    setBusy(true);
    try {
      set(await rpc<Setup>("staff_wa_inbox_connect"));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mt-3 grid gap-3" data-testid="wa-inbox-setup">
      <div className="flex items-center gap-2">
        <p className="flex-1 font-semibold text-chalk">استقبال الرسايل</p>
        <Badge tone={working ? "ok" : data.connected_at ? "info" : "warn"}>{working ? "شغال" : data.connected_at ? "مستني أول رسالة" : "مش متوصل"}</Badge>
      </div>
      <p className="text-sm text-mist">
        {working
          ? `آخر حاجة وصلت من ميتا ${fmt.rel(data.last_hit_at!)}.`
          : "عشان الرسايل اللي بتوصل لرقم الفريق تظهر هنا، ميتا لازم تبعتها لعنوان الاستقبال بتاعنا. دوس «وصّل» وهنطلبها من ميتا بالربط اللي عندنا."}
      </p>
      {data.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger" dir="auto">
          {`ميتا ردت: ${data.error}`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant={working ? "secondary" : "primary"} icon="link" loading={busy || data.connecting} onClick={() => void connect()} data-testid="wa-inbox-connect">
          {data.connected_at ? "وصّل تاني" : "وصّل"}
        </Button>
        <Button variant="ghost" onClick={() => setManual((v) => !v)}>
          {manual ? "اخفي" : "أوصّلها بإيدي"}
        </Button>
      </div>
      {(manual || data.error) && (
        <div className="grid gap-2 rounded-xl border border-[var(--line)] p-3 text-xs text-mist" data-testid="wa-inbox-manual">
          <p>من developers.facebook.com: التطبيق ← WhatsApp ← Configuration ← Webhook ← Edit، حط العنوان والكود دول، وبعدين Manage واشترك في «messages».</p>
          <Button size="sm" icon="copy" onClick={() => copyText(data.url, "اتنسخ العنوان")}>
            انسخ العنوان (Callback URL)
          </Button>
          <Button size="sm" icon="copy" onClick={() => copyText(data.token, "اتنسخ الكود")}>
            انسخ الكود (Verify token)
          </Button>
        </div>
      )}
    </Card>
  );
}
