import type { MausColor } from "@/lib/mascot";

/** Corso's five default bots keep one colour each wherever they appear (the Today page's DeskAvatar uses the same). */
const DESK_COLORS: Record<string, MausColor> = {
  "deal desk": "green",
  "listing desk": "blue",
  "inbox desk": "purple",
  "compliance desk": "orange",
  "marketing desk": "pink",
};

/** Greys too pale to read as text on their own tint. */
const PALE: readonly MausColor[] = ["chrome", "silver"];

/** DD for Deal Desk: the first letters of the first two words; a one-word name gives its first two letters. */
export function botInitials(name: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [...words[0]!].slice(0, 2) : words.slice(0, 2).map((word) => [...word][0]!);
  return letters.join("").toUpperCase();
}

/** A Desk's own colour, else the bot's colour; a pale grey bot reads in green. */
export function botInitialsColor(name: string | undefined, color: MausColor): MausColor {
  const desk = DESK_COLORS[(name ?? "").trim().toLowerCase()];
  if (desk) return desk;
  return PALE.includes(color) ? "green" : color;
}
