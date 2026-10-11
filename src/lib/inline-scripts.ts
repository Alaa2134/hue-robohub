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

/**
 * Arabic for Arabic phones: a visitor whose browser prefers Arabic and lands on an English page goes
 * to the same page in Arabic, unless they picked English themselves. Clicking any language link
 * (they all carry hreflang) remembers the choice on the device. Crawlers are left alone, and so are
 * pages already under /ar/ (which also keeps the shared 404 page from bouncing).
 */
export const AR_REDIRECT = `(function(){try{var K="bx-lang";document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[hreflang]");if(a)try{localStorage.setItem(K,a.getAttribute("hreflang"))}catch(_){}},true);if(document.documentElement.lang!=="en"||/bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent))return;var p=null;try{p=localStorage.getItem(K)}catch(_){}var l=((navigator.languages&&navigator.languages[0])||navigator.language||"").toLowerCase();if((p||(l.indexOf("ar")===0?"ar":"en"))!=="ar")return;var b="${BASE_PATH}",x=location.pathname;if(b&&x.indexOf(b)===0)x=x.slice(b.length);if(/^\\/(ar|app)(\\/|$)/.test(x))return;location.replace(b+"/ar"+x+location.search+location.hash)}catch(e){}})();`;

/** Where the app keeps its language on the device (src/portal/i18n.ts). */
export const APP_LANG_KEY = "bx-app-lang";

/**
 * The app in English, before anything draws: the page turns left-to-right, dates and numbers are
 * written in English (any Arabic locale the code asks for becomes en-GB), and the page stays hidden
 * until the texts are swapped (at most 3 seconds).
 */
export const APP_LANG = `(function(){try{if(localStorage.getItem("${APP_LANG_KEY}")!=="en")return;var d=document.documentElement;d.lang="en";d.dir="ltr";d.classList.add("bx-en-pending");setTimeout(function(){d.classList.remove("bx-en-pending")},3000);var fix=function(l){return Array.isArray(l)?l.map(fix):(l==null||/^ar/i.test(String(l)))?"en-GB":l};["DateTimeFormat","NumberFormat","RelativeTimeFormat","ListFormat","PluralRules"].forEach(function(n){var C=Intl[n];if(!C)return;var W=function(l,o){return new C(fix(l),o)};W.prototype=C.prototype;W.supportedLocalesOf=C.supportedLocalesOf;Intl[n]=W});[[Date.prototype,"toLocaleString"],[Date.prototype,"toLocaleDateString"],[Date.prototype,"toLocaleTimeString"],[Number.prototype,"toLocaleString"]].forEach(function(p){var f=p[0][p[1]];p[0][p[1]]=function(l,o){return f.call(this,fix(l),o)}})}catch(e){}})();`;
