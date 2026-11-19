// The first run's last step on a Mac: the permissions a bot needs to work in this Mac's apps and sites like a person
// (signing in to the real-estate apps that have no API, clicking and typing in them), each one press away, all skippable.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, KeyRound, MonitorPlay, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import {
  MAC_PERMISSIONS, openMacPermissionPane, screenNeedsReopen, type MacPermission, type MacPermissionState, type MacPermissionStatus, type MacPermissionsBridge,
} from "@/lib/mac-permissions";
import { PRIMARY, QUIET, STEP_ICON, StepFrame, StepIcon } from "./FunnelSteps";

/** How often the step reads the grants while it is open: they are made in System Settings, outside this window. */
export const PERMISSIONS_POLL_MS = 1_500;

const ROWS: Record<MacPermission, { icon: ReactNode; name: LocaleKey; why: LocaleKey }> = {
  accessibility: { icon: <MousePointerClick size={20} aria-hidden="true" />, name: "funnel.permissions.accessibility", why: "funnel.permissions.accessibilityWhy" },
  screen: { icon: <MonitorPlay size={20} aria-hidden="true" />, name: "funnel.permissions.screen", why: "funnel.permissions.screenWhy" },
};

/** The permissions a bot needs to use this Mac, each with where it stands and one press to grant it, read again while it
 * shows. `onStatus`: how many are on, as they change. */
export function MacPermissionList({ bridge, relaunch, onStatus }: {
  bridge: MacPermissionsBridge;
  relaunch?: (() => void) | null;
  onStatus?: (granted: number) => void;
}) {
  const [status, setStatus] = useState<MacPermissionStatus | null>(null);
  const [busy, setBusy] = useState<MacPermission | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const read = useCallback(() => {
    void bridge.status().then((next) => { if (live.current) setStatus(next); }, () => {});
  }, [bridge]);
  useEffect(() => {
    read();
    const timer = setInterval(read, PERMISSIONS_POLL_MS);
    window.addEventListener("focus", read);
    return () => { clearInterval(timer); window.removeEventListener("focus", read); };
  }, [read]);

  const ask = async (kind: MacPermission) => {
    setBusy(kind);
    try {
      const next = await bridge.request(kind).catch(() => null);
      // an app whose main process cannot read or ask still gets the pane
      if (!next?.supported) await openMacPermissionPane(kind);
      else if (live.current) setStatus(next);
    } finally {
      if (live.current) setBusy(null);
      read();
    }
  };

  const shown = status?.supported ? status : null;
  const stateOf = (kind: MacPermission): MacPermissionState => shown?.[kind] ?? "missing";
  const granted = MAC_PERMISSIONS.filter((kind) => stateOf(kind) === "granted").length;
  const told = useRef(onStatus);
  told.current = onStatus;
  useEffect(() => { told.current?.(granted); }, [granted]);

  return (
    <>
      <ul className="m-0 flex w-full max-w-[420px] list-none flex-col gap-1.5 p-0 text-start">
        {MAC_PERMISSIONS.map((kind) => {
          const row = ROWS[kind];
          const state = stateOf(kind);
          return (
            <li key={kind} data-permission={kind} data-permission-state={state}
              className="flex min-h-14 items-center gap-3.5 rounded-xl bg-ink/[0.035] py-2.5 pe-2.5 ps-4">
              <span className="flex shrink-0 text-ink-secondary">{row.icon}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-medium leading-[18px] text-ink">{t(row.name)}</span>
                <span className="text-[12px] leading-4 text-ink-secondary">{t(row.why)}</span>
              </span>
              {state === "granted" ? (
                <span role="img" aria-label={t("funnel.permissions.allowed")} className="flex size-8 shrink-0 items-center justify-center text-success">
                  <Check size={18} aria-hidden="true" />
                </span>
              ) : (
                <button type="button" data-permission-ask={kind} disabled={busy === kind}
                  aria-label={`${t(state === "asked" ? "funnel.permissions.openSettings" : "funnel.permissions.allow")}: ${t(row.name)}`}
                  onClick={() => void ask(kind)}
                  className="ui-button ui-button-pill ui-button-md shrink-0 whitespace-nowrap">
                  {t(state === "asked" ? "funnel.permissions.openSettings" : "funnel.permissions.allow")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {screenNeedsReopen(shown) && (
        <p data-permissions-reopen="" className="mt-4 flex max-w-[420px] flex-wrap items-center justify-center gap-x-1 text-[13px] leading-[18px] text-ink-secondary">
          {t("funnel.permissions.reopenLine")}
          {relaunch && <button type="button" onClick={relaunch} className={cn(QUIET, "min-h-0 px-1.5 py-0.5 text-ink underline-offset-2 hover:underline")}>{t("funnel.permissions.reopen")}</button>}
        </p>
      )}
    </>
  );
}

export function PermissionsStep({ bridge, onNext, relaunch }: {
  bridge: MacPermissionsBridge;
  /** on to the app; `granted`: how many were on when the person left */
  onNext: (how: "continue" | "later", granted: number) => void;
  /** reopens the app, for Screen Recording to take effect; absent where the app can't */
  relaunch?: (() => void) | null;
}) {
  const granted = useRef(0);
  const leave = (how: "continue" | "later") => onNext(how, granted.current);

  return (
    <div className="my-auto w-full">
      {/* top right, across from Back, and quiet: Continue is the way on */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-end px-4">
        <button type="button" data-funnel-permissions-later="" onClick={() => leave("later")}
          className={cn(QUIET, "pointer-events-auto text-[12px] text-ink-tertiary")}>{t("funnel.permissions.later")}</button>
      </div>
      <StepFrame art={<StepIcon><KeyRound size={STEP_ICON} aria-hidden="true" /></StepIcon>} title={t("funnel.permissions.title")} sub={t("funnel.permissions.sub")}
        footer={<button type="button" data-primary="" data-funnel-permissions-continue="" onClick={() => leave("continue")} className={PRIMARY}>{t("funnel.next")}</button>}>
        <div className="-mt-2 flex w-full flex-col items-center">
          <MacPermissionList bridge={bridge} relaunch={relaunch} onStatus={(count) => { granted.current = count; }} />
        </div>
      </StepFrame>
    </div>
  );
}
