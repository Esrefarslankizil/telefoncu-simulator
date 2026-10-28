import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  Color,
} from "three";
import type { Material, Object3D } from "three";
import type { AudioSystem } from "../core/AudioSystem";
import type { GameStore } from "../core/GameStore";
import type { InspectionCategoryId } from "../data/PhoneCatalog";
import { TOOLS, buildSteps } from "./workshopSteps";
import type { StepInfo, ToolId } from "./workshopSteps";
import "./workshop.css";

export interface WorkshopRepairJob {
  readonly uid: string;
  readonly modelKey: string;
  readonly modelLabel: string;
  readonly defectId: string;
  readonly defectCategory: InspectionCategoryId;
  readonly defectTitle: string;
}

export interface RepairWorkshopOptions {
  readonly uiRoot: HTMLElement;
  readonly shopScene: Scene;
  readonly phone: Group;
  readonly phoneBack: Mesh;
  readonly phoneScreen: Mesh;
  readonly store: GameStore;
  readonly audio: AudioSystem;
  readonly getRepairJob: () => WorkshopRepairJob | null;
  readonly onRepairComplete: (job: WorkshopRepairJob) => void;
  readonly onSceneChange: (active: boolean) => void;
}

interface ScrewAnimState {
  readonly group: Group;
  readonly cornerPos: Vector3;
  readonly trayPos: Vector3;
  removed: boolean;
  animProgress: number; // 0 = corner, 1 = tray
  targetRemoved: boolean;
  spinning: number;
}

const PHONE_X = -0.08;
const PHONE_Y = 1.095;
const PHONE_Z = -0.48;

/**
 * Sürükle-bırak ve animasyonlu birinci şahıs Tamir Atölyesi.
 * - Telefonun 4 köşesinde cıvatalar bulunur.
 * - Masanın solunda aletler (Isı Tabancası, Tornavida, Sökme Aparatı, Temizlik Bezi) yer alır.
 * - Masanın sağında aktif arızaya göre 3B Yedek Parça (Ekran, Batarya, Kamera) hazır bekler.
 */
export class RepairWorkshop {
  public readonly scene = new Scene();
  public readonly camera = new PerspectiveCamera(45, innerWidth / Math.max(innerHeight, 1), 0.08, 35);

  private readonly options: RepairWorkshopOptions;
  private readonly canvas = document.querySelector<HTMLCanvasElement>("#game-root canvas");
  private readonly root: HTMLElement;
  private readonly mats: MeshStandardMaterial[] = [];
  private readonly geos: Array<BoxGeometry | CylinderGeometry | PlaneGeometry> = [];
  private readonly pickables: Object3D[] = [];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly workPlane = new Plane(new Vector3(0, 1, 0), -1.16);
  private readonly planeHit = new Vector3();

  private readonly savedPosition = new Vector3();
  private readonly savedRotation = new Vector3();
  private readonly savedScale = new Vector3();
  private readonly back: Mesh;
  private readonly screen: Mesh;

  private readonly toolGroups = new Map<ToolId, Group>();
  private readonly toolHomePos = new Map<ToolId, Vector3>();
  private readonly screws: ScrewAnimState[] = [];
  private readonly dirtMeshes: Mesh[] = [];

  private heatCone!: Mesh;
  private heatGlowMat!: MeshStandardMaterial;
  private internalPcbGroup!: Group;
  private brokenPartGroup!: Group;
  private brokenScreenMesh!: Group;
  private brokenBatteryMesh!: Group;
  private brokenCameraMesh!: Group;
  private newPartGroup!: Group;
  private newScreenMesh!: Group;
  private newBatteryMesh!: Group;
  private newCameraMesh!: Group;
  private testGlowMesh!: Mesh;
  private testGlowMat!: MeshStandardMaterial;

  private readonly newPartHome = new Vector3(0.48, 1.115, -0.42);
  private readonly discardPos = new Vector3(0.48, 1.115, -0.84);
  private readonly phoneCenter = new Vector3(PHONE_X, PHONE_Y, PHONE_Z);

  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly stepsEl: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly progressWrap: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressLabel: HTMLElement;

  private job: WorkshopRepairJob | null = null;
  private stepList: StepInfo[] = buildSteps("battery");
  private step = 0;
  private dwellProgress = 0;
  private active = false;
  private originalVisible = false;
  private phoneMoved = false;
  private timer = 0;
  private animClock = 0;
  private soundCooldown = 0;

  // Sürüklenen nesne durumu
  private draggingKind: "none" | "tool" | "newPart" | "brokenPart" | "screw" = "none";
  private draggingTool: ToolId | null = null;
  private draggingScrewIdx = -1;
  private pointerWorld = new Vector3(PHONE_X, 1.16, PHONE_Z);
  private isOverPhone = false;

  // Parça animasyon hedefleri
  private brokenPartTarget = new Vector3(PHONE_X, 1.118, PHONE_Z);
  private newPartTarget = new Vector3(0.48, 1.115, -0.42);
  private isTestingAnim = false;
  private testAnimTimer = 0;

  public constructor(options: RepairWorkshopOptions) {
    this.options = options;
    this.back = options.phoneBack;
    this.screen = options.phoneScreen;
    this.scene.background = new Color("#182426");
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0.05, 3.65, -0.48);
    this.camera.lookAt(0.05, 1.08, -0.48);

    this.buildRoom();

    this.root = document.createElement("div");
    this.root.className = "workshop-ui";
    this.root.innerHTML =
      '<nav class="workshop-tabs" aria-label="Oda seçimi">' +
      '<button data-room="counter" type="button">Müşteri Tezgâhı <kbd>1</kbd></button>' +
      '<button data-room="workshop" type="button">Tamir Atölyesi <kbd>2</kbd></button>' +
      "</nav>" +
      '<div class="workshop-progress-badge" data-progress-wrap hidden>' +
      '<span data-progress-label>İŞLEM YAPILIYOR...</span>' +
      '<div class="workshop-progress-bar"><div class="workshop-progress-fill" data-progress-fill></div></div>' +
      "</div>" +
      '<aside class="workshop-panel">' +
      "<small>TAMİR MASASI</small>" +
      "<h2 data-title></h2>" +
      "<p data-hint></p>" +
      '<div class="workshop-job"><span>MODEL</span><b data-model>—</b><span>ARIZA</span><b data-defect>—</b></div>' +
      '<div class="workshop-tools">' +
      TOOLS.map((t) => '<button type="button" data-tool="' + t.id + '"><i style="--tool:' + t.color + '"></i>' + t.label + "</button>").join("") +
      "</div>" +
      '<div class="workshop-steps" data-steps></div>' +
      '<button class="workshop-action" data-action type="button"></button>' +
      "</aside>" +
      '<div class="workshop-tooltip">Aleti veya parçayı basılı tutup telefonun üzerine sürükle</div>' +
      '<div class="workshop-toast" aria-live="polite"></div>';

    options.uiRoot.append(this.root);
    this.title = this.root.querySelector("[data-title]")!;
    this.hint = this.root.querySelector("[data-hint]")!;
    this.stepsEl = this.root.querySelector("[data-steps]")!;
    this.toast = this.root.querySelector(".workshop-toast")!;
    this.action = this.root.querySelector<HTMLButtonElement>("[data-action]")!;
    this.progressWrap = this.root.querySelector<HTMLElement>("[data-progress-wrap]")!;
    this.progressFill = this.root.querySelector<HTMLElement>("[data-progress-fill]")!;
    this.progressLabel = this.root.querySelector<HTMLElement>("[data-progress-label]")!;

    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const room = target.closest<HTMLButtonElement>("[data-room]")?.dataset["room"];
      if (room === "counter") this.leave();
      else if (room === "workshop") this.enter();

      const toolBtn = target.closest<HTMLButtonElement>("[data-tool]")?.dataset["tool"] as ToolId | undefined;
      if (toolBtn) this.quickUseTool(toolBtn);
    });

    this.action.addEventListener("click", () => this.handleActionBtn());
    this.canvas?.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    this.updateUi();
  }

  public get isWorkshopActive(): boolean {
    return this.active;
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  public enter(): void {
    if (this.active) return;
    const job = this.options.getRepairJob();
    if (job && (job.uid !== this.job?.uid || job.defectId !== this.job?.defectId)) {
      this.startJob(job);
    } else if (!job) {
      this.job = null;
      this.resetBenchVisuals(null);
    }

    if (job) {
      const phone = this.options.phone;
      this.phoneMoved = true;
      this.savedPosition.copy(phone.position);
      this.savedRotation.set(phone.rotation.x, phone.rotation.y, phone.rotation.z);
      this.savedScale.copy(phone.scale);
      this.originalVisible = phone.visible;
      this.scene.add(phone);
      phone.position.set(PHONE_X, PHONE_Y, PHONE_Z);
      phone.rotation.set(0, 0, 0);
      phone.scale.setScalar(1.65);
      phone.visible = true;
    }

    this.active = true;
    this.root.classList.add("active");
    this.options.uiRoot.classList.add("workshop-active");
    this.options.onSceneChange(true);
    this.updateUi();
  }

  public leave(): void {
    if (!this.active) return;
    this.releaseDrag();
    if (this.phoneMoved) {
      const phone = this.options.phone;
      this.screen.visible = true;
      this.back.visible = true;
      this.options.shopScene.add(phone);
      phone.position.copy(this.savedPosition);
      phone.rotation.set(this.savedRotation.x, this.savedRotation.y, this.savedRotation.z);
      phone.scale.copy(this.savedScale);
      phone.visible = this.originalVisible;
      this.phoneMoved = false;
    }
    this.active = false;
    this.root.classList.remove("active");
    this.options.uiRoot.classList.remove("workshop-active");
    this.options.audio.playTap();
    this.options.onSceneChange(false);
    this.updateUi();
  }

  public destroy(): void {
    if (this.active) this.leave();
    this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.clearTimeout(this.timer);
    this.root.remove();
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }

  /** Her karede alet, cıvata, ısı tabancası, temizlik ve parça animasyonlarını günceller. */
  public update(dt: number): void {
    if (!this.active) return;
    this.animClock += dt;
    if (this.soundCooldown > 0) this.soundCooldown -= dt;

    // 1. 4 köşedeki cıvataların sökülme / takılma uçuş ve dönme animasyonu
    for (const s of this.screws) {
      const goal = s.targetRemoved ? 1 : 0;
      if (Math.abs(s.animProgress - goal) > 0.004) {
        const dir = goal > s.animProgress ? 1 : -1;
        s.animProgress = Math.max(0, Math.min(1, s.animProgress + dir * dt * 2.8));
        s.group.rotation.y += dt * 32 * dir;
      } else {
        s.animProgress = goal;
      }
      if (s.spinning > 0) {
        s.group.rotation.y += dt * 28;
        s.spinning = Math.max(0, s.spinning - dt);
      }

      if (this.draggingKind === "screw" && this.screws[this.draggingScrewIdx] === s) {
        s.group.position.lerp(new Vector3(this.pointerWorld.x, 1.24, this.pointerWorld.z), 0.35);
      } else {
        const arcLift = Math.sin(s.animProgress * Math.PI) * 0.22;
        s.group.position.lerpVectors(s.cornerPos, s.trayPos, s.animProgress);
        s.group.position.y += arcLift;
      }
    }

    // 2. Aletlerin sürükleme veya yuvaya dönüş animasyonu
    for (const [id, group] of this.toolGroups.entries()) {
      const home = this.toolHomePos.get(id)!;
      if (this.draggingKind === "tool" && this.draggingTool === id) {
        const wobbleX = this.isOverPhone ? Math.sin(this.animClock * 16) * 0.035 : 0;
        const wobbleZ = this.isOverPhone ? Math.cos(this.animClock * 14) * 0.035 : 0;
        const targetPos = new Vector3(this.pointerWorld.x + wobbleX, 1.24, this.pointerWorld.z + wobbleZ);
        group.position.lerp(targetPos, 0.35);
        if (id === "screwdriver" && this.isOverPhone) {
          group.rotation.z = Math.sin(this.animClock * 30) * 0.25;
        } else {
          group.rotation.z *= 0.85;
        }
      } else {
        group.position.lerp(home, 0.22);
        group.rotation.set(0, 0, 0);
      }
    }

    // Isı tabancası sıcak hava efekt hunisi
    const heatingActive =
      this.draggingKind === "tool" &&
      this.draggingTool === "heatGun" &&
      this.isOverPhone &&
      this.currentStep?.id === "heat";
    this.heatCone.visible = heatingActive;
    if (heatingActive) {
      const pulse = 0.85 + Math.sin(this.animClock * 22) * 0.2;
      this.heatCone.scale.set(pulse, 1 + Math.sin(this.animClock * 18) * 0.15, pulse);
      this.heatGlowMat.emissiveIntensity = 1.2 + Math.sin(this.animClock * 25) * 0.5;
    }

    // 3. Arızalı parça & yeni yedek parça pozisyon interpolasyonu
    if (this.draggingKind === "brokenPart") {
      this.brokenPartGroup.position.lerp(new Vector3(this.pointerWorld.x, 1.24, this.pointerWorld.z), 0.35);
    } else {
      this.brokenPartGroup.position.lerp(this.brokenPartTarget, 0.2);
    }

    if (this.draggingKind === "newPart") {
      this.newPartGroup.position.lerp(new Vector3(this.pointerWorld.x, 1.24, this.pointerWorld.z), 0.35);
    } else {
      this.newPartGroup.position.lerp(this.newPartTarget, 0.22);
    }

    // 4. Telefonun üzerinde aktif işlem ilerlemesi (Dwell sistemi)
    this.updateActiveStepWork(dt);

    // 5. Test ekran parlama animasyonu
    if (this.isTestingAnim) {
      this.testAnimTimer += dt;
      this.testGlowMesh.visible = true;
      this.testGlowMat.emissiveIntensity = 0.9 + Math.sin(this.testAnimTimer * 18) * 0.4;
      if (this.testAnimTimer >= 1.1) {
        this.isTestingAnim = false;
        this.testGlowMesh.visible = false;
        this.completeTestStep();
      }
    }
  }

  private get currentStep(): StepInfo | undefined {
    return this.stepList[this.step];
  }

  private updateActiveStepWork(dt: number): void {
    const cur = this.currentStep;
    if (!this.job || !cur || cur.id === "done" || cur.id === "test") {
      this.progressWrap.hidden = true;
      return;
    }

    const dwellNeeded = cur.dwell ?? 1.2;
    let working = false;
    let statusText = cur.label.toUpperCase();

    if (cur.id === "heat" && this.draggingKind === "tool" && this.draggingTool === "heatGun" && this.isOverPhone) {
      working = true;
      statusText = "🔥 KASA ISITILIYOR...";
      if (this.soundCooldown <= 0) {
        this.options.audio.playProgressTick(420 + this.dwellProgress * 220);
        this.soundCooldown = 0.14;
      }
    } else if (
      cur.id === "screwsOut" &&
      this.isOverPhone &&
      ((this.draggingKind === "tool" && this.draggingTool === "screwdriver") || this.draggingKind === "screw")
    ) {
      working = true;
      statusText = "🔩 CIVATALAR SÖKÜLÜYOR...";
      this.syncScrewsToProgress(this.dwellProgress / dwellNeeded, true);
      if (this.soundCooldown <= 0) {
        this.options.audio.playScrewdriver();
        this.soundCooldown = 0.22;
      }
    } else if (
      cur.id === "remove" &&
      this.isOverPhone &&
      ((this.draggingKind === "tool" && this.draggingTool === "remover") || this.draggingKind === "brokenPart")
    ) {
      working = true;
      statusText = "🔧 ARIZALI PARÇA ÇIKARILIYOR...";
      this.brokenPartTarget.set(
        PHONE_X + (this.dwellProgress / dwellNeeded) * 0.25,
        1.14 + (this.dwellProgress / dwellNeeded) * 0.1,
        PHONE_Z,
      );
      if (this.soundCooldown <= 0) {
        this.options.audio.playProgressTick(520);
        this.soundCooldown = 0.18;
      }
    } else if (cur.id === "clean" && this.draggingKind === "tool" && this.draggingTool === "cleaner" && this.isOverPhone) {
      working = true;
      statusText = "✨ YUVA TEMİZLENİYOR...";
      const ratio = Math.max(0, 1 - this.dwellProgress / dwellNeeded);
      this.dirtMeshes.forEach((m, idx) => {
        const s = Math.max(0.01, ratio - idx * 0.12);
        m.scale.setScalar(Math.max(0.01, s));
        m.visible = s > 0.05;
      });
      if (this.soundCooldown <= 0) {
        this.options.audio.playProgressTick(680);
        this.soundCooldown = 0.16;
      }
    } else if (cur.id === "install" && this.draggingKind === "newPart" && this.isOverPhone) {
      working = true;
      statusText = "🧩 YENİ PARÇA TAKILIYOR...";
      if (this.soundCooldown <= 0) {
        this.options.audio.playProgressTick(760);
        this.soundCooldown = 0.16;
      }
    } else if (
      cur.id === "screwsIn" &&
      this.isOverPhone &&
      ((this.draggingKind === "tool" && this.draggingTool === "screwdriver") || this.draggingKind === "screw")
    ) {
      working = true;
      statusText = "🔩 CIVATALAR SIKILIYOR...";
      this.syncScrewsToProgress(this.dwellProgress / dwellNeeded, false);
      if (this.soundCooldown <= 0) {
        this.options.audio.playScrewdriver();
        this.soundCooldown = 0.22;
      }
    }

    if (working) {
      this.dwellProgress += dt;
      const pct = Math.min(100, Math.round((this.dwellProgress / dwellNeeded) * 100));
      this.progressWrap.hidden = false;
      this.progressLabel.textContent = `${statusText} %${pct}`;
      this.progressFill.style.width = `${pct}%`;

      if (this.dwellProgress >= dwellNeeded) {
        this.dwellProgress = 0;
        this.progressWrap.hidden = true;
        this.completeCurrentStep();
      }
    } else if (this.dwellProgress > 0) {
      const pct = Math.min(100, Math.round((this.dwellProgress / dwellNeeded) * 100));
      this.progressWrap.hidden = false;
      this.progressLabel.textContent = `${cur.label.toUpperCase()} (%${pct}) — Telefonun Üzerine Getir`;
      this.progressFill.style.width = `${pct}%`;
    } else {
      this.progressWrap.hidden = true;
    }
  }

  private syncScrewsToProgress(ratio: number, removing: boolean): void {
    const count = Math.min(4, Math.floor(ratio * 4) + 1);
    for (let i = 0; i < count; i++) {
      const s = this.screws[i]!;
      s.spinning = 0.25;
      if (i < Math.floor(ratio * 4)) {
        s.removed = removing;
        s.targetRemoved = removing;
      }
    }
  }

  private completeCurrentStep(): void {
    const cur = this.currentStep;
    if (!cur || !this.job) return;

    if (cur.id === "heat") {
      this.options.audio.playClean();
      this.notify("🔥 Kasa ısıtıldı, yapışkan gevşedi. Şimdi köşelerdeki 4 cıvatayı sök.");
    } else if (cur.id === "screwsOut") {
      this.screws.forEach((s) => {
        s.removed = true;
        s.targetRemoved = true;
      });
      this.screen.visible = false;
      this.internalPcbGroup.visible = true;
      this.brokenPartGroup.visible = true;
      this.dirtMeshes.forEach((m) => {
        m.visible = true;
        m.scale.setScalar(1);
      });
      this.options.audio.playClean();
      this.notify("🔩 4 cıvata söküldü ve iç yuva açıldı! Arızalı parçayı çıkar.");
    } else if (cur.id === "remove") {
      this.brokenPartTarget.copy(this.discardPos);
      this.options.audio.playClean();
      this.notify("🔧 Arızalı parça çıkarıldı. Şimdi temizlik beziyle yuvayı temizle.");
    } else if (cur.id === "clean") {
      this.dirtMeshes.forEach((m) => (m.visible = false));
      this.options.audio.playClean();
      this.notify("✨ Yuva tertemiz oldu! Masadaki yeni parçayı tutup telefona tak.");
    } else if (cur.id === "install") {
      this.newPartTarget.set(PHONE_X, 1.12, PHONE_Z);
      this.options.audio.playCablePlug();
      this.notify("🧩 Yeni parça yerine oturdu! Şimdi cıvataları geri tak.");
    } else if (cur.id === "screwsIn") {
      this.screws.forEach((s) => {
        s.removed = false;
        s.targetRemoved = false;
      });
      this.internalPcbGroup.visible = false;
      this.brokenPartGroup.visible = false;
      this.newPartGroup.visible = false;
      this.screen.visible = true;
      this.back.visible = true;
      this.options.audio.playClean();
      this.notify("🔩 Cıvatalar sıkıldı ve kasa kapatıldı. Şimdi cihazı test et!");
    }

    this.releaseDrag();
    this.step = Math.min(this.stepList.length - 1, this.step + 1);
    this.updateUi();
  }

  private startTestStep(): void {
    if (!this.job || this.currentStep?.id !== "test" || this.isTestingAnim) return;
    this.isTestingAnim = true;
    this.testAnimTimer = 0;
    this.options.audio.playScan();
    this.notify("⚡ Cihaz açılıyor ve yeni parça test ediliyor...");
  }

  private completeTestStep(): void {
    if (!this.job) return;
    this.step = this.stepList.length - 1;
    this.options.onRepairComplete(this.job);
    this.options.audio.playCash();
    this.notify("✓ Test başarılı! Parça kusursuz çalışıyor. Tezgâha dönüp müşteriye teslim et.");
    this.updateUi();
  }

  private quickUseTool(toolId: ToolId): void {
    if (!this.job) {
      this.notify("Önce tezgâhta tamir müşterisi olmalı.");
      return;
    }
    const cur = this.currentStep;
    if (!cur) return;
    if (cur.tool === toolId) {
      this.notify(TOOLS.find((t) => t.id === toolId)!.label + " seçildi — telefonun üzerine sürükle veya işlem butonuna bas.");
    } else {
      this.notify("Şu anki adım: " + cur.label + " (" + cur.hint + ")");
    }
    this.updateUi();
  }

  private handleActionBtn(): void {
    if (!this.job) {
      this.notify("Önce tezgâhta tamir müşterisi olmalı.");
      return;
    }
    const cur = this.currentStep;
    if (!cur) return;
    if (cur.id === "done") {
      this.leave();
      return;
    }
    if (cur.id === "test") {
      this.startTestStep();
      return;
    }
    this.dwellProgress = 0;
    this.completeCurrentStep();
  }

  private buildRoom(): void {
    const mat = (c: string, r = 0.72, m = 0): MeshStandardMaterial => this.material(c, r, m);
    this.box(this.scene, [14, 0.08, 14], [0, -0.08, 0], mat("#485352"));
    const wall = mat("#d0d3c9");
    const metal = mat("#879397", 0.38, 0.65);
    const dark = mat("#263133");

    this.box(this.scene, [12, 5.5, 0.18], [0, 2.75, -3.2], wall);
    this.box(this.scene, [0.18, 5.5, 6.4], [-6, 2.75, 0], wall);
    this.box(this.scene, [0.18, 5.5, 6.4], [6, 2.75, 0], wall);

    this.scene.add(new AmbientLight("#dce9e4", 1.55));
    const light = new DirectionalLight("#ffe5bd", 1.85);
    light.position.set(-1.5, 5.2, 2.5);
    this.scene.add(light);

    // Tamir masası ve ESD antistatik mat
    this.box(this.scene, [3.8, 0.16, 2.2], [0, 0.91, -0.48], mat("#53443a"));
    this.box(this.scene, [3.85, 0.08, 2.3], [0, 1.03, -0.48], metal);
    this.box(this.scene, [3.2, 0.018, 1.75], [0, 1.08, -0.48], mat("#163934"));

    // Mat kılavuz çizgileri
    for (let i = 0; i < 5; i++) {
      this.box(this.scene, [0.008, 0.004, 1.65], [-1.25 + i * 0.62, 1.091, -0.48], mat("#2f685d"));
    }
    for (let i = 0; i < 4; i++) {
      this.box(this.scene, [3.05, 0.004, 0.008], [0, 1.091, -1.18 + i * 0.47], mat("#2f685d"));
    }

    // Sol manyetik cıvata tepsisi (Cıvatalar sökülünce buraya dizilir)
    this.box(this.scene, [0.22, 0.008, 0.56], [-0.56, 1.093, PHONE_Z], mat("#1f2937", 0.4, 0.5));
    this.box(this.scene, [0.18, 0.004, 0.52], [-0.56, 1.097, PHONE_Z], mat("#0f766e", 0.6, 0.2));

    // Sağ yedek parça tepsisi ve çıkma parça alanı
    this.box(this.scene, [0.42, 0.008, 0.48], [0.48, 1.093, -0.42], mat("#1e293b", 0.5, 0.3));
    this.box(this.scene, [0.38, 0.004, 0.44], [0.48, 1.097, -0.42], mat("#115e59", 0.65, 0.15));
    this.box(this.scene, [0.36, 0.006, 0.32], [0.48, 1.093, -0.84], mat("#3b1d1d", 0.6, 0.2));

    // 1. TELEFONUN 4 KÖŞESİNDEKİ CIVATALAR (Başlangıçta telefonun 4 köşesinde durur)
    const screwSteel = mat("#e2e8f0", 0.22, 0.88);
    const screwSlotMat = mat("#0f172a", 0.5, 0.2);
    const cornerOffsets: ReadonlyArray<[number, number]> = [
      [-0.175, -0.29],
      [0.175, -0.29],
      [-0.175, 0.29],
      [0.175, 0.29],
    ];
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = cornerOffsets[i]!;
      const cornerPos = new Vector3(PHONE_X + dx, 1.118, PHONE_Z + dz);
      const trayPos = new Vector3(-0.56, 1.115, PHONE_Z - 0.195 + i * 0.13);
      const g = new Group();
      g.position.copy(cornerPos);
      g.userData["screwIndex"] = i;
      g.userData["tooltip"] = `Köşe Cıvatası #${i + 1} (Tornavidayla veya tutup sürükleyerek sök/tak)`;

      // Cıvata gövdesi, başlığı ve yıldız (+) yarığı
      this.cylinder(g, 0.014, 0.022, [0, 0, 0], screwSteel);
      this.cylinder(g, 0.028, 0.01, [0, 0.012, 0], screwSteel);
      this.box(g, [0.036, 0.004, 0.007], [0, 0.018, 0], screwSlotMat);
      this.box(g, [0.007, 0.004, 0.036], [0, 0.018, 0], screwSlotMat);

      // Kolay yakalama için görünmez geniş dokunma kutusu
      const hit = this.box(g, [0.13, 0.08, 0.13], [0, 0.01, 0], mat("#ffffff"));
      (hit.material as MeshStandardMaterial).transparent = true;
      (hit.material as MeshStandardMaterial).opacity = 0;

      this.scene.add(g);
      this.pickables.push(g);
      this.screws.push({
        group: g,
        cornerPos,
        trayPos,
        removed: false,
        animProgress: 0,
        targetRemoved: false,
        spinning: 0,
      });
    }

    // 2. TELEFON İÇ YUVASI (Anakart, Kir Lekeleri, Arızalı Parça, Test Ekran Işığı)
    this.buildPhoneInternals(mat, metal, dark);

    // 3. MASADAKİ 3B YEDEK PARÇALAR (Ekran, Batarya, Kamera)
    this.buildReplacementPartsOnTable(mat, metal, dark);

    // 4. MASADAKİ 3B TAMİR ALETLERİ (Isı Tabancası, Tornavida, Sökme Aparatı, Temizlik Bezi)
    this.buildToolsOnTable(mat);

    // Masa lambası
    this.box(this.scene, [0.06, 0.54, 0.06], [-1.48, 1.45, -0.95], metal);
    this.cylinder(this.scene, 0.2, 0.08, [-1.48, 1.77, -0.95], mat("#e7bd66"));
  }

  private buildPhoneInternals(
    mat: (c: string, r?: number, m?: number) => MeshStandardMaterial,
    metal: MeshStandardMaterial,
    dark: MeshStandardMaterial,
  ): void {
    // Anakart iç yuva (Cıvatalar sökülünce görünür)
    this.internalPcbGroup = new Group();
    this.internalPcbGroup.position.set(PHONE_X, 1.112, PHONE_Z);
    this.internalPcbGroup.visible = false;
    this.scene.add(this.internalPcbGroup);

    this.box(this.internalPcbGroup, [0.27, 0.008, 0.56], [0, 0, 0], mat("#0f3d36", 0.55, 0.25));
    this.box(this.internalPcbGroup, [0.09, 0.012, 0.14], [-0.06, 0.005, -0.14], dark);
    this.box(this.internalPcbGroup, [0.08, 0.011, 0.08], [0.06, 0.005, 0.16], metal);
    this.box(this.internalPcbGroup, [0.04, 0.012, 0.06], [-0.05, 0.005, 0.15], mat("#d5b36c", 0.3, 0.8));

    // Temizlenecek termal macun / toz lekeleri
    const dirtMat = mat("#7c5836", 0.9, 0);
    const dirtCoords: ReadonlyArray<[number, number]> = [
      [-0.05, -0.06],
      [0.05, 0.02],
      [-0.03, 0.11],
      [0.04, -0.14],
    ];
    for (const [dx, dz] of dirtCoords) {
      const d = this.cylinder(this.internalPcbGroup, 0.042, 0.006, [dx, 0.008, dz], dirtMat);
      this.dirtMeshes.push(d);
    }

    // Telefondan çıkarılacak arızalı parça grubu
    this.brokenPartGroup = new Group();
    this.brokenPartGroup.position.set(PHONE_X, 1.122, PHONE_Z);
    this.brokenPartGroup.userData["brokenPart"] = true;
    this.brokenPartGroup.userData["tooltip"] = "Arızalı Parça (Sökme aparatıyla veya tutup dışarı çekerek çıkar)";
    this.brokenPartGroup.visible = false;
    this.scene.add(this.brokenPartGroup);
    this.pickables.push(this.brokenPartGroup);

    const hitBroken = this.box(this.brokenPartGroup, [0.32, 0.08, 0.58], [0, 0.02, 0], mat("#ffffff"));
    (hitBroken.material as MeshStandardMaterial).transparent = true;
    (hitBroken.material as MeshStandardMaterial).opacity = 0;

    // A) Arızalı Ekran (Çatlak izli koyu cam)
    this.brokenScreenMesh = new Group();
    this.box(this.brokenScreenMesh, [0.26, 0.012, 0.54], [0, 0, 0], mat("#1e293b", 0.25, 0.4));
    const crackLine1 = this.box(this.brokenScreenMesh, [0.006, 0.015, 0.36], [0.02, 0.002, -0.03], mat("#f87171", 0.3, 0.2));
    crackLine1.rotation.y = 0.42;
    const crackLine2 = this.box(this.brokenScreenMesh, [0.006, 0.015, 0.24], [-0.04, 0.002, 0.08], mat("#fca5a5", 0.3, 0.2));
    crackLine2.rotation.y = -0.55;
    this.brokenPartGroup.add(this.brokenScreenMesh);

    // B) Arızalı Batarya (Şişmiş/kırmızı uyarı etiketli pil)
    this.brokenBatteryMesh = new Group();
    this.box(this.brokenBatteryMesh, [0.16, 0.022, 0.34], [0.01, 0, 0.02], mat("#334155", 0.4, 0.3));
    this.box(this.brokenBatteryMesh, [0.13, 0.025, 0.24], [0.01, 0.002, 0.02], mat("#dc2626", 0.5, 0.1));
    this.brokenPartGroup.add(this.brokenBatteryMesh);

    // C) Arızalı Kamera Modülü
    this.brokenCameraMesh = new Group();
    this.box(this.brokenCameraMesh, [0.13, 0.022, 0.15], [-0.04, 0, -0.15], mat("#1f2937", 0.35, 0.5));
    this.cylinder(this.brokenCameraMesh, 0.028, 0.026, [-0.06, 0.004, -0.17], mat("#ef4444", 0.3, 0.4));
    this.cylinder(this.brokenCameraMesh, 0.028, 0.026, [-0.02, 0.004, -0.12], mat("#7f1d1d", 0.3, 0.4));
    this.brokenPartGroup.add(this.brokenCameraMesh);

    // Test adımı için yeşil onay ekran parlaması
    this.testGlowMat = new MeshStandardMaterial({
      color: "#10b981",
      emissive: new Color("#10b981"),
      emissiveIntensity: 1.1,
      roughness: 0.2,
    });
    this.mats.push(this.testGlowMat);
    this.testGlowMesh = this.box(this.scene, [0.28, 0.006, 0.58], [PHONE_X, 1.126, PHONE_Z], this.testGlowMat);
    this.testGlowMesh.visible = false;
  }

  private buildReplacementPartsOnTable(
    mat: (c: string, r?: number, m?: number) => MeshStandardMaterial,
    metal: MeshStandardMaterial,
    dark: MeshStandardMaterial,
  ): void {
    this.newPartGroup = new Group();
    this.newPartGroup.position.copy(this.newPartHome);
    this.newPartGroup.userData["newPart"] = true;
    this.newPartGroup.userData["tooltip"] = "Yeni Yedek Parça (Basılı tutup telefonun üzerine sürükle)";
    this.scene.add(this.newPartGroup);
    this.pickables.push(this.newPartGroup);

    const hitNew = this.box(this.newPartGroup, [0.38, 0.1, 0.52], [0, 0.02, 0], mat("#ffffff"));
    (hitNew.material as MeshStandardMaterial).transparent = true;
    (hitNew.material as MeshStandardMaterial).opacity = 0;

    // 1. Yeni Ekran Paneli (Parlak OLED cam + altın flex kablo)
    this.newScreenMesh = new Group();
    this.box(this.newScreenMesh, [0.27, 0.014, 0.52], [0, 0.006, 0], mat("#0f172a", 0.12, 0.85));
    this.box(this.newScreenMesh, [0.24, 0.016, 0.48], [0, 0.007, 0], mat("#0ea5e9", 0.18, 0.3));
    this.box(this.newScreenMesh, [0.05, 0.008, 0.09], [0.06, 0.004, 0.27], mat("#d97706", 0.35, 0.6));
    this.newPartGroup.add(this.newScreenMesh);

    // 2. Yeni Batarya Hücresi (Sağlam yeşil/altın şeritli batarya + soket flexi)
    this.newBatteryMesh = new Group();
    this.box(this.newBatteryMesh, [0.18, 0.024, 0.36], [0, 0.01, 0], dark);
    this.box(this.newBatteryMesh, [0.15, 0.026, 0.26], [0, 0.011, 0], mat("#10b981", 0.35, 0.2));
    this.box(this.newBatteryMesh, [0.12, 0.027, 0.05], [0, 0.012, -0.08], mat("#f59e0b", 0.3, 0.4));
    this.box(this.newBatteryMesh, [0.035, 0.012, 0.07], [0.04, 0.01, -0.2], mat("#d97706", 0.3, 0.7));
    this.newPartGroup.add(this.newBatteryMesh);

    // 3. Yeni Kamera Modülü (Metalik ada + 3 parlak lens halkası)
    this.newCameraMesh = new Group();
    this.box(this.newCameraMesh, [0.18, 0.024, 0.22], [0, 0.01, 0], metal);
    for (const [lx, lz] of [
      [-0.045, -0.055],
      [-0.045, 0.055],
      [0.045, 0],
    ] as const) {
      this.cylinder(this.newCameraMesh, 0.036, 0.028, [lx, 0.016, lz], mat("#cbd5e1", 0.2, 0.9));
      this.cylinder(this.newCameraMesh, 0.026, 0.03, [lx, 0.017, lz], mat("#0284c7", 0.1, 0.95));
    }
    this.box(this.newCameraMesh, [0.04, 0.01, 0.08], [0, 0.008, 0.14], mat("#d97706", 0.35, 0.6));
    this.newPartGroup.add(this.newCameraMesh);
  }

  private buildToolsOnTable(mat: (c: string, r?: number, m?: number) => MeshStandardMaterial): void {
    const steel = mat("#cbd5e1", 0.25, 0.85);
    const makeTool = (id: ToolId, label: string, pos: [number, number, number]): Group => {
      const g = new Group();
      const home = new Vector3(...pos);
      g.position.copy(home);
      g.userData["tool"] = id;
      g.userData["tooltip"] = `${label} (Basılı tutup telefonun üzerine getir)`;
      const hit = this.box(g, [0.28, 0.1, 0.28], [0, 0.02, 0], mat("#ffffff"));
      (hit.material as MeshStandardMaterial).transparent = true;
      (hit.material as MeshStandardMaterial).opacity = 0;
      this.scene.add(g);
      this.pickables.push(g);
      this.toolGroups.set(id, g);
      this.toolHomePos.set(id, home);
      return g;
    };

    // 1. Isı Tabancası (Turuncu gövde + metal namlu + sıcak hava hunisi)
    const gun = makeTool("heatGun", "Isı Tabancası", [-0.98, 1.12, -0.84]);
    this.box(gun, [0.18, 0.08, 0.14], [-0.03, 0.02, 0], mat("#ea580c", 0.4, 0.2));
    this.box(gun, [0.07, 0.06, 0.14], [-0.07, 0.01, 0.1], mat("#1e293b", 0.6, 0.1));
    const nozzle = this.cylinder(gun, 0.032, 0.12, [0.09, 0.025, 0], steel);
    nozzle.rotation.z = Math.PI / 2;

    this.heatGlowMat = new MeshStandardMaterial({
      color: "#fb923c",
      emissive: new Color("#f97316"),
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.65,
    });
    this.mats.push(this.heatGlowMat);
    this.heatCone = this.cylinder(gun, 0.085, 0.22, [0.22, 0.025, 0], this.heatGlowMat);
    this.heatCone.rotation.z = Math.PI / 2;
    this.heatCone.visible = false;

    // 2. Hassas Tornavida
    const driver = makeTool("screwdriver", "Hassas Tornavida", [-0.98, 1.12, -0.56]);
    const handle = this.cylinder(driver, 0.028, 0.2, [-0.05, 0.02, 0], mat("#eab308", 0.35, 0.3));
    handle.rotation.z = Math.PI / 2;
    const shaft = this.cylinder(driver, 0.009, 0.18, [0.11, 0.02, 0], steel);
    shaft.rotation.z = Math.PI / 2;

    // 3. Sökme Aparatı (Mavi/Turkuaz Spudger + Vantuz)
    const remover = makeTool("remover", "Sökme Aparatı", [-0.98, 1.12, -0.28]);
    this.box(remover, [0.26, 0.02, 0.045], [0, 0.015, 0], mat("#14b8a6", 0.4, 0.2));
    this.cylinder(remover, 0.055, 0.028, [0.08, 0.025, 0], mat("#e2e8f0", 0.3, 0.1));

    // 4. Temizlik Bezi (Mavi mikrofiber ped)
    const cleaner = makeTool("cleaner", "Temizlik Bezi", [-0.98, 1.12, 0.0]);
    this.box(cleaner, [0.18, 0.022, 0.14], [0, 0.012, 0], mat("#38bdf8", 0.85, 0.05));
    this.box(cleaner, [0.14, 0.026, 0.1], [0, 0.014, 0], mat("#bae6fd", 0.9, 0.05));
  }

  private startJob(job: WorkshopRepairJob): void {
    this.job = job;
    this.stepList = buildSteps(job.defectCategory);
    this.step = 0;
    this.dwellProgress = 0;
    this.isTestingAnim = false;
    this.resetBenchVisuals(job.defectCategory);
    this.updateUi();
  }

  private resetBenchVisuals(category: InspectionCategoryId | null): void {
    this.screen.visible = true;
    this.back.visible = true;
    this.internalPcbGroup.visible = false;
    this.brokenPartGroup.visible = false;
    this.brokenPartGroup.position.set(PHONE_X, 1.122, PHONE_Z);
    this.brokenPartTarget.set(PHONE_X, 1.122, PHONE_Z);
    this.testGlowMesh.visible = false;

    // Köşe cıvatalarını telefonun 4 köşesine yerleştir
    for (const s of this.screws) {
      s.removed = false;
      s.targetRemoved = false;
      s.animProgress = 0;
      s.spinning = 0;
      s.group.position.copy(s.cornerPos);
    }

    // Kir lekelerini sıfırla
    for (const m of this.dirtMeshes) {
      m.visible = true;
      m.scale.setScalar(1);
    }

    // Masadaki yedek parçayı arıza tipine göre hazırla (Ekran / Batarya / Kamera)
    const cat = category ?? "battery";
    this.brokenScreenMesh.visible = cat === "screen";
    this.brokenBatteryMesh.visible = cat === "battery";
    this.brokenCameraMesh.visible = cat === "camera";

    this.newPartGroup.visible = true;
    this.newPartGroup.position.copy(this.newPartHome);
    this.newPartTarget.copy(this.newPartHome);
    this.newScreenMesh.visible = cat === "screen";
    this.newBatteryMesh.visible = cat === "battery";
    this.newCameraMesh.visible = cat === "camera";
  }

  private updateUi(): void {
    const cur = this.currentStep ?? this.stepList[0]!;
    this.title.textContent = this.job ? cur.label : "Tamir telefonu bekleniyor";
    this.hint.textContent = this.job
      ? cur.hint
      : "Tezgâhta bir tamir müşterisiyle anlaştığında telefon ve yedek parçası masaya gelir.";

    this.root.querySelector<HTMLElement>("[data-model]")!.textContent = this.job?.modelLabel ?? "—";
    this.root.querySelector<HTMLElement>("[data-defect]")!.textContent = this.job?.defectTitle ?? "—";

    const visibleSteps = this.stepList.slice(0, this.stepList.length - 1);
    this.stepsEl.innerHTML = visibleSteps
      .map(
        (s, i) =>
          '<div class="workshop-step ' +
          (i < this.step ? "done" : i === this.step ? "current" : "") +
          '"><i>' +
          (i < this.step ? "✓" : String(i + 1).padStart(2, "0")) +
          "</i>" +
          s.label +
          "</div>",
      )
      .join("");

    if (!this.job) {
      this.action.textContent = "TAMİR TELEFONU BEKLENİYOR";
      this.action.disabled = true;
    } else if (cur.id === "done") {
      this.action.textContent = "TEZGÂHA DÖN VE TESLİM ET →";
      this.action.disabled = false;
    } else if (cur.id === "test") {
      this.action.textContent = "⚡ CİHAZI TEST ET →";
      this.action.disabled = false;
    } else {
      this.action.textContent = cur.label.toUpperCase() + " (HIZLI UYGULA) →";
      this.action.disabled = false;
    }

    this.root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
      b.classList.toggle("selected", b.dataset["tool"] === cur.tool);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-room]").forEach((b) => {
      b.classList.toggle("active", b.dataset["room"] === (this.active ? "workshop" : "counter"));
    });
  }

  private updateRayFromEvent(clientX: number, clientY: number): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.workPlane, this.planeHit)) {
      this.pointerWorld.copy(this.planeHit);
    }
    const dx = this.pointerWorld.x - this.phoneCenter.x;
    const dz = this.pointerWorld.z - this.phoneCenter.z;
    this.isOverPhone = Math.abs(dx) < 0.28 && Math.abs(dz) < 0.42;
  }

  private hitTest(clientX: number, clientY: number): Object3D | undefined {
    this.updateRayFromEvent(clientX, clientY);
    for (const hit of this.raycaster.intersectObjects(this.pickables, true)) {
      let obj: Object3D | null = hit.object;
      while (obj && obj !== this.scene) {
        if (
          obj.userData["tool"] ||
          obj.userData["newPart"] ||
          obj.userData["brokenPart"] ||
          obj.userData["screwIndex"] !== undefined
        ) {
          return obj;
        }
        obj = obj.parent;
      }
    }
    return undefined;
  }

  private releaseDrag(): void {
    this.draggingKind = "none";
    this.draggingTool = null;
    this.draggingScrewIdx = -1;
  }

  private notify(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add("visible");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.toast.classList.remove("visible"), 2600);
  }

  private material(c: string, r = 0.75, m = 0): MeshStandardMaterial {
    const x = new MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    this.mats.push(x);
    return x;
  }

  private geometry<T extends BoxGeometry | CylinderGeometry | PlaneGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  private box(parent: Object3D, size: [number, number, number], pos: [number, number, number], mat: Material): Mesh {
    const x = new Mesh(this.geometry(new BoxGeometry(...size)), mat);
    x.position.set(...pos);
    parent.add(x);
    return x;
  }

  private cylinder(parent: Object3D, radius: number, height: number, pos: [number, number, number], mat: Material): Mesh {
    const x = new Mesh(this.geometry(new CylinderGeometry(radius, radius, height, 14)), mat);
    x.position.set(...pos);
    parent.add(x);
    return x;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLElement && e.target.matches("input,textarea,[contenteditable=true]")) return;
    if (e.key === "2") this.enter();
    if ((e.key === "1" || e.key === "Escape") && this.active) this.leave();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.active || e.button !== 0) return;
    this.options.audio.unlock();
    const hit = this.hitTest(e.clientX, e.clientY);

    if (this.currentStep?.id === "test" && this.isOverPhone) {
      this.startTestStep();
      return;
    }

    if (!hit) return;

    const toolId = hit.userData["tool"] as ToolId | undefined;
    if (toolId) {
      this.draggingKind = "tool";
      this.draggingTool = toolId;
      this.options.audio.playTap();
      return;
    }

    if (hit.userData["newPart"]) {
      if (this.currentStep?.id !== "install") {
        this.notify("Yeni parçayı takmadan önce eski parçayı çıkarıp yuvayı temizle.");
        return;
      }
      this.draggingKind = "newPart";
      this.options.audio.playTap();
      return;
    }

    if (hit.userData["brokenPart"]) {
      if (this.currentStep?.id === "remove") {
        this.draggingKind = "brokenPart";
        this.options.audio.playTap();
      }
      return;
    }

    if (hit.userData["screwIndex"] !== undefined) {
      const idx = Number(hit.userData["screwIndex"]);
      this.draggingKind = "screw";
      this.draggingScrewIdx = idx;
      const s = this.screws[idx]!;
      s.spinning = 0.5;
      this.options.audio.playScrewdriver();

      // Cıvataya doğrudan basıldığında da sökme/takma ilerlemesine katkı ver
      if (this.currentStep?.id === "screwsOut" && !s.removed) {
        s.removed = true;
        s.targetRemoved = true;
        this.dwellProgress += 0.36;
        if (this.screws.every((sc) => sc.removed)) {
          this.dwellProgress = 0;
          this.completeCurrentStep();
        }
      } else if (this.currentStep?.id === "screwsIn" && s.removed) {
        s.removed = false;
        s.targetRemoved = false;
        this.dwellProgress += 0.36;
        if (this.screws.every((sc) => !sc.removed)) {
          this.dwellProgress = 0;
          this.completeCurrentStep();
        }
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.active) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    const tip = this.root.querySelector<HTMLElement>(".workshop-tooltip")!;
    if (this.draggingKind !== "none") {
      tip.textContent = this.isOverPhone
        ? "✓ Telefonun üzerindesin — işlemi tamamlamak için gezdirmeye devam et"
        : "Telefonun üzerine doğru sürükle";
    } else {
      tip.textContent = String(
        hit?.userData["tooltip"] ?? "Aleti veya parçayı basılı tutup telefonun üzerine sürükle",
      );
    }
  };

  private onPointerUp = (): void => {
    if (!this.active || this.draggingKind === "none") return;
    if (this.draggingKind === "newPart" && this.currentStep?.id === "install" && this.isOverPhone) {
      this.dwellProgress = 0;
      this.completeCurrentStep();
      return;
    }
    if (this.draggingKind === "brokenPart" && this.currentStep?.id === "remove" && !this.isOverPhone) {
      this.dwellProgress = 0;
      this.completeCurrentStep();
      return;
    }
    this.releaseDrag();
  };
}
