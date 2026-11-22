import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { designFileName, freePath, localDate, slug } from "./output.ts";

describe("design file names", () => {
  it("read date, address, template and format", () => {
    expect(designFileName({ date: "2026-11-21", address: "1847 Larkspur Ln, Boulder, CO", template: "just-listed", format: "square", output: "png" }))
      .toBe("2026-11-21-1847-larkspur-ln-boulder-co-just-listed-square.png");
    expect(designFileName({ date: "2026-11-21", template: "listing-flyer", format: "flyer", output: "pdf" })).toBe("2026-11-21-listing-flyer-flyer.pdf");
  });

  it("keep only plain ASCII words, accents folded, and stay short without cutting a word", () => {
    expect(slug("Ünit #4 — Côte Rd / Denver")).toBe("unit-4-cote-rd-denver");
    expect(slug("<script>../../etc</script>")).toBe("script-etc-script");
    const long = slug("12345 Very Long Mountain View Boulevard Northeast Apartment 1234 Colorado Springs");
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long.endsWith("-")).toBe(false);
  });

  it("take the date in the given time zone", () => {
    const lateEvening = new Date("2026-11-22T04:30:00Z");
    expect(localDate(lateEvening, "America/Denver")).toBe("2026-11-21");
    expect(localDate(lateEvening, "UTC")).toBe("2026-11-22");
  });

  it("never replace an earlier render", () => {
    const taken = new Set([join("/w", "a.png"), join("/w", "a-2.png")]);
    expect(freePath("/w", "a.png", (path) => taken.has(path))).toBe(join("/w", "a-3.png"));
    expect(freePath("/w", "b.png", (path) => taken.has(path))).toBe(join("/w", "b.png"));
  });
});
