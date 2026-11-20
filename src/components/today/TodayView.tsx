// The Today page: what needs the person today, the deadlines of the next seven days and what their team did, read from the
// shared deal list. People who aren't technical land here every morning, so it reads larger than the rest of the app.
import { useCallback } from "react";
import { activeLocale, intlLocale, t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { localizedRelativeTime } from "@/lib/relative-time";
import { useShowThreads } from "@/lib/thread-preferences";
import { activityBot, botForDesk, comingUpTitle, dayBlock, greetingFor, headlineKey, hourIn, longDate, streetOf, todayCards, type TodayCard } from "@/lib/today";
import { refreshDealsToday, useDealsToday } from "@/state/deals-today";
import { openBot, useStore, type Bot } from "@/state/store";
import type { DealActivityItem, DealComingUp, DealTodayView } from "../../../shared/deals";
import { WindowDragStrip } from "../DesktopCapabilities";
import { DeskAvatar } from "./DeskAvatar";

const ACTIVITY_SHOWN = 6;
const SECTION_TITLE = "text-[20px] font-bold leading-7 tracking-[-0.01em] text-ink";
const QUIET_LINE = "text-[15px] leading-[22px] text-ink-secondary";

export interface TodayPageProps {
  view: DealTodayView | null;
  failed: boolean;
  bots: readonly Bot[];
  now: number;
  onOpenBot: (bot: Bot) => void;
  onRetry: () => void;
}

export function TodayView() {
  const { state, dispatch } = useStore();
  const { view, failed } = useDealsToday();
  const showThreads = useShowThreads();
  const onOpenBot = useCallback((bot: Bot) => openBot(dispatch, bot, showThreads), [dispatch, showThreads]);
  return <TodayPage view={view} failed={failed} bots={state.bots} now={Date.now()} onOpenBot={onOpenBot} onRetry={() => void refreshDealsToday()} />;
}

export function TodayPage({ view, failed, bots, now, onOpenBot, onRetry }: TodayPageProps) {
  const locale = intlLocale();
  const cards = view ? todayCards(view, locale) : [];
  const today = view?.today ?? localDay(now);
  return (
    <main aria-label={t("today.title")} data-today-view={view ? cards.length : "loading"} className="relative flex h-full min-w-0 flex-1 flex-col bg-app text-ink">
      <WindowDragStrip />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-12 pt-16 sm:px-8 md:pt-11 lg:px-14">
          <header>
            <p className="text-[15px] font-medium leading-[22px] text-ink-secondary">{longDate(today, locale)}</p>
            <h1 className="mt-1.5 text-[32px] font-extrabold leading-10 tracking-[-0.02em] text-ink">
              {t(greetingFor(hourIn(view?.timeZone, now)))}
              {view && <> <Headline count={cards.length} /></>}
            </h1>
          </header>
          {failed && <LoadProblem shown={view !== null} onRetry={onRetry} />}
          {view && (
            <div className="mt-9 flex flex-col gap-10 xl:flex-row xl:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-9">
                {cards.length > 0 && <NeedsYou cards={cards} bots={bots} onOpenBot={onOpenBot} />}
                <ComingUp rows={view.comingUp} locale={locale} bots={bots} />
              </div>
              <TeamActivity items={view.recentActivity.slice(0, ACTIVITY_SHOWN)} bots={bots} now={now} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Headline({ count }: { count: number }) {
  const words = t(headlineKey(count), { count });
  if (count === 0) return <>{words}</>;
  return <span className="bg-[linear-gradient(transparent_62%,color-mix(in_srgb,var(--color-warning)_24%,transparent)_62%)]">{words}</span>;
}

function LoadProblem({ shown, onRetry }: { shown: boolean; onRetry: () => void }) {
  return (
    <div role="status" className="mt-6 flex flex-wrap items-center gap-3">
      <p className={QUIET_LINE}>{t(shown ? "today.error.stale" : "today.error.load")}</p>
      <button type="button" onClick={onRetry} className="ui-button ui-button-pill">{t("today.error.retry")}</button>
    </div>
  );
}

function NeedsYou({ cards, bots, onOpenBot }: { cards: TodayCard[]; bots: readonly Bot[]; onOpenBot: (bot: Bot) => void }) {
  return (
    <section aria-labelledby="today-needs-you">
      <h2 id="today-needs-you" className={SECTION_TITLE}>{t("today.needsYou")}</h2>
      <ul className="mt-3.5 flex flex-col gap-3">
        {cards.map((card) => <NeedCard key={card.key} card={card} bot={botForDesk(bots, card.desk)} onOpenBot={onOpenBot} />)}
      </ul>
    </section>
  );
}

function NeedCard({ card, bot, onOpenBot }: { card: TodayCard; bot?: Bot; onOpenBot: (bot: Bot) => void }) {
  return (
    <li data-today-card={card.key} data-urgent={card.urgent || undefined}
      className={cn("flex flex-col gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:gap-4", card.urgent ? "border-transparent bg-warning/[0.14]" : "border-hairline")}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <DeskAvatar name={card.desk} bot={bot} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-5 text-ink-secondary">{t(card.tag.key, { when: card.tag.when })}</p>
          <p dir="auto" title={card.title} className="truncate text-[17px] font-bold leading-6 text-ink">{card.title}</p>
          <p dir="auto" title={card.address} className="mt-0.5 truncate text-[15px] leading-[22px] text-ink-secondary">{card.address}</p>
        </div>
      </div>
      {bot && (
        <button type="button" onClick={() => onOpenBot(bot)} className={cn("ui-button ui-button-lg ui-button-pill shrink-0 self-start ms-15 sm:ms-0 sm:self-auto", card.urgent && "ui-button-primary")}>
          {t("today.card.ask", { desk: bot.name })}
        </button>
      )}
    </li>
  );
}

function ComingUp({ rows, locale, bots }: { rows: DealComingUp[]; locale: string; bots: readonly Bot[] }) {
  const deskBot = botForDesk(bots, "Deal Desk");
  return (
    <section aria-labelledby="today-coming-up">
      <h2 id="today-coming-up" className={cn(SECTION_TITLE, "flex items-baseline gap-2.5")}>
        {t("today.comingUp")}
        <span className="text-[15px] font-medium text-ink-secondary">{t("today.comingUp.window")}</span>
      </h2>
      {rows.length === 0 ? <p className={cn(QUIET_LINE, "mt-3")}>{t("today.comingUp.empty")}</p> : (
        <ol className="mt-2.5">
          {rows.map((row) => {
            const day = dayBlock(row.deadline.dueDate, locale);
            const title = comingUpTitle(row, locale);
            return (
              <li key={row.deadline.id} data-today-deadline={row.deadline.id} className="flex items-center gap-5 border-b border-hairline px-1 py-3.5 text-[16px] leading-6">
                <time dateTime={row.deadline.dueDate} className="w-14 shrink-0">
                  <span className="block text-[13px] font-semibold leading-4 text-ink-secondary">{day.weekday}</span>
                  <span className="block text-[22px] font-extrabold leading-6 tabular-nums text-ink">{day.date}</span>
                </time>
                <span dir="auto" title={title} className="min-w-0 flex-1 truncate font-semibold text-ink">{title}</span>
                <span dir="auto" title={row.address} className="hidden w-[200px] shrink-0 truncate text-ink-secondary sm:block">{streetOf(row.address)}</span>
                <DeskAvatar name="Deal Desk" bot={deskBot} size={30} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function TeamActivity({ items, bots, now }: { items: DealActivityItem[]; bots: readonly Bot[]; now: number }) {
  return (
    <aside aria-labelledby="today-team" className="w-full shrink-0 rounded-xl bg-ink/[0.04] p-6 xl:w-[340px]">
      <h2 id="today-team" className={SECTION_TITLE}>{t("today.team")}</h2>
      {items.length === 0 ? <p className={cn(QUIET_LINE, "mt-3")}>{t("today.team.empty")}</p> : (
        <ul className="mt-1.5">
          {items.map((item) => {
            const name = activityBot(item);
            return (
              <li key={item.activity.id} data-today-activity={item.activity.id} className="flex gap-3.5 py-3.5">
                <DeskAvatar name={name} bot={botForDesk(bots, name)} size={36} />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="text-[15px] leading-[22px] text-ink">{item.activity.summary}</p>
                  <p dir="auto" className="mt-0.5 text-[13px] font-medium leading-5 text-ink-secondary">
                    {streetOf(item.address)} · <time dateTime={new Date(item.activity.at).toISOString()}>{localizedRelativeTime(item.activity.at, activeLocale(), now)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/** This computer's calendar day, for the date line before the first read answers. */
function localDay(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
