"use client";
/**
 * The 3D AI studio: make (or bring back) a wallet, top up with a transfer receipt, describe a model or
 * upload a photo, watch it being made, then turn it around and download GLB, STL or OBJ. While models
 * are being made it asks every few seconds (which also moves them along).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { prepareImage } from "@/lib/client-image";
import {
  createWallet,
  DEFAULT_PACKAGES,
  errorKey,
  generate,
  getInfo,
  getMe,
  modelUrl,
  photoDataUrl,
  recoverWallet,
  savedWallet,
  saveWallet,
  share,
  topUp,
  type Info,
  type Job,
  type Me,
  type Saved,
} from "./api";
import { COPY, type Lang } from "./copy";
import { ModelViewer, saveObj, saveStl } from "./viewer";

type C = (typeof COPY)["ar"];
const input = "h-12 w-full rounded-xl border border-[var(--line)] bg-void px-4 text-chalk outline-none transition-colors placeholder:text-steel focus:border-cyan/60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-mist">{label}</span>
      {children}
      {hint && <span className="text-xs text-fog">{hint}</span>}
    </label>
  );
}

function Wallet({ c, onReady }: { c: C; onReady: (w: Saved) => void }) {
  const [mode, setMode] = useState<"new" | "back">("new");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const w = mode === "new" ? await createWallet(name, phone) : await recoverWallet(code, phone);
      saveWallet(w);
      onReady(w);
    } catch (x) {
      setErr(c.errors[errorKey(x)] ?? c.errors.invalid);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={go} className="mx-auto grid max-w-lg gap-5 rounded-3xl border border-[var(--line)] bg-abyss p-7" data-testid="ai3d-wallet-form">
      <div className="flex gap-2">
        {(["new", "back"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex-1 rounded-xl border px-3 py-2 text-sm transition-colors", mode === m ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line)] text-fog hover:text-chalk")}>
            {m === "new" ? c.newWallet : c.haveWallet}
          </button>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-mist">{mode === "new" ? c.walletNewBody : c.recoverBody}</p>
      {mode === "new" ? (
        <Field label={c.yourName}>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" data-testid="ai3d-name" />
        </Field>
      ) : (
        <Field label={c.walletCode}>
          <input className={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required dir="ltr" placeholder="X3D-XXXXXXXX" />
        </Field>
      )}
      <Field label={c.phone}>
        <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" dir="ltr" autoComplete="tel" placeholder="01xxxxxxxxx" data-testid="ai3d-phone" />
      </Field>
      {err && <p className="text-sm text-danger">{err}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary" data-testid="ai3d-wallet-submit">
        <span aria-hidden className="btn-sheen" />
        <span>{mode === "new" ? c.create : c.recover}</span>
      </button>
    </form>
  );
}

function TopUp({ c, lang, info, token, start, onDone, onClose }: { c: C; lang: Lang; info: Info | null; token: string; start: number; onDone: () => void; onClose: () => void }) {
  const pkgs = info?.packages?.length ? info.packages : DEFAULT_PACKAGES;
  const [pkg, setPkg] = useState(Math.min(start, pkgs.length - 1));
  const [method, setMethod] = useState("vodafone_cash");
  const [sender, setSender] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const pay = lang === "ar" ? info?.pay_ar : info?.pay_en || info?.pay_ar;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setErr(c.errors.receipt);
    setBusy(true);
    setErr("");
    try {
      const small = await prepareImage(file, { maxEdge: 1600, maxBytes: 1_500_000 }).catch(() => file);
      await topUp(token, pkg, method, sender, small);
      setOk(true);
      onDone();
    } catch (x) {
      setErr(c.errors[errorKey(x)] ?? c.errors.invalid);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-void/85 p-4 backdrop-blur">
      <form onSubmit={send} className="relative grid w-full max-w-xl gap-5 rounded-3xl border border-[var(--line)] bg-abyss p-7" data-testid="ai3d-topup">
        <button type="button" onClick={onClose} className="btn btn-icon absolute end-3 top-3" aria-label={c.close}>
          <Icon name="close" size={16} />
        </button>
        <h2 className="font-display text-2xl font-bold text-chalk">{c.topupTitle}</h2>
        {ok ? (
          <p className="rounded-2xl border border-ok/40 bg-ok/10 p-5 text-ok" data-testid="ai3d-topup-sent">
            {c.sent}
          </p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-sm font-medium text-mist">{c.choose}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {pkgs.map((p, i) => (
                  <button key={i} type="button" onClick={() => setPkg(i)} className={cn("rounded-2xl border p-4 text-start transition-colors", pkg === i ? "border-cyan/60 bg-cyan/10" : "border-[var(--line)] hover:border-cyan/30")}>
                    <span className="block text-sm text-fog">{c.credit(p.credits)}</span>
                    <span className="block font-display text-xl font-bold text-chalk">{c.egp(p.price)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-void p-4 text-sm">
              <p className="font-medium text-mist">{c.payTo}</p>
              <p className="mt-1 whitespace-pre-line text-chalk" dir="auto">
                {pay || c.payNotSet}
              </p>
            </div>
            <Field label={c.method}>
              <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(c.methods).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={c.sender} hint={c.senderHint}>
              <input className={input} value={sender} onChange={(e) => setSender(e.target.value)} required minLength={3} maxLength={80} dir="auto" data-testid="ai3d-sender" />
            </Field>
            <Field label={c.receipt}>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-mist file:me-3 file:rounded-lg file:border-0 file:bg-cyan/15 file:px-3 file:py-2 file:text-ice" data-testid="ai3d-receipt" />
            </Field>
            {err && <p className="text-sm text-danger">{err}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary" data-testid="ai3d-topup-send">
              <span aria-hidden className="btn-sheen" />
              <span>{c.send}</span>
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function JobCard({ c, job, onOpen, onShare }: { c: C; job: Job; onOpen: () => void; onShare: (on: boolean) => void }) {
  const running = job.status !== "done" && job.status !== "failed";
  const thumb = modelUrl(job.thumb);
  return (
    <article className="overflow-hidden rounded-3xl border border-[var(--line)] bg-abyss" data-testid="ai3d-job" data-status={job.status}>
      <div className="relative aspect-square overflow-hidden bg-void">
        {thumb ? (
           
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-cyan">
            <Icon name="cad" size={44} className={cn(running && "animate-[spin_6s_linear_infinite]")} />
          </div>
        )}
        {running && (
          <div aria-hidden className="absolute inset-x-0 h-1/3 animate-[scan_2.4s_linear_infinite] bg-gradient-to-b from-cyan/0 via-cyan/25 to-cyan/0" />
        )}
      </div>
      <div className="grid gap-2 p-4">
        <p className="line-clamp-2 min-h-[2.5em] text-sm text-chalk" dir="auto">
          {job.prompt || (job.kind === "image" ? c.fromImage : "")}
        </p>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={cn(job.status === "done" ? "text-ok" : job.status === "failed" ? "text-danger" : "text-ice")}>{c.status[job.status]}</span>
          {running && <span className="font-mono text-fog">{job.progress}%</span>}
          {job.status === "failed" && job.refunded && <span className="text-fog">{c.refunded}</span>}
        </div>
        {running && (
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-volt to-cyan transition-[width] duration-700" style={{ width: `${Math.max(4, job.progress)}%` }} />
          </div>
        )}
        {job.status === "done" && (job.glb || job.remote_glb) && (
          <>
            <button type="button" onClick={onOpen} className="btn btn-sm btn-primary mt-1" data-testid="ai3d-open">
              <span>{c.view}</span>
            </button>
            <label className="flex items-center gap-2 text-xs text-fog">
              <input type="checkbox" checked={job.public} onChange={(e) => onShare(e.target.checked)} className="accent-cyan" />
              {job.public ? c.shared : c.share}
            </label>
          </>
        )}
      </div>
    </article>
  );
}

function ViewerDialog({ c, job, onClose }: { c: C; job: Job; onClose: () => void }) {
  const url = modelUrl(job.glb) ?? job.remote_glb!;
  const model = useRef<THREE.Object3D | null>(null);
  const [ready, setReady] = useState(false);
  const name = `buildx-3d-${job.id.slice(0, 8)}`;
  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-[80] grid place-items-center bg-void/90 p-4 backdrop-blur" onClick={onClose}>
      <div className="relative flex h-[min(88vh,46rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-abyss" onClick={(e) => e.stopPropagation()}>
        <div className="relative min-h-0 flex-1">
          <ModelViewer
            url={url}
            onLoaded={(m) => {
              model.current = m.scene;
              setReady(true);
            }}
          />
          <button type="button" onClick={onClose} className="btn btn-icon absolute end-3 top-3" aria-label={c.close}>
            <Icon name="close" size={16} />
          </button>
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-fog">{c.viewerHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] p-4">
          <span className="me-auto text-sm text-mist">{c.download}</span>
          <a href={url} download={`${name}.glb`} className="btn btn-sm" data-testid="ai3d-dl-glb">
            GLB
          </a>
          <button type="button" disabled={!ready} onClick={() => model.current && saveStl(model.current, name)} className="btn btn-sm" data-testid="ai3d-dl-stl">
            STL
          </button>
          <button type="button" disabled={!ready} onClick={() => model.current && saveObj(model.current, name)} className="btn btn-sm">
            OBJ
          </button>
        </div>
      </div>
    </div>
  );
}

export function Ai3dStudio({ lang, home }: { lang: Lang; home: string }) {
  const c = COPY[lang];
  const [info, setInfo] = useState<Info | null>(null);
  const [wallet, setWallet] = useState<Saved | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [kind, setKind] = useState<"text" | "image">("text");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [buy, setBuy] = useState<number | null>(null);
  const [open, setOpen] = useState<Job | null>(null);

  useEffect(() => {
    getInfo().then(setInfo, () => {});
    setWallet(savedWallet());
    const b = new URLSearchParams(location.search).get("buy");
    if (b !== null && /^\d$/.test(b)) setBuy(Number(b));
  }, []);

  const load = useCallback(async () => {
    if (!wallet) return;
    try {
      setMe(await getMe(wallet.token));
    } catch (x) {
      if (errorKey(x) === "wallet_invalid") {
        saveWallet(null);
        setWallet(null);
        setErr(c.errors.wallet_invalid);
      }
    }
  }, [wallet, c]);

  useEffect(() => {
    void load();
  }, [load]);

  // While something is being made, ask every few seconds.
  const running = me?.jobs.some((j) => j.status !== "done" && j.status !== "failed") ?? false;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => !document.hidden && void load(), 4000);
    return () => clearInterval(id);
  }, [running, load]);

  const cost = kind === "text" ? (info?.cost_text ?? 1) : (info?.cost_image ?? 1);
  const enabled = info?.enabled ?? false;
  const enough = (me?.wallet.credits ?? 0) >= cost;

  const make = async () => {
    if (!wallet) return;
    setBusy(true);
    setErr("");
    try {
      await generate(wallet.token, kind, prompt, style, kind === "image" ? photo : null);
      if (kind === "text") setPrompt("");
      await load();
    } catch (x) {
      setErr(c.errors[errorKey(x)] ?? c.errors.invalid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative min-h-screen bg-void pb-24 pt-28 lg:pt-32">
      <div aria-hidden className="grid-lines mask-radial absolute inset-x-0 top-0 h-[40rem] opacity-30" />
      <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={home} className="font-mono text-xs uppercase tracking-[0.2em] text-fog hover:text-chalk">
              {c.name}
            </Link>
            <h1 className="mt-2 font-display text-[clamp(2rem,4.5vw,3.4rem)] font-bold text-chalk">{c.studio}</h1>
          </div>
          {me && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-abyss px-5 py-3" data-testid="ai3d-balance">
              <div>
                <p className="text-xs text-fog">{c.credits}</p>
                <p className="font-display text-2xl font-bold text-chalk">{me.wallet.credits}</p>
              </div>
              <div className="border-s border-[var(--line)] ps-3">
                <p className="text-xs text-fog">{c.code}</p>
                <p className="font-mono text-sm text-ice" title={c.saveCode}>
                  {me.wallet.code}
                </p>
              </div>
              <button type="button" onClick={() => setBuy(0)} className="btn btn-sm btn-primary" data-testid="ai3d-topup-open">
                <span>{c.topup}</span>
              </button>
            </div>
          )}
        </div>

        {info && !enabled && <p className="mb-6 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-gold">{c.closed}</p>}

        {wallet === null && <Wallet c={c} onReady={setWallet} />}
        {err && !me && <p className="mt-4 text-center text-sm text-danger">{err}</p>}

        {wallet && (
          <>
            <div className="grid gap-6 rounded-3xl border border-[var(--line)] bg-abyss p-6 lg:p-8">
              <div className="flex gap-2">
                {(["text", "image"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={cn("flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors", kind === k ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line)] text-fog hover:text-chalk")}>
                    <Icon name={k === "text" ? "book" : "image"} size={16} />
                    {k === "text" ? c.fromText : c.fromImage}
                  </button>
                ))}
              </div>
              {kind === "text" ? (
                <Field label={c.promptLabel} hint={c.promptHint}>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={500} rows={3} dir="auto" className={cn(input, "h-auto py-3")} data-testid="ai3d-prompt" />
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <label className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-[var(--line)] bg-void text-fog hover:border-cyan/50">
                    {photo ? (
                       
                      <img src={photo} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="grid place-items-center gap-1 text-center text-xs">
                        <Icon name="image" size={28} />
                        {c.pickImage}
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          setPhoto(await photoDataUrl(f));
                        } catch {
                          setErr(c.errors.image);
                        }
                      }}
                    />
                  </label>
                  <div className="grid content-start gap-3">
                    <p className="text-sm text-mist">{c.imageLabel}</p>
                    <p className="text-xs text-fog">{c.imageHint}</p>
                    <Field label={c.noteLabel}>
                      <input className={input} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={200} dir="auto" />
                    </Field>
                  </div>
                </div>
              )}
              {kind === "text" && (
                <div className="flex flex-wrap gap-2">
                  {c.ideas.map((x) => (
                    <button key={x} type="button" onClick={() => setPrompt(x)} className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-fog transition-colors hover:border-cyan/40 hover:text-chalk" dir="auto">
                      {x}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-medium text-mist">{c.style}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(c.styles).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setStyle(k)} className={cn("rounded-xl border px-3 py-1.5 text-sm transition-colors", style === k ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line)] text-fog hover:text-chalk")}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {err && me && <p className="text-sm text-danger">{err}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || !enabled || !enough || (kind === "text" ? prompt.trim().length < 3 : !photo)}
                  onClick={() => void make()}
                  className="btn btn-primary btn-lg"
                  data-testid="ai3d-generate"
                >
                  <span aria-hidden className="btn-sheen" />
                  <span>{c.generate(cost)}</span>
                </button>
                {me && enabled && !enough && (
                  <button type="button" onClick={() => setBuy(0)} className="text-sm text-gold underline-offset-4 hover:underline">
                    {c.needCredits}
                  </button>
                )}
              </div>
            </div>

            <h2 className="mb-5 mt-12 font-display text-2xl font-bold text-chalk">{c.myModels}</h2>
            {me && me.jobs.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-[var(--line)] p-10 text-center text-fog">{c.none}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {me?.jobs.map((j) => (
                  <JobCard
                    key={j.id}
                    c={c}
                    job={j}
                    onOpen={() => setOpen(j)}
                    onShare={(on) => {
                      setMe((m) => (m ? { ...m, jobs: m.jobs.map((x) => (x.id === j.id ? { ...x, public: on } : x)) } : m));
                      void share(wallet.token, j.id, on);
                    }}
                  />
                ))}
              </div>
            )}

            {me && me.topups.length > 0 && (
              <>
                <h2 className="mb-4 mt-12 font-display text-xl font-bold text-chalk">{c.history}</h2>
                <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-abyss">
                  {me.topups.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                      <span className="text-chalk">
                        {c.credit(t.credits)} · {c.egp(Number(t.amount))}
                      </span>
                      <span className="text-fog">{c.methods[t.method]}</span>
                      <span className={cn(t.status === "approved" ? "text-ok" : t.status === "rejected" ? "text-danger" : "text-gold")}>
                        {t.status === "approved" ? c.approved : t.status === "rejected" ? c.rejected : c.pending}
                        {t.note ? ` — ${t.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                saveWallet(null);
                setWallet(null);
                setMe(null);
              }}
              className="mt-10 text-xs text-steel hover:text-fog"
            >
              {c.signOut}
            </button>
          </>
        )}
      </div>
      {wallet && buy !== null && <TopUp c={c} lang={lang} info={info} token={wallet.token} start={buy} onDone={() => void load()} onClose={() => setBuy(null)} />}
      {open && <ViewerDialog c={c} job={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
