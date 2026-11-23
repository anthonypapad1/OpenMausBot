// @vitest-environment happy-dom
// The first run, then the chat. The hello, an AI, what this computer's other AI apps hold, Corso's questions, then the
// Chief of Staff over the app; what it saves, where it lands, and what a reload or a replay does.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { introStaged, stageIntro, useChiefStepOpen } from "@/lib/default-bot";
import { setLocale } from "@/lib/i18n";
import { WHATS_NEW_NOTICE } from "@/lib/notices";
import { EMPTY_ONBOARDING, MET_CHIEF_HINT, WELCOME_VERSION } from "@/lib/onboarding";
import { saveWelcomeDraft } from "@/lib/welcome-draft";
import type { InstanceInfo } from "@/state/store";

const f = vi.hoisted(() => ({ state: {} as Record<string, unknown>, dispatch: vi.fn(), api: vi.fn(), landed: vi.fn(), onDone: vi.fn(),
  checks: [] as string[], draft: vi.fn(), desks: vi.fn() }));
vi.mock("@/state/store", () => ({ useStore: () => ({ state: f.state, dispatch: f.dispatch }), api: f.api }));
vi.mock("@/lib/drafts", () => ({ appendComposerDraft: f.draft }));
vi.mock("@/lib/first-run-desks", () => ({ createFirstRunDesks: f.desks }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), setEmailGateDone: vi.fn() }));
vi.mock("@/components/Avatar", () => ({ BotAvatar: () => null, MausAvatar: () => null }));
vi.mock("@/components/mascot-clock", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("@/components/EngineSetup", async (original) => {
  const { createElement: h } = await import("react");
  return { ...(await original<typeof import("@/components/EngineSetup")>()),
    EngineSetup: ({ instance }: { instance: InstanceInfo }) => h("div", { "data-engine-setup": instance.instanceId }) };
});
vi.mock("@/lib/default-bot", async (original) => ({ ...(await original<typeof import("@/lib/default-bot")>()), useViewerEmail: () => null }));
vi.mock("@/lib/mausbot-landing", () => ({ FLIGHT_MS: 700, landInSidebar: (input: { botId: string; commit: () => void }) => { f.landed(input.botId); input.commit(); } }));
const { WelcomeFlow } = await import("./WelcomeFlow");
const { CHIEF_FADE_MS, CHIEF_GUARD_MS } = await import("./ChiefIntro");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const claude = (ready: boolean, aiTest?: InstanceInfo["aiTest"]): InstanceInfo => ({
  instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", install: { docsUrl: "https://example.test" },
  snapshot: { state: ready ? "available" : "unavailable", authenticated: ready }, models: { default: "m", options: [] }, ...(aiTest ? { aiTest } : {}),
});
const freeOpenCode: InstanceInfo = {
  instanceId: "opencodeGo", driverKind: "opencodeGo", displayName: "OpenCode", install: { docsUrl: "https://example.test" },
  snapshot: { state: "available", authenticated: true, freeFallback: true }, models: { default: "opencode/big-pickle", options: [] }, aiTest: "passed",
};
const notInstalledOpenCode = { ...freeOpenCode, snapshot: { state: "unavailable" }, aiTest: undefined,
  install: { docsUrl: "https://example.test", server: { standalone: { version: "1", downloadBytes: 1 } } } } as InstanceInfo;
const signIn = (): InstanceInfo => ({ ...claude(false), snapshot: { state: "available", authenticated: false }, authentication: { method: "paste-code" } } as InstanceInfo);
const maus = { id: "maus", threadId: "t", name: "Corso", title: "", description: "", notifications: true, color: "chrome", unread: false,
  modelSelection: { instanceId: "claude", model: "m" }, messages: [], defaultBot: {}, chiefOfStaff: true };

let host: HTMLDivElement, root: Root;
let chiefStep = false;
function Watch() {
  chiefStep = useChiefStepOpen();
  return null;
}
const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((node) => node.textContent === label);
const press = async (label: string) => { await act(async () => { button(label)!.click(); }); };
const tick = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
const key = async (name: string) => {
  const screen = host.querySelector<HTMLElement>("[data-welcome]")!;
  await act(async () => { screen.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })); });
};
const show = async (extra: Record<string, unknown> = {}) => {
  await act(async () => { root.render([createElement(Watch, { key: "w" }), createElement(WelcomeFlow, { key: "f", onDone: f.onDone, ...extra })]); });
};
/** Corso's three questions, each passed with Continue (or Skip for now) and its 100 ms fade. */
const throughQuestions = async (label = "Continue") => {
  for (let i = 0; i < 3; i++) {
    await press(label);
    await tick(100);
  }
};
/** Get started, the AI step's way on, each with its 100 ms fade. */
const throughHello = async (ai = "Continue") => {
  await press("Get started");
  await tick(100);
  await press(ai);
  await tick(100);
};
/** The hello and the AI, the questions left unanswered, and the Chief dialog's input guard. */
const toChief = async (ai = "Continue") => {
  await throughHello(ai);
  await throughQuestions();
  await tick(CHIEF_GUARD_MS);
};
const title = () => host.querySelector("h1")?.textContent;
const pick = async (label: string) => { await act(async () => { [...host.querySelectorAll("button")].find((node) => node.textContent?.includes(label))!.click(); }); };
const type = async (label: string, value: string) => {
  const input = [...host.querySelectorAll("label")].find((node) => node.textContent?.startsWith(label))!.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const saved = () => f.api.mock.calls.filter(([path, init]) => path === "/api/config" && init?.method === "PUT").map(([, init]) => JSON.parse(init.body));
const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, String(v)), removeItem: (k: string) => void values.delete(k), clear: () => values.clear() };
};

beforeEach(() => {
  vi.useFakeTimers();
  HTMLElement.prototype.animate = vi.fn(() => ({ onfinish: null, oncancel: null, cancel() {} }) as unknown as Animation);
  setLocale("en");
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  f.dispatch.mockReset();
  f.landed.mockReset();
  f.onDone.mockReset();
  f.draft.mockReset();
  f.desks.mockReset();
  f.api.mockReset();
  f.checks = [];
  f.api.mockImplementation(async (path: string, init?: { body?: string }) => {
    if (path.endsWith("/check")) { f.checks.push(path); return { ok: true }; }
    return path === "/api/instances" ? { instances: f.state.instances } : JSON.parse(init?.body ?? "{}");
  });
  f.state = { instances: [claude(true)], config: { onboarding: EMPTY_ONBOARDING, profile: { name: "" } }, bots: [maus], cloudAdd: null };
  stageIntro(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a new install's first run", () => {
  it("with an AI already working: the hello, the AI marked connected, the questions, then Create, and it lands in the Chief's chat", async () => {
    await show();
    expect(title()).toBe("Meet Corso");
    expect(text()).toContain("Your transaction team. Bots that do the real work on your deals.");
    for (const gone of ["Back", "Skip", "Your name", "Set up later"]) expect(text()).not.toContain(gone);

    await press("Get started");
    expect(host.querySelector("[data-welcome]")?.getAttribute("data-welcome"), "the hello fades out first").toBe("welcome");
    await tick(100);
    expect(title()).toBe("Connect an AI");
    expect(host.querySelector('[data-funnel-ai="claude"]')?.hasAttribute("data-connected"), "already signed in here").toBe(true);
    expect(host.querySelector('[data-funnel-ai="claude"]')?.textContent).toContain("Connected");
    await act(async () => {});
    expect(text()).toContain("Connected to Claude");
    expect(host.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress")).toBe("2/5");
    expect(button("Back")).toBeDefined();
    await press("Continue");
    await tick(100);
    expect(title()).toBe("Tell us about your business");
    await throughQuestions();
    expect(host.querySelector("[role=dialog]")?.textContent).toContain("Introducing your Chief of Staff");
    expect(host.querySelector("[data-welcome]")!.className).toContain("ui-scrim");
    expect(chiefStep, "the app behind it is the empty shell").toBe(true);
    expect(button("Choose an existing bot"), "no bots of the person's own yet").toBeUndefined();

    await tick(CHIEF_GUARD_MS);
    await press("Create Chief of Staff");
    expect(f.landed).toHaveBeenCalledWith("maus");
    expect(f.dispatch).toHaveBeenCalledWith({ type: "updateBot", botId: "maus", patch: { welcomed: true } });
    await tick(CHIEF_FADE_MS);
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith("maus");
    expect(introStaged("maus"), "its first messages arrive one at a time").toBe(true);
    await act(async () => {});
    expect(f.draft, "no first job picked").not.toHaveBeenCalled();
    expect(saved(), "no answers, so About me stays as it was").toEqual([{ onboarding: expect.objectContaining({ version: WELCOME_VERSION, hintsSeen: [MET_CHIEF_HINT] }) }]);
  });

  it("counts an AI once it answered one tiny test message, and never before", async () => {
    await show();
    expect(f.checks).toEqual(["/api/instances/claude/check"]);
  });

  it("comes back to the step it was on after a reload there", async () => {
    saveWelcomeDraft({ beat: "chief" });
    await show();
    expect(text()).toContain("Introducing your Chief of Staff");
  });
});

describe("Corso's questions", () => {
  it("saves the answers into About me, keeps what was there, and leaves the first job in the Chief's message box", async () => {
    f.state = { ...f.state, config: { onboarding: EMPTY_ONBOARDING, profile: { name: "", aboutMe: "I have two kids." } } };
    await show();
    await throughHello();
    await type("Brokerage", "Kentwood");
    await type("Where you work", "Denver");
    await pick("6-15");
    await press("Continue");
    await tick(100);
    expect(title()).toBe("How should your team talk?");
    await pick("Straight to the point");
    await press("Continue");
    await tick(100);
    await pick("Chase the signatures");
    await press("Continue");
    await act(async () => {});
    expect(saved()[0]).toEqual({ profile: { aboutMe: "I have two kids.\nBrokerage: Kentwood\nMarket: Denver\nDeals open at a time: 6-15\nHow to talk to me: short and to the point, facts first" } });
    await tick(100);
    await tick(CHIEF_GUARD_MS);
    await press("Create Chief of Staff");
    await tick(CHIEF_FADE_MS);
    expect(f.draft).toHaveBeenCalledExactlyOnceWith("bot:maus:t", "Chase the signatures I'm still waiting on");
  });

  it("still asks where a bring step filled About me, and the answers replace what it brought", async () => {
    const brought = "- 2026-11-14 · learned by ChatGPT · Brokerage: Summit Realty\n- 2026-11-14 · learned by ChatGPT · Work: Team lead";
    f.state = { ...f.state, config: { onboarding: EMPTY_ONBOARDING, profile: { name: "", aboutMe: brought } } };
    await show();
    await throughHello();
    expect(title()).toBe("Tell us about your business");
    await type("Brokerage", "Kentwood");
    await throughQuestions();
    await act(async () => {});
    expect(saved()[0]).toEqual({ profile: { aboutMe: "- 2026-11-14 · learned by ChatGPT · Work: Team lead\nBrokerage: Kentwood" } });
  });

  it("goes back a step, and Skip for now leaves that step's answers out", async () => {
    await show();
    await throughHello();
    expect(host.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress"), "the questions are steps of the same run").toBe("3/5");
    await type("Brokerage", "Kentwood");
    await press("Skip for now");
    await tick(100);
    expect(title()).toBe("How should your team talk?");
    await press("Back");
    await tick(100);
    expect(title()).toBe("Tell us about your business");
    expect(host.querySelector("input")!.value, "skipped, so the typed brokerage is gone").toBe("");
    await press("Back");
    await tick(100);
    expect(title(), "and back again to the AI").toBe("Connect an AI");
    await press("Continue");
    await tick(100);
    await throughQuestions("Skip for now");
    await act(async () => {});
    expect(saved().filter((body) => "profile" in body), "nothing answered, nothing saved").toEqual([]);
  });
});

describe("the kind of work the person does", () => {
  const meetChief = async () => {
    await tick(100);
    await tick(CHIEF_GUARD_MS);
    await press("Create Chief of Staff");
    await tick(CHIEF_FADE_MS);
  };
  const made = () => (f.desks.mock.calls[0]?.[0] as Array<{ name: string; notes?: Record<string, string> }> | undefined);

  it("asks a commercial broker their own questions, offers their first jobs, and makes their Desks once the Chief is in", async () => {
    await show();
    await throughHello();
    expect(text()).toContain("What kind of work do you do?");
    await pick("Commercial real estate");
    expect(title()).toBe("Tell us about your deals");
    expect([...host.querySelectorAll("label")].map((node) => node.textContent), "no brokerage field").not.toContain("Brokerage");
    await type("Where you work", "Denver");
    await type("Property types", "industrial");
    await pick("Leasing");
    await press("Continue");
    await tick(100);
    await press("Continue");
    await tick(100);
    expect(text()).not.toContain("Chase the signatures");
    await pick("Pull the critical dates");
    await press("Continue");
    await act(async () => {});
    expect(saved()[0]).toEqual({ profile: { aboutMe: "What I do: commercial real estate\nMarket: Denver\nProperty types: industrial\nSales or leasing: leasing" } });
    expect(f.desks, "not before the Chief").not.toHaveBeenCalled();
    await meetChief();
    expect(f.draft).toHaveBeenCalledExactlyOnceWith("bot:maus:t", "Pull the critical dates out of a lease I send you");
    expect(made()!.map((desk) => desk.name)).toEqual(["Deal Desk", "Lease Desk", "Marketing Desk", "Inbox Desk"]);
  });

  it("keeps a residential agent's run as it was: the same questions and lines, and no Desks made", async () => {
    await show();
    await throughHello();
    await pick("Residential agent");
    expect(title()).toBe("Tell us about your business");
    await type("Brokerage", "Kentwood");
    await pick("6-15");
    await throughQuestions();
    await act(async () => {});
    expect(saved()[0]).toEqual({ profile: { aboutMe: "Brokerage: Kentwood\nDeals open at a time: 6-15" } });
    await tick(CHIEF_GUARD_MS);
    await press("Create Chief of Staff");
    await tick(CHIEF_FADE_MS);
    expect(f.desks).not.toHaveBeenCalled();
  });

  it("seeds a brokerage's Office Compliance Desk with the checklist they paste", async () => {
    await show();
    await throughHello();
    await pick("Brokerage");
    expect(title()).toBe("Tell us about your brokerage");
    const area = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, "- Listing agreement");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await pick("Maybe later");
    await throughQuestions();
    await act(async () => {});
    expect(saved()[0]).toEqual({ profile: { aboutMe: "What I do: I run a brokerage (broker, managing broker or compliance)\nPlans to offer Corso to our agents: maybe later" } });
    await tick(CHIEF_GUARD_MS);
    await press("Create Chief of Staff");
    await tick(CHIEF_FADE_MS);
    expect(made()!.map((desk) => desk.name)).toEqual(["Office Compliance Desk", "Inbox Desk", "Deal Desk", "Listing Desk", "Marketing Desk"]);
    expect(made()![0]!.notes!["memory/required-docs.md"]).toContain("- Listing agreement");
  });

  it("drops a first job from another path, and Skip for now drops the path", async () => {
    await show();
    await throughHello();
    await pick("Buying or selling my own home");
    expect(title()).toBe("Tell us about your move");
    await press("Continue");
    await tick(100);
    await press("Continue");
    await tick(100);
    await pick("Explain my contract");
    await press("Back");
    await tick(100);
    await press("Back");
    await tick(100);
    await pick("Property management");
    await press("Skip for now");
    await tick(100);
    await press("Continue");
    await tick(100);
    expect(text(), "skipped, so the residential jobs").toContain("Chase the signatures");
    await press("Continue");
    await meetChief();
    expect(f.draft, "the consumer's job went with its path").not.toHaveBeenCalled();
    expect(f.desks).not.toHaveBeenCalled();
  });
});

describe("the Chief step", () => {
  const finishesAfterQuestions = async () => {
    await show();
    await throughHello();
    await throughQuestions();
    expect(text()).not.toContain("Introducing your Chief of Staff");
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith(null);
    expect(chiefStep).toBe(false);
  };

  it("is skipped once Corso has met the person", async () => {
    f.state = { ...f.state, bots: [{ ...maus, welcomed: true }] };
    await finishesAfterQuestions();
  });

  it("is skipped where another bot is already the Chief", async () => {
    f.state = { ...f.state, bots: [{ ...maus, chiefOfStaff: false }, { ...maus, id: "research", threadId: "r", name: "Research", defaultBot: undefined, chiefOfStaff: true }] };
    await finishesAfterQuestions();
  });

  it("is skipped where there is no Corso", async () => {
    f.state = { ...f.state, bots: [] };
    await finishesAfterQuestions();
  });
});

describe("What's new", () => {
  it("is left for a later launch by a first run on a desktop that sells the Cloud: everyone who installs sees it once", async () => {
    const seen = vi.fn(async () => {});
    vi.stubGlobal("ogb", { remoteClient: { active: false }, cloudAccount: { offer: vi.fn() }, desktopNotices: { seen } });
    await show();
    await throughHello();
    expect(title(), "this computer's own app brings in what its AI apps hold").toBe("Bring what you already use");
    await press("Continue");
    await tick(100);
    await throughQuestions();
    await tick(CHIEF_GUARD_MS);
    await press("Create Chief of Staff");
    await tick(CHIEF_FADE_MS);
    await act(async () => {});
    expect(seen).not.toHaveBeenCalled();
    expect(saved()[0].onboarding.hintsSeen).toEqual([MET_CHIEF_HINT]);
    expect(localStorage.getItem(WHATS_NEW_NOTICE)).toBeNull();
  });
});

describe("connecting an AI", () => {
  const toAi = async () => {
    await show();
    await press("Get started");
    await tick(100);
  };

  it("with none working: the grid, Continue held until one connects, and Set up later past it", async () => {
    f.state = { ...f.state, instances: [signIn()] };
    await toAi();
    expect(title()).toBe("Connect an AI");
    expect(button("Continue")!.disabled).toBe(true);
    expect(host.querySelector('[data-funnel-ai="claude"]')?.hasAttribute("data-connected")).toBe(false);
    expect(button("More providers or use an API key")).toBeDefined();
    await pick("Claude");
    expect(button("Sign in with Claude"), "the pressed card's own sign-in, under the grid").toBeDefined();
    expect(host.querySelector("[data-engine-setup]")).toBeNull();
    await press("Set up later");
    await tick(100);
    await throughQuestions();
    await tick(CHIEF_GUARD_MS);
    expect(text()).toContain("Introducing your Chief of Staff");
  });

  it("shows only the AIs this server can connect, by what people call them", async () => {
    const plan = { instanceId: "chatgpt", driverKind: "codex", displayName: "ChatGPT plan", install: { docsUrl: "https://example.test" },
      snapshot: { state: "available", authenticated: false }, authentication: { method: "browser-pkce" }, models: { default: "m", options: [] } } as InstanceInfo;
    f.state = { ...f.state, instances: [signIn(), plan, notInstalledOpenCode] };
    await toAi();
    expect([...host.querySelectorAll("[data-funnel-ai]")].map((node) => node.textContent)).toEqual(["Claude", "ChatGPT"]);
    await pick("ChatGPT");
    expect(button("Sign in with ChatGPT")).toBeDefined();
  });

  it("offers the free model to start with where one is ready, never counting it as the person's own AI", async () => {
    f.state = { ...f.state, instances: [freeOpenCode, claude(false)] };
    await toAi();
    expect(button("Continue")!.disabled).toBe(true);
    expect(button("Start with the free model")).toBeDefined();
    expect(f.checks).toEqual([]);
  });

  it("opens every other way in the Connect an AI dialog, where the free model is only a backup", async () => {
    f.state = { ...f.state, instances: [freeOpenCode, claude(false)] };
    await toAi();
    await press("More providers or use an API key");
    const dialog = host.querySelector("[data-connect-ai]")!;
    expect(dialog.textContent).toContain("OpenCode's free model is ready as a backup");
    expect(dialog.querySelector('[data-engine-setup="claude"]')).not.toBeNull();
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(host.querySelector("[data-connect-ai]")).toBeNull();
    expect(title(), "Escape closed the dialog only").toBe("Connect an AI");
  });

  it("says why an AI didn't answer its test, with Check again", async () => {
    f.state = { ...f.state, instances: [freeOpenCode, claude(true, "failed")] };
    await toAi();
    expect(host.querySelector("[data-ai-silent]")?.textContent).toContain("Claude");
    expect(button("Check again")).toBeDefined();
  });

  it("turns Continue on once the AI connects, with the confirmation under the grid", async () => {
    f.state = { ...f.state, instances: [claude(false)] };
    await toAi();
    expect(button("Continue")!.disabled).toBe(true);
    f.state = { ...f.state, instances: [claude(true)] };
    await show();
    await act(async () => {});
    expect(text()).toContain("Connected to Claude");
    expect(button("Continue")!.disabled).toBe(false);
    expect(button("Set up later")).toBeUndefined();
  });

  it("moves on with Escape, past an AI still to connect", async () => {
    f.state = { ...f.state, instances: [claude(false)] };
    await toAi();
    await key("Escape");
    await tick(100);
    expect(title()).toBe("Tell us about your business");
  });
});

describe("bringing in what this computer's AI apps hold", () => {
  const detection = {
    skills: [{ name: "pdf", source: "codex" }], tools: [],
    memory: [{ source: "claudeCode", files: 4, notes: 18, topics: { preferences: true, aboutYou: true, workStyle: false, projects: 0 } }],
    usage: { claudeCode: 21 }, activity: { claudeCode: Date.now() },
  };
  beforeEach(() => {
    vi.stubGlobal("ogb", { remoteClient: { active: false } });
    f.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.endsWith("/check")) { f.checks.push(path); return { ok: true }; }
      if (path === "/api/setup-import" && !init?.method) return detection;
      if (path === "/api/setup-import") return { memory: { added: 18, sources: ["claudeCode"], failed: false } };
      return path === "/api/instances" ? { instances: f.state.instances } : JSON.parse(init?.body ?? "{}");
    });
  });

  it("leads with the app the person really uses, and brings its memory into Corso with one press while the run goes on", async () => {
    await show();
    await throughHello();
    expect(title()).toBe("Bring what you already use");
    expect(host.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress")).toBe("3/6");
    const hero = host.querySelector("[data-bring-hero]")!;
    expect(hero.textContent).toContain("Claude Code already knows you");
    expect(hero.textContent).toContain("You've used it on 21 of the last 30 days.");
    expect(host.querySelector("[data-bring-prompt]")?.textContent, "and the prompt for AIs online below it").toContain("Copy the prompt");
    await act(async () => { hero.querySelector<HTMLButtonElement>("[data-bring-import]")!.click(); });
    const sent = f.api.mock.calls.find(([path, init]) => path === "/api/setup-import" && init?.method === "POST")!;
    expect(JSON.parse(sent[1].body)).toEqual({ skills: true, tools: true, sources: ["claudeCode"], memory: true, memoryBot: "maus" });
    await act(async () => {});
    expect(host.querySelector("[data-bring-said]")?.textContent).toBe("Done. Your bots now know 18 things about you.");
    await press("Continue");
    await tick(100);
    expect(title()).toBe("Tell us about your business");
    expect(host.querySelector("[data-bring-status]")?.textContent, "the line stays at the foot of the later steps").toBe("Your bots now know 18 things about you.");
  });

  it("takes notes from another AI pasted on any step", async () => {
    await show();
    await throughHello();
    await press("Continue");
    await tick(100);
    const notes = "---\nformat: corso-notes\nversion: 1\nfrom: ChatGPT\n---\n\n# Memories\n- Likes tea\n\nEND OF CORSO NOTES\n";
    const paste = new Event("paste", { bubbles: true }) as Event & { clipboardData: { getData: () => string } };
    paste.clipboardData = { getData: () => notes };
    await act(async () => { host.querySelector("[data-welcome]")!.dispatchEvent(paste); });
    await act(async () => {});
    expect(host.querySelector("[data-bring-status]")?.textContent).toBe("Brought in from ChatGPT: 1 memory.");
  });
});

describe("this Mac's permissions", () => {
  const mac = (accessibility: string, screen: string) => ({
    platform: "darwin",
    macPermissions: { status: vi.fn(async () => ({ supported: true, accessibility, screen })), request: vi.fn(async () => ({ supported: true, accessibility: "granted", screen })) },
  });

  it("come last before the Chief while one a bot needs is off, each one press away", async () => {
    const ogb = mac("missing", "granted");
    vi.stubGlobal("ogb", ogb);
    await show();
    await act(async () => {});
    await throughHello();
    await throughQuestions();
    expect(title()).toBe("Let your bots use this Mac");
    expect(host.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress")).toBe("6/6");
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-permission-ask="accessibility"]')!.click(); });
    expect(ogb.macPermissions.request).toHaveBeenCalledWith("accessibility");
    await press("Continue");
    await tick(100);
    await tick(CHIEF_GUARD_MS);
    expect(text()).toContain("Introducing your Chief of Staff");
  });

  it("are left out once everything is on", async () => {
    vi.stubGlobal("ogb", mac("granted", "granted"));
    await show();
    await act(async () => {});
    await throughHello();
    await throughQuestions();
    await tick(CHIEF_GUARD_MS);
    expect(text()).toContain("Introducing your Chief of Staff");
  });
});

describe("other first runs", () => {
  it("gives a hosted place's admin the hello and its AI only, then the chat", async () => {
    await show({ hosted: true });
    await press("Get started");
    await tick(100);
    expect(text()).toContain("This is your team's shared Corso");
    await press("Continue");
    await tick(100);
    expect(text()).not.toContain("Introducing your Chief of Staff");
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("a replay from Settings records nothing about a first chat", async () => {
    f.state = { ...f.state, config: { onboarding: { ...EMPTY_ONBOARDING, completedAt: "2026-09-01T00:00:00.000Z", version: WELCOME_VERSION } } };
    await show({ replay: true });
    await toChief();
    await press("Create Chief of Staff");
    await tick(CHIEF_FADE_MS);
    await act(async () => {});
    expect(saved()[0].onboarding).not.toHaveProperty("hintsSeen");
    expect(introStaged("maus"), "a replay lands in a chat that may be long under way").toBe(false);
  });
});
