"use client";
import { useState } from "react";
import { Icon } from "@/components/brand/icons";
import { mailtoLink } from "@/lib/contact";

/** Shows a one-time secret link once, with copy / WhatsApp / email sharing. */
export function ShareLink({ link, name, email, note }: { link: string; name: string; email?: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const first = name.split(/\s+/)[0];
  const text = `Hi ${first}, here is your BuildX HUE Command Center link to set your password:\n${link}\n\nThe link works once and expires in 7 days.`;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ok/30 bg-ok/[0.06] p-4">
      <p className="text-sm text-[#bdf5dc]">{note}</p>
      <code className="block break-all rounded-lg border border-[var(--line)] bg-void/70 p-3 font-mono text-xs text-mist" dir="ltr">
        {link}
      </code>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(link);
            setCopied(true);
          }}
        >
          <Icon name="check" size={14} />
          <span>{copied ? "Copied" : "Copy link"}</span>
        </button>
        <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={14} />
          <span>Send on WhatsApp</span>
        </a>
        {email && (
          <a className="btn btn-sm" href={mailtoLink(email, "Your BuildX HUE Command Center access", text)}>
            <Icon name="mail" size={14} />
            <span>Email</span>
          </a>
        )}
      </div>
      <p className="text-xs text-fog">This link is shown only now. If it gets lost, generate a new one from the account row.</p>
    </div>
  );
}
