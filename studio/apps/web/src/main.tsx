import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApiError, api, loadServerConfig, signIn, signOut, token, type Me, type ServerConfig } from "./api.ts";
import { Dashboard } from "./Dashboard.tsx";
import { Editor } from "./editor/Editor.tsx";
import { Team } from "./Team.tsx";
import { Icon, Toasts, useHash } from "./ui.tsx";
import "./styles.css";

function Shell() {
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "no_api" | "offline" | "login" | "denied" | "ready">("loading");
  const [denied, setDenied] = useState("");
  const route = useHash();

  const refresh = useCallback(async () => {
    try {
      const c = await loadServerConfig();
      setCfg(c);
      if (!(await token())) return setState("login");
      setMe(await api<Me>("GET", "/me"));
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.code === "no_api") return setState("no_api");
      if (e instanceof ApiError && e.code === "offline") return setState("offline");
      if (e instanceof ApiError && e.code === "not_member") {
        setDenied(e.message);
        return setState("denied");
      }
      setState("login");
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  if (state === "loading") return <Center>جاري التحميل…</Center>;
  if (state === "no_api")
    return (
      <Center>
        <h1 className="mb-2 text-xl font-bold">BuildX AI Studio Pro</h1>
        <p className="max-w-md text-mute">سيرفر الرندر لسه متوصّلش بالنسخة دي من الموقع. الاستوديو بيحتاج سيرفر FFmpeg شغّال (شوف studio/README.md) — من غيره مفيش تصدير حقيقي، فمش هنعرض أزرار مش شغالة.</p>
      </Center>
    );
  if (state === "offline")
    return (
      <Center>
        <p className="mb-3 text-mute">سيرفر الاستوديو مش بيرد دلوقتي.</p>
        <button className="btn" onClick={() => void refresh()}>
          جرّب تاني
        </button>
      </Center>
    );
  if (state === "login" || !cfg) return <Login cfg={cfg} onDone={refresh} />;
  if (state === "denied")
    return (
      <Center>
        <p className="mb-3 max-w-md text-mute">{denied}</p>
        <button className="btn" onClick={() => void signOut().then(refresh)}>
          خروج
        </button>
      </Center>
    );
  const out = () => void signOut().then(refresh);
  const m = route.match(/^\/p\/([0-9a-f-]{36})/);
  if (m) return <Editor key={m[1]} id={m[1]} cfg={cfg} me={me!} />;
  if (route === "/team" && me?.role === "admin") return <Team me={me} />;
  return <Dashboard cfg={cfg} me={me!} onSignOut={out} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-6 text-center">{children}</div>;
}

function Login({ cfg, onDone }: { cfg: ServerConfig | null; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Center>
      <form
        className="card w-full max-w-sm p-6 text-start"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await signIn(email, password);
            onDone();
          } catch (x) {
            setErr((x as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel2 text-accent">
            <Icon name="play" />
          </span>
          <div>
            <h1 className="font-bold">BuildX AI Studio Pro</h1>
            <p className="text-xs text-mute">{cfg?.auth === "supabase" ? "ادخل بحساب فريق BuildX HUE" : "دخول الاستوديو"}</p>
          </div>
        </div>
        <label className="label" htmlFor="email">
          الإيميل
        </label>
        <input id="email" className="field mb-3" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label" htmlFor="password">
          الباسورد
        </label>
        <input id="password" className="field mb-4" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="mb-3 text-sm text-bad">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "…" : "دخول"}
        </button>
      </form>
    </Center>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell />
    <Toasts />
  </StrictMode>,
);
