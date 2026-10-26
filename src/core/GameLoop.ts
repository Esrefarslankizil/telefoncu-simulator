import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type { EventBus } from "./EventBus";
import type { GameEvents, PauseReason } from "./GameEvents";

const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;
const DEFAULT_MAX_FRAME_DELTA_SECONDS = 0.25;
const DEFAULT_MAX_SUB_STEPS = 5;

export interface GameLoopOptions {
  readonly fixedUpdate: (stepSeconds: number) => void;
  readonly render: (interpolationAlpha: number) => void;
  readonly fixedStepSeconds?: number;
  readonly maxFrameDeltaSeconds?: number;
  readonly maxSubSteps?: number;
}

/** Runs fixed-step simulation and variable-rate rendering without per-frame allocations. */
export class GameLoop {
  private readonly fixedUpdate: (stepSeconds: number) => void;
  private readonly render: (interpolationAlpha: number) => void;
  private readonly fixedStepSeconds: number;
  private readonly maxFrameDeltaSeconds: number;
  private readonly maxSubSteps: number;
  private readonly events: EventBus<GameEvents>;
  private readonly onAnimationFrame = (timestampMilliseconds: number): void => {
    this.handleAnimationFrame(timestampMilliseconds);
  };
  private readonly onVisibilityChange = (): void => {
    this.documentVisible = document.visibilityState !== "hidden";
    this.reconcilePauseState("visibility");
  };

  private requestId: number | null = null;
  private previousTimeSeconds: number | null = null;
  private accumulatorSeconds = 0;
  private started = false;
  private paused = false;
  private manuallyPaused = false;
  private documentVisible = document.visibilityState !== "hidden";
  private nativeAppActive = true;
  private destroyed = false;
  private capacitorListener: PluginListenerHandle | null = null;

  public constructor(options: GameLoopOptions, events: EventBus<GameEvents>) {
    this.fixedUpdate = options.fixedUpdate;
    this.render = options.render;
    this.fixedStepSeconds = options.fixedStepSeconds ?? DEFAULT_FIXED_STEP_SECONDS;
    this.maxFrameDeltaSeconds =
      options.maxFrameDeltaSeconds ?? DEFAULT_MAX_FRAME_DELTA_SECONDS;
    this.maxSubSteps = options.maxSubSteps ?? DEFAULT_MAX_SUB_STEPS;
    this.events = events;

    if (!Number.isFinite(this.fixedStepSeconds) || this.fixedStepSeconds <= 0) {
      throw new RangeError("GameLoop fixedStepSeconds must be greater than zero.");
    }

    if (!Number.isFinite(this.maxFrameDeltaSeconds) || this.maxFrameDeltaSeconds <= 0) {
      throw new RangeError("GameLoop maxFrameDeltaSeconds must be greater than zero.");
    }

    if (!Number.isSafeInteger(this.maxSubSteps) || this.maxSubSteps < 1) {
      throw new RangeError("GameLoop maxSubSteps must be a positive integer.");
    }

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.attachCapacitorAppListener();
  }

  public get isRunning(): boolean {
    return this.started && !this.paused;
  }

  public start(): void {
    if (this.destroyed || this.started) {
      return;
    }

    this.started = true;
    this.accumulatorSeconds = 0;
    this.previousTimeSeconds = null;

    const pauseReason = this.getPauseReason();
    this.paused = pauseReason !== null;

    if (pauseReason === null) {
      this.scheduleNextFrame();
      return;
    }

    this.events.emit("game:paused", { reason: pauseReason });
  }

  public pause(): void {
    if (this.destroyed) {
      return;
    }

    this.manuallyPaused = true;
    this.reconcilePauseState("manual");
  }

  public resume(): void {
    if (this.destroyed) {
      return;
    }

    this.manuallyPaused = false;
    this.reconcilePauseState("manual");
  }

  /** Stops the loop but leaves lifecycle listeners attached so it can restart. */
  public stop(): void {
    if (this.requestId !== null) {
      cancelAnimationFrame(this.requestId);
      this.requestId = null;
    }

    this.started = false;
    this.paused = false;
    this.manuallyPaused = false;
    this.accumulatorSeconds = 0;
    this.previousTimeSeconds = null;
  }

  /** Permanently stops the loop and releases browser and Capacitor listeners. */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.stop();
    this.destroyed = true;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    if (this.capacitorListener !== null) {
      void this.capacitorListener.remove();
      this.capacitorListener = null;
    }
  }

  private handleAnimationFrame(timestampMilliseconds: number): void {
    this.requestId = null;

    if (!this.started || this.paused || this.destroyed) {
      return;
    }

    const currentTimeSeconds = timestampMilliseconds * 0.001;

    if (this.previousTimeSeconds === null) {
      this.previousTimeSeconds = currentTimeSeconds;
      this.render(0);
      this.scheduleNextFrame();
      return;
    }

    let frameDeltaSeconds = currentTimeSeconds - this.previousTimeSeconds;
    this.previousTimeSeconds = currentTimeSeconds;

    if (frameDeltaSeconds < 0) {
      frameDeltaSeconds = 0;
    } else if (frameDeltaSeconds > this.maxFrameDeltaSeconds) {
      frameDeltaSeconds = this.maxFrameDeltaSeconds;
    }

    this.accumulatorSeconds += frameDeltaSeconds;
    let subStepCount = 0;

    while (
      this.accumulatorSeconds >= this.fixedStepSeconds &&
      subStepCount < this.maxSubSteps
    ) {
      this.fixedUpdate(this.fixedStepSeconds);
      this.accumulatorSeconds -= this.fixedStepSeconds;
      subStepCount += 1;
    }

    // Drop excess whole steps after a long frame to avoid a catch-up spiral.
    if (subStepCount === this.maxSubSteps && this.accumulatorSeconds >= this.fixedStepSeconds) {
      this.accumulatorSeconds %= this.fixedStepSeconds;
    }

    this.render(this.accumulatorSeconds / this.fixedStepSeconds);
    this.scheduleNextFrame();
  }

  private scheduleNextFrame(): void {
    if (
      this.requestId === null &&
      this.started &&
      !this.paused &&
      !this.destroyed
    ) {
      this.requestId = requestAnimationFrame(this.onAnimationFrame);
    }
  }

  private reconcilePauseState(reason: PauseReason): void {
    if (!this.started || this.destroyed) {
      return;
    }

    const shouldPause = this.getPauseReason() !== null;

    if (shouldPause === this.paused) {
      return;
    }

    this.paused = shouldPause;
    this.accumulatorSeconds = 0;
    this.previousTimeSeconds = null;

    if (shouldPause) {
      if (this.requestId !== null) {
        cancelAnimationFrame(this.requestId);
        this.requestId = null;
      }

      this.events.emit("game:paused", { reason });
      return;
    }

    this.events.emit("game:resumed", { reason });
    this.scheduleNextFrame();
  }

  private getPauseReason(): PauseReason | null {
    if (this.manuallyPaused) {
      return "manual";
    }

    if (!this.documentVisible) {
      return "visibility";
    }

    if (!this.nativeAppActive) {
      return "app-state";
    }

    return null;
  }

  private attachCapacitorAppListener(): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    void App.addListener("appStateChange", ({ isActive }) => {
      this.nativeAppActive = isActive;
      this.reconcilePauseState("app-state");
    })
      .then((listener) => {
        if (this.destroyed) {
          void listener.remove();
          return;
        }

        this.capacitorListener = listener;
      })
      .catch((error: unknown) => {
        console.warn("Could not attach the Capacitor app-state listener.", error);
      });
  }
}
