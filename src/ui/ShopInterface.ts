import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  CanvasTexture,
} from "three";
import type { AudioSystem } from "../core/AudioSystem";
import type { GameStore } from "../core/GameStore";
import type { SeededRNG } from "../core/SeededRNG";
import type { SaveSystem } from "../persistence/SaveSystem";
import type { RepairWorkshop, WorkshopRepairJob } from "../workshop/RepairWorkshop";
import type { StationId } from "../config/stations";
import { STATIONS } from "../config/stations";
import { SHELL_HTML } from "./shellTemplate";
import { OrientationManager } from "../core/OrientationManager";
import { TimeManager } from "../game/TimeManager";
import { WorkerManager } from "../game/WorkerManager";
import { StockController } from "../game/StockController";
import { CustomerController } from "../game/CustomerController";
import { InspectionController } from "../game/InspectionController";
import { BargainController } from "../game/BargainController";

export interface ShopUiHandle {
  update: (state: ReturnType<GameStore["getState"]>) => void;
  updateTick: (deltaSeconds: number) => void;
  isUserDraggingPhone: () => boolean;
  isInspecting: () => boolean;
  getWorkshopRepairJob: () => WorkshopRepairJob | null;
  completeWorkshopRepair: (job: WorkshopRepairJob) => void;
  advanceBenchTimer: (seconds: number) => void;
  returnToCounter: () => void;
  destroy: () => void;
}

export function buildInterface(
  root: HTMLElement,
  store: GameStore,
  _saveSystem: SaveSystem,
  audio: AudioSystem,
  rng: SeededRNG,
  phone: Group,
  _phoneBody: Mesh,
  _phoneBack: Mesh,
  _screen: Mesh,
  _crack1: Mesh,
  _crack2: Mesh,
  batteryMarker: Mesh,
  _bodyMarker: Mesh,
  _funcMarker: Mesh,
  _phoneFrameMat: MeshStandardMaterial,
  _phoneBackMat: MeshStandardMaterial,
  phoneScreenMat: MeshStandardMaterial,
  _cameraBumpMat: MeshStandardMaterial,
  _elmaCamGroup: Group,
  _elmaDuoCamGroup: Group,
  _samsamCamGroup: Group,
  _shaomiCamGroup: Group,
  _redmiCamGroup: Group,
  _pocoCamGroup: Group,
  _jacket: MeshStandardMaterial,
  customerGroup: Group,
  legLeft: Mesh,
  legRight: Mesh,
  armLeft: Mesh,
  armRight: Mesh,
  headMesh: Mesh,
  _ammeterUnit: Group,
  ammeterDisplayMat: MeshStandardMaterial,
  cablePlugGroup: Group,
  _batteryTesterGroup: Group,
  phoneScreenCanvas: HTMLCanvasElement,
  phoneScreenTexture: CanvasTexture,
  updateBatteryLcd: (state: "done" | "idle" | "testing", progress?: number, isHealthy?: boolean, healthPct?: number) => void,
  updateCableMesh: (plugged: boolean) => void,
  camTargetPos: Vector3,
  camTargetLook: Vector3,
  resetCamLook: () => void,
  _applyLookDrag: (dx: number, dy: number) => void,
  wakeRender: (ms?: number) => void,
  _workshop: RepairWorkshop,
  _camera: PerspectiveCamera,
  _scene: Scene,
): ShopUiHandle {
  const shell = document.createElement("div");
  shell.className = "shop-shell";
  shell.innerHTML = SHELL_HTML;
  root.append(shell);

  const select = <T extends HTMLElement>(selector: string): T => shell.querySelector<T>(selector)!;
  const moneyEl = select<HTMLElement>("[data-money]");
  const repEl = select<HTMLElement>("[data-rep]");
  const dayEl = select<HTMLElement>("[data-day]");
  const clockEl = shell.querySelector<HTMLElement>("[data-clock]");
  const customerInitials = select<HTMLElement>("[data-customer-initials]");
  const customerEyebrow = select<HTMLElement>("[data-customer-eyebrow]");
  const customerName = select<HTMLElement>("[data-customer-name]");
  const customerRequest = select<HTMLElement>("[data-customer-request]");
  const nextCustomerBtn = select<HTMLButtonElement>(".next-customer");
  const shopStatusEl = select<HTMLElement>("[data-shop-status]");
  const inspectBtn = select<HTMLButtonElement>(".inspect-btn");
  const diagnoseBtn = select<HTMLButtonElement>(".diagnose-btn");
  const backdropEl = select<HTMLElement>(".modal-backdrop");
  const toastEl = select<HTMLElement>(".toast");
  const speechBubbleOverlay = select<HTMLElement>(".speech-bubble-overlay");
  const bubbleAvatar = select<HTMLElement>(".bubble-avatar");
  const bubbleName = select<HTMLElement>(".bubble-name");
  const bubbleText = select<HTMLElement>(".bubble-text");
  const bubbleIntent = select<HTMLElement>(".bubble-intent-badge");
  const bubbleDismissBtn = select<HTMLButtonElement>(".bubble-dismiss-btn");

  const workersModalEl = shell.querySelector<HTMLElement>("[data-workers-modal]");
  const workersListEl = shell.querySelector<HTMLElement>("[data-workers-list]");
  const openWorkersBtn = shell.querySelector<HTMLButtonElement>("[data-open-workers-btn]");
  const menuWorkersBtn = shell.querySelector<HTMLButtonElement>("[data-open-workers]");
  const workersModalClose = shell.querySelector<HTMLButtonElement>("[data-workers-modal-close]");
  const workersBadgeEl = shell.querySelector<HTMLElement>("[data-workers-badge]");

  let toastTimer = 0;
  const notify = (msg: string): void => {
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("visible"), 3200);
  };

  const timeManager = new TimeManager(clockEl);

  const openWorkersModal = (): void => {
    if (!workersModalEl || !workersListEl) return;
    audio.playTap();
    workersModalEl.hidden = false;
    workerManager.renderModal(workersListEl);
    wakeRender(400);
  };

  const closeWorkersModal = (): void => {
    if (!workersModalEl) return;
    audio.playTap();
    workersModalEl.hidden = true;
    wakeRender(400);
  };

  openWorkersBtn?.addEventListener("click", openWorkersModal);
  menuWorkersBtn?.addEventListener("click", openWorkersModal);
  workersModalClose?.addEventListener("click", closeWorkersModal);
  workersModalEl?.addEventListener("click", (e) => {
    if (e.target === workersModalEl) closeWorkersModal();
  });

  const workerManager = new WorkerManager(audio, () => {
    updateCustomerHeader();
    updateHUD(store.getState());
    if (workersModalEl && !workersModalEl.hidden && workersListEl) {
      workerManager.renderModal(workersListEl);
    }
  });

  const stockController = new StockController(shell, {
    audio,
    notify,
    wakeRender,
    onStockRepairRequested: () => openWorkersModal(),
  });

  const openSpeechBubble = (text: string, speaker: "customer" | "player" = "customer"): void => {
    speechBubbleOverlay.classList.toggle("player-speech", speaker === "player");
    bubbleAvatar.textContent = speaker === "player" ? "🧑‍🔧" : customerController.encounter.customer.initials;
    bubbleName.textContent = speaker === "player" ? "Sen · Telefoncu" : customerController.encounter.customer.name;
    bubbleText.textContent = text;
    bubbleIntent.className = "bubble-intent-badge " + (speaker === "player" ? "repair" : customerController.encounter.customer.intent);
    bubbleIntent.textContent = speaker === "player" ? "TEKLİF" : customerController.encounter.customer.intent.toUpperCase();
    speechBubbleOverlay.hidden = false;
    if (speaker === "customer") audio.playCustomerSpeech();
    else audio.playTap();
  };

  bubbleDismissBtn.addEventListener("click", () => {
    speechBubbleOverlay.hidden = true;
    audio.stopCustomerSpeech();
    audio.playTap();
  });

  const bargainController = new BargainController(shell, {
    audio,
    store,
    workerManager,
    notify,
    dismissCustomer: () => customerController.dismissCustomer(),
    onTransactionCompleted: () => {
      customerController.customersServedToday += 1;
      updateCustomerHeader();
      updateHUD(store.getState());
    },
    openSpeechBubble,
    onOpenWorkersModal: openWorkersModal,
    getStockItems: () => stockController.items,
  });

  const inspectionController = new InspectionController(shell, {
    audio,
    phone,
    phoneScreenMat,
    batteryMarker,
    cablePlugGroup,
    chargerDockPos: new Vector3(0.08, 1.155, 0.44),
    ammeterDisplayMat,
    phoneScreenCanvas,
    phoneScreenTexture,
    updateBatteryLcd,
    updateCableMesh,
    notify,
    wakeRender,
    onCategoryInspected: (cat) => {
      bargainController.diagnosedCategories.add(cat);
      bargainController.renderDiagnosticArea();
    },
  });

  const customerController = new CustomerController(
    {
      audio,
      rng,
      store,
      customerGroup,
      legLeft,
      legRight,
      armLeft,
      armRight,
      headMesh,
      phone,
      notify,
      wakeRender,
      onPhonePlaced: () => {
        bargainController.setEncounter(customerController.encounter);
        inspectionController.setEncounter(customerController.encounter);
        bargainController.renderDiagnosticArea();
      },
      onStateChanged: () => {
        updateCustomerHeader();
        updateHUD(store.getState());
      },
      openSpeechBubble,
    },
    stockController.items.length,
  );

  bargainController.setEncounter(customerController.encounter);
  inspectionController.setEncounter(customerController.encounter);

  let currentStation: StationId = "counter";
  const setStation = (st: StationId): void => {
    currentStation = st;
    resetCamLook();
    if (st === "repair") {
      camTargetPos.set(0.12, 1.48, 0.22);
      camTargetLook.set(0.12, 1.18, 0.22);
      shell.querySelector<HTMLElement>(".work-panel")!.hidden = true;
      shell.querySelector<HTMLElement>(".inspect-panel")!.hidden = false;
    } else {
      camTargetPos.set(0, 1.68, -0.85);
      camTargetLook.set(0, 1.40, 1.45);
      shell.querySelector<HTMLElement>(".work-panel")!.hidden = false;
      shell.querySelector<HTMLElement>(".inspect-panel")!.hidden = true;
    }
    wakeRender(1200);
  };

  const stationNav = select<HTMLElement>(".station-nav");
  for (const st of STATIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset["station"] = st.id;
    btn.textContent = st.title;
    btn.addEventListener("click", () => setStation(st.id));
    stationNav.append(btn);
  }

  inspectBtn.addEventListener("click", () => setStation("repair"));
  select<HTMLButtonElement>(".exit-inspect").addEventListener("click", () => setStation("counter"));
  select<HTMLButtonElement>(".to-bargain-btn").addEventListener("click", () => {
    setStation("counter");
    bargainController.renderDiagnosticArea();
  });
  diagnoseBtn.addEventListener("click", () => bargainController.renderDiagnosticArea());

  nextCustomerBtn.addEventListener("click", () => {
    if (customerController.state === "WAITING") {
      customerController.triggerArrival(stockController.items.length);
    } else if (bargainController.dealFinished) {
      customerController.dismissCustomer();
    }
  });

  const updateCustomerHeader = (): void => {
    const repair = workerManager.repair;
    if (bargainController.isReturningCustomerActive && repair) {
      customerInitials.textContent = repair.customer.initials;
      customerEyebrow.textContent = repair.isRepaired ? "CİHAZI ALMAYA GELDİ · TAMİR EDİLDİ" : "CİHAZI ALMAYA GELDİ · SÜRE DOLDU!";
      customerName.textContent = repair.customer.name;
      customerRequest.textContent = repair.isRepaired
        ? `"Selam usta, 1 saat doldu telefonumu almaya geldim!"`
        : `"Selam usta! 1 saat doldu, telefonum hazır mı?"`;
      nextCustomerBtn.textContent = "TESLİMAT";
      return;
    }

    if (customerController.state === "WAITING") {
      customerInitials.textContent = "⏳";
      if (repair) {
        const sec = Math.max(0, Math.ceil(repair.remainingSeconds));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        customerEyebrow.textContent = `ATÖLYEDE TAMİRDE (TEK İŞÇİ) · KALAN: ${timeStr}`;
        customerName.textContent = repair.isRepaired ? "✓ Tamir Bitti (Müşteri Bekleniyor)" : "Tamir Devam Ediyor";
        customerRequest.textContent = `${repair.phone.brand} ${repair.phone.model} onarılıyor (~${timeStr} sonra müşteri gelecek).`;
        nextCustomerBtn.textContent = "BEKLE";
        return;
      }
      customerEyebrow.textContent = "DÜKKÂN SAKİN · MÜŞTERİ BEKLENİYOR";
      customerName.textContent = "Tezgâhta Bekliyorsun";
      customerRequest.textContent = `Sıradaki müşteri ~${Math.max(1, Math.ceil(customerController.waitTimer))} saniye içinde kapıdan girecek.`;
      nextCustomerBtn.textContent = "🔔 KAPIDAN ÇAĞIR";
      return;
    }

    const cust = customerController.encounter.customer;
    customerInitials.textContent = cust.initials;
    customerEyebrow.textContent = `${cust.intent.toUpperCase()} TALEBİ`;
    customerName.textContent = cust.name;
    customerRequest.textContent = cust.speechText;
  };

  const updateHUD = (state: ReturnType<GameStore["getState"]>): void => {
    moneyEl.textContent = `₺${Math.floor(state.money).toLocaleString("tr-TR")}`;
    repEl.textContent = `${Math.round(state.reputation)} / 100`;
    dayEl.textContent = `G${String(state.day).padStart(2, "0")}`;
    shopStatusEl.textContent = "DÜKKÂN AÇIK";
    timeManager.render();
    if (workersBadgeEl) {
      workersBadgeEl.hidden = !workerManager.hasActiveRepair;
      if (workerManager.repair) {
        workersBadgeEl.textContent = workerManager.repair.isRepaired ? "✓" : "1";
      }
    }
  };

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.matches("input,textarea,[contenteditable=true]")) return;
    if (e.key === "2") openWorkersModal();
    if (e.key === "1") closeWorkersModal();
    if (e.key === "Escape") closeWorkersModal();
  });

  const orientationManager = new OrientationManager({
    onPause: () => audio.suspend(),
    onResume: () => {
      audio.resume();
      wakeRender(1000);
    },
  });
  orientationManager.bindFullscreenButton(shell.querySelector<HTMLButtonElement>(".fullscreen-toggle"));

  select<HTMLButtonElement>(".settings-open").addEventListener("click", () => {
    backdropEl.hidden = false;
  });
  select<HTMLButtonElement>(".modal-close").addEventListener("click", () => {
    backdropEl.hidden = true;
  });
  select<HTMLButtonElement>(".advance-day-btn").addEventListener("click", () => {
    store.advanceDay();
    timeManager.resetDay();
    customerController.customersServedToday = 0;
    backdropEl.hidden = true;
    notify("Yeni güne geçildi! Günaydın usta.");
    updateHUD(store.getState());
  });

  updateHUD(store.getState());
  updateCustomerHeader();
  setStation("counter");

  return {
    update: updateHUD,
    updateTick: (deltaSeconds: number): void => {
      timeManager.updateTick(deltaSeconds);
      const isRepairDone = workerManager.updateTick(deltaSeconds);
      if (isRepairDone && !bargainController.isReturningCustomerActive && customerController.state === "WAITING") {
        bargainController.isReturningCustomerActive = true;
        const rep = workerManager.repair!;
        customerController.encounter = {
          phone: rep.phone,
          customer: {
            ...rep.customer,
            intent: "repair",
            speechText: rep.isRepaired ? "Selam usta! 1 saat doldu telefonumu almaya geldim." : "Selam usta! Telefonum hazır mı?",
          },
        };
        customerController.state = "WALKING_IN";
        customerGroup.position.set(0, 0, 5.2);
        customerGroup.rotation.y = Math.PI;
        customerGroup.visible = true;
        phone.visible = false;
        audio.playDoorBell();
        notify(`🔔 Kapı zili çaldı: ${rep.customer.name} telefonunu almaya geldi!`);
        updateCustomerHeader();
      }

      customerController.updateTick(deltaSeconds, stockController.items.length);
      if (customerController.state === "WAITING") {
        updateCustomerHeader();
      }
    },
    isUserDraggingPhone: () => false,
    isInspecting: () => currentStation === "repair",
    getWorkshopRepairJob: () => {
      const rep = workerManager.repair;
      if (rep) {
        return {
          uid: rep.phone.uid,
          modelKey: `${rep.phone.brand}|${rep.phone.model}`,
          modelLabel: `${rep.phone.brand} ${rep.phone.model}`,
          defectId: rep.defect.id,
          defectCategory: rep.defect.category,
          defectTitle: rep.defect.title,
          remainingSeconds: rep.remainingSeconds,
          isRepaired: rep.isRepaired,
        };
      }
      return null;
    },
    completeWorkshopRepair: (job: WorkshopRepairJob) => {
      const rep = workerManager.repair;
      if (rep && rep.phone.uid === job.uid) {
        workerManager.completeNow();
        notify("✓ Telefon atölyede onarıldı!");
      }
    },
    advanceBenchTimer: (sec) => workerManager.advanceTimer(sec),
    returnToCounter: () => setStation("counter"),
    destroy: () => {
      inspectionController.destroy();
      shell.remove();
    },
  };
}
