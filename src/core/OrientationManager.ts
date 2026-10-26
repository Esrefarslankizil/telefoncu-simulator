export class OrientationManager {
  private warningEl: HTMLElement | null = null;
  private fullscreenBtn: HTMLButtonElement | null = null;
  private isPortrait = false;
  private onPause?: (() => void) | undefined;
  private onResume?: (() => void) | undefined;

  constructor(options?: { onPause?: (() => void) | undefined; onResume?: (() => void) | undefined }) {
    this.onPause = options?.onPause;
    this.onResume = options?.onResume;
    this.warningEl = document.getElementById("orientation-warning");
    this.init();
  }

  private init(): void {
    this.checkOrientation();

    window.addEventListener("resize", () => this.handleResize());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.handleResize(), 120);
    });

    if (screen.orientation && "addEventListener" in screen.orientation) {
      try {
        screen.orientation.addEventListener("change", () => {
          setTimeout(() => this.handleResize(), 120);
        });
      } catch (_) {}
    }

    // İlk kullanıcı hareketinde (dokunuş/tıklama) otomatik tam ekran & yatay yön denemesi
    const onFirstGesture = () => {
      this.tryAutoLandscape();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("click", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true, passive: true });
    window.addEventListener("touchstart", onFirstGesture, { once: true, passive: true });
    window.addEventListener("click", onFirstGesture, { once: true, passive: true });

    // Dik modda devam etme butonu dinleyicisi
    this.warningEl?.querySelector(".orientation-dismiss-btn")?.addEventListener("click", () => {
      this.warningEl?.classList.add("hidden");
      this.onResume?.();
    });
  }

  public bindFullscreenButton(btn: HTMLButtonElement | null): void {
    if (!btn) return;
    this.fullscreenBtn = btn;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFullscreen();
    });

    const updateBtn = () => {
      const isFull = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (this.fullscreenBtn) {
        this.fullscreenBtn.textContent = isFull ? "🗗" : "⛶";
        this.fullscreenBtn.title = isFull ? "Tam Ekrandan Çık" : "Tam Ekran (Yatay Mod)";
      }
    };

    document.addEventListener("fullscreenchange", updateBtn);
    document.addEventListener("webkitfullscreenchange", updateBtn);
    updateBtn();
  }

  public async toggleFullscreen(): Promise<void> {
    const doc = document as any;
    const docEl = document.documentElement as any;

    try {
      const isFull = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (!isFull) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        }
        await this.lockLandscape();
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch (_) {}
  }

  public async tryAutoLandscape(): Promise<void> {
    if (this.isStandalone()) return;
    try {
      await this.lockLandscape();
    } catch (_) {}
  }

  private async lockLandscape(): Promise<void> {
    if (screen.orientation && "lock" in screen.orientation) {
      try {
        await (screen.orientation as any).lock("landscape");
      } catch (_) {}
    }
  }

  private isStandalone(): boolean {
    return (
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as any).standalone)
    );
  }

  private handleResize(): void {
    this.checkOrientation();
  }

  public checkOrientation(): boolean {
    if (!this.warningEl) {
      this.warningEl = document.getElementById("orientation-warning");
    }
    // Dikey mod kontrolü: genişlik yükseklikten küçükse
    const isPortrait = window.innerWidth < window.innerHeight;

    if (isPortrait !== this.isPortrait) {
      this.isPortrait = isPortrait;
      if (this.warningEl) {
        if (isPortrait) {
          this.warningEl.classList.remove("hidden");
          this.onPause?.();
        } else {
          this.warningEl.classList.add("hidden");
          this.onResume?.();
        }
      }
    }
    return !isPortrait;
  }
}
