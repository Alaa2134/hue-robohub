/**
 * Puts buildxhue.com's Cloudflare zone in the shape docs/cloudflare.md describes, through the API:
 * DNS to GitHub Pages, HTTPS + HSTS, security level and bot fight mode, firewall rules, a rate limit,
 * cache rules, security headers. Safe to run again: it only changes what differs, never removes a DNS
 * record, and keeps any rule someone added by hand (ours are told apart by their "buildx_" ref).
 *
 *   CF_TOKEN=… node scripts/cloudflare-setup.mjs [--apply] [--proxy auto|on|off]
 *
 * Without --apply it only reports what it would change. Run from the "Cloudflare" workflow, where the
 * token is the CLOUDFLARE_API_TOKEN secret; it is never printed.
 */
import { appendFileSync } from "node:fs";

const API = process.env.CF_API ?? "https://api.cloudflare.com/client/v4";
const TOKEN = process.env.CF_TOKEN ?? "";
const DOMAIN = process.env.DOMAIN ?? "buildxhue.com";
const PAGES_HOST =
  process.env.PAGES_HOST ?? `${(process.env.GITHUB_REPOSITORY_OWNER ?? "alaa2134").toLowerCase()}.github.io`;
const SITE_CHECK = process.env.SITE_CHECK ?? `https://${DOMAIN}/`;
const apply = process.argv.includes("--apply");
const proxyArg = process.argv[process.argv.indexOf("--proxy") + 1];
const proxyMode =
  process.argv.includes("--proxy") && ["on", "off", "auto"].includes(proxyArg) ? proxyArg : "auto";

const GITHUB_A = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
const GITHUB_AAAA = [
  "2606:50c0:8000::153",
  "2606:50c0:8001::153",
  "2606:50c0:8002::153",
  "2606:50c0:8003::153",
];

/** The permission each part needs, said when the token is missing it. */
const NEEDS = {
  zone: "Zone → Zone → Read",
  dns: "Zone → DNS → Edit",
  settings: "Zone → Zone Settings → Edit",
  bots: "Zone → Bot Management → Edit",
  waf: "Zone → Zone WAF → Edit",
  cache: "Zone → Cache Rules → Edit",
  headers: "Zone → Transform Rules → Edit",
  purge: "Zone → Cache Purge → Purge",
};

/** JSON with keys in order, so what Cloudflare sends back compares equal to what we want. */
const stable = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );

const report = [];
const line = (icon, text) => {
  report.push(`${icon} ${text}`);
  console.log(`${icon} ${text}`);
};
let failed = 0;

class CfError extends Error {
  constructor(status, errors) {
    super(errors.map((e) => `${e.code}: ${e.message}`).join("; ") || `HTTP ${status}`);
    this.status = status;
    this.denied = status === 403 || errors.some((e) => e.code === 10000 || e.code === 9109);
  }
}

async function cf(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const out = await r.json().catch(() => ({ success: false, errors: [] }));
  if (!r.ok || !out.success) throw new CfError(r.status, out.errors ?? []);
  return out.result;
}

/** Runs one part; a failure is reported (with the missing permission when that's the cause) and the rest goes on. */
async function part(name, need, fn) {
  try {
    await fn();
  } catch (e) {
    failed++;
    if (e instanceof CfError && e.denied)
      line("⛔", `${name}: التوكن ناقصه صلاحية «${need}». ضيفها للتوكن وشغّل تاني.`);
    else line("❌", `${name}: ${e.message}`);
  }
}

if (!TOKEN) {
  console.log(
    "CLOUDFLARE_API_TOKEN is not set: add it in GitHub → Settings → Secrets and variables → Actions (docs/cloudflare.md).",
  );
  process.exit(1);
}

// ── The zone ──────────────────────────────────────────────────────────────────────────────────
let zone;
try {
  const zones = await cf("GET", `/zones?name=${encodeURIComponent(DOMAIN)}`);
  zone = zones[0];
} catch (e) {
  line(
    "⛔",
    e instanceof CfError && e.denied
      ? `التوكن مش شغال أو ناقصه «${NEEDS.zone}».`
      : `مقدرتش أوصل لـ Cloudflare: ${e.message}`,
  );
  finish(1);
}
if (!zone) {
  line(
    "⛔",
    `الدومين ${DOMAIN} مش متضاف على حساب Cloudflare ده. ضيفه الأول (Add a domain، خطة Free) وبعدين شغّل تاني.`,
  );
  finish(1);
}
const Z = `/zones/${zone.id}`;
const active = zone.status === "active";
line(
  active ? "✅" : "⏳",
  active
    ? `الدومين شغال على Cloudflare (zone ${zone.id}).`
    : `الدومين لسه مستني تغيير الـ Nameservers. غيّرهم عند مزوّد الدومين لـ: ${zone.name_servers.join(" و ")}`,
);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `zone_id=${zone.id}\nactive=${active}\n`);

// ── Proxy (orange cloud) only once GitHub's own HTTPS certificate works on the domain ───────────
/** "auto": on when it already is, or when the domain is active and HTTPS answers (fetch fails on a bad certificate). */
async function decideProxy(records) {
  if (proxyMode !== "auto") return proxyMode === "on";
  if (records.some((r) => r.name === DOMAIN && (r.type === "A" || r.type === "AAAA") && r.proxied))
    return true;
  if (!active) return false;
  const r = await fetch(SITE_CHECK, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return !!r && r.status < 500;
}
let proxied = false;

// ── DNS: GitHub Pages at the root and www; nothing is removed ─────────────────────────────────
await part("DNS", NEEDS.dns, async () => {
  const records = await cf("GET", `${Z}/dns_records?per_page=500`);
  proxied = await decideProxy(records);
  line(
    "ℹ️",
    proxied
      ? "الحماية (السحابة البرتقاني) شغالة."
      : "الحماية (السحابة البرتقاني) لسه مقفولة لحد ما الدومين يشتغل وشهادة HTTPS بتاعة GitHub تطلع. شغّل تاني بعدها.",
  );
  const want = [
    ...GITHUB_A.map((content) => ({ type: "A", name: DOMAIN, content })),
    ...GITHUB_AAAA.map((content) => ({ type: "AAAA", name: DOMAIN, content })),
    { type: "CNAME", name: `www.${DOMAIN}`, content: PAGES_HOST },
  ];
  for (const w of want) {
    const have = records.find(
      (r) => r.type === w.type && r.name === w.name && r.content.toLowerCase() === w.content.toLowerCase(),
    );
    if (!have) {
      if (w.type === "CNAME" && records.some((r) => r.name === w.name)) {
        line("⚠️", `www عليه سجل تاني غير ${PAGES_HOST}. سيبته زي ما هو، راجعه من DNS في Cloudflare.`);
        continue;
      }
      line("➕", `DNS ${w.type} ${w.name} → ${w.content}${proxied ? " (proxied)" : ""}`);
      if (apply) await cf("POST", `${Z}/dns_records`, { ...w, ttl: 1, proxied });
    } else if (have.proxied !== proxied) {
      line("🔁", `DNS ${w.type} ${w.name} → ${proxied ? "proxied" : "DNS only"}`);
      if (apply) await cf("PATCH", `${Z}/dns_records/${have.id}`, { proxied });
    }
  }
  const stray = records.filter(
    (r) =>
      r.name === DOMAIN &&
      ((r.type === "A" && !GITHUB_A.includes(r.content)) ||
        (r.type === "AAAA" && !GITHUB_AAAA.includes(r.content))),
  );
  for (const r of stray)
    line(
      "⚠️",
      `سجل ${r.type} ${r.name} → ${r.content} مش بتاع GitHub Pages، وده بيخلّي الموقع يفتح ساعات ويقع ساعات. امسحه من DNS في Cloudflare.`,
    );
});

// ── Zone settings ──────────────────────────────────────────────────────────────────────────────
const SETTINGS = {
  ssl: "strict",
  always_use_https: "on",
  automatic_https_rewrites: "on",
  min_tls_version: "1.2",
  tls_1_3: "on",
  security_level: "medium",
  browser_check: "on",
  rocket_loader: "off",
  email_obfuscation: "off",
  security_header: {
    strict_transport_security: {
      enabled: true,
      max_age: 15_552_000,
      include_subdomains: true,
      nosniff: true,
      preload: false,
    },
  },
};
await part("الإعدادات", NEEDS.settings, async () => {
  const now = Object.fromEntries((await cf("GET", `${Z}/settings`)).map((s) => [s.id, s.value]));
  for (const [id, value] of Object.entries(SETTINGS)) {
    if (stable(now[id]) === stable(value)) continue;
    line("🔧", `${id} → ${typeof value === "string" ? value : "HSTS 6 شهور"}`);
    if (!apply) continue;
    try {
      await cf("PATCH", `${Z}/settings/${id}`, { value });
    } catch (e) {
      if (e instanceof CfError && e.denied) throw e;
      line("⚠️", `${id}: ${e.message}`);
    }
  }
});

// Bot Fight Mode stays off: on the free plan no rule can let anything through it, and it challenges
// every request from a server, which shuts out the hourly monitor and Baqloz reading the site's
// knowledge file. The rules below, the rate limit and the security level do the protecting.
await part("Bot Fight Mode", NEEDS.bots, async () => {
  const now = await cf("GET", `${Z}/bot_management`);
  if (!now.fight_mode) return;
  line("🔧", "Bot Fight Mode → off (كان بيقفل الموقع على المراقبة وعلى بقلظ)");
  if (apply) await cf("PUT", `${Z}/bot_management`, { fight_mode: false });
});

// ── Rules: ours replace ours; anything else in the phase stays ──────────────────────────────────
const ASSETS = `starts_with(http.request.uri.path, "/_next/static/") or starts_with(http.request.uri.path, "/media/")`;
const PHASES = [
  {
    name: "قواعد الحظر",
    need: NEEDS.waf,
    phase: "http_request_firewall_custom",
    rules: [
      {
        ref: "buildx_probe_paths",
        description: "BuildX: paths attackers probe for (the site has none of them)",
        expression: `(http.request.uri.path contains "/wp-") or (http.request.uri.path contains "xmlrpc") or (http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "phpmyadmin") or (ends_with(http.request.uri.path, ".php"))`,
        action: "block",
      },
      {
        ref: "buildx_methods",
        description: "BuildX: the site is static, it only takes GET",
        expression: `not http.request.method in {"GET" "HEAD" "OPTIONS"}`,
        action: "block",
      },
    ],
  },
  {
    name: "حد الطلبات",
    need: NEEDS.waf,
    phase: "http_ratelimit",
    rules: [
      {
        ref: "buildx_rate",
        description: "BuildX: 60 pages in 10 seconds from one IP",
        expression: `not starts_with(http.request.uri.path, "/_next/") and not starts_with(http.request.uri.path, "/media/") and not starts_with(http.request.uri.path, "/voice/")`,
        action: "block",
        ratelimit: {
          characteristics: ["cf.colo.id", "ip.src"],
          period: 10,
          requests_per_period: 60,
          mitigation_timeout: 10,
        },
      },
    ],
    // The free plan may not take functions in a rate-limit expression; this one says the same with "contains".
    fallback: `not (http.request.uri.path contains "/_next/" or http.request.uri.path contains "/media/" or http.request.uri.path contains "/voice/")`,
  },
  {
    name: "الكاش",
    need: NEEDS.cache,
    phase: "http_request_cache_settings",
    rules: [
      {
        ref: "buildx_cache_pages",
        description: "BuildX: pages, 2 minutes at the edge",
        expression: `true`,
        action: "set_cache_settings",
        action_parameters: { cache: true, edge_ttl: { mode: "override_origin", default: 120 } },
      },
      {
        ref: "buildx_cache_assets",
        description: "BuildX: build files and media (their names change with every build)",
        expression: ASSETS,
        action: "set_cache_settings",
        action_parameters: {
          cache: true,
          edge_ttl: { mode: "override_origin", default: 31_536_000 },
          browser_ttl: { mode: "override_origin", default: 31_536_000 },
        },
      },
    ],
  },
  {
    name: "Security headers",
    need: NEEDS.headers,
    phase: "http_response_headers_transform",
    rules: [
      {
        ref: "buildx_headers",
        description: "BuildX: security headers",
        expression: `true`,
        action: "rewrite",
        action_parameters: {
          headers: {
            "X-Content-Type-Options": { operation: "set", value: "nosniff" },
            "X-Frame-Options": { operation: "set", value: "DENY" },
            "Referrer-Policy": { operation: "set", value: "strict-origin-when-cross-origin" },
            "Permissions-Policy": {
              operation: "set",
              value: "camera=(self), microphone=(self), geolocation=()",
            },
            "Cross-Origin-Opener-Policy": { operation: "set", value: "same-origin" },
          },
        },
      },
    ],
  },
];

const shape = (r) =>
  stable({
    ref: r.ref,
    description: r.description,
    expression: r.expression,
    action: r.action,
    action_parameters: r.action_parameters,
    ratelimit: r.ratelimit,
    enabled: r.enabled ?? true,
  });

for (const p of PHASES) {
  await part(p.name, p.need, async () => {
    const current = await cf("GET", `${Z}/rulesets/phases/${p.phase}/entrypoint`).catch((e) => {
      if (e instanceof CfError && e.status === 404) return { rules: [] };
      throw e;
    });
    const keep = (current.rules ?? []).filter((r) => !String(r.ref ?? "").startsWith("buildx_"));
    const ours = (current.rules ?? []).filter((r) => String(r.ref ?? "").startsWith("buildx_"));
    const strip = (r) =>
      Object.fromEntries(
        Object.entries(r).filter(([k]) =>
          [
            "ref",
            "description",
            "expression",
            "action",
            "action_parameters",
            "ratelimit",
            "enabled",
            "logging",
          ].includes(k),
        ),
      );
    const same =
      ours.length === p.rules.length &&
      ours.every(
        (r, i) =>
          shape(r) === shape(p.rules[i]) ||
          (p.fallback && shape(r) === shape({ ...p.rules[i], expression: p.fallback })),
      );
    if (same) return;
    line(
      "🔧",
      `${p.name}: ${p.rules.length} قاعدة${keep.length ? ` (والـ ${keep.length} اللي اتعملوا بالإيد فضلوا زي ما هم)` : ""}`,
    );
    if (!apply) return;
    const put = (rules) =>
      cf("PUT", `${Z}/rulesets/phases/${p.phase}/entrypoint`, { rules: [...keep.map(strip), ...rules] });
    // The free plan has room for one rate-limit rule; one made by hand keeps its place.
    const full = (e) => /\b50001\b/.test(String(e?.message)) && keep.length > 0;
    try {
      await put(p.rules);
    } catch (e) {
      if (full(e))
        return void line(
          "ℹ️",
          `${p.name}: فيه قاعدة معمولة بالإيد واخدة المكان الوحيد في الخطة المجانية، سيبناها زي ما هي.`,
        );
      if (!p.fallback || (e instanceof CfError && e.denied)) throw e;
      try {
        await put(p.rules.map((r) => ({ ...r, expression: p.fallback })));
      } catch (e2) {
        if (full(e2))
          return void line(
            "ℹ️",
            `${p.name}: فيه قاعدة معمولة بالإيد واخدة المكان الوحيد في الخطة المجانية، سيبناها زي ما هي.`,
          );
        throw e2;
      }
    }
  });
}

// ── After: the cache is cleared and the site is checked from outside ───────────────────────────
const changed = report.some((l) => /^(➕|🔁|🔧)/u.test(l));
if (apply && changed && failed === 0)
  await part("مسح الكاش", NEEDS.purge, () => cf("POST", `${Z}/purge_cache`, { purge_everything: true }));
if (active && apply) {
  // Asked like the hourly monitor asks: a server, not a browser. It has to get the page too.
  const r = await fetch(SITE_CHECK, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildX-Check/1.0; +https://buildxhue.com)" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!r) line("⚠️", `${SITE_CHECK} مش بيفتح دلوقتي. لو لسه مشغّل الحماية، استنى دقيقتين وجرّب.`);
  else if (r.status >= 400) {
    const challenged = r.headers.get("cf-mitigated") === "challenge";
    line(
      "⚠️",
      `الموقع رد بـ ${r.status}${challenged ? " (Cloudflare عامل challenge)" : ""} على طلب من سيرفر. الزوار من المتصفح غالبًا شغالين عادي، بس المراقبة وبقلظ ممكن يتأثروا. لو فضل كده بعد دقيقتين، شغّل الزرار تاني.`,
    );
  } else {
    const via = r.headers.get("server") === "cloudflare";
    line(
      via ? "✅" : "ℹ️",
      via
        ? `الموقع شغال من ورا Cloudflare (${r.status}).`
        : `الموقع شغال (${r.status}) بس لسه مش من ورا Cloudflare.`,
    );
    if (via)
      for (const h of ["strict-transport-security", "x-frame-options", "x-content-type-options"])
        if (!r.headers.get(h)) line("⚠️", `الـ header ${h} لسه مش ظاهر (ممكن ياخد دقيقة).`);
  }
}

finish(failed ? 1 : 0);

function finish(code) {
  const head = apply ? "## إعداد Cloudflare" : "## فحص Cloudflare (من غير تغيير)";
  const tail =
    !apply && report.some((l) => /^(➕|🔁|🔧)/u.test(l))
      ? "\n\nشغّل الـ workflow تاني واختار **apply** عشان التغييرات دي تتنفذ."
      : "";
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${head}\n\n${report.map((l) => `- ${l}`).join("\n") || "- كله مظبوط، مفيش حاجة تتغير."}${tail}\n`,
    );
  process.exit(code);
}
