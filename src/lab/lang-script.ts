/** Key for the Lab's language (ar / en); falls back to the BuildX App's choice, then the browser's. */
export const LAB_LANG_KEY = "bx-lab-lang";

/** Sets <html lang/dir> before the first paint so the layout never flips after loading. */
export const LAB_LANG = `(function(){try{var l=localStorage.getItem("${LAB_LANG_KEY}")||localStorage.getItem("bx-app-lang")||((navigator.language||"").toLowerCase().indexOf("ar")===0?"ar":"en");if(l!=="en")l="ar";var d=document.documentElement;d.lang=l;d.dir=l==="en"?"ltr":"rtl";}catch(e){}})();`;
