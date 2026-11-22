import { expect, it } from "vitest";
import { initialState, reducer } from "./store";

it("opens on Today, and Today closes the side panels as the other pages do", () => {
  expect(initialState.activeView).toBe("today");
  const busy = { ...initialState, activeView: "chat" as const, settingsOpen: true, computerOpen: true, activityOpen: true };
  expect(reducer(busy, { type: "showToday" })).toMatchObject({ activeView: "today", settingsOpen: false, computerOpen: false, activityOpen: false });
});
