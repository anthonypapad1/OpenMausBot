// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { MacPermissionStatus, MacPermissionsBridge } from "@/lib/mac-permissions";
import { macPermissionsBridge, permissionsMissing, screenNeedsReopen } from "@/lib/mac-permissions";

const { PermissionsStep } = await import("./PermissionsStep");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openSettings = vi.fn(async () => undefined);
const onNext = vi.fn();
let root: ReturnType<typeof createRoot> | null = null;
const show = async (bridge: MacPermissionsBridge, relaunch: (() => void) | null = null) => {
  document.body.innerHTML = "";
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => { root!.render(createElement(PermissionsStep, { bridge, onNext, relaunch })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};
const button = (kind: string) => document.querySelector<HTMLButtonElement>(`[data-permission-ask="${kind}"]`);
const state = (kind: string) => document.querySelector(`[data-permission="${kind}"]`)!.getAttribute("data-permission-state");
const status = (accessibility: string, screen: string) => ({ supported: true, accessibility, screen }) as MacPermissionStatus;

beforeEach(() => {
  setLocale("en");
  openSettings.mockClear();
  onNext.mockClear();
  (window as unknown as { ogb: unknown }).ogb = { platform: "darwin", remoteClient: { active: false }, permOpenSettings: openSettings };
});
afterEach(async () => { await act(async () => root?.unmount()); root = null; });

describe("the permissions step", () => {
  it("asks for one permission at a time, says where each stands, and goes on with how many are on", async () => {
    let now = status("missing", "missing");
    const bridge = {
      status: vi.fn(async () => now),
      request: vi.fn(async (kind: string) => { now = kind === "accessibility" ? status("granted", now.supported ? now.screen : "missing") : status("granted", "asked"); return now; }),
    };
    await show(bridge);
    expect(document.querySelector("h1")?.textContent).toBe("Let your bots use this Mac");
    expect(state("accessibility")).toBe("missing");
    await act(async () => button("accessibility")!.click());
    expect(bridge.request).toHaveBeenCalledWith("accessibility");
    expect(state("accessibility")).toBe("granted");
    expect(button("accessibility"), "a granted one can't be asked again").toBeNull();
    await act(async () => button("screen")!.click());
    expect(state("screen")).toBe("asked");
    expect(button("screen")?.textContent, "macOS asked once; now only System Settings can grant it").toBe("Open settings");
    expect(document.querySelector("[data-permissions-reopen]")?.textContent).toContain("Reopen Corso to finish");
    await act(async () => document.querySelector<HTMLButtonElement>("[data-funnel-permissions-continue]")!.click());
    expect(onNext).toHaveBeenCalledWith("continue", 1);
  });

  it("stays pressable when the app cannot read the grants, and opens the permission's own pane", async () => {
    const failing = { status: vi.fn(() => Promise.reject(new Error("No handler registered"))), request: vi.fn(() => Promise.reject(new Error("No handler registered"))) };
    await show(failing);
    expect(button("accessibility")!.disabled).toBe(false);
    await act(async () => button("screen")!.click());
    expect(openSettings).toHaveBeenCalledWith("screen");
    await act(async () => document.querySelector<HTMLButtonElement>("[data-funnel-permissions-later]")!.click());
    expect(onNext).toHaveBeenCalledWith("later", 0);
  });
});

describe("this Mac's permissions bridge", () => {
  it("is only this computer's own app on macOS", () => {
    const bridge = { status: vi.fn(), request: vi.fn() };
    (window as unknown as { ogb: unknown }).ogb = { platform: "darwin", remoteClient: { active: false }, macPermissions: bridge };
    expect(macPermissionsBridge()).toBe(bridge);
    (window as unknown as { ogb: unknown }).ogb = { platform: "darwin", remoteClient: { active: true }, macPermissions: bridge };
    expect(macPermissionsBridge(), "another computer's page").toBeNull();
    (window as unknown as { ogb: unknown }).ogb = { platform: "win32", macPermissions: bridge };
    expect(macPermissionsBridge()).toBeNull();
  });

  it("says what is missing and when the app must reopen", () => {
    expect(permissionsMissing(status("granted", "granted"))).toBe(false);
    expect(permissionsMissing(status("granted", "asked"))).toBe(true);
    expect(permissionsMissing({ supported: false })).toBe(false);
    expect(screenNeedsReopen(status("granted", "asked"))).toBe(true);
    expect(screenNeedsReopen(status("granted", "missing"))).toBe(false);
  });
});
