import { CanvasTexture, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { AudioSystem } from "../core/AudioSystem";
import type { BatteryRating, InspectionCategoryId } from "../data/PhoneCatalog";
import { getBatteryRating } from "../data/PhoneCatalog";
import { renderSmartphoneScreen } from "../scene/textures/smartphoneScreen";
import type { CustomerEncounter, PhoneDefect } from "./GameTypes";

export interface InspectionControllerOptions {
  readonly audio: AudioSystem;
  readonly phone: Group;
  readonly phoneScreenMat: MeshStandardMaterial;
  readonly batteryMarker: Mesh;
  readonly cablePlugGroup: Group;
  readonly chargerDockPos: Vector3;
  readonly ammeterDisplayMat: MeshStandardMaterial;
  readonly phoneScreenCanvas: HTMLCanvasElement;
  readonly phoneScreenTexture: CanvasTexture;
  readonly updateBatteryLcd: (mode: "idle" | "testing" | "done", progress?: number, isHealthy?: boolean, healthPct?: number) => void;
  readonly updateCableMesh: (plugged: boolean) => void;
  readonly notify: (msg: string) => void;
  readonly wakeRender: (ms?: number) => void;
  readonly onCategoryInspected: (category: InspectionCategoryId) => void;
}

export class InspectionController {
  public isScreenPoweredOn = false;
  public inCameraApp = false;
  public isChargerPlugged = false;

  private readonly options: InspectionControllerOptions;
  private batteryTestInterval: number | null = null;
  private encounter: CustomerEncounter | null = null;

  private readonly batteryLiveOverlay: HTMLElement;
  private readonly batteryLiveVal: HTMLElement;
  private readonly batteryLiveFill: HTMLElement;
  private readonly cameraLiveOverlay: HTMLElement;

  private readonly screenHint: HTMLElement | null;
  private readonly batteryHint: HTMLElement | null;
  private readonly cameraHint: HTMLElement | null;

  public constructor(shell: HTMLElement, options: InspectionControllerOptions) {
    this.options = options;
    this.batteryLiveOverlay = shell.querySelector<HTMLElement>(".battery-live-overlay")!;
    this.batteryLiveVal = shell.querySelector<HTMLElement>("[data-battery-val]")!;
    this.batteryLiveFill = shell.querySelector<HTMLElement>("[data-battery-fill]")!;
    this.cameraLiveOverlay = shell.querySelector<HTMLElement>(".camera-live-overlay")!;

    this.screenHint = shell.querySelector<HTMLElement>("[data-hint='screen']");
    this.batteryHint = shell.querySelector<HTMLElement>("[data-hint='battery']");
    this.cameraHint = shell.querySelector<HTMLElement>("[data-hint='camera']");

    this.bindButtons(shell);
  }

  public setEncounter(encounter: CustomerEncounter): void {
    this.encounter = encounter;
    this.resetTools();
  }

  public resetTools(): void {
    if (this.batteryTestInterval !== null) {
      clearInterval(this.batteryTestInterval);
      this.batteryTestInterval = null;
    }
    this.batteryLiveOverlay.hidden = true;
    this.cameraLiveOverlay.hidden = true;
    this.options.cablePlugGroup.position.copy(this.options.chargerDockPos);
    this.options.cablePlugGroup.rotation.set(0, 0, 0);
    this.options.updateCableMesh(false);
    this.options.batteryMarker.visible = false;
    this.isChargerPlugged = false;
    this.isScreenPoweredOn = false;
    this.inCameraApp = false;
    this.options.updateBatteryLcd("idle");
    this.updateScreenDisplay();
    this.updateHud();
  }

  public updateScreenDisplay(): void {
    if (!this.encounter) return;
    renderSmartphoneScreen(
      this.options.phoneScreenCanvas,
      this.encounter.phone,
      this.isScreenPoweredOn,
      this.inCameraApp,
      !this.encounter.phone.defects.some((d: PhoneDefect) => d.category === "camera"),
      false,
    );
    this.options.phoneScreenTexture.needsUpdate = true;
  }

  public updateHud(): void {
    if (!this.encounter) return;
    const ph = this.encounter.phone;

    if (ph.inspected["battery"]) {
      const battDefect = ph.defects.find((d: PhoneDefect) => d.category === "battery");
      const battRating = getBatteryRating(ph.batteryHealth, !!battDefect);
      if (this.batteryHint) {
        const isBad = battRating === "ÇOK KÖTÜ" || battRating === "KÖTÜ";
        this.batteryHint.className = "hint-pill " + (isBad ? "warn" : "good");
        this.batteryHint.innerHTML = `<b>${isBad ? "⚠" : "✓"} Batarya:</b> %${ph.batteryHealth} (${battRating})`;
      }
    } else if (this.batteryHint) {
      this.batteryHint.className = "hint-pill";
      this.batteryHint.innerHTML = "<b>⚡ Test Kablosunu Bağla:</b> Batarya Test Cihazı";
    }

    if (ph.inspected["camera"]) {
      const camDef = ph.defects.find((d: PhoneDefect) => d.category === "camera");
      if (this.cameraHint) {
        this.cameraHint.className = "hint-pill " + (camDef ? "warn" : "good");
        this.cameraHint.innerHTML = camDef ? `<b>⚠ Kamera:</b> ${camDef.title}` : "<b>✓ Kamera:</b> Sensör Net";
      }
    } else if (this.cameraHint) {
      this.cameraHint.className = "hint-pill";
      this.cameraHint.innerHTML = "<b>📸 Kamera:</b> Uygulamayı Aç & Test Et";
    }

    if (this.screenHint) {
      this.screenHint.innerHTML = `<b>👆👆 Çift Dokun:</b> Ekranı ${this.isScreenPoweredOn ? "Kapat" : "Aç"}`;
    }
  }

  public runChargerTest(): void {
    this.runBatteryTest3Seconds();
  }

  public runScreenPowerToggle(): void {
    this.options.audio.unlock();
    this.isScreenPoweredOn = !this.isScreenPoweredOn;
    if (!this.isScreenPoweredOn) this.inCameraApp = false;
    this.options.audio.playScreenClick(this.isScreenPoweredOn);
    this.updateScreenDisplay();
    if (this.isScreenPoweredOn) {
      this.options.phoneScreenMat.color.set("#ffffff");
      this.options.notify("📱 Ekran açıldı · Dokunmatik panel ve OLED aktif.");
      window.setTimeout(() => {
        this.options.onCategoryInspected("screen");
        this.updateHud();
      }, 350);
    } else {
      this.options.notify("📱 Ekran kapatıldı.");
      this.updateHud();
    }
    this.options.wakeRender(1200);
  }

  public runCameraTest(): void {
    if (!this.encounter) return;
    this.options.audio.unlock();
    if (!this.isScreenPoweredOn) this.isScreenPoweredOn = true;
    this.inCameraApp = true;
    this.options.audio.playCameraShutter();
    this.updateScreenDisplay();

    const isCamWorking = !this.encounter.phone.defects.some((d: PhoneDefect) => d.category === "camera");
    if (isCamWorking) {
      this.cameraLiveOverlay.className = "camera-live-overlay good";
      this.cameraLiveOverlay.textContent = "📸 KAMERA SAĞLAM · Zemin & vizör net görünüyor!";
      this.cameraLiveOverlay.hidden = false;
      this.options.notify("📸 Kamera açıldı · Sensör sağlam.");
    } else {
      this.cameraLiveOverlay.className = "camera-live-overlay bad";
      this.cameraLiveOverlay.textContent = "⚠ KAMERA HATASI · Siyah ekran, sensör arızalı!";
      this.cameraLiveOverlay.hidden = false;
      this.options.notify("⚠ Kamera açıldı · Siyah ekran! Sensör arızalı.");
    }
    window.setTimeout(() => {
      this.cameraLiveOverlay.hidden = true;
    }, 4000);

    this.options.onCategoryInspected("camera");
    this.updateHud();
    this.options.wakeRender(1200);
  }

  public runPhoneFlip(): void {
    this.options.audio.unlock();
    this.options.audio.playTap();
    this.options.phone.rotation.y = Math.abs(this.options.phone.rotation.y - Math.PI) < 0.8 ? 0 : Math.PI;
    this.options.notify(this.options.phone.rotation.y > 1.5 ? "Arka cam ve kamera adası gösteriliyor." : "Ön ekran gösteriliyor.");
    this.options.wakeRender(1200);
  }

  public destroy(): void {
    if (this.batteryTestInterval !== null) {
      clearInterval(this.batteryTestInterval);
      this.batteryTestInterval = null;
    }
  }

  private runBatteryTest3Seconds(): void {
    if (this.batteryTestInterval !== null) {
      clearInterval(this.batteryTestInterval);
      this.batteryTestInterval = null;
    }
    this.options.audio.unlock();
    this.isChargerPlugged = true;
    this.options.cablePlugGroup.position.set(0.119, 1.278, 0.22);
    this.options.cablePlugGroup.rotation.set(0, 0, 0);
    this.options.updateCableMesh(true);
    this.options.audio.playCablePlug();
    this.options.ammeterDisplayMat.color.set("#38bdf8");

    this.batteryLiveOverlay.hidden = false;
    const heading = this.batteryLiveOverlay.querySelector("strong");
    if (heading) heading.textContent = "⚡ BATARYA ANALİZİ YAPILIYOR...";
    this.batteryLiveVal.style.color = "var(--gold)";
    this.batteryLiveVal.textContent = "%0";
    this.batteryLiveFill.style.width = "0%";
    this.options.notify("⚡ Batarya test kablosu bağlandı. Analiz yapılıyor (3 sn)...");
    this.options.updateBatteryLcd("testing", 0);

    const startTime = performance.now();
    const durationMs = 3000;

    this.batteryTestInterval = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, Math.floor((elapsed / durationMs) * 100));
      this.batteryLiveVal.textContent = `%${progress}`;
      this.batteryLiveFill.style.width = `${progress}%`;
      this.options.audio.playProgressTick(480 + progress * 7);
      this.options.updateBatteryLcd("testing", progress);
      this.options.wakeRender(120);

      if (progress >= 100) {
        if (this.batteryTestInterval !== null) {
          clearInterval(this.batteryTestInterval);
          this.batteryTestInterval = null;
        }
        if (!this.encounter) return;
        const ph = this.encounter.phone;
        const defect = ph.defects.find((d: PhoneDefect) => d.category === "battery");
        const isHealthy = !defect;
        const healthPct = ph.batteryHealth ?? (isHealthy ? 96 : 54);
        const rating: BatteryRating = getBatteryRating(healthPct, !isHealthy);

        this.options.updateBatteryLcd("done", 100, isHealthy, healthPct);

        if (rating === "ÇOK KÖTÜ" || rating === "KÖTÜ") {
          this.options.audio.playDefect();
          if (defect) this.options.batteryMarker.visible = true;
          if (heading) heading.textContent = "⚠ BATARYA ANALİZİ TAMAMLANDI";
          this.batteryLiveVal.textContent = `%${healthPct} · ${rating}`;
          this.batteryLiveVal.style.color = rating === "ÇOK KÖTÜ" ? "#f87171" : "#fb923c";
          this.options.ammeterDisplayMat.color.set("#ef4444");
          this.options.onCategoryInspected("battery");
          this.options.notify(`⚠ Pil Sağlığı %${healthPct} · Durum: ${rating} (${defect?.title || "Aşınmış Batarya"})`);
        } else {
          this.options.audio.playClean();
          if (heading) heading.textContent = "✓ BATARYA ANALİZİ TAMAMLANDI";
          this.batteryLiveVal.textContent = `%${healthPct} · ${rating}`;
          this.batteryLiveVal.style.color = rating === "ÇOK İYİ" ? "#22d3ee" : rating === "İYİ" ? "#4ade80" : "#facc15";
          this.options.ammeterDisplayMat.color.set("#10b981");
          this.options.onCategoryInspected("battery");
          this.options.notify(`✓ Pil Sağlığı %${healthPct} · Durum: ${rating}`);
        }
        this.updateHud();
        window.setTimeout(() => {
          this.batteryLiveOverlay.hidden = true;
        }, 4000);
      }
    }, 60);
  }

  private bindButtons(shell: HTMLElement): void {
    shell.querySelector("[data-tool='charger']")?.addEventListener("click", () => this.runChargerTest());
    shell.querySelector("[data-tool='screen']")?.addEventListener("click", () => this.runScreenPowerToggle());
    shell.querySelector("[data-tool='battery']")?.addEventListener("click", () => this.runBatteryTest3Seconds());
    shell.querySelector("[data-tool='camera']")?.addEventListener("click", () => this.runCameraTest());
    shell.querySelector("[data-tool='flip']")?.addEventListener("click", () => this.runPhoneFlip());
  }
}
