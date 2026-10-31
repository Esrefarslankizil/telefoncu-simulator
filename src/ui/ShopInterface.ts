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
import { HudController } from "../game/HudController";
import { CasinoController } from "../game/CasinoController";

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
  root: HTMLElement, store: GameStore, _saveSystem: SaveSystem, audio: AudioSystem, rng: SeededRNG,
  phone: Group, _phoneBody: Mesh, _phoneBack: Mesh, _screen: Mesh, _crack1: Mesh, _crack2: Mesh,
  batteryMarker: Mesh, _bodyMarker: Mesh, _funcMarker: Mesh, _phoneFrameMat: MeshStandardMaterial,
  _phoneBackMat: MeshStandardMaterial, phoneScreenMat: MeshStandardMaterial, _cameraBumpMat: MeshStandardMaterial,
  _elmaCamGroup: Group, _elmaDuoCamGroup: Group, _samsamCamGroup: Group, _shaomiCamGroup: Group,
  _redmiCamGroup: Group, _pocoCamGroup: Group, _jacket: MeshStandardMaterial, customerGroup: Group,
  legLeft: Mesh, legRight: Mesh, armLeft: Mesh, armRight: Mesh, headMesh: Mesh, _ammeterUnit: Group,
  ammeterDisplayMat: MeshStandardMaterial, cablePlugGroup: Group, _batteryTesterGroup: Group,
  phoneScreenCanvas: HTMLCanvasElement, phoneScreenTexture: CanvasTexture,
  updateBatteryLcd: (state: "done" | "idle" | "testing", progress?: number, isHealthy?: boolean, healthPct?: number) => void,
  updateCableMesh: (plugged: boolean) => void, camTargetPos: Vector3, camTargetLook: Vector3,
  resetCamLook: () => void, _applyLookDrag: (dx: number, dy: number) => void,
  wakeRender: (ms?: number) => void, _workshop: RepairWorkshop, _camera: PerspectiveCamera, _scene: Scene,
): ShopUiHandle {
  const shell = document.createElement("div");
  shell.className = "shop-shell";
  shell.innerHTML = SHELL_HTML;
  root.append(shell);

  const select = <T extends HTMLElement>(sel: string): T => shell.querySelector<T>(sel)!;
  const clockEl = shell.querySelector<HTMLElement>("[data-clock]");
  const backdropEl = select<HTMLElement>(".modal-backdrop");

  const timeManager = new TimeManager(clockEl);
  let hud: HudController;

  const workerManager = new WorkerManager(audio, () => {
    hud.updateCustomerHeader(customerController, bargainController);
    hud.updateHUD(store.getState());
    hud.renderWorkersModalIfOpen();
  });

  hud = new HudController(shell, audio, timeManager, workerManager, wakeRender);

  const stockController = new StockController(shell, {
    audio,
    notify: hud.notify,
    wakeRender,
    onStockRepairRequested: () => hud.openWorkersModal(),
  });

  new CasinoController(shell, store, audio, hud.notify, () => hud.updateHUD(store.getState()), wakeRender);

  const openSpeech = (text: string, speaker: "customer" | "player" = "customer"): void => {
    const cust = customerController.encounter.customer;
    hud.openSpeechBubble(text, speaker, cust.initials, cust.name, cust.intent);
  };

  const bargainController = new BargainController(shell, {
    audio,
    store,
    workerManager,
    notify: hud.notify,
    dismissCustomer: () => customerController.dismissCustomer(),
    onTransactionCompleted: () => {
      customerController.customersServedToday += 1;
      hud.updateCustomerHeader(customerController, bargainController);
      hud.updateHUD(store.getState());
    },
    openSpeechBubble: openSpeech,
    onOpenWorkersModal: () => hud.openWorkersModal(),
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
    notify: hud.notify,
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
      notify: hud.notify,
      wakeRender,
      onPhonePlaced: () => {
        bargainController.setEncounter(customerController.encounter);
        inspectionController.setEncounter(customerController.encounter);
        bargainController.renderDiagnosticArea();
      },
      onStateChanged: () => {
        hud.updateCustomerHeader(customerController, bargainController);
        hud.updateHUD(store.getState());
      },
      openSpeechBubble: openSpeech,
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

  select<HTMLButtonElement>(".inspect-btn").addEventListener("click", () => setStation("repair"));
  select<HTMLButtonElement>(".exit-inspect").addEventListener("click", () => setStation("counter"));
  select<HTMLButtonElement>(".to-bargain-btn").addEventListener("click", () => {
    setStation("counter");
    bargainController.renderDiagnosticArea();
  });
  select<HTMLButtonElement>(".diagnose-btn").addEventListener("click", () => bargainController.renderDiagnosticArea());

  hud.nextCustomerBtn.addEventListener("click", () => {
    if (customerController.state === "WAITING") {
      customerController.triggerArrival(stockController.items.length);
    } else if (bargainController.dealFinished) {
      customerController.dismissCustomer();
    }
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
    hud.notify("Yeni güne geçildi! Günaydın usta.");
    hud.updateHUD(store.getState());
  });

  hud.updateHUD(store.getState());
  hud.updateCustomerHeader(customerController, bargainController);
  setStation("counter");

  return {
    update: (st) => hud.updateHUD(st),
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
        hud.notify(`🔔 Kapı zili çaldı: ${rep.customer.name} telefonunu almaya geldi!`);
        hud.updateCustomerHeader(customerController, bargainController);
      }

      customerController.updateTick(deltaSeconds, stockController.items.length);
      if (customerController.state === "WAITING") {
        hud.updateCustomerHeader(customerController, bargainController);
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
        hud.notify("✓ Telefon atölyede onarıldı!");
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
