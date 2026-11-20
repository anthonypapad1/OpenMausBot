// The AIs people already use, as a grid of cards with their own logos. A press starts that AI's sign-in under the grid
// (the first screen's sign-in pill: getting it ready, its own sign-in in the browser, the code to enter), or shows its
// setup where it has no sign-in (an API key, a local endpoint). An AI that is already signed in here shows Connected
// and can't be pressed again.
import { useState } from "react";
import { Check, Server } from "lucide-react";
import { EngineSetup } from "@/components/EngineSetup";
import { engineReady } from "@/components/EngineLibrary";
import { PresetProviderMark, ProviderMark } from "@/components/ProviderIcons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useStore, type InstanceInfo } from "@/state/store";
import { setupFor } from "./ConnectAi";
import { aiConnected, aiTiles, type AiTile, type AiTileId } from "./funnel";
import { TILE } from "./FunnelSteps";
import { pillWay, SignInPill, useSignInPill } from "./SignInPill";
import type { WelcomeAiNow } from "./welcome-ai";

const ready = (instance: InstanceInfo) => engineReady(instance);

function TileMark({ tile, size }: { tile: AiTile<InstanceInfo>; size: number }) {
  switch (tile.id) {
    case "gemini": return <PresetProviderMark preset="google" size={size} />;
    case "openrouter": return <PresetProviderMark preset="openrouter" size={size} />;
    case "local": return <Server size={size - 4} aria-hidden="true" className="text-ink-secondary" />;
    default: return <ProviderMark driverKind={tile.instance.driverKind} size={size} />;
  }
}

const label = (tile: AiTile<InstanceInfo>) => (tile.id === "local" ? t("funnel.ai.local") : tile.label);

/** The pressed AI's way in: its sign-in pill, or its setup where it has no sign-in the pill can run. */
function AiConnect({ tile, tested, onDialog }: { tile: AiTile<InstanceInfo>; tested: WelcomeAiNow | null; onDialog: () => void }) {
  const instance = tile.instance;
  const pill = useSignInPill(instance, "meet");
  if (pillWay(instance) === "dialog") {
    return <EngineSetup instance={instance} {...setupFor(instance)} className="w-full rounded-xl border-0 bg-ink/[0.035] p-4 text-start" />;
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <SignInPill pill={pill} instance={instance} name={label(tile)} waiting={tested?.state === "testing" && tested.instance.instanceId === instance.instanceId}
        onDialog={onDialog} />
      {pill.error && <p role="alert" className="text-[13px] leading-[18px] text-danger">{pill.error}</p>}
    </div>
  );
}

function AiCard({ tile, connected, picked, onPick }: { tile: AiTile<InstanceInfo>; connected: boolean; picked: boolean; onPick: () => void }) {
  if (connected) {
    return (
      <div data-funnel-ai={tile.id} data-connected="" role="listitem" aria-label={t("funnel.ai.connectedName", { name: label(tile) })}
        className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl bg-ink/[0.035] px-2">
        <span className="grid size-7 place-items-center"><TileMark tile={tile} size={24} /></span>
        <span className="flex max-w-full flex-col items-center">
          <span className="max-w-full truncate text-[13px] leading-[18px] text-ink">{label(tile)}</span>
          <span className="flex items-center gap-1 text-[12px] leading-4 text-success">
            <Check size={12} aria-hidden="true" className="shrink-0" />{t("funnel.ai.ready")}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div role="listitem" className="flex">
      <button type="button" data-funnel-ai={tile.id} aria-pressed={picked} onClick={onPick}
        className={cn(TILE, "flex h-24 w-full flex-col items-center justify-center gap-2 px-2", picked && "bg-ink/[0.08] hover:bg-ink/[0.08]")}>
        <span className="grid size-7 place-items-center"><TileMark tile={tile} size={24} /></span>
        <span className="max-w-full truncate text-[13px] leading-[18px] text-ink">{label(tile)}</span>
      </button>
    </div>
  );
}

/** The AIs that are connected here now, by their card. */
export function connectedAiCards(instances: readonly InstanceInfo[]): AiTileId[] {
  return aiTiles(instances, ready).filter((tile) => aiConnected(tile.instance, ready)).map((tile) => tile.id);
}

/** The grid of popular AIs this server can connect and, under it, the pressed one's way in. `onMore`: the small link to
 * every other provider and API keys. Nothing runs until a card is pressed. */
export function AiCards({ tested, onMore }: { tested: WelcomeAiNow | null; onMore: () => void }) {
  const { state } = useStore();
  const [picked, setPicked] = useState<AiTileId | null>(null);
  const tiles = aiTiles(state.instances, ready);
  const chosen = tiles.find((tile) => tile.id === picked && !aiConnected(tile.instance, ready));
  return (
    <div data-ai-cards="" className="@container flex w-full flex-col items-center">
      <div role="list" aria-label={t("funnel.ai.title")} className="grid w-full grid-cols-2 gap-2.5 @min-[400px]:grid-cols-4">
        {tiles.map((tile) => (
          <AiCard key={tile.id} tile={tile} connected={aiConnected(tile.instance, ready)} picked={picked === tile.id}
            onPick={() => setPicked((now) => (now === tile.id ? null : tile.id))} />
        ))}
      </div>
      {chosen && (
        <div data-funnel-ai-connect={chosen.id} className="flex w-full animate-fade-in flex-col items-center pt-5 motion-reduce:animate-none">
          <AiConnect key={chosen.id} tile={chosen} tested={tested} onDialog={onMore} />
        </div>
      )}
      <button type="button" data-ai-more="" onClick={onMore}
        className="mt-3 min-h-9 rounded-full px-3 text-[13px] leading-[18px] text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none">
        {t("connectAi.more")}
      </button>
    </div>
  );
}
