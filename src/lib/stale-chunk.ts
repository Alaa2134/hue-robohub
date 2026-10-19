/**
 * A page opened before a new deploy asks for script files that the deploy replaced (ChunkLoadError),
 * and breaks. Reloading once brings the new page; a second failure within a minute is a real error.
 */
const STALE =
  /ChunkLoadError|Loading chunk \S+ failed|Failed to load chunk|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i;
const KEY = "bx-stale-reload";

/** True when the page is reloading for the new files (so the error is not worth reporting). */
export function reloadIfStale(message: string): boolean {
  if (!STALE.test(message)) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}
