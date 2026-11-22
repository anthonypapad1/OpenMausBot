// @vitest-environment happy-dom
// The card above the first bot's message box while notes from another AI are on their way, and as they come: from
// Downloads, a dropped file or a paste it says it is bringing them in, then what came in for a few seconds, and goes.
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ state: {} as Record<string, unknown>, api: vi.fn(), copy: vi.fn() }));
vi.mock("@/state/store", () => ({ useStore: () => ({ state: f.state, dispatch: vi.fn() }), api: f.api }));
vi.mock("@/lib/copy-text", () => ({ copyText: f.copy }));
vi.mock("@/lib/default-bot", async (original) => ({ ...(await original<typeof import("@/lib/default-bot")>()), useViewerEmail: () => null }));

import { setLocale } from "@/lib/i18n";
import { copyNotesPrompt, stopWaiting } from "@/lib/assistant-notes";
import { ARRIVAL_SHOWN_MS, dismissArrival, noteArrival } from "@/lib/notes-arrival";
import { NotesWaitingLine, useNotesIntake } from "./NotesWaiting";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const corso = { id: "corso", name: "Corso", threadId: "corso-thread", defaultBot: {}, messages: [] };
const atlas = { id: "atlas", name: "Atlas", threadId: "atlas-thread", messages: [] };
const NOTES = "---\nformat: corso-notes\nversion: 1\nfrom: ChatGPT\n---\n\n# Memories\n- Likes tea\n\nEND OF CORSO NOTES\n";

let host: HTMLDivElement, root: Root;
let take: ReturnType<typeof useNotesIntake> | null = null;
const card = () => host.querySelector<HTMLElement>("[data-notes-waiting], [data-notes-arrived]");
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
function Harness({ botId }: { botId: string }) {
  const intake = useNotesIntake();
  useEffect(() => { take = intake; }, [intake]);
  return createElement(NotesWaitingLine, { botId });
}
const show = async (botId = "corso") => { await act(async () => root.render(createElement(Harness, { botId }))); };

beforeEach(() => {
  setLocale("en");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  dismissArrival();
  f.state = { bots: [corso, atlas], selectedId: "corso", config: { profile: {} } };
  f.copy.mockResolvedValue("copied");
  f.api.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  stopWaiting();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the notes card above the message box", () => {
  it("while waiting: one short line, Copy the prompt and a close, in the first bot's chat only", async () => {
    await copyNotesPrompt();
    await show();
    expect(card()?.dataset.notesWaiting).toBe("");
    expect(card()?.textContent).toBe("Waiting for your notes. Paste or drop the file here.Copy the prompt");
    expect(card()?.querySelector("[data-notes-stop]")?.getAttribute("aria-label")).toBe("Stop waiting");
    await show("atlas");
    expect(card(), "no waiting card in another bot's chat").toBeNull();
  });

  it("says where the notes came from while they come in, then what came in for a few seconds, then goes", async () => {
    await copyNotesPrompt();
    await show();
    for (const [via, line] of [["downloads", "Got your notes from Downloads. Bringing everything in…"], ["drop", "Got your notes file. Bringing everything in…"], ["paste", "Got your pasted notes. Bringing everything in…"]] as const) {
      await act(async () => noteArrival(via, "corso"));
      expect(card()?.dataset.notesArrived).toBe("working");
      expect(card()?.textContent).toBe(line);
    }
    let finish!: () => void;
    f.api.mockImplementation((path: string, init?: { method?: string }) => (path.endsWith("/memory/file") && init?.method === "PUT"
      ? new Promise((resolve) => { finish = () => resolve({ ok: true }); }) : Promise.resolve({ text: "" })));
    await act(async () => take!(NOTES, undefined, "paste"));
    await settle();
    expect(card()?.textContent).toBe("Got your pasted notes. Bringing everything in…");
    await act(async () => finish());
    await settle();
    expect(card()?.dataset.notesArrived).toBe("done");
    expect(card()?.textContent).toBe("Brought in from ChatGPT: 1 memory.");
    await act(async () => { vi.advanceTimersByTime(ARRIVAL_SHOWN_MS - 1); });
    expect(card()).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(card(), "gone, and the waiting is over").toBeNull();
  });

  it("notes pasted in another bot's chat say so there; memory stays the first bot's", async () => {
    f.api.mockImplementation(async (path: string) => (path.includes("/memory/file?") ? { text: "" } : { ok: true }));
    await show("atlas");
    await act(async () => take!(NOTES, undefined, "paste", "atlas"));
    await settle();
    expect(f.api).toHaveBeenCalledWith("/api/bots/corso/memory/file", expect.objectContaining({ method: "PUT" }));
    expect(card()?.dataset.notesArrived).toBe("done");
  });

  it("the prompt pasted by mistake says what to do, longer", async () => {
    f.state = { ...f.state, selectedId: "atlas" };
    f.api.mockResolvedValue({});
    await show("atlas");
    await act(async () => take!("I'm moving to a new assistant\nfrom: <name of this app, e.g. ChatGPT>\nformat: corso-notes", undefined, "paste", "atlas"));
    expect(card()?.dataset.notesArrived).toBe("failed");
    expect(card()?.textContent).toMatch(/^That's the prompt itself/);
    await act(async () => { vi.advanceTimersByTime(ARRIVAL_SHOWN_MS); });
    expect(card(), "a failure stays long enough to read").not.toBeNull();
    await act(async () => (card()!.querySelector("[data-notes-dismiss]") as HTMLButtonElement).click());
    expect(card()).toBeNull();
  });
});
