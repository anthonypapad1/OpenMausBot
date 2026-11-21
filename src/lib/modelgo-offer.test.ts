import { describe, expect, it } from "vitest";

import { modelgoOfferable } from "./modelgo-offer";

describe("the ModelGo sponsor offer", () => {
  it("is never offered while Corso Cloud isn't, whatever the organization allows", () => {
    expect(modelgoOfferable(null)).toBe(false);
    expect(modelgoOfferable(undefined)).toBe(false);
  });
});
