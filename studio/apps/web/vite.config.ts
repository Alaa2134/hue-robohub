import { createHash } from "node:crypto";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The same guards every page of the site has: hidden if another site frames it, moved to https on
// buildxhue.com. Allowed by its hash (no blanket inline scripts).
const GUARD =
  '(function(){try{if(window.top!==window.self&&window.top.location.hostname!==location.hostname)throw 0}catch(e){document.documentElement.style.display="none";try{window.top.location=location.href}catch(_){}}})();(function(){try{if(location.protocol!=="http:"||!/(^|\\.)buildxhue\\.com$/.test(location.hostname))return;location.replace("https://"+location.host+location.pathname+location.search+location.hash)}catch(e){}})();';

function security(): Plugin {
  return {
    name: "studio-security",
    transformIndexHtml(html) {
      const api = process.env.VITE_STUDIO_API_URL ? new URL(process.env.VITE_STUDIO_API_URL).origin : "";
      const hash = createHash("sha256").update(GUARD).digest("base64");
      // Media and uploads come from the studio server and from signed storage links (https).
      const csp = [
        "default-src 'self'",
        `script-src 'self' 'sha256-${hash}'`,
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: https: ${api}`.trim(),
        `media-src 'self' blob: https: ${api}`.trim(),
        "font-src 'self' data:",
        `connect-src 'self' https: ${api}`.trim(),
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");
      return html.replace(
        '<meta charset="utf-8" />',
        `<meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${csp}" /><meta name="referrer" content="strict-origin-when-cross-origin" /><script>${GUARD}</script>`,
      );
    },
  };
}

// STUDIO_BASE: where the built studio lives on the site (/ar/studio/ on buildxhue.com).
export default defineConfig({
  base: process.env.STUDIO_BASE ?? "/",
  plugins: [react(), tailwindcss(), security()],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
