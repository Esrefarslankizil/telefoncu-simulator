import type { EventBus } from "./EventBus";
import type { GameEvents, QualityPresetName } from "./GameEvents";

export const CURRENT_GAME_STATE_VERSION = 1 as const;

const STARTING_MONEY = 18_500;
const STARTING_REPUTATION = 50;
const STARTING_DAY = 1;
const DEFAULT_RNG_STATE = 0x1a2b3c4d;

export type QualityPreference = "auto" | QualityPresetName;

export interface GameSettings {
  readonly quality: QualityPreference;
  readonly audioEnabled: boolean;
  readonly lookSensitivity: number;
}

export interface GameState {
  readonly schemaVersion: typeof CURRENT_GAME_STATE_VERSION;
  readonly money: number;
  readonly reputation: number;
  readonly day: number;
  readonly inventory: Readonly<Record<string, number>>;
  readonly settings: GameSettings;
  readonly rngState: number;
}

export type StoreListener = (state: GameState) => void;

const DEFAULT_SETTINGS: GameSettings = {
  quality: "auto",
  audioEnabled: true,
  lookSensitivity: 1,
};

/** The serializable source of truth for the current game session. */
export class GameStore {
  private currentState: GameState;
  private readonly listeners = new Set<StoreListener>();
  private readonly events: EventBus<GameEvents>;

  public constructor(events: EventBus<GameEvents>) {
    this.events = events;
    this.currentState = GameStore.createInitialState();
  }

  public getState(): GameState {
    return this.currentState;
  }

  /** Returns a detached plain-data snapshot suitable for JSON serialization. */
  public serialize(): GameState {
    return GameStore.cloneState(this.currentState);
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setMoney(money: number): void {
    this.assertFiniteNumber(money, "money");
    this.commit({ ...this.currentState, money });
  }

  public addMoney(amount: number): void {
    this.assertFiniteNumber(amount, "amount");
    this.setMoney(this.currentState.money + amount);
  }

  public setReputation(reputation: number): void {
    this.assertFiniteNumber(reputation, "reputation");
    const boundedReputation = Math.min(100, Math.max(0, reputation));
    this.commit({ ...this.currentState, reputation: boundedReputation });
  }

  public addReputation(amount: number): void {
    this.assertFiniteNumber(amount, "amount");
    this.setReputation(this.currentState.reputation + amount);
  }

  public advanceDay(): void {
    this.commit({ ...this.currentState, day: this.currentState.day + 1 });
  }

  public setInventoryQuantity(itemId: string, quantity: number): void {
    this.assertItemId(itemId);

    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new RangeError("Inventory quantity must be a non-negative safe integer.");
    }

    const inventory = GameStore.cloneInventory(this.currentState.inventory);

    if (quantity === 0) {
      delete inventory[itemId];
    } else {
      inventory[itemId] = quantity;
    }

    this.commit({ ...this.currentState, inventory });
  }

  public addInventory(itemId: string, quantity = 1): void {
    this.assertPositiveQuantity(quantity);
    const currentQuantity = this.currentState.inventory[itemId] ?? 0;
    this.setInventoryQuantity(itemId, currentQuantity + quantity);
  }

  /** Returns false and leaves inventory unchanged when stock is insufficient. */
  public removeInventory(itemId: string, quantity = 1): boolean {
    this.assertItemId(itemId);
    this.assertPositiveQuantity(quantity);
    const currentQuantity = this.currentState.inventory[itemId] ?? 0;

    if (currentQuantity < quantity) {
      return false;
    }

    this.setInventoryQuantity(itemId, currentQuantity - quantity);
    return true;
  }

  public updateSettings(patch: Partial<GameSettings>): void {
    const settings: GameSettings = {
      ...this.currentState.settings,
      ...patch,
    };

    GameStore.assertSettings(settings);
    this.commit({ ...this.currentState, settings });
  }

  public setRngState(rngState: number): void {
    if (!Number.isSafeInteger(rngState) || rngState < 0 || rngState > 0xffff_ffff) {
      throw new RangeError("rngState must be an unsigned 32-bit integer.");
    }

    this.commit({ ...this.currentState, rngState });
  }

  /** Migrates older save shapes before replacing the current state. */
  public replaceFromSave(saveData: unknown): void {
    this.commit(GameStore.migrate(saveData));
  }

  public static createInitialState(): GameState {
    return {
      schemaVersion: CURRENT_GAME_STATE_VERSION,
      money: STARTING_MONEY,
      reputation: STARTING_REPUTATION,
      day: STARTING_DAY,
      inventory: Object.create(null) as Record<string, number>,
      settings: { ...DEFAULT_SETTINGS },
      rngState: DEFAULT_RNG_STATE,
    };
  }

  private commit(nextState: GameState): void {
    this.currentState = nextState;
    this.events.emit("store:changed", { state: nextState });

    for (const listener of this.listeners) {
      listener(nextState);
    }
  }

  private assertFiniteNumber(value: number, name: string): void {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must be a finite number.`);
    }
  }

  private assertItemId(itemId: string): void {
    if (itemId.trim().length === 0) {
      throw new RangeError("Inventory itemId must not be empty.");
    }
  }

  private assertPositiveQuantity(quantity: number): void {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new RangeError("Inventory quantity must be a positive safe integer.");
    }
  }

  private static migrate(saveData: unknown): GameState {
    if (!GameStore.isRecord(saveData)) {
      throw new TypeError("Save data must be a JSON object.");
    }

    const detectedVersion =
      typeof saveData["schemaVersion"] === "number" ? saveData["schemaVersion"] : 0;

    if (!Number.isSafeInteger(detectedVersion) || detectedVersion < 0) {
      throw new RangeError("Save schema version is invalid.");
    }

    if (detectedVersion > CURRENT_GAME_STATE_VERSION) {
      throw new RangeError(
        `Save version ${detectedVersion} is newer than supported version ${CURRENT_GAME_STATE_VERSION}.`,
      );
    }

    // Version 0 covered the initial unversioned save shape: cash/dayNumber
    // were used by early prototypes, so normalize those names here.
    const migratedData: Record<string, unknown> =
      detectedVersion === 0
        ? {
            schemaVersion: CURRENT_GAME_STATE_VERSION,
            money: saveData["money"] ?? saveData["cash"] ?? STARTING_MONEY,
            reputation: saveData["reputation"] ?? STARTING_REPUTATION,
            day: saveData["day"] ?? saveData["dayNumber"] ?? STARTING_DAY,
            inventory: saveData["inventory"] ?? {},
            settings: saveData["settings"] ?? {},
            rngState: saveData["rngState"] ?? DEFAULT_RNG_STATE,
          }
        : saveData;

    const settings = GameStore.normalizeSettings(migratedData["settings"]);
    const inventory = GameStore.normalizeInventory(migratedData["inventory"]);
    const dayValue = GameStore.readFiniteNumber(migratedData["day"], STARTING_DAY);
    const rngValue = GameStore.readFiniteNumber(migratedData["rngState"], DEFAULT_RNG_STATE);

    if (!Number.isSafeInteger(dayValue) || dayValue < 1) {
      throw new RangeError("Save day must be a positive safe integer.");
    }

    if (!Number.isSafeInteger(rngValue) || rngValue < 0 || rngValue > 0xffff_ffff) {
      throw new RangeError("Save rngState must be an unsigned 32-bit integer.");
    }

    return {
      schemaVersion: CURRENT_GAME_STATE_VERSION,
      money: GameStore.readFiniteNumber(migratedData["money"], STARTING_MONEY),
      reputation: Math.min(
        100,
        Math.max(
          0,
          GameStore.readFiniteNumber(migratedData["reputation"], STARTING_REPUTATION),
        ),
      ),
      day: dayValue,
      inventory,
      settings,
      rngState: rngValue,
    };
  }

  private static normalizeSettings(value: unknown): GameSettings {
    if (!GameStore.isRecord(value)) {
      return { ...DEFAULT_SETTINGS };
    }

    const quality = value["quality"];
    const audioEnabled = value["audioEnabled"];
    const lookSensitivity = GameStore.readFiniteNumber(value["lookSensitivity"], 1);
    const settings: GameSettings = {
      quality:
        quality === "low" || quality === "medium" || quality === "high" || quality === "auto"
          ? quality
          : DEFAULT_SETTINGS.quality,
      audioEnabled:
        typeof audioEnabled === "boolean" ? audioEnabled : DEFAULT_SETTINGS.audioEnabled,
      lookSensitivity,
    };

    GameStore.assertSettings(settings);
    return settings;
  }

  private static normalizeInventory(value: unknown): Readonly<Record<string, number>> {
    if (!GameStore.isRecord(value)) {
      return Object.create(null) as Record<string, number>;
    }

    const inventory = Object.create(null) as Record<string, number>;

    for (const itemId of Object.keys(value)) {
      const quantity = value[itemId];

      if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0) {
        throw new RangeError(`Invalid quantity for inventory item '${itemId}'.`);
      }

      if (quantity > 0) {
        inventory[itemId] = quantity;
      }
    }

    return inventory;
  }

  private static assertSettings(settings: GameSettings): void {
    if (
      settings.quality !== "auto" &&
      settings.quality !== "low" &&
      settings.quality !== "medium" &&
      settings.quality !== "high"
    ) {
      throw new RangeError("Settings quality must be auto, low, medium, or high.");
    }

    if (typeof settings.audioEnabled !== "boolean") {
      throw new TypeError("Settings audioEnabled must be a boolean.");
    }

    if (
      !Number.isFinite(settings.lookSensitivity) ||
      settings.lookSensitivity < 0.2 ||
      settings.lookSensitivity > 3
    ) {
      throw new RangeError("Settings lookSensitivity must be between 0.2 and 3.");
    }
  }

  private static readFiniteNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static cloneInventory(
    inventory: Readonly<Record<string, number>>,
  ): Record<string, number> {
    return Object.assign(Object.create(null) as Record<string, number>, inventory);
  }

  private static cloneState(state: GameState): GameState {
    return {
      schemaVersion: state.schemaVersion,
      money: state.money,
      reputation: state.reputation,
      day: state.day,
      inventory: GameStore.cloneInventory(state.inventory),
      settings: { ...state.settings },
      rngState: state.rngState,
    };
  }
}
