// Connecting an AI, as one step of the first run: the grid of AIs people already use (AiCards), one already signed in
// here marked Connected, and the free model or later when none is connected yet. More providers opens every other way
// in, API keys included.
import { useState } from "react";
import { Check, LoaderCircle, Plug, RefreshCw } from "lucide-react";
import { engineReady } from "@/components/EngineLibrary";
import { ConnectAiPlaceContext } from "@/lib/connect-ai-events";
import { t } from "@/lib/i18n";
import { aiWorks } from "@/lib/onboarding";
import { useStore } from "@/state/store";
import { AiCards } from "./AiCards";
import { ConnectAiDialog } from "./ConnectAi";
import { aiConnected, aiName, aiTiles, freeModel } from "./funnel";
import { PRIMARY, SECONDARY, STEP_ICON, StepFrame, StepIcon } from "./FunnelSteps";
import type { WelcomeAiNow } from "./welcome-ai";

/** `tested`: the AI the welcome stands on, after its test message (useWelcomeAi). `onChoose`: an AI picked in More
 * providers, which counts even as the free backup. `hosted`: a team's shared place, whose AIs its organization provides. */
export function AiStep({ tested, hosted = false, onChoose, onNext }: {
  tested: WelcomeAiNow | null;
  hosted?: boolean;
  onChoose: (instanceId: string) => void;
  onNext: () => void;
}) {
  const { state } = useStore();
  const [more, setMore] = useState(false);
  const free = freeModel(state.instances, engineReady);
  const connected = aiTiles(state.instances, engineReady).filter((tile) => aiConnected(tile.instance, engineReady));
  const works = aiWorks(tested);
  const ready = connected.length > 0 || works;
  const sub = hosted ? t("onboarding.hosted.intro") : ready ? t("funnel.ai.subMore") : t("funnel.ai.sub");
  return (
    <ConnectAiPlaceContext.Provider value="meet">
      <StepFrame art={<StepIcon><Plug size={STEP_ICON} aria-hidden="true" /></StepIcon>} title={t("funnel.ai.title")} sub={sub} wide
        footer={<>
          <button type="button" data-primary="" data-funnel-ai-continue="" disabled={!ready} onClick={onNext} className={PRIMARY}>{t("funnel.next")}</button>
          {!ready && <button type="button" data-funnel-later="" onClick={onNext} className={SECONDARY}>{t(free ? "funnel.ai.free" : "funnel.ai.later")}</button>}
        </>}>
        <AiCards tested={tested} onMore={() => setMore(true)} />
        {tested?.state === "testing" && (
          <p role="status" data-ai-checking="" className="mt-5 flex items-center gap-2 text-[13px] leading-[18px] text-ink-secondary">
            <LoaderCircle size={14} aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" />
            {t("onboarding.engines.checkingAnswer", { name: aiName(tested.instance) })}
          </p>
        )}
        {works && tested && (
          <p role="status" data-ai-connected="" className="mt-5 flex items-center gap-1.5 text-[13px] leading-[18px] text-success">
            <Check size={14} aria-hidden="true" className="shrink-0" />{t("onboarding.meet.connected", { name: aiName(tested.instance) })}
          </p>
        )}
        {tested?.state === "failed" && (
          <div role="alert" data-ai-silent="" className="mt-5 flex flex-col items-center gap-2 text-[13px] leading-[18px] text-ink">
            <p>{tested.error ?? t("onboarding.engines.noAnswer", { name: tested.instance.displayName })}</p>
            <button type="button" onClick={tested.retry} className="ui-button ui-button-pill ui-button-sm"><RefreshCw size={12} aria-hidden="true" />{t("common.checkAgain")}</button>
          </div>
        )}
        {more && <ConnectAiDialog hosted={hosted} tested={tested} onChoose={onChoose} onClose={() => setMore(false)} />}
      </StepFrame>
    </ConnectAiPlaceContext.Provider>
  );
}
