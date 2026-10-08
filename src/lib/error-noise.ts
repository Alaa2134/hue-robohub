/**
 * Errors that aren't the site's: browser extensions (crypto wallets inject window.ethereum, other
 * add-ons run their own scripts) and cross-origin "Script error." with no details. They are left
 * out of the error log so real bugs stand out in the dashboard.
 */
export function isNoise(message: string, source?: string): boolean {
  if (/^Script error\.?$/i.test(message.trim())) return true;
  if (/window\.ethereum|ethereum\.|web3|metamask|__firefox__|webkit\.messageHandlers/i.test(message)) return true;
  return /^(chrome|moz|safari|safari-web)-extension:\/\//i.test(source ?? "");
}
