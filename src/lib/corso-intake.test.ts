import { describe, expect, it } from "vitest";
import { EMPTY_INTAKE, intakeAnswered, intakeLines, mergeAboutMe } from "./corso-intake";

const full = { brokerage: " Kentwood ", market: "Denver", volume: "6-15" as const, voice: "warm" as const };

describe("corso intake", () => {
  it("writes one labelled line per answer, trimmed", () => {
    expect(intakeLines(full)).toEqual([
      "Brokerage: Kentwood",
      "Market: Denver",
      "Deals open at a time: 6-15",
      "How to talk to me: friendly and reassuring, but still brief",
    ]);
  });

  it("writes nothing for an intake left empty", () => {
    expect(intakeLines(EMPTY_INTAKE)).toEqual([]);
    expect(intakeAnswered(EMPTY_INTAKE)).toBe(false);
    expect(intakeAnswered({ ...EMPTY_INTAKE, market: "Boulder" })).toBe(true);
  });

  it("keeps what the person wrote and adds the answers after it", () => {
    expect(mergeAboutMe("I have two kids.\n\n", { ...EMPTY_INTAKE, market: "Denver" })).toBe("I have two kids.\nMarket: Denver");
    expect(mergeAboutMe("", { ...EMPTY_INTAKE, market: "Denver" })).toBe("Market: Denver");
  });

  it("replaces an answered line and leaves an unanswered one", () => {
    const before = "Brokerage: Old Co\nI work weekends.\nMarket: Denver";
    expect(mergeAboutMe(before, { ...EMPTY_INTAKE, brokerage: "New Co" })).toBe("I work weekends.\nMarket: Denver\nBrokerage: New Co");
  });

  it("replaces what another AI's notes said under the same label, and keeps the rest of what they brought", () => {
    const before = "- 2026-11-14 · learned by ChatGPT · Brokerage: Summit Realty\n- 2026-11-14 · learned by ChatGPT · Market: Boulder County\n- 2026-11-14 · learned by ChatGPT · Work: Team lead";
    expect(mergeAboutMe(before, { ...EMPTY_INTAKE, brokerage: "Kentwood", market: "Denver metro" }))
      .toBe("- 2026-11-14 · learned by ChatGPT · Work: Team lead\nBrokerage: Kentwood\nMarket: Denver metro");
    expect(mergeAboutMe(before, EMPTY_INTAKE), "a skipped question leaves the brought-in line").toBe(before);
  });
});
