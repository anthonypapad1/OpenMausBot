// The first run's frame (Back, how far along it is, a step that arrives piece by piece) and its hello.
import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { BotAvatar, MausAvatar } from "@/components/Avatar";
import { usePrefersReducedMotion } from "@/components/mascot-clock";
import { brand, productName } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { DEFAULT_BOT_NAME, myDefaultBot, useViewerEmail } from "@/lib/default-bot";
import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";
import { useDesktopCapabilities } from "../DesktopCapabilities";

export const PRIMARY = "ui-button ui-button-pill ui-button-lg ui-button-primary w-[288px] max-w-full";
/** The quiet way past a step that still reads as a button: a soft fill, no outline. */
export const SECONDARY = "ui-button ui-button-pill ui-button-lg w-[288px] max-w-full";
export const QUIET = "min-h-9 rounded-full px-3 text-[13px] leading-[18px] text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";
/** A tonal choice: a soft fill, no outline, a deeper fill on hover and while chosen. */
export const TILE = "rounded-xl bg-ink/[0.035] transition-colors duration-150 hover:bg-ink/[0.06] active:bg-ink/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

/** macOS's traffic lights span 16-76px of a window with its frame off: nothing clickable starts before this. */
const MAC_TRAFFIC_LIGHT_CLEAR_X = 88;

/** Back, and how far along the first run is, over every step but the hello. */
export function FunnelBar({ at, count, onBack }: { at: number; count: number; onBack: (() => void) | null }) {
  const lights = useDesktopCapabilities().capabilities.windowChrome === "mac-inset";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-center px-4">
      {onBack && (
        <button type="button" data-funnel-back={lights ? "clear-of-traffic-lights" : ""} onClick={onBack}
          style={lights ? { insetInlineStart: MAC_TRAFFIC_LIGHT_CLEAR_X } : undefined}
          className="pointer-events-auto absolute start-4 inline-flex min-h-9 items-center gap-0.5 rounded-full py-1 pe-3 ps-1.5 text-[13px] leading-[18px] text-ink-secondary transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none">
          <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />{t("funnel.back")}
        </button>
      )}
      <div role="progressbar" aria-label={t("funnel.progress")} aria-valuemin={1} aria-valuemax={count} aria-valuenow={at + 1}
        aria-valuetext={t("funnel.progressAt", { at: String(at + 1), count: String(count) })} data-funnel-progress={`${at + 1}/${count}`}
        className="flex items-center gap-1.5">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} aria-hidden="true" className={cn("h-1 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none",
            index === at ? "w-6 bg-ink" : index < at ? "w-3 bg-ink/45" : "w-3 bg-ink/12")} />
        ))}
      </div>
    </div>
  );
}

/** One piece of a step arriving: the picture first, then the title, the line, what to do and the way on, 45ms apart.
 * Under reduced motion they are simply there. */
const rise = (index: number): { className: string; style: CSSProperties } => ({
  className: "animate-rise motion-reduce:animate-none",
  style: { animationDelay: `${index ? 60 + index * 45 : 0}ms` },
});

/** One step's page: a small picture that explains it, the title, a short line, what to do, and the way on. */
export function StepFrame({ art, title, sub, children, footer, wide = false }: {
  art?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const piece = (index: number, className: string) => ({ className: cn(rise(index).className, className), style: rise(index).style });
  return (
    <div data-step-cascade="" className={cn("mx-auto my-auto flex w-full flex-col items-center px-6 pt-20 text-center", footer ? "pb-6" : "pb-12", wide ? "max-w-[640px]" : "max-w-[520px]")}>
      {art && <div aria-hidden="true" {...piece(0, "mb-6 flex h-16 items-end justify-center")}>{art}</div>}
      <h1 id="welcome-title" tabIndex={-1} {...piece(1, "text-balance text-[28px] font-normal leading-[34px] tracking-[-0.02em] text-ink outline-none")}>{title}</h1>
      {sub && <p {...piece(2, "mt-2 max-w-[420px] text-pretty text-[15px] leading-[22px] text-ink-secondary")}>{sub}</p>}
      {children && <div {...piece(3, "mt-8 flex w-full flex-col items-center")}>{children}</div>}
      {/* a step taller than the window keeps its way on in view, over the content scrolling under it */}
      {footer && <div data-step-footer="" {...piece(4, "sticky bottom-0 z-[1] mt-4 flex w-full flex-col items-center gap-2 bg-app pb-6 pt-4")}>{footer}</div>}
    </div>
  );
}

/** A step's small picture: a lucide icon at the step's size, in a soft disc. */
export function StepIcon({ children }: { children: ReactNode }) {
  return <span className="grid size-14 place-items-center rounded-full bg-ink/[0.05] text-ink-secondary">{children}</span>;
}

/** The app's own face: the brand's logo where it has one, else the person's first bot, else the default mascot. */
export function AppFace({ size, mood = "idle" }: { size: number; mood?: "idle" | "happy" | "excited" }) {
  const { state } = useStore();
  const reduced = usePrefersReducedMotion();
  const maus = myDefaultBot(state.bots, useViewerEmail());
  const logo = brand().logo;
  if (logo) return <img src={logo} alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} />;
  if (maus) return <BotAvatar bot={maus} size={size} state={mood} animated={!reduced} />;
  return <MausAvatar color="chrome" size={size} state={mood} animated={!reduced} label={DEFAULT_BOT_NAME} />;
}

/** The hello: the app's face, its name, one line about it and Get started. */
export function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-full w-full flex-col">
      <StepFrame
        art={<AppFace size={72} mood="excited" />}
        title={t("funnel.welcome.title", { app: productName() })}
        sub={t("funnel.welcome.sub")}
        footer={<button type="button" data-primary="" data-funnel-start="" autoFocus onClick={onStart} className={PRIMARY}>{t("funnel.welcome.start")}</button>}
      />
    </div>
  );
}
