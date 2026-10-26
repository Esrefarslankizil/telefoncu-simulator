import type { WebGLRenderer } from "three";
import type { EventBus } from "../core/EventBus";
import type { GameEvents, QualityPresetName } from "../core/GameEvents";
import type { QualityPreference } from "../core/GameStore";

interface QualityProfile {
  readonly pixelRatioScale: number;
  readonly minimumDynamicScale: number;
}

interface NavigatorWithDeviceMemory extends Navigator {
  readonly deviceMemory?: number;
}

const QUALITY_PROFILES: Record<QualityPresetName, QualityProfile> = {
  low: { pixelRatioScale: 0.8, minimumDynamicScale: 0.55 },
  medium: { pixelRatioScale: 1, minimumDynamicScale: 0.65 },
  high: { pixelRatioScale: 1, minimumDynamicScale: 0.7 },
};

const FRAMES_PER_SAMPLE = 30;
const SLOW_FRAME_WINDOW_SECONDS = 0.033;
const FAST_FRAME_WINDOW_SECONDS = 0.018;
const MIN_DYNAMIC_SCALE_STEP = 0.05;

/** Selects a quality profile and adjusts render resolution when frame time degrades. */
export class QualityManager {
  private readonly renderer: WebGLRenderer;
  private readonly events: EventBus<GameEvents>;
  private preference: QualityPreference;
  private preset: QualityPresetName = "medium";
  private dynamicScale = 1;
  private frameTimeTotal = 0;
  private frameSampleCount = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private destroyed = false;

  private readonly onResize = (): void => {
    this.applyRendererSize();
  };

  public constructor(
    renderer: WebGLRenderer,
    events: EventBus<GameEvents>,
    initialPreference: QualityPreference,
  ) {
    this.renderer = renderer;
    this.events = events;
    this.preference = initialPreference;
    this.preset = initialPreference === "auto" ? this.detectDevicePreset() : initialPreference;

    window.addEventListener("resize", this.onResize, { passive: true });
    this.applyRendererSize();
    this.emitQualityChange(initialPreference === "auto" ? "device" : "user");
  }

  public get currentPreset(): QualityPresetName {
    return this.preset;
  }

  public get currentPreference(): QualityPreference {
    return this.preference;
  }

  public get currentPixelRatio(): number {
    return this.getPixelRatio();
  }

  public setQuality(
    preference: QualityPreference,
    source: "device" | "user" = "user",
  ): void {
    if (this.destroyed) {
      return;
    }

    this.preference = preference;
    this.preset = preference === "auto" ? this.detectDevicePreset() : preference;
    this.dynamicScale = 1;
    this.resetFrameSamples();
    this.applyRendererSize();
    this.emitQualityChange(source);
  }

  /** Feed this once per rendered frame; no arrays or objects are created here. */
  public recordFrame(frameDeltaSeconds: number): void {
    if (this.destroyed || !Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) {
      return;
    }

    this.frameTimeTotal += frameDeltaSeconds;
    this.frameSampleCount += 1;

    if (this.frameSampleCount < FRAMES_PER_SAMPLE) {
      return;
    }

    const averageFrameTime = this.frameTimeTotal / this.frameSampleCount;
    this.frameTimeTotal = 0;
    this.frameSampleCount = 0;

    if (averageFrameTime > SLOW_FRAME_WINDOW_SECONDS) {
      this.slowWindows += 1;
      this.fastWindows = 0;

      if (this.slowWindows >= 2) {
        this.slowWindows = 0;
        this.adjustDynamicScale(-0.1);
      }

      return;
    }

    if (averageFrameTime < FAST_FRAME_WINDOW_SECONDS) {
      this.fastWindows += 1;
      this.slowWindows = 0;

      if (this.fastWindows >= 4) {
        this.fastWindows = 0;
        this.adjustDynamicScale(MIN_DYNAMIC_SCALE_STEP);
      }

      return;
    }

    this.slowWindows = 0;
    this.fastWindows = 0;
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    window.removeEventListener("resize", this.onResize);
  }

  private adjustDynamicScale(change: number): void {
    const profile = QUALITY_PROFILES[this.preset];
    const nextScale = Math.min(1, Math.max(profile.minimumDynamicScale, this.dynamicScale + change));

    if (nextScale === this.dynamicScale) {
      return;
    }

    this.dynamicScale = nextScale;
    this.applyRendererSize();
    this.emitQualityChange("fps");
  }

  private applyRendererSize(): void {
    this.renderer.setPixelRatio(this.getPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private getPixelRatio(): number {
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    return devicePixelRatio * QUALITY_PROFILES[this.preset].pixelRatioScale * this.dynamicScale;
  }

  private detectDevicePreset(): QualityPresetName {
    const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory ?? 4;
    const logicalCores = navigator.hardwareConcurrency || 4;

    if (deviceMemory <= 3 || logicalCores <= 4) {
      return "low";
    }

    if (deviceMemory >= 8 && logicalCores >= 8) {
      return "high";
    }

    return "medium";
  }

  private resetFrameSamples(): void {
    this.frameTimeTotal = 0;
    this.frameSampleCount = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
  }

  private emitQualityChange(source: "device" | "fps" | "user"): void {
    this.events.emit("quality:changed", {
      preset: this.preset,
      pixelRatio: this.getPixelRatio(),
      source,
    });
  }
}
