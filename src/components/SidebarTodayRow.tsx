// The Today row at the top of the sidebar: opens the Today page, with how many things need the person today as its count.
import { Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useDealsToday } from "@/state/deals-today";
import { useStore } from "@/state/store";

export function SidebarTodayRow({ icons, large, onOpened }: {
  icons: boolean;
  /** Simple's row, sized as its bots' rows are. */
  large: boolean;
  onOpened?: () => void;
}) {
  const { state, dispatch } = useStore();
  const count = useDealsToday().view?.needsYou.length ?? 0;
  const active = state.activeView === "today";
  const shown = count > 9 ? "9+" : String(count);
  const label = count > 0 ? t("today.row.count", { count }) : t("today.title");
  const open = () => { dispatch({ type: "showToday" }); onOpened?.(); };
  if (icons) {
    return (
      <button type="button" data-sidebar-today={count} aria-label={label} title={label} aria-current={active ? "page" : undefined} onClick={open}
        className={cn("relative mx-auto mb-1 flex size-[46px] shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", active && "bg-raised text-ink")}>
        <Sun size={20} aria-hidden="true" />
        {count > 0 && <span aria-hidden="true" data-today-count className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-warning px-0.5 text-[10px] font-semibold leading-4 text-panel">{shown}</span>}
      </button>
    );
  }
  return (
    <div className="px-3 pb-1">
      <button type="button" data-sidebar-today={count} aria-label={label} title={label} aria-current={active ? "page" : undefined} onClick={open}
        className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-start outline-none hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-accent/60", active && "bg-raised")}>
        <span className={cn("grid shrink-0 place-items-center rounded-full", active ? "bg-ink/[0.16] text-ink" : "bg-raised text-ink-secondary", large ? "size-9" : "size-8")}>
          <Sun size={large ? 18 : 16} aria-hidden="true" />
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-ink", large ? "text-[14px] font-medium leading-5" : "text-[15px] font-semibold leading-5")}>{t("today.title")}</span>
        {count > 0 && <span aria-hidden="true" data-today-count className="shrink-0 rounded-full bg-warning px-1.5 text-[11px] font-semibold tabular-nums text-panel">{shown}</span>}
      </button>
    </div>
  );
}
