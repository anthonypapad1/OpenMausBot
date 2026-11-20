import { describe, expect, it } from "vitest";
import type { DealDeadline, DealToday } from "../../shared/deals";
import { botForDesk, clockTime, dayBlock, deskInitials, deskOf, greetingFor, headlineKey, hourIn, isHomeView, longDate, streetOf, todayCards } from "./today";

const deadline = (id: string, dueDate: string, dueTime: string | null = null): DealDeadline =>
  ({ id, dealId: "d1", label: `Deadline ${id}`, dueDate, dueTime, status: "open", kind: "other", updatedAt: 0 });
const due = (id: string, dueDate: string, overdue: boolean, dueTime: string | null = null): DealToday =>
  ({ type: "deadline", dealId: "d1", address: "1847 Larkspur Ln, Boulder, CO 80304", overdue, deadline: deadline(id, dueDate, dueTime) });
const unsigned = (id: string): DealToday =>
  ({ type: "document", dealId: "d2", address: "622 W Pine St, Fort Collins, CO 80521", document: { id, dealId: "d2", name: "Inspection resolution", status: "needs_signature", required: true, updatedAt: 0 } });

describe("the greeting", () => {
  it("says good morning from 5 to noon, good afternoon until 5 pm and good evening through the night", () => {
    expect([4, 5, 11, 12, 16, 17, 23, 0].map(greetingFor)).toEqual([
      "today.greeting.evening", "today.greeting.morning", "today.greeting.morning", "today.greeting.afternoon",
      "today.greeting.afternoon", "today.greeting.evening", "today.greeting.evening", "today.greeting.evening",
    ]);
  });

  it("reads the hour in the deal list's time zone, and on this computer's clock for a zone it doesn't know", () => {
    const at = Date.UTC(2026, 10, 20, 15, 30);
    expect(hourIn("America/Denver", at)).toBe(8);
    expect(hourIn("UTC", Date.UTC(2026, 10, 20, 0, 5))).toBe(0);
    expect(hourIn("Mars/Olympus", at)).toBe(new Date(at).getHours());
  });

  it("counts what needs the person, with a calm line when nothing does", () => {
    expect([0, 1, 2, 12].map(headlineKey)).toEqual(["today.headline.none", "today.headline.one", "today.headline.other", "today.headline.other"]);
  });
});

describe("the Needs you cards", () => {
  it("puts overdue deadlines first, oldest first, then today's, then documents to sign, whatever order they arrive in", () => {
    const cards = todayCards({ needsYou: [unsigned("doc"), due("today-late", "2026-11-20", false, "17:00"), due("old", "2026-11-17", true), due("today-early", "2026-11-20", false, "09:00"), due("yesterday", "2026-11-19", true)] }, "en-US");
    expect(cards.map((card) => card.key)).toEqual(["deadline:old", "deadline:yesterday", "deadline:today-early", "deadline:today-late", "document:doc"]);
  });

  it("marks deadlines urgent for Deal Desk, and documents waiting on a signature for Compliance Desk", () => {
    const [overdue, today, document] = todayCards({ needsYou: [due("a", "2026-11-19", true, "17:00"), due("b", "2026-11-20", false), unsigned("c")] }, "en-US");
    expect(overdue).toMatchObject({ desk: "Deal Desk", urgent: true, tag: { key: "today.card.overdue", when: "Thu, Nov 19, 5:00 PM" } });
    expect(today).toMatchObject({ desk: "Deal Desk", urgent: true, tag: { key: "today.card.dueToday" } });
    expect(document).toMatchObject({ desk: "Compliance Desk", urgent: false, title: "Inspection resolution", address: "622 W Pine St, Fort Collins, CO 80521", tag: { key: "today.card.needsSignature" } });
  });

  it("says the time a deadline due today is due, when it has one", () => {
    expect(todayCards({ needsYou: [due("a", "2026-11-20", false, "17:00")] }, "en-US")[0]!.tag).toEqual({ key: "today.card.dueTodayAt", when: "5:00 PM" });
  });
});

describe("the desks", () => {
  it("takes initials from the bot's name", () => {
    expect(["Deal Desk", "Listing Desk", "Inbox Desk", "Compliance Desk", "Scout", "  ", "écrivain public"].map(deskInitials)).toEqual(["DD", "LD", "ID", "CD", "SC", "?", "ÉP"]);
  });

  it("knows the four desks by name, in any case", () => {
    expect(deskOf("deal desk")).toBe("Deal Desk");
    expect(deskOf("Transaction coordinator")).toBeNull();
  });

  it("finds the bot to open by its name, never a hidden one", () => {
    const bots = [{ name: "Deal Desk", hidden: true, id: "old" }, { name: " deal desk ", id: "new" }, { name: "Inbox Desk", id: "inbox" }];
    expect(botForDesk(bots, "Deal Desk")?.id).toBe("new");
    expect(botForDesk(bots, "Compliance Desk")).toBeUndefined();
  });
});

describe("dates", () => {
  it("shows a deal's calendar day as that day wherever this computer is", () => {
    expect(longDate("2026-11-20", "en-US")).toBe("Friday, November 20");
    expect(dayBlock("2026-11-23", "en-US")).toEqual({ weekday: "Mon", date: "23" });
    expect(clockTime("14:00", "en-US")).toBe("2:00 PM");
    expect(clockTime("14:00", "en-GB")).toBe("14:00");
  });

  it("shortens an address to its street", () => {
    expect(streetOf("1847 Larkspur Ln, Boulder, CO 80304")).toBe("1847 Larkspur Ln");
    expect(streetOf("Lot 4")).toBe("Lot 4");
  });
});

it("opens first-run screens over Today as over a chat, and nowhere else", () => {
  expect(["today", "chat", "routines", "files"].map(isHomeView)).toEqual([true, true, false, false]);
});
