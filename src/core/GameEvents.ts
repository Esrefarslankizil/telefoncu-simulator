import type { GameState } from "./GameStore";

export type PauseReason = "manual" | "visibility" | "app-state";
export type QualityPresetName = "low" | "medium" | "high";

export interface GameEvents {
  "game:paused": { readonly reason: PauseReason };
  "game:resumed": { readonly reason: PauseReason };
  "store:changed": { readonly state: GameState };
  "save:completed": { readonly savedAt: number };
  "save:failed": { readonly message: string };
  "quality:changed": {
    readonly preset: QualityPresetName;
    readonly pixelRatio: number;
    readonly source: "device" | "fps" | "user";
  };
  "asset:progress": {
    readonly url: string;
    readonly loaded: number;
    readonly total: number;
  };
  "asset:loaded": { readonly url: string };
  "asset:failed": { readonly url: string; readonly message: string };
}
