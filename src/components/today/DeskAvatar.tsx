import type { CSSProperties } from "react";
import { deskInitials, deskOf, type Desk } from "@/lib/today";
import type { Bot } from "@/state/store";
import { BotAvatar } from "../Avatar";

/** Same colours as DESK_COLORS in src/lib/bot-initials.ts (the sidebar and chat avatars): change them together. */
const DESK_COLOR: Record<Desk, string> = {
  "Deal Desk": "var(--identity-blue)",
  "Listing Desk": "var(--identity-cyan)",
  "Inbox Desk": "var(--identity-purple)",
  "Compliance Desk": "var(--identity-orange)",
  "Marketing Desk": "var(--identity-pink)",
};

/** A Desk's initials on a tint of its colour. Any other bot shows its own avatar, or its initials when it isn't here. */
export function DeskAvatar({ name, bot, size }: { name: string; bot?: Bot; size: number }) {
  const desk = deskOf(name);
  if (!desk && bot) return <BotAvatar bot={bot} size={size} label={name} />;
  const color = desk ? DESK_COLOR[desk] : "var(--color-ink-secondary)";
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36), "--desk": color } as CSSProperties;
  return (
    <span role="img" aria-label={name} title={name} data-desk-avatar={deskInitials(name)} style={style}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-[var(--desk)] bg-[color-mix(in_srgb,var(--desk)_16%,transparent)]">
      <span aria-hidden="true">{deskInitials(name)}</span>
    </span>
  );
}
