/** Where the studio's server is. Set at build time (VITE_STUDIO_API_URL) or by the page (?api=… for local testing). */
const fromQuery = typeof location !== "undefined" ? new URLSearchParams(location.search).get("api") : null;
const local = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API_URL = ((local && fromQuery) || import.meta.env.VITE_STUDIO_API_URL || "").replace(/\/$/, "");
