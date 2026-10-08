"use client";
/**
 * "Rate the app" in the store app, at a good moment (a student scoring 80%+ on a quiz, a coach
 * finishing their third session). The stores show their own sheet and decide whether it appears, so
 * we ask rarely: after the app has been in use for 3 days, at most every 4 months, 3 times in all.
 */
import { registerPlugin } from "@capacitor/core";
import { isNative } from "./core";

const InAppReview = registerPlugin<{ requestReview(): Promise<void> }>("InAppReview");
const KEY = "rh-review";
type Memo = { first: number; asked: number[]; wins: number };

function read(): Memo {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? "null") as Memo | null;
    if (m && typeof m.first === "number") return m;
  } catch {
    /* ignore */
  }
  return { first: Date.now(), asked: [], wins: 0 };
}
function write(m: Memo) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Something went well; after `need` such moments (and the waits above) the store's rating sheet may show. */
export function goodMoment(need = 1) {
  if (!isNative()) return;
  const m = read();
  m.wins++;
  const day = 86_400_000;
  const last = m.asked.at(-1) ?? 0;
  if (m.wins >= need && Date.now() - m.first > 3 * day && Date.now() - last > 120 * day && m.asked.length < 3) {
    m.asked.push(Date.now());
    m.wins = 0;
    InAppReview.requestReview().catch(() => undefined);
  }
  write(m);
}

/** Starts the clock on first launch. */
export function noteLaunch() {
  if (isNative()) write(read());
}
