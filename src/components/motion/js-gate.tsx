"use client";
import { useEffect } from "react";

/**
 * Scroll-reveal content is hidden only under html.js. This inline script adds the class before first
 * paint and takes it away again if the app hasn't started within six seconds (blocked or failed
 * scripts, very old browsers) — the page then simply shows everything without animation.
 */
export const JS_GATE = `(function(){var d=document.documentElement;d.classList.add("js");setTimeout(function(){if(!d.hasAttribute("data-hydrated"))d.classList.remove("js")},6000)})();`;

/** Marks the page as running (rendered once in the layout). */
export function Hydrated() {
  useEffect(() => {
    document.documentElement.setAttribute("data-hydrated", "");
  }, []);
  return null;
}
