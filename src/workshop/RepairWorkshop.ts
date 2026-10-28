import { AmbientLight, BoxGeometry, Color, CylinderGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, Vector2, Vector3 } from "three";
import type { Material, Object3D } from "three";
import type { AudioSystem } from "../core/AudioSystem";
import type { GameStore } from "../core/GameStore";
import type { InspectionCategoryId } from "../data/PhoneCatalog";
import { PHONE_MODELS } from "../data/PhoneCatalog";
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
type ToolId = "screwdriver" | "spudger" | "suction" | "tweezers" | "heatGun" | "adhesive";
type StepId = "heat" | "screwsOut" | "remove" | "part" | "install" | "screwsIn" | "close" | "test" | "done";
interface PartItem { id: string; modelKey: string; modelLabel: string; category: InspectionCategoryId }
const TOOLS: ReadonlyArray<{ id: ToolId; label: string; color: string }> = [
  { id: "screwdriver", label: "Hassas tornavida", color: "#d5b36c" }, { id: "spudger", label: "Plastik açma çubuğu", color: "#53b5a0" },
  { id: "suction", label: "Vakumlu vantuz", color: "#d6e6df" }, { id: "tweezers", label: "İnce cımbız", color: "#9aa9b1" },
  { id: "heatGun", label: "Isı tabancası", color: "#e38157" }, { id: "adhesive", label: "Ekran yapıştırıcısı", color: "#bd6f8c" },
];
const STEPS: ReadonlyArray<{ id: StepId; label: string; hint: string }> = [
  { id: "heat", label: "Kasayı ısıt ve aç", hint: "Isı tabancasını seç." },
  { id: "screwsOut", label: "Cıvataları sök", hint: "Tornavidayla dört cıvatayı sırayla çıkar." },
  { id: "remove", label: "Arızalı parçayı çıkar", hint: "Ekran için vantuz, diğer parçalar için cımbız kullan." },
  { id: "part", label: "Yedek parçayı al", hint: "Model etiketini kontrol ederek raftan parça al." },
  { id: "install", label: "Yeni parçayı tak", hint: "Uyumlu parçayı cımbızla yerine oturt." },
  { id: "screwsIn", label: "Cıvataları geri tak", hint: "Dört cıvatayı mat üzerinden geri yerleştir." },
  { id: "close", label: "Telefonu kapat", hint: "Yapıştırıcıyı sürüp kapağı bastır." },
  { id: "test", label: "Son testi yap", hint: "Tamiri tamamla ve cihazı kontrol et." },
  { id: "done", label: "Tamir edildi", hint: "Tezgâha dönüp müşteriye teslim et." },
];

/** Ayrı birinci şahıs atölye. Müşterinin canlı telefon Group nesnesi sahneler arasında taşınır. */
export class RepairWorkshop {
  public readonly scene = new Scene();
  public readonly camera = new PerspectiveCamera(46, innerWidth / Math.max(innerHeight, 1), 0.08, 35);
  private readonly options: RepairWorkshopOptions;
  private readonly canvas = document.querySelector<HTMLCanvasElement>("#game-root canvas");
  private readonly root: HTMLElement;
  private readonly mats: MeshStandardMaterial[] = [];
  private readonly geos: Array<BoxGeometry | CylinderGeometry | PlaneGeometry> = [];
  private readonly pickables: Object3D[] = [];
  private readonly screws: Mesh[] = [];
  private readonly productMeshes: Mesh[] = [];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly savedPosition = new Vector3();
  private readonly savedRotation = new Vector3();
  private readonly savedScale = new Vector3();
  private readonly back: Mesh;
  private readonly screen: Mesh;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly stock: HTMLElement;
  private readonly steps: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly action: HTMLButtonElement;
  private job: WorkshopRepairJob | null = null;
  private parts: PartItem[] = [];
  private heldPart: PartItem | null = null;
  private tool: ToolId | null = null;
  private step = 0;
  private screw = 0;
  private active = false;
  private down = false;
  private dragged = false;
  private x = 0;
  private y = 0;
  private originalVisible = false;
  private phoneMoved = false;
  private timer = 0;

  public constructor(options: RepairWorkshopOptions) {
    this.options = options;
    this.back = options.phoneBack;
    this.screen = options.phoneScreen;
    this.scene.background = new Color("#1b2729");
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 4.1, -0.48);
    this.camera.lookAt(0, 1.08, -0.48);
    this.buildRoom();
    this.root = document.createElement("div");
    this.root.className = "workshop-ui";
    this.root.innerHTML = '<nav class="workshop-tabs" aria-label="Oda seçimi"><button data-room="counter" type="button">Müşteri Tezgâhı <kbd>1</kbd></button><button data-room="workshop" type="button">Tamir Atölyesi <kbd>2</kbd></button></nav>' +
      '<aside class="workshop-panel"><small>TAMİR MASASI</small><h2 data-title></h2><p data-hint></p><div class="workshop-job"><span>MODEL</span><b data-model>—</b><span>ARIZA</span><b data-defect>—</b></div><p class="workshop-held">ELİNDEKİ ALET: <b data-tool-label>Yok</b></p><div class="workshop-tools">' + TOOLS.map((t) => '<button type="button" data-tool="' + t.id + '"><i style="--tool:' + t.color + '"></i>' + t.label + '</button>').join("") + '</div><div class="workshop-steps" data-steps></div><div class="workshop-stock-title">YEDEK PARÇA STOĞU</div><div class="workshop-stock" data-stock></div><button class="workshop-action" data-action type="button"></button></aside><div class="workshop-tooltip">Üstten sabit görünüm · Dokunarak alet veya parça seç</div><div class="workshop-toast" aria-live="polite"></div>';
    options.uiRoot.append(this.root);
    this.title = this.root.querySelector("[data-title]")!;
    this.hint = this.root.querySelector("[data-hint]")!;
    this.stock = this.root.querySelector("[data-stock]")!;
    this.steps = this.root.querySelector("[data-steps]")!;
    this.toast = this.root.querySelector(".workshop-toast")!;
    this.action = this.root.querySelector<HTMLButtonElement>("[data-action]")!;
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const room = target.closest<HTMLButtonElement>("[data-room]")?.dataset["room"];
      if (room === "counter") this.leave(); else if (room === "workshop") this.enter();
      const tool = target.closest<HTMLButtonElement>("[data-tool]")?.dataset["tool"] as ToolId | undefined;
      if (tool) this.selectTool(tool);
      const part = target.closest<HTMLButtonElement>("[data-part]")?.dataset["part"];
      if (part) this.takePart(part);
    });
    this.action.addEventListener("click", () => this.advance());
    this.canvas?.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    this.updateUi();
  }

  public get isWorkshopActive(): boolean { return this.active; }
  public resize(width: number, height: number): void { this.camera.aspect = width / Math.max(height, 1); this.camera.updateProjectionMatrix(); }
  public enter(): void {
    if (this.active) return;
    const job = this.options.getRepairJob();
    if (job && (job.uid !== this.job?.uid || job.defectId !== this.job?.defectId)) this.startJob(job);
    if (!job) {
      this.job = null;
      this.parts = [];
      this.heldPart = null;
      this.productMeshes.forEach((mesh) => { mesh.userData["part"] = ""; mesh.userData["tooltip"] = "Yedek parça rafı"; });
    }
    if (job) {
      const phone = this.options.phone;
      this.phoneMoved = true;
      this.savedPosition.copy(phone.position); this.savedRotation.set(phone.rotation.x, phone.rotation.y, phone.rotation.z); this.savedScale.copy(phone.scale); this.originalVisible = phone.visible;
      this.scene.add(phone); phone.position.set(0, 1.092, -0.48); phone.rotation.set(0, 0, 0); phone.scale.setScalar(1.65); phone.visible = true;
    }
    this.active = true; this.root.classList.add("active"); this.options.uiRoot.classList.add("workshop-active"); this.options.onSceneChange(true); this.updateUi();
  }
  public leave(): void {
    if (!this.active) return;
    if (this.phoneMoved) {
      const phone = this.options.phone;
      this.options.shopScene.add(phone); phone.position.copy(this.savedPosition); phone.rotation.set(this.savedRotation.x, this.savedRotation.y, this.savedRotation.z); phone.scale.copy(this.savedScale); phone.visible = this.originalVisible;
      this.phoneMoved = false;
    }
    this.active = false; this.root.classList.remove("active"); this.options.uiRoot.classList.remove("workshop-active"); this.options.audio.playTap(); this.options.onSceneChange(false); this.updateUi();
  }
  public destroy(): void {
    if (this.active) this.leave();
    this.canvas?.removeEventListener("pointerdown", this.onPointerDown); window.removeEventListener("pointermove", this.onPointerMove); window.removeEventListener("pointerup", this.onPointerUp); window.removeEventListener("keydown", this.onKeyDown); window.clearTimeout(this.timer); this.root.remove();
    this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose());
  }

  private buildRoom(): void {
    const mat = (c: string, r = 0.72, m = 0): MeshStandardMaterial => this.material(c, r, m);
    const floor = this.box(this.scene, [14, 0.08, 14], [0, -0.08, 0], mat("#485352"));
    void floor;
    const wall = mat("#d0d3c9"); const metal = mat("#879397", 0.38, 0.65); const dark = mat("#303b3d");
    this.box(this.scene, [12, 5.5, 0.18], [0, 2.75, -3.2], wall); this.box(this.scene, [0.18, 5.5, 6.4], [-6, 2.75, 0], wall); this.box(this.scene, [0.18, 5.5, 6.4], [6, 2.75, 0], wall);
    this.scene.add(new AmbientLight("#d7e4df", 1.4)); const light = new DirectionalLight("#ffe5bd", 1.7); light.position.set(-2, 5, 3); this.scene.add(light);
    this.box(this.scene, [3.8, 0.16, 2.2], [0, 0.91, -0.48], mat("#53443a")); this.box(this.scene, [3.85, 0.08, 2.3], [0, 1.03, -0.48], metal);
    this.box(this.scene, [3.2, 0.018, 1.7], [0, 1.08, -0.48], mat("#173b36"));
    for (let i = 0; i < 5; i++) this.box(this.scene, [0.009, 0.004, 1.62], [-1.15 + i * 0.575, 1.092, -0.48], mat("#387569"));
    for (let i = 0; i < 4; i++) this.box(this.scene, [3.05, 0.004, 0.009], [0, 1.092, -1.18 + i * 0.47], mat("#387569"));
    const screwMat = mat("#c1c9c6", 0.3, 0.72); for (let i = 0; i < 4; i++) { const s = this.cylinder(this.scene, 0.018, 0.012, [-1.34 + (i % 2) * 0.22, 1.11, -0.56 + Math.floor(i / 2) * 0.2], screwMat); s.visible = false; this.screws.push(s); }
    const toolMat = mat("#b5c0c3", 0.28, 0.8);
    const tool = (id: ToolId, label: string, pos: [number, number, number]): Group => { const g = new Group(); g.position.set(...pos); g.userData["tool"] = id; g.userData["tooltip"] = label; this.scene.add(g); this.pickables.push(g); return g; };
    const screwdriver = tool("screwdriver", "Hassas tornavida", [-1, 1.13, 0.25]); this.cylinder(screwdriver, 0.025, 0.32, [0, 0, 0], mat("#513a30")).rotation.x = Math.PI / 2; this.cylinder(screwdriver, 0.008, 0.24, [0, 0, -0.22], toolMat).rotation.x = Math.PI / 2;
    const spudger = tool("spudger", "Plastik açma çubuğu", [-0.52, 1.12, 0.25]); this.box(spudger, [0.045, 0.018, 0.36], [0, 0, 0], mat("#53b5a0"));
    const suction = tool("suction", "Vakumlu vantuz", [0.02, 1.12, 0.25]); this.cylinder(suction, 0.1, 0.035, [0, 0.02, 0], mat("#d6e6df"));
    const tweezers = tool("tweezers", "İnce cımbız", [0.55, 1.12, 0.25]); this.box(tweezers, [0.018, 0.018, 0.35], [-0.025, 0, 0], toolMat); this.box(tweezers, [0.018, 0.018, 0.35], [0.025, 0, 0], toolMat);
    const gun = tool("heatGun", "Isı tabancası", [1.08, 1.12, 0.25]); this.box(gun, [0.14, 0.09, 0.2], [0, 0.02, 0], mat("#e38157")); this.cylinder(gun, 0.035, 0.16, [0, 0.03, -0.15], toolMat).rotation.x = Math.PI / 2;
    const glue = tool("adhesive", "Ekran yapıştırıcısı", [1.62, 1.12, 0.25]); this.cylinder(glue, 0.1, 0.07, [0, 0.02, 0], mat("#bd6f8c"));
    this.box(this.scene, [0.06, 0.54, 0.06], [-1.58, 1.45, -0.9], metal); this.cylinder(this.scene, 0.2, 0.08, [-1.58, 1.77, -0.9], mat("#e7bd66"));
    this.buildShelf(4.1, "#6e9d91", mat, metal, dark); this.buildShelf(-4.1, "#526d83", mat, metal, dark);
  }
  private buildShelf(x: number, color: string, mat: (c: string, r?: number, m?: number) => MeshStandardMaterial, metal: MeshStandardMaterial, dark: MeshStandardMaterial): void {
    this.box(this.scene, [1.45, 2.6, 0.12], [x, 1.85, -1.1], dark);
    for (const y of [0.82, 1.56, 2.3, 2.95]) this.box(this.scene, [1.6, 0.07, 0.72], [x, y, -0.72], metal);
    const a = this.box(this.scene, [0.34, 0.15, 0.18], [x, 1.69, -0.52], mat(color)); const b = this.box(this.scene, [0.24, 0.12, 0.16], [x, 0.96, -0.52], mat("#c9a555"));
    a.userData["partIndex"] = this.productMeshes.length; b.userData["partIndex"] = this.productMeshes.length + 1; this.productMeshes.push(a, b); this.pickables.push(a, b);
  }
  private startJob(job: WorkshopRepairJob): void {
    this.job = job; this.step = 0; this.screw = 0; this.tool = null; this.heldPart = null; this.screen.visible = true; this.back.visible = true; this.screws.forEach((s) => s.visible = false);
    const other = PHONE_MODELS.find((m) => m.brand + "|" + m.model !== job.modelKey) ?? PHONE_MODELS[0]!;
    this.parts = [this.makePart(job.defectCategory, job.modelKey, job.modelLabel), this.makePart(job.defectCategory, other.brand + "|" + other.model, other.brand + " " + other.model)];
    for (const p of this.parts) { const marker = "repair-seeded:" + p.id; const inv = this.options.store.getState().inventory; if (!inv[marker]) { if (!inv[p.id]) this.options.store.setInventoryQuantity(p.id, 1); this.options.store.setInventoryQuantity(marker, 1); } }
    this.productMeshes.forEach((mesh, i) => { const p = this.parts[i >> 1]; mesh.userData["part"] = p?.id ?? ""; mesh.userData["tooltip"] = p?.modelLabel ?? "Yedek parça"; });
    this.updateUi();
  }
  private makePart(category: InspectionCategoryId, modelKey: string, modelLabel: string): PartItem { return { id: "repair-part:" + category + ":" + modelKey.toLowerCase().replace(/[^a-z0-9]+/g, "-"), modelKey, modelLabel, category }; }
  private advance(): void {
    if (!this.job) { this.notify("Önce tezgâhta tamir müşterisi olmalı."); return; }
    if (this.step === STEPS.length - 1) { this.leave(); return; }
    const id = STEPS[this.step]!.id; const required: Partial<Record<StepId, ToolId>> = { heat: "heatGun", screwsOut: "screwdriver", remove: this.job.defectCategory === "screen" ? "suction" : "tweezers", install: "tweezers", screwsIn: "screwdriver", close: "adhesive" };
    if (required[id] && this.tool !== required[id]) { this.notify("Önce " + TOOLS.find((t) => t.id === required[id])!.label + " seç."); return; }
    if (id === "part" && !this.heldPart) { this.notify("Raftan bir yedek parça al."); return; }
    if (id === "install" && this.heldPart?.modelKey !== this.job.modelKey) { this.notify("UYUMSUZ PARÇA: Bu yedek parça telefon modeline uygun değil."); return; }
    if (id === "screwsOut" || id === "screwsIn") { const screw = this.screws[this.screw]!; screw.visible = id === "screwsOut"; this.screw++; this.options.audio.playScrewdriver(); if (this.screw < 4) { this.updateUi(); this.notify("Cıvata " + this.screw + "/4 tamamlandı."); return; } this.screw = 0; }
    if (id === "remove") { this.screen.visible = false; this.options.audio.playClean(); }
    if (id === "install") { if (!this.options.store.removeInventory(this.heldPart!.id, 1)) { this.notify("Bu parçanın stoğu bitti."); return; } this.heldPart = null; this.options.audio.playClean(); }
    if (id === "close") { this.screen.visible = true; this.back.visible = true; }
    if (id === "test") { this.step = STEPS.length - 1; this.options.onRepairComplete(this.job); this.options.audio.playCash(); this.notify("Bu parça onarıldı. Tezgâha dön; kalan arıza varsa atölyeye tekrar geç, tümü bitince teslim et."); this.updateUi(); return; }
    this.step++; this.tool = null; this.options.audio.playTap(); this.updateUi();
  }
  private takePart(id: string): void {
    if (!this.active || this.step !== 3) { this.notify("Parça almak için önce arızalı parçayı çıkar."); return; }
    const part = this.parts.find((p) => p.id === id); if (!part) return;
    if ((this.options.store.getState().inventory[id] ?? 0) < 1) { this.notify("Bu parçanın stoğu kalmadı."); return; }
    this.heldPart = part; this.notify(part.modelKey === this.job?.modelKey ? "Uyumlu parça elinde. Cımbızı seçip tak." : "Yanlış model parça aldın; yerine takılamaz."); this.updateUi();
  }
  private selectTool(id: ToolId): void { if (!this.active) return; this.tool = id; this.options.audio.playTap(); this.updateUi(); }
  private updateUi(): void {
    const current = STEPS[this.step]!;
    this.title.textContent = this.job ? current.label : "";
    this.hint.textContent = this.job ? current.hint : "Müşteri telefonu olmadan atölyeyi gezebilir, aletleri ve yedek parça raflarını inceleyebilirsin.";
    this.root.querySelector<HTMLElement>("[data-model]")!.textContent = this.job?.modelLabel ?? "Müşteri telefonu bekleniyor";
    this.root.querySelector<HTMLElement>("[data-defect]")!.textContent = this.job?.defectTitle ?? "—";
    this.root.querySelector<HTMLElement>("[data-tool-label]")!.textContent = TOOLS.find((t) => t.id === this.tool)?.label ?? "Yok";
    this.steps.innerHTML = STEPS.slice(0, STEPS.length - 1).map((s, i) => '<div class="workshop-step ' + (i < this.step ? "done" : i === this.step ? "current" : "") + '"><i>' + (i < this.step ? "✓" : String(i + 1).padStart(2, "0")) + "</i>" + s.label + "</div>").join("");
    this.stock.innerHTML = this.parts.map((p) => { const n = this.options.store.getState().inventory[p.id] ?? 0; const ok = p.modelKey === this.job?.modelKey; return '<button type="button" data-part="' + p.id + '" ' + (n ? "" : "disabled") + ' class="workshop-part ' + (ok ? "compatible" : "mismatch") + '"><b>' + p.modelLabel + '</b><small>' + (ok ? "UYUMLU · " : "FARKLI MODEL · ") + p.category.toUpperCase() + '</small><strong>×' + n + '</strong></button>'; }).join("") || "<small>Aktif tamir telefonu yok.</small>";
    const actionNames = ["ISIT VE KASAYI AÇ", "CIVATALARI SÖK", "ARIZALI PARÇAYI ÇIKAR", "YEDEK PARÇA AL", "YENİ PARÇAYI TAK", "CIVATALARI GERİ TAK", "YAPIŞTIR VE KAPAT", "CİHAZI TEST ET", "TEZGÂHA DÖN"];
    this.action.textContent = this.job ? actionNames[this.step]! + "  →" : "TAMİR TELEFONU BEKLENİYOR"; this.action.disabled = !this.job;
    this.root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => b.classList.toggle("selected", b.dataset["tool"] === this.tool));
    this.root.querySelectorAll<HTMLButtonElement>("[data-room]").forEach((b) => b.classList.toggle("active", b.dataset["room"] === (this.active ? "workshop" : "counter")));
  }
  private hitTest(clientX: number, clientY: number): Object3D | undefined {
    if (!this.canvas) return undefined; const rect = this.canvas.getBoundingClientRect(); this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1); this.raycaster.setFromCamera(this.pointer, this.camera);
    for (const hit of this.raycaster.intersectObjects(this.pickables, true)) { let obj: Object3D | null = hit.object; while (obj && obj !== this.scene) { if (obj.userData["tool"] || obj.userData["part"]) return obj; obj = obj.parent; } } return undefined;
  }
  private notify(text: string): void { this.toast.textContent = text; this.toast.classList.add("visible"); clearTimeout(this.timer); this.timer = window.setTimeout(() => this.toast.classList.remove("visible"), 2600); }
  private material(c: string, r = 0.75, m = 0): MeshStandardMaterial { const x = new MeshStandardMaterial({ color: c, roughness: r, metalness: m }); this.mats.push(x); return x; }
  private geometry<T extends BoxGeometry | CylinderGeometry | PlaneGeometry>(g: T): T { this.geos.push(g); return g; }
  private box(parent: Object3D, size: [number, number, number], pos: [number, number, number], mat: Material): Mesh { const x = new Mesh(this.geometry(new BoxGeometry(...size)), mat); x.position.set(...pos); parent.add(x); return x; }
  private cylinder(parent: Object3D, radius: number, height: number, pos: [number, number, number], mat: Material): Mesh { const x = new Mesh(this.geometry(new CylinderGeometry(radius, radius, height, 10)), mat); x.position.set(...pos); parent.add(x); return x; }
  private onKeyDown = (e: KeyboardEvent): void => { if (e.target instanceof HTMLElement && e.target.matches("input,textarea,[contenteditable=true]")) return; if (e.key === "2") this.enter(); if ((e.key === "1" || e.key === "Escape") && this.active) this.leave(); };
  private onPointerDown = (e: PointerEvent): void => { if (!this.active || e.button !== 0) return; this.down = true; this.dragged = false; this.x = e.clientX; this.y = e.clientY; };
  private onPointerMove = (e: PointerEvent): void => { if (!this.active) return; const hit = this.hitTest(e.clientX, e.clientY); const tip = this.root.querySelector<HTMLElement>(".workshop-tooltip")!; tip.textContent = String(hit?.userData["tooltip"] ?? "Üstten sabit görünüm · Dokun: alet veya parça seç"); if (!this.down) return; const dx = e.clientX - this.x; const dy = e.clientY - this.y; if (Math.abs(dx) + Math.abs(dy) > 2) this.dragged = true; this.x = e.clientX; this.y = e.clientY;  };
  private onPointerUp = (e: PointerEvent): void => { if (!this.active || !this.down) return; this.down = false; if (this.dragged) return; const hit = this.hitTest(e.clientX, e.clientY); if (!hit) return; const tool = hit.userData["tool"] as ToolId | undefined; if (tool) this.selectTool(tool); else if (hit.userData["part"]) this.takePart(String(hit.userData["part"])); };
}







