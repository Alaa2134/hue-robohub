/**
 * Small inline scripts the layouts put in every page's <head>. They live in a plain (server-safe)
 * module: constants exported from a "use client" file reach server components as client references,
 * not strings.
 */
import { BASE_PATH } from "@/lib/deploy";

/**
 * Clickjacking guard for the static site (GitHub Pages can't send frame-ancestors / X-Frame-Options):
 * framed by another site, the page hides itself and tries to take over the top window.
 */
export const FRAME_GUARD = `(function(){try{if(window.top!==window.self&&window.top.location.hostname!==location.hostname)throw 0}catch(e){document.documentElement.style.display="none";try{window.top.location=location.href}catch(_){}}})();`;

/**
 * Plain-http visits to buildxhue.com move to https (the browser then shows the site as secure). It
 * first checks that https really works (a tiny image over https loads), so the page is never sent
 * to a broken address while the certificate is still being issued.
 */
export const HTTPS_UPGRADE = `(function(){try{if(location.protocol!=="http:"||!/(^|\\.)buildxhue\\.com$/.test(location.hostname))return;var i=new Image();i.onload=function(){location.replace("https://"+location.host+location.pathname+location.search+location.hash)};i.src="https://"+location.host+"/favicon.ico?h="+Date.now()}catch(e){}})();`;

/**
 * Keeps the site's files on the device after the first visit (public/sw.js), so the next visits
 * load from there and use less data. Only over https (and on localhost for the tests).
 */
export const SW_REGISTER = `(function(){if(!("serviceWorker" in navigator))return;if(location.protocol!=="https:"&&location.hostname!=="localhost")return;addEventListener("load",function(){navigator.serviceWorker.register("${BASE_PATH}/sw.js",{scope:"${BASE_PATH}/"}).catch(function(){})})})();`;
