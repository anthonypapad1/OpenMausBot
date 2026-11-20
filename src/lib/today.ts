import type { DealActivityItem, DealComingUp, DealToday, DealTodayView } from "../../shared/deals";
import type { LocaleKey } from "@/locales";

export const DESKS = ["Deal Desk", "Listing Desk", "Inbox Desk", "Compliance Desk"] as const;
export type Desk = (typeof DESKS)[number];

export type Greeting = "today.greeting.morning" | "today.greeting.afternoon" | "today.greeting.evening";

/** Morning from 5 to noon, afternoon until 5 pm, evening through the night. */
export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return "today.greeting.morning";
  if (hour >= 12 && hour < 17) return "today.greeting.afternoon";
  return "today.greeting.evening";
}

/** The hour (0–23) it is at `now` in `timeZone`, or on this computer's clock when the zone is unknown here. */
export function hourIn(timeZone: string | undefined, now: number): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now);
    return Number(hour) % 24;
  } catch {
    return new Date(now).getHours();
  }
}

export function headlineKey(count: number): LocaleKey {
  return count === 0 ? "today.headline.none" : count === 1 ? "today.headline.one" : "today.headline.other";
}

/** DD for Deal Desk; a name of one word gives its first two letters. */
export function deskInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [...words[0]!].slice(0, 2) : words.slice(0, 2).map((word) => [...word][0]!);
  return letters.join("").toUpperCase();
}

export function deskOf(name: string): Desk | null {
  const wanted = name.trim().toLowerCase();
  return DESKS.find((desk) => desk.toLowerCase() === wanted) ?? null;
}

/** The bot whose name is the desk's, so a card can open its chat. Hidden bots don't answer. */
export function botForDesk<B extends { name: string; hidden?: boolean }>(bots: readonly B[], desk: string): B | undefined {
  const wanted = desk.trim().toLowerCase();
  return bots.find((bot) => !bot.hidden && bot.name.trim().toLowerCase() === wanted);
}

export interface TodayCard {
  key: string;
  dealId: string;
  address: string;
  /** Who looks after it: Deal Desk for a deadline, Compliance Desk for a document waiting on a signature. */
  desk: Desk;
  /** Overdue or due today: drawn on the warning tint, with the one primary button. */
  urgent: boolean;
  title: string;
  tag: { key: LocaleKey; when: string };
}

const isDeadline = (item: DealToday): item is Extract<DealToday, { type: "deadline" }> => item.type === "deadline";

const rank = (item: DealToday) => (item.type === "deadline" ? (item.overdue ? 0 : 1) : 2);

/** Overdue deadlines (oldest first), then today's, then documents to sign: the server's order, kept if it ever drifts. */
export function todayCards(view: Pick<DealTodayView, "needsYou">, locale: string): TodayCard[] {
  const items = view.needsYou.map((item, index) => ({ item, index }));
  items.sort((a, b) => rank(a.item) - rank(b.item) || dueOrder(a.item, b.item) || a.index - b.index);
  return items.map(({ item }) => {
    if (isDeadline(item)) {
      const { deadline } = item;
      const time = deadline.dueTime ? clockTime(deadline.dueTime, locale) : "";
      const tag = item.overdue
        ? { key: "today.card.overdue" as const, when: [shortDate(deadline.dueDate, locale), time].filter(Boolean).join(", ") }
        : time ? { key: "today.card.dueTodayAt" as const, when: time } : { key: "today.card.dueToday" as const, when: "" };
      return { key: `deadline:${deadline.id}`, dealId: item.dealId, address: item.address, desk: "Deal Desk", urgent: true, title: deadline.label, tag };
    }
    return { key: `document:${item.document.id}`, dealId: item.dealId, address: item.address, desk: "Compliance Desk", urgent: false, title: item.document.name, tag: { key: "today.card.needsSignature", when: "" } };
  });
}

function dueOrder(a: DealToday, b: DealToday): number {
  if (!isDeadline(a) || !isDeadline(b)) return 0;
  return a.deadline.dueDate.localeCompare(b.deadline.dueDate) || (a.deadline.dueTime ?? "99").localeCompare(b.deadline.dueTime ?? "99");
}

/** A deal's calendar day, "YYYY-MM-DD", as midnight UTC: formatting it in UTC shows that very day wherever the computer is. */
const dayInstant = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year!, month! - 1, date!);
};

export function longDate(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(dayInstant(day));
}

export function shortDate(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(dayInstant(day));
}

/** The weekday and day number a Coming up row shows in its date block. */
export function dayBlock(day: string, locale: string): { weekday: string; date: string } {
  const at = dayInstant(day);
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(at),
    date: new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(at),
  };
}

/** "17:00" as the person's locale says it: 5:00 PM, 17:00. */
export function clockTime(time: string, locale: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, hours, minutes));
}

export function comingUpTitle(row: DealComingUp, locale: string): string {
  return row.deadline.dueTime ? `${row.deadline.label} · ${clockTime(row.deadline.dueTime, locale)}` : row.deadline.label;
}

/** "1847 Larkspur Ln" of "1847 Larkspur Ln, Boulder, CO 80304": what a row narrower than the whole address shows. */
export const streetOf = (address: string): string => address.split(",")[0]!.trim() || address;

/** A deal's deadlines are Deal Desk's; the activity panel shows whichever bot did the work. */
export const activityBot = (item: DealActivityItem): string => item.activity.botName || item.activity.botId;

/** The views the app opens on: Today, and a bot's chat. First-run screens show over either. */
export const isHomeView = (view: string): boolean => view === "today" || view === "chat";
