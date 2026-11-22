// The macOS permissions a bot needs to use this Mac like a person (Accessibility to click and type, Screen Recording to
// see), as the first run's permissions step reads and asks for them through the desktop app.
export type MacPermission = "accessibility" | "screen";

/** "asked": macOS showed its own prompt already, so only System Settings can grant it now. */
export type MacPermissionState = "granted" | "asked" | "missing";

export type MacPermissionStatus =
  | { supported: false }
  | { supported: true; accessibility: MacPermissionState; screen: MacPermissionState };

export interface MacPermissionsBridge {
  status(): Promise<MacPermissionStatus>;
  /** Asks for one: macOS's prompt the first time, its System Settings pane after that. */
  request(kind: MacPermission): Promise<MacPermissionStatus>;
}

export const MAC_PERMISSIONS: readonly MacPermission[] = ["accessibility", "screen"];

/** This computer's own desktop app on macOS, where bots can use the Mac. */
export function macPermissionsBridge(): MacPermissionsBridge | null {
  const desktop = typeof window === "undefined" ? undefined : window.ogb;
  if (!desktop || desktop.platform !== "darwin" || desktop.remoteClient?.active === true) return null;
  return desktop.macPermissions ?? null;
}

/** System Settings at this permission's own list. */
export async function openMacPermissionPane(kind: MacPermission): Promise<void> {
  await window.ogb?.permOpenSettings(kind).catch(() => {});
}

export function permissionsMissing(status: MacPermissionStatus | null): boolean {
  if (!status?.supported) return false;
  return MAC_PERMISSIONS.some((kind) => status[kind] !== "granted");
}

/** Screen Recording granted in System Settings only takes effect once the app reopens (macOS 15+ caches it per process). */
export function screenNeedsReopen(status: MacPermissionStatus | null): boolean {
  return status?.supported === true && status.screen === "asked";
}
