/** wa.me link for an Egyptian or international number ("010…", "+20 10…", "0020…"); null when unusable. */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  let d = (phone ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^01\d{9}$/.test(d)) d = `20${d.slice(1)}`;
  d = d.replace(/\D/g, "");
  if (d.length < 8 || d.length > 15) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function mailtoLink(email: string, subject?: string, body?: string): string {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  if (body) q.set("body", body);
  const s = q.toString().replace(/\+/g, "%20");
  return `mailto:${email}${s ? `?${s}` : ""}`;
}
