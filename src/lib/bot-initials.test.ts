import { describe, expect, it } from "vitest";

import { botInitials, botInitialsColor } from "./bot-initials";

describe("a bot's initials", () => {
  it("takes the first letters of the first two words, or a one-word name's first two letters", () => {
    expect(["Deal Desk", "Listing Desk", "Inbox Desk", "Compliance Desk", "Corso", "  ", "écrivain public", "a b c"].map(botInitials))
      .toEqual(["DD", "LD", "ID", "CD", "CO", "?", "ÉP", "AB"]);
    expect(botInitials(undefined)).toBe("?");
  });

  it("gives each Desk its own colour, as the Today page does, and any other bot its own", () => {
    expect(["Deal Desk", "listing desk", " Inbox Desk ", "Compliance Desk"].map((name) => botInitialsColor(name, "red")))
      .toEqual(["green", "blue", "purple", "orange"]);
    expect(botInitialsColor("Scout", "teal")).toBe("teal");
    expect(botInitialsColor("Corso", "chrome")).toBe("green");
  });
});
