// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const opened = vi.hoisted(() => ({ props: null as null | { readyBotId?: string; onClose?: () => void; onCreated?: (bot: { id: string }) => void }, dispatch: vi.fn(), state: { config: null, bots: [] } as { config: { botLimit?: number } | null; bots: object[] } }));
vi.mock("./lazy-screens", () => ({
  NewBotDialog: (props: NonNullable<typeof opened.props>) => { opened.props = props; return null; },
}));
vi.mock("@/state/store", () => ({ useStore: () => ({ dispatch: opened.dispatch, state: opened.state }) }));

const { ReadyBotGallery } = await import("./ReadyBotGallery");
const { GALLERY_BOTS } = await import("@/lib/ready-bots");

let root: Root;
let host: HTMLElement;
const onDialog = vi.fn();
const onAdded = vi.fn();

function render(search = "") {
  flushSync(() => root.render(createElement(ReadyBotGallery, { search, onDialog, onAdded })));
}
const cards = () => [...host.querySelectorAll("[data-ready-bot]")].map((card) => card.getAttribute("data-ready-bot"));
const button = (name: string) => [...host.querySelectorAll("button")].find((candidate) =>
  candidate.textContent === name || candidate.getAttribute("aria-label") === name)!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  opened.props = null;
  opened.state = { config: null, bots: [] };
  opened.dispatch.mockReset();
  onDialog.mockClear();
  onAdded.mockClear();
});
afterEach(() => { flushSync(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("ready-made bots gallery", () => {
  it("shows the Desks and the everyday helpers, each with its own Add button", () => {
    render();
    expect(cards()).toEqual(GALLERY_BOTS.map((bot) => bot.id));
    const labels = [...host.querySelectorAll("button[aria-label^='Add ']")].map((add) => add.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(GALLERY_BOTS.length);
    expect(host.textContent).toContain("Try: “Read this contract and set up the deal”");
    expect(host.textContent).toContain("Includes a paused routine");
  });

  it("narrows to a category and back to all", () => {
    render();
    flushSync(() => button("Sales").click());
    expect(cards()).toEqual(["call-coach"]);
    expect(button("Sales").getAttribute("aria-pressed")).toBe("true");
    flushSync(() => button("All").click());
    expect(cards()).toHaveLength(GALLERY_BOTS.length);
  });

  it("leads with Corso's five Desks, which Real estate narrows to", () => {
    render();
    expect(cards().slice(0, 5)).toEqual(["deal-desk", "listing-desk", "inbox-desk", "compliance-desk", "marketing-desk"]);
    flushSync(() => button("Real estate").click());
    expect(cards()).toEqual(["deal-desk", "listing-desk", "inbox-desk", "compliance-desk", "marketing-desk"]);
    expect(host.textContent).toContain("Works with Gmail, Google Calendar, Google Drive");
    expect(button("Add Deal Desk, Contract to close")).toBeDefined();
  });

  it("offers none of the developer or hobby bots OpenMausBot came with, nor their empty categories", () => {
    render();
    for (const gone of ["coder", "community", "plant-care", "travel", "study", "design-critic", "humanizer"]) expect(cards()).not.toContain(gone);
    for (const chip of ["Design", "Personal"]) expect([...host.querySelectorAll("button")].some((one) => one.textContent === chip)).toBe(false);
    render("plant");
    expect(host.querySelector("section")).toBeNull();
  });

  it("follows the Templates search and hides itself when nothing matches", () => {
    render("coach");
    expect(cards()).toEqual(["call-coach"]);
    render("no bot is called this");
    expect(host.querySelector("section")).toBeNull();
  });

  it("opens New bot filled in with the chosen bot, and tells Templates to step aside", () => {
    render();
    flushSync(() => button("Add Coach, Sales call coach").click());
    expect(opened.props?.readyBotId).toBe("call-coach");
    expect(onDialog).toHaveBeenLastCalledWith(true);
    opened.props!.onCreated!({ id: "new-bot" });
    expect(onAdded).toHaveBeenCalledWith({ id: "new-bot" });
    expect(onDialog).toHaveBeenLastCalledWith(false);
  });

  it("on a paired device, which cannot read the host's defaults, makes the bot at once", () => {
    vi.stubGlobal("ogb", { remoteClient: { active: true } });
    render();
    flushSync(() => button("Add Coach, Sales call coach").click());
    expect(opened.props).toBeNull();
    expect(opened.dispatch).toHaveBeenCalledWith({ type: "newBot", onCreated: onAdded });
  });

  it("gives Templates its keys back when New bot is closed without creating", () => {
    render();
    flushSync(() => button("Add Quill, Writer").click());
    flushSync(() => opened.props!.onClose!());
    expect(onDialog).toHaveBeenLastCalledWith(false);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("at Starter's limit opens the upgrade popup instead of a form to fill in", async () => {
    const { botLimitShown, closeBotLimit } = await import("@/lib/bot-limit");
    opened.state = { config: { botLimit: 5 }, bots: Array.from({ length: 5 }, () => ({})) };
    render();
    flushSync(() => button("Add Coach, Sales call coach").click());
    expect(opened.props).toBeNull();
    expect(onDialog).not.toHaveBeenCalled();
    expect(botLimitShown()).toBe(true);
    closeBotLimit();
  });
});
