import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { EventBus } from "../core/EventBus";
import type { GameEvents } from "../core/GameEvents";
import { GameStore } from "../core/GameStore";

const DEFAULT_STORAGE_KEY = "phone-shop-simulator-save";
const DEFAULT_AUTOSAVE_DELAY_MS = 800;

export interface SaveSystemOptions {
  readonly storageKey?: string;
  readonly autosaveDelayMs?: number;
}

/** Loads and persists GameStore snapshots with a debounced autosave. */
export class SaveSystem {
  private readonly store: GameStore;
  private readonly events: EventBus<GameEvents>;
  private readonly storageKey: string;
  private readonly autosaveDelayMs: number;
  private unsubscribeFromStore: (() => void) | null = null;
  private autosaveTimer: number | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private initialized = false;
  private destroyed = false;

  private readonly onPageHide = (): void => {
    void this.saveNow();
  };

  public constructor(
    store: GameStore,
    events: EventBus<GameEvents>,
    options: SaveSystemOptions = {},
  ) {
    this.store = store;
    this.events = events;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.autosaveDelayMs = options.autosaveDelayMs ?? DEFAULT_AUTOSAVE_DELAY_MS;

    if (!Number.isFinite(this.autosaveDelayMs) || this.autosaveDelayMs < 0) {
      throw new RangeError("SaveSystem autosaveDelayMs must be a non-negative number.");
    }
  }

  /** Loads the last save before enabling automatic saves. */
  public async initialize(): Promise<void> {
    if (this.initialized || this.destroyed) {
      return;
    }

    try {
      const serializedSave = await this.readSave();

      if (serializedSave !== null) {
        this.store.replaceFromSave(JSON.parse(serializedSave) as unknown);
      }
    } catch (error: unknown) {
      this.emitSaveFailure(error);
    }

    if (this.destroyed) {
      return;
    }

    this.initialized = true;
    this.unsubscribeFromStore = this.store.subscribe(this.scheduleAutosave);
    window.addEventListener("pagehide", this.onPageHide);
  }

  /** Writes the current store snapshot immediately. */
  public saveNow(): Promise<boolean> {
    if (!this.initialized || this.destroyed) {
      return Promise.resolve(false);
    }

    const serializedSave = JSON.stringify(this.store.serialize());
    const writeOperation = this.saveQueue.then(() => this.writeSave(serializedSave));

    this.saveQueue = writeOperation.then(
      () => undefined,
      () => undefined,
    );

    return writeOperation.then(
      () => {
        this.events.emit("save:completed", { savedAt: Date.now() });
        return true;
      },
      (error: unknown) => {
        this.emitSaveFailure(error);
        return false;
      },
    );
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.unsubscribeFromStore?.();
    this.unsubscribeFromStore = null;
    window.removeEventListener("pagehide", this.onPageHide);

    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private readonly scheduleAutosave = (): void => {
    if (this.destroyed) {
      return;
    }

    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
    }

    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      void this.saveNow();
    }, this.autosaveDelayMs);
  };

  private async readSave(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Preferences.get({ key: this.storageKey });

        if (result.value !== null) {
          return result.value;
        }
      } catch (error: unknown) {
        console.warn("Capacitor Preferences read failed; trying localStorage.", error);
      }
    }

    try {
      return window.localStorage.getItem(this.storageKey);
    } catch (error: unknown) {
      this.emitSaveFailure(error);
      return null;
    }
  }

  private async writeSave(serializedSave: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Preferences.set({ key: this.storageKey, value: serializedSave });
        return;
      } catch (error: unknown) {
        console.warn("Capacitor Preferences write failed; trying localStorage.", error);
      }
    }

    window.localStorage.setItem(this.storageKey, serializedSave);
  }

  private emitSaveFailure(error: unknown): void {
    this.events.emit("save:failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
