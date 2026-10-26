import type { WebGLRenderer } from "three";

interface PerformanceWithMemory extends Performance {
  readonly memory?: {
    readonly usedJSHeapSize: number;
  };
}

/** Development-only DOM diagnostics for frame rate and renderer statistics. */
export class DebugOverlay {
  private readonly renderer: WebGLRenderer;
  private readonly element: HTMLDivElement | null;
  private elapsedSeconds = 0;
  private frameCount = 0;

  public constructor(renderer: WebGLRenderer, enabled = import.meta.env.DEV) {
    this.renderer = renderer;

    if (!enabled) {
      this.element = null;
      return;
    }

    const element = document.createElement("div");
    element.className = "debug-overlay";
    element.setAttribute("aria-live", "off");
    element.style.position = "fixed";
    element.style.top = "max(8px, env(safe-area-inset-top))";
    element.style.right = "8px";
    element.style.zIndex = "1000";
    element.style.padding = "7px 9px";
    element.style.border = "1px solid rgba(148, 163, 184, 0.3)";
    element.style.borderRadius = "7px";
    element.style.background = "rgba(15, 23, 42, 0.82)";
    element.style.color = "#e2e8f0";
    element.style.font = "11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace";
    element.style.pointerEvents = "none";
    element.textContent = "FPS -- | Draw -- | Tri --";
    document.body.append(element);
    this.element = element;
  }

  /** Call once per rendered frame; DOM text is refreshed at most twice a second. */
  public update(frameDeltaSeconds: number): void {
    if (this.element === null || !Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds < 0) {
      return;
    }

    this.elapsedSeconds += frameDeltaSeconds;
    this.frameCount += 1;

    if (this.elapsedSeconds < 0.5) {
      return;
    }

    const framesPerSecond = Math.round(this.frameCount / this.elapsedSeconds);
    const renderStats = this.renderer.info.render;
    const heapSize = (performance as PerformanceWithMemory).memory?.usedJSHeapSize;
    const memoryText =
      heapSize === undefined
        ? `GPU ${this.renderer.info.memory.geometries}g/${this.renderer.info.memory.textures}t`
        : `JS ${(heapSize / 1_048_576).toFixed(0)}MB`;

    this.element.textContent =
      `FPS ${framesPerSecond} | Draw ${renderStats.calls} | ` +
      `Tri ${renderStats.triangles} | ${memoryText}`;
    this.elapsedSeconds = 0;
    this.frameCount = 0;
  }

  public destroy(): void {
    this.element?.remove();
  }
}
