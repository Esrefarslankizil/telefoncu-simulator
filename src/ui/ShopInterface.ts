import {
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from "three";
import type { AudioSystem } from "../core/AudioSystem";
import type { GameStore, QualityPreference } from "../core/GameStore";
import { OrientationManager } from "../core/OrientationManager";
import type { SeededRNG } from "../core/SeededRNG";
import type { SaveSystem } from "../persistence/SaveSystem";
import {
  DEFECT_POOL,
  PHONE_MODELS,
  INSPECTION_CATEGORIES,
  generateCustomerEncounter,
  getBatteryRating,
  getDailyCustomerQuota,
  getKnownPhoneValue,
  roundTo50,
} from "../data/PhoneCatalog";
import type {
  BatteryRating,
  CustomerIntent,
  InspectionCategoryId,
  StockPhoneItem,
} from "../data/PhoneCatalog";
import type { RepairWorkshop, WorkshopRepairJob } from "../workshop/RepairWorkshop";
import type { StationId } from "../config/stations";
import { STATIONS } from "../config/stations";
import { renderSmartphoneScreen } from "../scene/textures/smartphoneScreen";
import { SHELL_HTML } from "./shellTemplate";
import { getBuyerAcceptChance, getKnownStockValue, getSuggestedBuyerPrice } from "../data/BuyerLogic";

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
  saveSystem: SaveSystem,
  audio: AudioSystem,
  rng: SeededRNG,
  phone: Group,
  phoneBody: Mesh,
  phoneBack: Mesh,
  screen: Mesh,
  crack1: Mesh,
  crack2: Mesh,
  batteryMarker: Mesh,
  bodyMarker: Mesh,
  funcMarker: Mesh,
  phoneFrameMat: MeshStandardMaterial,
  phoneBackMat: MeshStandardMaterial,
  phoneScreenMat: MeshStandardMaterial,
  cameraBumpMat: MeshStandardMaterial,
  elmaCamGroup: Group,
  elmaDuoCamGroup: Group,
  samsamCamGroup: Group,
  shaomiCamGroup: Group,
  redmiCamGroup: Group,
  pocoCamGroup: Group,
  jacket: MeshStandardMaterial,
  customerGroup: Group,
  legLeft: Mesh,
  legRight: Mesh,
  armLeft: Mesh,
  armRight: Mesh,
  headMesh: Mesh,
  ammeterUnit: Group,
  ammeterDisplayMat: MeshStandardMaterial,
  cablePlugGroup: Group,
  batteryTesterGroup: Group,
  phoneScreenCanvas: HTMLCanvasElement,
  phoneScreenTexture: CanvasTexture,
  updateBatteryLcd: (
    state: "idle" | "testing" | "done",
    progress?: number,
    isHealthy?: boolean,
    healthPct?: number,
  ) => void,
  updateCableMesh: (isPlugged: boolean) => void,
  camTargetPos: Vector3,
  camTargetLook: Vector3,
  resetLookOffset: () => void,
  applyLookDrag: (dx: number, dy: number) => void,
  wakeRender: (ms?: number) => void,
  workshop: RepairWorkshop,
  camera: PerspectiveCamera,
  scene: Scene,
): ShopUiHandle {
  let timeMinutes = 9 * 60;
  let customersServedToday = 0;
  const stockItems: StockPhoneItem[] = [];

  type CustomerState = "WAITING" | "WALKING_IN" | "PLACING_PHONE" | "INTERACTING" | "WALKING_OUT";
  let customerState: CustomerState = "WAITING";
  let customerWaitTimer = 32; // 30 - 40 sn müşteri bekleme süresi
  let walkAnimCycle = 0;
  let placingTimer = 0;
  let phonePlacedSoundPlayed = false;
  let isScreenPoweredOn = false;
  let isChargerPlugged = false;
  let isInspecting = false;
  let inCameraApp = false;
  let shutterFlash = false;
  let batteryTestInterval: number | null = null;
  let activeToolDragging: "none" | "charger" = "none";
  let lastPhoneTapTime = 0;
  let isSpeechBubbleOpen = false;
  let typewriterTimer: number | null = null;
  let selectedStockIdx = 0;

  const chargerDockPos = new Vector3(0.23, 1.274, 0.22);
  const chargePortPos = new Vector3(0.096, 1.278, 0.22);
  const benchPlane = new Plane(new Vector3(0, 1, 0), -1.274);

  let encounter = generateCustomerEncounter(rng, store.getState().reputation, stockItems.length);
  store.setRngState(rng.getState());
  let currentOffer =
    encounter.customer.intent === "sell"
      ? roundTo50(encounter.phone.baseValue * 0.82)
      : encounter.customer.intent === "repair"
        ? roundTo50(encounter.customer.initialAskPrice * 0.95)
        : encounter.customer.initialAskPrice;
  let dealFinished = false;
  let repairAgreed = false;
  let workshopRepaired = false;

  interface ActiveBenchRepair {
    customer: ReturnType<typeof generateCustomerEncounter>["customer"];
    phone: ReturnType<typeof generateCustomerEncounter>["phone"];
    defect: ReturnType<typeof generateCustomerEncounter>["phone"]["defects"][number];
    agreedPrice: number;
    partCost: number;
    remainingSeconds: number;
    totalSeconds: number;
    isRepaired: boolean;
  }
  let activeBenchRepair: ActiveBenchRepair | null = null;
  let isReturningCustomerActive = false;
  let bubbleAction: "inspect" | "offer" | "reject" | "close" = "close";
  let falseDiagnosisClaimed = false;
  let successfulLieDiscount = 0;
  let caughtLies = 0;
  let successfulLies = 0;
  const rejectedClaims = new Set<InspectionCategoryId>();
  const claimLines: string[] = [];
  const claimPhrases: Record<InspectionCategoryId, string> = {
    battery: "Batarya bozuk",
    camera: "Kamera bozuk",
    screen: "Ekran çatlak",
  };
  const claimDenials: Record<InspectionCategoryId, string> = {
    battery: "Hayır usta, pilimde hiçbir sorun yok.",
    camera: "Hayır usta, kameram gayet düzgün çalışıyor.",
    screen: "Hayır usta, ekranım çatlak değil.",
  };
  let pendingPlayerOfferText = "";
  const diagnosedCategories = new Set<InspectionCategoryId>();
  const diagnosisOptions: ReadonlyArray<{ id: InspectionCategoryId; label: string }> = [
    { id: "screen", label: "Ekran kırık" },
    { id: "camera", label: "Kamera bozuk" },
    { id: "battery", label: "Batarya zayıf" },
  ];
  let station: StationId = "counter";

  let lastTransactionSummary: {
    intent?: CustomerIntent;
    phoneModel: string;
    boughtPrice: number;
    actualValue: number;
    netProfit: number;
    repDelta: number;
    foundDefects: ReadonlyArray<{ title: string; valueLoss: number }>;
    missedDefects: ReadonlyArray<{ title: string; valueLoss: number }>;
    stockUid: string;
    sold: boolean;
    repairTitle?: string;
    repairPartCost?: number;
  } | null = null;

  const formatTime = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const updateScreenDisplay = (): void => {
    const ph = encounter.phone;
    const isCamWorking = !ph.defects.some((d) => d.category === "camera");
    renderSmartphoneScreen(
      phoneScreenCanvas,
      ph,
      isScreenPoweredOn,
      inCameraApp,
      isCamWorking,
      shutterFlash,
    );
    phoneScreenTexture.needsUpdate = true;
  };

  const shell = document.createElement("div");
  shell.className = "game-ui";
  shell.innerHTML = SHELL_HTML;

  root.append(shell);

  const stationNav = shell.querySelector<HTMLElement>(".station-nav")!;
  for (const st of STATIONS) {
    const button = document.createElement("button");
    button.className = `station-button${st.id === "counter" ? " active" : ""}`;
    button.dataset["station"] = st.id;
    button.innerHTML = `<span>${st.title}</span><small>${st.description}</small>`;
    stationNav.append(button);
  }

  const select = <T extends HTMLElement>(selector: string): T => shell.querySelector<T>(selector)!;
  const moneyEl = select<HTMLElement>("[data-money]");
  const repEl = select<HTMLElement>("[data-rep]");
  const dayEl = select<HTMLElement>("[data-day]");
  const customerInitials = select<HTMLElement>("[data-customer-initials]");
  const customerEyebrow = select<HTMLElement>("[data-customer-eyebrow]");
  const customerName = select<HTMLElement>("[data-customer-name]");
  const customerRequest = select<HTMLElement>("[data-customer-request]");
  const nextCustomerBtn = select<HTMLButtonElement>(".next-customer");
  const shopStatusEl = select<HTMLElement>("[data-shop-status]");
  const titleEl = select<HTMLElement>("[data-panel-title]");
  const copyEl = select<HTMLElement>("[data-panel-copy]");
  const kickerEl = select<HTMLElement>("[data-panel-kicker]");
  const inspectGridEl = select<HTMLElement>("[data-inspect-grid]");
  const mainActionsEl = select<HTMLElement>("[data-main-actions]");
  const inspectBtn = select<HTMLButtonElement>(".inspect-btn");
  const diagnoseBtn = select<HTMLButtonElement>(".diagnose-btn");
  const diagnosticEl = select<HTMLElement>(".diagnostic");
  const backdropEl = select<HTMLElement>(".modal-backdrop");
  const toastEl = select<HTMLElement>(".toast");
  const qualityRowEl = select<HTMLElement>("[data-quality-row]");
  const toggleAudioBtn = select<HTMLButtonElement>(".toggle-audio-btn");

  // Üst sol menü, Stoktaki Telefonlar ve Telefonlar & Fiyatlar rehberi
  const stockMenuBtn = select<HTMLButtonElement>("[data-stock-menu-btn]");
  const stockMenuPanel = select<HTMLElement>("[data-stock-menu]");
  const stockModalEl = select<HTMLElement>("[data-stock-modal]");
  const priceGuideModalEl = select<HTMLElement>("[data-price-guide-modal]");
  const openStockListBtn = select<HTMLButtonElement>("[data-open-stock-list]");
  const openPriceGuideBtn = select<HTMLButtonElement>("[data-open-price-guide]");
  const priceGuideListEl = select<HTMLElement>("[data-price-guide-list]");
  const priceHelpBtn = select<HTMLButtonElement>("[data-price-help-btn]");
  const priceHelpBox = select<HTMLElement>("[data-price-help-box]");
  const menuStockBadge = select<HTMLElement>("[data-menu-stock-badge]");
  const stockMenuList = select<HTMLElement>("[data-stock-list]");
  const stockMenuSummary = select<HTMLElement>("[data-stock-summary]");
  const stockMenuCount = select<HTMLElement>("[data-stock-count]");
  let activeStockRepairUid: string | null = null;
  const formatLira = (value: number): string => `₺${Math.round(value).toLocaleString("tr-TR")}`;

  priceGuideListEl.innerHTML = PHONE_MODELS.map(
    (m, idx) => `<article class="stock-list-row price-guide-row">
      <div class="stock-col-model">
        <strong>${idx + 1}. ${m.brand} ${m.model}</strong>
        <small>${m.storage} · Sorunsuz Piyasa Değeri</small>
      </div>
      <div class="stock-col-market good">
        <b>${formatLira(m.basePrice)}</b>
        <small>Sorunsuz 2. El</small>
      </div>
    </article>`,
  ).join("");

  const renderStockMenu = (): void => {
    stockMenuCount.textContent = String(stockItems.length);
    stockMenuCount.hidden = stockItems.length === 0;
    menuStockBadge.textContent = `${stockItems.length} Cihaz →`;
    if (stockModalEl.hidden) return;
    const totalCost = stockItems.reduce((sum, item) => sum + item.boughtPrice, 0);
    const totalMarket = stockItems.reduce((sum, item) => sum + getKnownStockValue(item), 0);
    stockMenuSummary.innerHTML = `<span>TOPLAM ${stockItems.length} TELEFON</span><span>TOPLAM ALIŞ: ${formatLira(totalCost)}</span><span>TOPLAM PİYASA DEĞERİ: ${formatLira(totalMarket)}</span>`;
    stockMenuList.innerHTML =
      stockItems.length === 0
        ? `<p class="stock-menu-empty">Stokta henüz telefon yok. Müşteriden telefon satın aldığında burada listelenir.</p>`
        : stockItems
            .map((item, idx) => {
              const marketVal = getKnownStockValue(item);
              const diff = marketVal - item.boughtPrice;
              const diffSign = diff >= 0 ? "+" : "";
              const totalDefects = item.foundDefects.length + item.missedDefects.length;
              const repairBtnHtml =
                totalDefects > 0
                  ? `<button type="button" class="stock-repair-btn" data-repair-stock="${item.uid}">🔧 Tamir Et (+%${totalDefects * 20} Değer)</button>`
                  : `<span class="stock-clean-pill">✓ Sorunsuz (Tam Değer)</span>`;
              return `<article class="stock-list-row">
                <div class="stock-col-model">
                  <strong>${idx + 1}. ${item.brand} ${item.model}</strong>
                  <small>${repairBtnHtml}</small>
                </div>
                <div class="stock-col-bought">
                  <b>${formatLira(item.boughtPrice)}</b>
                  <small>Aldığı Fiyat</small>
                </div>
                <div class="stock-col-market ${diff >= 0 ? "good" : "bad"}">
                  <b>${formatLira(marketVal)}</b>
                  <small>${diffSign}${formatLira(diff)} fark</small>
                </div>
              </article>`;
            })
            .join("");
  };

  stockMenuList.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-repair-stock]");
    if (!btn) return;
    activeStockRepairUid = btn.dataset["repairStock"] ?? null;
    stockModalEl.hidden = true;
    audio.unlock();
    audio.playTap();
    workshop.enter();
  });

  const setStockMenuOpen = (open: boolean): void => {
    stockMenuPanel.hidden = !open;
    stockMenuBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      audio.unlock();
      audio.playTap();
      renderStockMenu();
    }
    wakeRender(400);
  };

  const setStockModalOpen = (open: boolean): void => {
    stockModalEl.hidden = !open;
    if (open) {
      priceGuideModalEl.hidden = true;
      stockMenuPanel.hidden = true;
      stockMenuBtn.setAttribute("aria-expanded", "false");
      audio.unlock();
      audio.playTap();
      renderStockMenu();
    }
    wakeRender(400);
  };

  const setPriceGuideOpen = (open: boolean): void => {
    priceGuideModalEl.hidden = !open;
    if (open) {
      stockModalEl.hidden = true;
      stockMenuPanel.hidden = true;
      stockMenuBtn.setAttribute("aria-expanded", "false");
      audio.unlock();
      audio.playTap();
    }
    wakeRender(400);
  };

  stockMenuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setStockMenuOpen(Boolean(stockMenuPanel.hidden));
  });
  openStockListBtn.addEventListener("click", () => setStockModalOpen(true));
  openPriceGuideBtn.addEventListener("click", () => setPriceGuideOpen(true));
  priceHelpBtn.addEventListener("click", () => {
    audio.unlock();
    audio.playTap();
    priceHelpBox.classList.remove("pulse");
    void priceHelpBox.offsetWidth;
    priceHelpBox.classList.add("pulse");
    notify("💡 Batarya bozuksa −%20, Ekran bozuksa −%20, Kamera bozuksa −%20 değer düşer.");
  });
  shell.querySelector("[data-stock-menu-close]")?.addEventListener("click", () => setStockMenuOpen(false));
  shell.querySelector("[data-stock-modal-close]")?.addEventListener("click", () => setStockModalOpen(false));
  shell.querySelector("[data-price-guide-close]")?.addEventListener("click", () => setPriceGuideOpen(false));
  stockModalEl.addEventListener("click", (event) => {
    if (event.target === stockModalEl) setStockModalOpen(false);
  });
  priceGuideModalEl.addEventListener("click", (event) => {
    if (event.target === priceGuideModalEl) setPriceGuideOpen(false);
  });
  const onStockMenuOutsidePress = (event: PointerEvent): void => {
    if (stockMenuPanel.hidden) return;
    const target = event.target;
    if (target instanceof Node && (stockMenuPanel.contains(target) || stockMenuBtn.contains(target))) return;
    setStockMenuOpen(false);
  };
  window.addEventListener("pointerdown", onStockMenuOutsidePress);

  const customerCardEl = select<HTMLElement>(".customer-card");
  const workPanelEl = select<HTMLElement>(".work-panel");

  // Özel İnceleme Ekranı DOM öğeleri
  const inspectionHud = select<HTMLElement>(".inspection-hud");
  const diagnosisPanel = select<HTMLElement>("[data-diagnosis-panel]");
  const diagnosisOptionsRoot = select<HTMLElement>("[data-diagnosis-options]");
  const inspectBrandEl = select<HTMLElement>("[data-inspect-brand]");
  const inspectTitleEl = select<HTMLElement>("[data-inspect-title]");
  const inspectStatusEl = select<HTMLElement>("[data-inspect-status]");
  const dockSummaryEl = select<HTMLElement>("[data-dock-summary]");
  const exitInspectBtn = select<HTMLButtonElement>(".exit-inspect-btn");
  const toBargainBtn = select<HTMLButtonElement>(".to-bargain-btn");

  const batteryLiveOverlay = select<HTMLElement>(".battery-live-overlay");
  const batteryLiveVal = select<HTMLElement>("[data-battery-val]");
  const batteryLiveFill = select<HTMLElement>(".battery-live-fill");
  const cameraLiveOverlay = select<HTMLElement>(".camera-live-overlay");

  const speechBubbleOverlay = select<HTMLElement>(".speech-bubble-overlay");
  const bubbleAvatar = select<HTMLElement>("[data-bubble-avatar]");
  const bubbleName = select<HTMLElement>("[data-bubble-name]");
  const bubbleIntent = select<HTMLElement>("[data-bubble-intent]");
  const bubbleText = select<HTMLElement>("[data-bubble-text]");
  const bubbleFooterText = select<HTMLElement>("[data-bubble-footer-copy]");

  let toastTimer = 0;

  const notify = (message: string): void => {
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("visible"), 2500);
  };

  const openSpeechBubble = (text: string, speaker: "customer" | "player" = "customer"): void => {
    isSpeechBubbleOpen = true;
    speechBubbleOverlay.hidden = false;
    speechBubbleOverlay.classList.toggle("player-speech", speaker === "player");
    bubbleAvatar.textContent = speaker === "player" ? "🧑‍🔧" : encounter.customer.initials;
    bubbleName.textContent = speaker === "player" ? "Sen · Telefoncu" : encounter.customer.name;
    const isRepairRequest = speaker === "customer" && (encounter.customer.intent === "repair" || encounter.customer.intent === "sell");
    bubbleAction = speaker === "player" ? "offer" : isRepairRequest ? "inspect" : "close";
    bubbleFooterText.textContent = speaker === "player" ? "Teklifini müşteriye sun" : isRepairRequest ? (encounter.customer.intent === "repair" ? "Şikâyeti kontrol etmek için telefonu incele" : "Değerini belirlemek için telefonu incele") : "Kapatmak için devam et";
    const dismissButton = speechBubbleOverlay.querySelector<HTMLButtonElement>(".bubble-dismiss-btn");
    if (dismissButton) dismissButton.innerHTML = speaker === "player" ? "TEKLİFİ SUN <span>→</span>" : isRepairRequest ? "TELEFONU İNCELE <span>→</span>" : "DEVAM ET <span>→</span>";

    const intent = encounter.customer.intent;
    bubbleIntent.className = "bubble-intent-badge " + (speaker === "player" ? "repair" : intent);
    bubbleIntent.textContent = speaker === "player" ? "🔎 USTA TESPİTİ" : intent === "sell" ? "🏷️ TELEFON SATIŞI" : intent === "repair" ? "🔧 TAMİR TALEBİ" : "🛒 TELEFON ALIMI";

    bubbleText.textContent = "";
    if (speaker === "customer") audio.playCustomerSpeech(); else audio.playTap();

    if (typewriterTimer !== null) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }

    let charIdx = 0;
    typewriterTimer = window.setInterval(() => {
      if (charIdx < text.length) {
        bubbleText.textContent = text.slice(0, charIdx + 1);
        charIdx += 1;
        wakeRender(80);
      } else {
        if (typewriterTimer !== null) {
          clearInterval(typewriterTimer);
          typewriterTimer = null;
        }
      }
    }, 22);

    wakeRender(1200);
  };

  const closeSpeechBubble = (): void => {
    if (!isSpeechBubbleOpen) return;
    isSpeechBubbleOpen = false;
    speechBubbleOverlay.hidden = true;
    if (typewriterTimer !== null) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
    audio.stopCustomerSpeech();
    audio.playTap();
    wakeRender(800);

    if (encounter.customer.intent === "buy" && stockItems.length === 0 && !workshop.isWorkshopActive) {
      notify("Vitrinde satılık telefon olmadığı için müşteri ayrıldı.");
      window.setTimeout(() => {
        dismissCustomerAndStartWaiting();
      }, 700);
    }
  };

  speechBubbleOverlay.addEventListener("click", () => {
    // Satış / tamir müşterisinde balonun neresine tıklanırsa tıklansın telefon incelemeye alınır.
    if (bubbleAction === "inspect") speechBubbleOverlay.querySelector<HTMLButtonElement>(".bubble-dismiss-btn")?.click();
    else closeSpeechBubble();
  });
  speechBubbleOverlay.querySelector(".bubble-dismiss-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const action = bubbleAction;
    closeSpeechBubble();
    if (action === "inspect") {
      if (encounter.customer.intent === "buy") setStation("display");
      else setStation("repair", false);
    }
    else if (action === "offer" && falseDiagnosisClaimed) {
      openSpeechBubble("Hayır usta, telefonumun " + (diagnosisOptions.find((option) => !encounter.phone.defects.some((defect) => defect.category === option.id) && diagnosedCategories.has(option.id))?.label.toLowerCase() ?? "bu parçası") + " bozuk değil. Böyle bir işlem istemiyorum, vazgeçtim.", "customer");
      bubbleAction = "reject";
      const rejectButton = speechBubbleOverlay.querySelector<HTMLButtonElement>(".bubble-dismiss-btn");
      if (rejectButton) rejectButton.innerHTML = "MÜŞTERİYİ UĞURLA <span>→</span>";
      bubbleFooterText.textContent = "Müşteri yanlış arıza iddiasına itiraz ediyor";
    } else if (action === "reject") {
      store.addReputation(-1);
      updateHUD(store.getState());
      notify("Müşteri vazgeçti · İtibar −1");
      dismissCustomerAndStartWaiting();
    } else if (action === "offer") handleOfferSubmission();
  });

  const sync3DSceneToEncounter = (): void => {
    const { phone: ph, customer: cust } = encounter;
    phone.visible =
      (customerState === "INTERACTING" || customerState === "PLACING_PHONE") &&
      cust.intent !== "buy";
    customerGroup.visible = customerState !== "WAITING";

    jacket.color.set(cust.personality.jacketColor);
    phoneFrameMat.color.set(ph.frameColor);
    phoneBackMat.color.set(ph.bodyColor);
    cameraBumpMat.color.set(ph.cameraColor);

    // Gerçekçi kamera modülleri (Apple Pro, Apple Duo, Samsung, Xiaomi, Redmi, Poco)
    elmaCamGroup.visible = ph.cameraStyle === "elma";
    elmaDuoCamGroup.visible = ph.cameraStyle === "elma_duo";
    samsamCamGroup.visible = ph.cameraStyle === "samsam";
    shaomiCamGroup.visible = ph.cameraStyle === "shaomi";
    redmiCamGroup.visible = ph.cameraStyle === "redmi";
    pocoCamGroup.visible = ph.cameraStyle === "poco";

    phoneScreenMat.color.set(isScreenPoweredOn ? "#1f4842" : ph.screenTint);
    screen.material = phoneScreenMat;

    const screenDefectFound = ph.defects.some((d) => d.category === "screen" && d.found);
    const batteryDefectFound = ph.defects.some((d) => d.category === "battery" && d.found);
    const cameraDefectFound = ph.defects.some((d) => d.category === "camera" && d.found);

    crack1.visible = screenDefectFound;
    crack2.visible = screenDefectFound;
    batteryMarker.visible = batteryDefectFound;
    bodyMarker.visible = false;
    funcMarker.visible = cameraDefectFound;

    updateScreenDisplay();
    wakeRender(1600);
  };

  const updateHUD = (state: ReturnType<GameStore["getState"]>): void => {
    moneyEl.textContent = `₺${Math.floor(state.money).toLocaleString("tr-TR")}`;
    repEl.textContent = `${Math.round(state.reputation)} / 100`;
    dayEl.textContent = `G${String(state.day).padStart(2, "0")} · ${formatTime(timeMinutes)}`;
    renderStockMenu();

    const quota = getDailyCustomerQuota(state.reputation);
    if (customerState === "WAITING") {
      shopStatusEl.textContent = `DÜKKÂN AÇIK · YENİ MÜŞTERİ BEKLENİYOR (${Math.ceil(customerWaitTimer)}s)`;
    } else {
      shopStatusEl.textContent = `MÜŞTERİ TEZGÂHTA (${customersServedToday + 1}/${quota} · STOK ${stockItems.length})`;
    }

    qualityRowEl.querySelectorAll<HTMLElement>("[data-q]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["q"] === state.settings.quality);
    });
    toggleAudioBtn.textContent = state.settings.audioEnabled ? "AÇIK" : "KAPALI";
  };

  const updateCustomerHeader = (): void => {
    if (isReturningCustomerActive && activeBenchRepair) {
      customerInitials.textContent = activeBenchRepair.customer.initials;
      customerEyebrow.textContent = activeBenchRepair.isRepaired ? "CİHAZI ALMAYA GELDİ · TAMİR EDİLDİ" : "CİHAZI ALMAYA GELDİ · SÜRE DOLDU!";
      customerName.textContent = activeBenchRepair.customer.name;
      customerRequest.textContent = activeBenchRepair.isRepaired
        ? `"Selam usta, 1 saat doldu telefonumu almaya geldim!"`
        : `"Selam usta! 1 saat doldu, telefonum hazır mı?"`;
      nextCustomerBtn.textContent = "TESLİMAT";
      return;
    }

    if (customerState === "WAITING") {
      customerInitials.textContent = "⏳";
      if (activeBenchRepair) {
        const sec = Math.max(0, Math.ceil(activeBenchRepair.remainingSeconds));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        customerEyebrow.textContent = `ATÖLYEDE TAMİRDE (TEK İŞÇİ) · KALAN: ${timeStr}`;
        customerName.textContent = activeBenchRepair.isRepaired ? "✓ Tamir Bitti (Müşteri Bekleniyor)" : "Tamir Devam Ediyor";
        customerRequest.textContent = activeBenchRepair.isRepaired
          ? `${activeBenchRepair.customer.name} cihazı almaya gelecek (~${timeStr} kaldı).`
          : `${activeBenchRepair.phone.brand} ${activeBenchRepair.phone.model} atölyede onarılıyor (~${timeStr} sonra müşteri gelecek).`;
        nextCustomerBtn.textContent = "BEKLE";
        return;
      }
      customerEyebrow.textContent = "DÜKKÂN SAKİN · MÜŞTERİ BEKLENİYOR";
      customerName.textContent = "Tezgâhta Bekliyorsun";
      customerRequest.textContent = `Sıradaki müşteri ~${Math.max(1, Math.ceil(customerWaitTimer))} saniye içinde kapıdan girecek.`;
      nextCustomerBtn.textContent = "🔔 KAPIDAN ÇAĞIR";
      return;
    }

    if (customerState === "WALKING_IN") {
      customerInitials.textContent = "🚶";
      customerEyebrow.textContent = "KAPI ZİLİ ÇALDI · GELİYOR...";
      customerName.textContent = `${encounter.customer.name} Tezgâha Yaklaşıyor`;
      customerRequest.textContent =
        encounter.customer.intent === "sell"
          ? `${encounter.phone.brand} ${encounter.phone.model} satmak istiyor.`
          : encounter.customer.intent === "repair"
            ? `${encounter.phone.brand} ${encounter.phone.model} tamir ettirmek istiyor.`
            : `İkinci el ${encounter.customer.buyerTargetBrand} telefon almak istiyor.`;
      nextCustomerBtn.textContent = "BEKLE";
      return;
    }

    if (customerState === "PLACING_PHONE") {
      customerInitials.textContent = "🗣️";
      customerEyebrow.textContent = "MÜŞTERİ TEZGÂHTA · KONUŞUYOR";
      customerName.textContent = `${encounter.customer.name}`;
      customerRequest.textContent =
        encounter.customer.intent === "buy"
          ? `"${encounter.customer.name} vitrine bakıyor..."`
          : `"${encounter.customer.name} telefonu tezgâhın üzerindeki inceleme matına bırakıyor."`;
      nextCustomerBtn.textContent = "DİNLE";
      return;
    }

    const { phone: ph, customer: cust } = encounter;
    customerInitials.textContent = cust.initials;
    const intentLabel =
      cust.intent === "sell"
        ? "🏷️ SATIŞ"
        : cust.intent === "repair"
          ? "🔧 TAMİR"
          : "🛒 ALIM";
    customerEyebrow.textContent = `${intentLabel} · ${cust.personality.label} MÜŞTERİ · SABIR %${cust.patience} · TUR ${cust.bargainRound}/${cust.maxBargainRounds}`;
    customerName.textContent =
      cust.intent === "buy"
        ? `${cust.name} · Telefon Arıyor`
        : `${cust.name} · ${ph.brand} ${ph.model} (${ph.storage})`;
    customerRequest.textContent =
      cust.intent === "buy"
        ? `Aradığı: ${cust.buyerTargetBrand} · "${cust.lastResponse}"`
        : `Talep / Teklif: ₺${cust.currentAskPrice.toLocaleString("tr-TR")} · "${cust.lastResponse}"`;
    nextCustomerBtn.textContent = "YENİ MÜŞTERİ ↗";

    if (cust.intent === "sell") {
      inspectBtn.textContent = "CİHAZI İNCELE";
      diagnoseBtn.innerHTML = "PAZARLIĞA GEÇ <span>→</span>";
      toBargainBtn.innerHTML = "PAZARLIĞA GEÇ <span>→</span>";
    } else if (cust.intent === "repair") {
      inspectBtn.textContent = "ARIZAYI İNCELE";
      diagnoseBtn.innerHTML = "TAMİR FİYATI VER <span>→</span>";
      toBargainBtn.innerHTML = "TAMİR FİYATI VER <span>→</span>";
    } else {
      inspectBtn.textContent = "VİTRİNİ AÇ";
      diagnoseBtn.innerHTML = "CİHAZ ÖNER & SAT <span>→</span>";
      toBargainBtn.innerHTML = "SATIŞA DÖN <span>→</span>";
    }
  };

  const updateInspectionHud = (): void => {
    const { phone: ph, customer: cust } = encounter;
    inspectBrandEl.textContent = `${ph.brand.toUpperCase()} · ${ph.model.toUpperCase()} (${ph.storage})`;
    inspectTitleEl.textContent = `${ph.brand} ${ph.model} · ${ph.storage} (${ph.ageYears} Yıllık Cihaz)`;

    let checkedCount = 0;
    for (const cat of INSPECTION_CATEGORIES) {
      if (ph.inspected[cat.id]) checkedCount += 1;
    }
    const foundDefects = ph.defects.filter((d) => d.found);

    if (checkedCount === 0) {
      inspectStatusEl.textContent = `Bataryayı test cihazıyla; ekranı ve kamerayı telefondan kontrol et. Müşteri Sabrı: %${cust.patience}`;
    } else if (foundDefects.length > 0) {
      inspectStatusEl.textContent = `⚠ ${foundDefects.length} Arıza Bulundu (−₺${foundDefects.reduce((s, d) => s + d.valueLoss, 0).toLocaleString("tr-TR")}) · Sabır: %${cust.patience}`;
    } else if (checkedCount === INSPECTION_CATEGORIES.length) {
      inspectStatusEl.textContent = `✓ Tüm kontroller yapıldı, cihaz kusursuz görünüyor! · Sabır: %${cust.patience}`;
    } else {
      inspectStatusEl.textContent = `${checkedCount}/${INSPECTION_CATEGORIES.length} kontrol yapıldı, henüz kusur bulunmadı · Sabır: %${cust.patience}`;
    }

    dockSummaryEl.textContent = `${checkedCount}/${INSPECTION_CATEGORIES.length} KONTROL TAMAMLANDI`;

    // İnceleme ipuçları çubuğundaki (inspect-hints-bar) pill durumlarını güncelle
    const batteryHint = shell.querySelector<HTMLElement>("[data-hint='battery']");
    const screenHint = shell.querySelector<HTMLElement>("[data-hint='screen']");
    const cameraHint = shell.querySelector<HTMLElement>("[data-hint='camera']");

    // 1. Batarya test durumu
    if (ph.inspected["battery"]) {
      const battDefect = ph.defects.find((d) => d.category === "battery");
      const battRating = getBatteryRating(ph.batteryHealth, !!battDefect);
      if (batteryHint) {
        if (battRating === "ÇOK KÖTÜ" || battRating === "KÖTÜ") {
          batteryHint.className = "hint-pill warn";
          batteryHint.innerHTML = `<b>⚠ Batarya:</b> %${ph.batteryHealth} (${battRating})`;
        } else {
          batteryHint.className = "hint-pill good";
          batteryHint.innerHTML = `<b>✓ Batarya:</b> %${ph.batteryHealth} (${battRating})`;
        }
      }
    } else if (batteryHint) {
      batteryHint.className = "hint-pill";
      batteryHint.innerHTML = "<b>⚡ Test Kablosunu Bağla:</b> Batarya Test Cihazı";
    }

    // 3. Kamera durumu
    if (ph.inspected["camera"]) {
      const camDef = ph.defects.find((d) => d.category === "camera");
      if (cameraHint) {
        if (camDef) {
          cameraHint.className = "hint-pill warn";
          cameraHint.innerHTML = `<b>⚠ Kamera:</b> ${camDef.title}`;
        } else {
          cameraHint.className = "hint-pill good";
          cameraHint.innerHTML = "<b>✓ Kamera:</b> Sensör Net, Zemin Görünüyor";
        }
      }
    } else if (cameraHint) {
      cameraHint.className = "hint-pill";
      cameraHint.innerHTML = "<b>📸 Kamera:</b> Uygulamayı Aç & Test Et";
    }

    // 4. Ekran güç durumu
    if (screenHint) {
      screenHint.innerHTML = `<b>👆👆 Çift Dokun:</b> Ekranı ${isScreenPoweredOn ? "Kapat" : "Aç"}`;
    }
    renderDiagnosisPanel();
  };

  const runBatteryTest3Seconds = (): void => {
    if (batteryTestInterval !== null) {
      clearInterval(batteryTestInterval);
      batteryTestInterval = null;
    }
    audio.unlock();
    isChargerPlugged = true;
    cablePlugGroup.position.set(0.119, 1.278, 0.22);
    cablePlugGroup.rotation.set(0, 0, 0);
    updateCableMesh(true);
    audio.playCablePlug();
    ammeterDisplayMat.color.set("#38bdf8"); // Canlı camgöbeği elektrik akımı

    batteryLiveOverlay.hidden = false;
    const overlayHeading = batteryLiveOverlay.querySelector("strong");
    if (overlayHeading) overlayHeading.textContent = "⚡ BATARYA ANALİZİ YAPILIYOR...";
    batteryLiveVal.style.color = "var(--gold)";
    batteryLiveVal.textContent = "%0";
    batteryLiveFill.style.width = "0%";
    notify("⚡ Batarya test kablosu bağlandı. Analiz yapılıyor (3 sn)...");
    updateBatteryLcd("testing", 0);

    const startTime = performance.now();
    const durationMs = 3000;

    batteryTestInterval = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, Math.floor((elapsed / durationMs) * 100));
      batteryLiveVal.textContent = `%${progress}`;
      batteryLiveFill.style.width = `${progress}%`;
      audio.playProgressTick(480 + progress * 7);
      updateBatteryLcd("testing", progress);
      wakeRender(120);

      if (progress >= 100) {
        if (batteryTestInterval !== null) {
          clearInterval(batteryTestInterval);
          batteryTestInterval = null;
        }
        const ph = encounter.phone;
        const defect = ph.defects.find((d) => d.category === "battery");
        const isHealthy = !defect;
        const healthPct = ph.batteryHealth ?? (isHealthy ? 96 : 54);
        const rating: BatteryRating = getBatteryRating(healthPct, !isHealthy);

        updateBatteryLcd("done", 100, isHealthy, healthPct);

        if (rating === "ÇOK KÖTÜ" || rating === "KÖTÜ") {
          audio.playDefect();
          if (defect) batteryMarker.visible = true; // 3B Şişmiş batarya göstergesi
          if (overlayHeading) overlayHeading.textContent = "⚠ BATARYA ANALİZİ TAMAMLANDI";
          batteryLiveVal.textContent = `%${healthPct} · ${rating}`;
          batteryLiveVal.style.color = rating === "ÇOK KÖTÜ" ? "#f87171" : "#fb923c";
          ammeterDisplayMat.color.set("#ef4444"); // Kırmızı uyarı
          runCategoryInspection("battery");
          notify(`⚠ Batarya Test Cihazı: Pil Sağlığı %${healthPct} · Durum: ${rating} (${defect?.title || "Aşınmış Batarya"})`);
        } else {
          audio.playClean();
          if (overlayHeading) overlayHeading.textContent = "✓ BATARYA ANALİZİ TAMAMLANDI";
          batteryLiveVal.textContent = `%${healthPct} · ${rating}`;
          batteryLiveVal.style.color = rating === "ÇOK İYİ" ? "#22d3ee" : rating === "İYİ" ? "#4ade80" : "#facc15";
          ammeterDisplayMat.color.set("#10b981"); // Yeşil temiz akım
          runCategoryInspection("battery");
          notify(`✓ Batarya Test Cihazı: Pil Sağlığı %${healthPct} · Durum: ${rating}`);
        }
        updateInspectionHud();
        window.setTimeout(() => {
          batteryLiveOverlay.hidden = true;
        }, 4000);
      }
    }, 60);
  };

  const runChargerTest = (): void => {
    runBatteryTest3Seconds();
  };

  const runScreenPowerToggle = (): void => {
    audio.unlock();
    isScreenPoweredOn = !isScreenPoweredOn;
    if (!isScreenPoweredOn) inCameraApp = false;
    audio.playScreenClick(isScreenPoweredOn);
    updateScreenDisplay();
    if (isScreenPoweredOn) {
      phoneScreenMat.color.set("#ffffff");
      notify("📱 Ekran açıldı · Dokunmatik panel ve OLED aktif.");
      window.setTimeout(() => {
        runCategoryInspection("screen");
        updateInspectionHud();
      }, 350);
    } else {
      notify("📱 Ekran kapatıldı.");
      updateInspectionHud();
    }
    wakeRender(1200);
  };

  const runBatteryAnalyzerTest = (): void => {
    runBatteryTest3Seconds();
  };

  const runCameraTest = (): void => {
    audio.unlock();
    if (!isScreenPoweredOn) {
      isScreenPoweredOn = true;
    }
    inCameraApp = true;
    audio.playCameraShutter();
    updateScreenDisplay();

    const isCamWorking = !encounter.phone.defects.some(
      (d) => d.category === "camera",
    );
    if (isCamWorking) {
      cameraLiveOverlay.className = "camera-live-overlay good";
      cameraLiveOverlay.textContent =
        "📸 KAMERA SAĞLAM · Zemin & 'CEP DÜKKÂNI' logosu vizörde net görünüyor!";
      cameraLiveOverlay.hidden = false;
      notify("📸 Kamera açıldı · Zemin ve masa logosu net görülüyor (Kamera sağlam)");
    } else {
      cameraLiveOverlay.className = "camera-live-overlay bad";
      cameraLiveOverlay.textContent = "⚠ KAMERA HATASI · Siyah ekran, zemin ve logo görülemiyor!";
      cameraLiveOverlay.hidden = false;
      notify("⚠ Kamera açıldı · Siyah ekran! Sensör arızalı.");
    }
    window.setTimeout(() => {
      cameraLiveOverlay.hidden = true;
    }, 4500);

    runCategoryInspection("camera");
    updateInspectionHud();
    wakeRender(1200);
  };

  const runPhoneFlip = (): void => {
    audio.unlock();
    audio.playTap();
    phone.rotation.y = Math.abs(phone.rotation.y - Math.PI) < 0.8 ? 0 : Math.PI;
    notify(phone.rotation.y > 1.5 ? "Arka cam ve kamera adası gösteriliyor." : "Ön ekran gösteriliyor.");
    wakeRender(1200);
  };

  /** Oyuncunun söylediği arıza için tahmini değer kaybı (olmayan arıza söylenirse buna göre fiyat oynar). */
  const estimateDefectLoss = (category: InspectionCategoryId): number => {
    const pool = DEFECT_POOL[category];
    const avgRatio = pool.reduce((sum, item) => sum + item.lossRatio, 0) / Math.max(pool.length, 1);
    return roundTo50(encounter.phone.baseValue * avgRatio);
  };

  const showCustomerObjection = (text: string): void => {
    openSpeechBubble(text, "customer");
    bubbleAction = "close";
    bubbleFooterText.textContent = "Müşteri yalanını fark etti";
    const dismiss = speechBubbleOverlay.querySelector<HTMLButtonElement>(".bubble-dismiss-btn");
    if (dismiss) dismiss.innerHTML = "DEVAM ET <span>→</span>";
  };

  const renderDiagnosisPanel = (): void => {
    const intent = encounter.customer.intent;
    if (intent !== "repair" && intent !== "sell") {
      diagnosisPanel.hidden = true;
      return;
    }
    diagnosisPanel.hidden = false;
    const phoneData = encounter.phone;
    diagnosisOptionsRoot.innerHTML = diagnosisOptions.map((option) => {
      const tested = phoneData.inspected[option.id];
      const testedDefect = phoneData.defects.some((item) => item.category === option.id);
      const claimed = diagnosedCategories.has(option.id);
      const rejected = rejectedClaims.has(option.id);
      const state = claimed ? "MÜŞTERİYE SÖYLENDİ" : rejected ? "MÜŞTERİ İTİRAZ ETTİ" : tested ? (testedDefect ? "TESTTE ARIZA ÇIKTI" : "TEST TEMİZ ÇIKTI") : "HENÜZ TEST ETMEDİN";
      const tone = claimed ? "claimed" : rejected ? "rejected" : tested ? (testedDefect ? "fault" : "clear") : "";
      const locked = claimed || rejected || dealFinished;
      return '<button type="button" class="diagnosis-option ' + tone + '" data-diagnosis="' + option.id + '" ' + (locked ? "disabled" : "") + '><span>' + claimPhrases[option.id] + '</span><small>' + state + '</small></button>';
    }).join("") + '<button type="button" class="primary-btn inspection-finished-btn">İNCELEME BİTTİ <span>→</span></button>';
  };

  /**
   * Oyuncu müşteriye bir arıza söyler. Gerçek arıza ise fiyat gerçek mantıkla değişir;
   * olmayan bir arıza ise müşteri (kişiliğine göre) bazen yalanı fark eder, bazen anlamaz.
   *  - Satış müşterisi: söylenen arıza kadar fiyat kırılır.
   *  - Tamir müşterisi: şikâyet dışındaki her ek sorun için ücret yükselir.
   */
  const reportDiagnosisToCustomer = (category: InspectionCategoryId): void => {
    const { phone: ph, customer: cust } = encounter;
    const isRepair = cust.intent === "repair";
    if ((!isRepair && cust.intent !== "sell") || dealFinished || diagnosedCategories.has(category) || rejectedClaims.has(category)) return;
    audio.unlock();
    const phrase = claimPhrases[category];
    const defect = ph.defects.find((item) => item.category === category);
    const wasKnown = defect?.found === true;
    const estLoss = defect ? defect.valueLoss : estimateDefectLoss(category);
    const lira = (value: number): string => "₺" + value.toLocaleString("tr-TR");

    if (!defect) {
      // Oyuncu olmayan bir arızayı söylüyor: müşteri bazen anlar, bazen anlamaz.
      const baseNotice: Record<string, number> = { savvy: 0.75, stingy: 0.55, flexible: 0.35, hurried: 0.2 };
      const noticeChance = Math.min(0.95, (baseNotice[cust.personality.id] ?? 0.4) + 0.1 * (caughtLies + successfulLies));
      const noticed = rng.nextFloat() < noticeChance;
      store.setRngState(rng.getState());
      if (noticed) {
        rejectedClaims.add(category);
        caughtLies += 1;
        store.addReputation(-1);
        cust.patience = Math.max(0, cust.patience - Math.round(30 * cust.personality.patienceDecay));
        const leaves = caughtLies >= 2 || cust.patience <= 0;
        const objection = leaves
          ? "Beni kandırmaya çalışıyorsun usta! Başka dükkâna gidiyorum."
          : claimDenials[category] + " Beni kandırmaya çalışma usta!";
        cust.lastResponse = objection;
        if (leaves) {
          audio.playFail();
          dealFinished = true;
          customersServedToday += 1;
          store.addReputation(-2);
          titleEl.textContent = "Müşteri yalanını yakaladı ve ayrıldı";
          copyEl.textContent = "Olmayan arızaları söylemek güveni bozdu. Dürüst teşhis müşteriyi elde tutar.";
          notify("Müşteri yalanını yakaladı ve ayrıldı · İtibar −3");
        } else {
          audio.playTap();
          titleEl.textContent = "Müşteri yalanını fark etti";
          copyEl.textContent = "“" + phrase + "” demiştin ama müşteri anladı. Bir daha denersen gidebilir.";
          notify("Müşteri yalanını fark etti · İtibar −1");
        }
        showCustomerObjection(objection);
        sync3DSceneToEncounter();
        updateCustomerHeader();
        updateHUD(store.getState());
        updateInspectionHud();
        renderInspectionGrid();
        renderDiagnosisPanel();
        renderDiagnosticArea();
        return;
      }
      successfulLies += 1;
    }

    diagnosedCategories.add(category);
    if (defect) {
      defect.found = true;
      ph.inspected[category] = true;
      audio.playDefect();
    } else {
      audio.playTap();
    }

    let line: string;
    if (isRepair) {
      const requested = cust.repairTargetDefect;
      if (requested !== undefined && requested.category === category) {
        line = phrase + " şikâyetini doğruladım. Tamir teklifim " + lira(currentOffer) + ".";
        notify("Müşteri şikâyeti doğrulandı: " + phrase + ".");
      } else {
        currentOffer = roundTo50(currentOffer + 1000);
        cust.currentAskPrice = roundTo50(cust.currentAskPrice + 1000);
        cust.minAcceptPrice = roundTo50(cust.minAcceptPrice + 1000);
        line = phrase + ". Bu ek onarım için ücretimi ₺1.000 artırıyorum, yeni teklifim " + lira(currentOffer) + ".";
        cust.lastResponse = defect ? "Öyle mi, bilmiyordum. Tamam usta, onu da yap." : "Öyle mi usta? Ben fark etmemiştim... Peki, onu da yap.";
        notify("Ek arıza bildirildi · Tamir teklifine ₺1.000 eklendi.");
      }
    } else if (wasKnown) {
      line = phrase + " konusunu zaten konuşmuştuk, fiyatım " + lira(currentOffer) + ".";
    } else {
      const discount = roundTo50(estLoss * cust.personality.defectConcession);
      cust.minAcceptPrice = Math.max(400, cust.minAcceptPrice - discount);
      cust.currentAskPrice = Math.max(cust.minAcceptPrice, cust.currentAskPrice - roundTo50(discount * 0.85));
      if (!defect) successfulLieDiscount += roundTo50(estLoss * 0.85);
      currentOffer = roundTo50(Math.max(400, getKnownPhoneValue(ph) * 0.85 - successfulLieDiscount));
      cust.lastResponse = defect ? "Haklısın usta, " + phrase.toLowerCase() + ". Fiyatı düşürmek zorundayım." : "Hımm, öyle mi? Ben bilmiyordum... Peki fiyatı düşüreyim.";
      line = phrase + ", o yüzden fiyatı kırıyorum. Teklifim " + lira(currentOffer) + ".";
      notify("Pazarlıkta fiyat kırıldı · " + phrase);
    }

    claimLines.push(line);
    pendingPlayerOfferText = "Telefonu inceledim. " + claimLines.join(" ");
    sync3DSceneToEncounter();
    updateCustomerHeader();
    updateHUD(store.getState());
    updateInspectionHud();
    renderInspectionGrid();
    renderDiagnosisPanel();
    renderDiagnosticArea();
  };

  diagnosisOptionsRoot.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest(".inspection-finished-btn")) {
      audio.unlock();
      audio.playTap();
      setStation("counter");
      renderDiagnosticArea();
      notify("İnceleme tamamlandı · Teklif tutarını belirle.");
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-diagnosis]");
    const category = button?.dataset["diagnosis"] as InspectionCategoryId | undefined;
    if (!category) return;

    reportDiagnosisToCustomer(category);
  });
  const renderInspectionGrid = (): void => {
    if (customerState !== "INTERACTING" || station === "display" || station === "stock" || dealFinished) {
      inspectGridEl.hidden = true;
      return;
    }
    inspectGridEl.hidden = false;
    inspectGridEl.innerHTML = "";

    const { phone: ph } = encounter;
    for (const cat of INSPECTION_CATEGORIES) {
      const isChecked = ph.inspected[cat.id];
      const defect = ph.defects.find((d) => d.category === cat.id);
      const chip = document.createElement("button");
      chip.className = "inspect-chip";
      if (isChecked) {
        chip.classList.add(defect ? "defect" : "clean");
        chip.disabled = true;
      }

      const statusBadge = !isChecked
        ? `<span style="color:var(--gold)">TEST ET</span>`
        : defect
          ? `<span class="warn">⚠ −₺${defect.valueLoss.toLocaleString("tr-TR")}</span>`
          : `<span class="good">✓ TEMİZ</span>`;

      const subtitle =
        isChecked && defect ? defect.title : isChecked ? "Kusur bulunmadı" : cat.shortDesc;

      chip.innerHTML = `<div class="inspect-chip-top"><b>${cat.title}</b>${statusBadge}</div><small>${subtitle}</small>`;
      chip.addEventListener("click", () => runCategoryInspection(cat.id));
      inspectGridEl.append(chip);
    }
  };

  const runCategoryInspection = (catId: InspectionCategoryId): void => {
    audio.unlock();
    if (customerState !== "INTERACTING" || dealFinished) return;
    const { phone: ph, customer: cust } = encounter;
    const catInfo = INSPECTION_CATEGORIES.find((c) => c.id === catId);
    if (!catInfo || ph.inspected[catId]) return;

    ph.inspected[catId] = true;
    timeMinutes = Math.min(19 * 60, timeMinutes + catInfo.timeMinutes);

    const patienceLoss = Math.round(catInfo.patienceCost * cust.personality.patienceDecay);
    cust.patience = Math.max(0, cust.patience - patienceLoss);

    if (station !== "repair") {
      setStation("repair", false);
    }

    const defect = ph.defects.find((d) => d.category === catId);
    if (defect) {
      defect.found = true;
      audio.playDefect();
      if (catId === "screen") phoneScreenMat.color.set("#162322");
      if (cust.intent === "repair") {
        titleEl.textContent = catInfo.title + ": arıza tespit edildi";
        copyEl.textContent = defect.title + " bulundu. Sağdaki listeden arızayı müşteriye bildir.";
        notify("⚠ " + catInfo.title + ": " + defect.title + " bulundu. Tespiti sağ panelden bildir.");
      } else {
        const discount = roundTo50(defect.valueLoss * cust.personality.defectConcession);
        cust.minAcceptPrice = Math.max(400, cust.minAcceptPrice - discount);
        cust.currentAskPrice = Math.max(cust.minAcceptPrice, cust.currentAskPrice - roundTo50(discount * 0.85));
        cust.lastResponse = catInfo.title + " arızasını (" + defect.title + ") kabul ediyorum; fiyatı ₺" + cust.currentAskPrice.toLocaleString("tr-TR") + " yaptım.";
        titleEl.textContent = catInfo.title + ": Gizli arıza tespit edildi!";
        copyEl.textContent = defect.title + " (−₺" + defect.valueLoss.toLocaleString("tr-TR") + "). Müşteri fiyatı ₺" + cust.currentAskPrice.toLocaleString("tr-TR") + " seviyesine çekti.";
        notify("⚠ " + catInfo.title + ": " + defect.title + " bulundu!");
      }
    } else {
      audio.playClean();
      cust.lastResponse = "Gördüğün gibi " + catInfo.title.toLowerCase() + " tarafı saat gibi çalışıyor.";
      titleEl.textContent = catInfo.title + " kontrolü temiz çıktı";
      copyEl.textContent = ph.model + " · " + catInfo.title + " testinde kusur görülmedi.";
      notify("✓ " + catInfo.title + " sorunsuz.");
    }

    if (cust.intent !== "repair") currentOffer = roundTo50(Math.max(400, getKnownPhoneValue(ph) * 0.85 - successfulLieDiscount));
    renderDiagnosisPanel();
    if (cust.patience <= 0) {
      audio.playFail();
      dealFinished = true;
      customersServedToday += 1;
      store.addReputation(-2);
      cust.lastResponse = "Telefonu incelemen çok uzun sürdü usta, vaktim kalmadı!";
      titleEl.textContent = "Müşteri sabırsızlanıp ayrıldı";
      copyEl.textContent = "Hızlı müşterilerde tüm testler yerine kritik kontroller yapıp teklif vermelisin.";
      notify("Müşterinin sabrı tükendi · İtibar −2");
    }

    sync3DSceneToEncounter();
    updateCustomerHeader();
    updateHUD(store.getState());
    renderInspectionGrid();
    renderDiagnosticArea();
  };

  const finishReturningCustomerDelivery = (success: boolean): void => {
    if (!activeBenchRepair) return;
    const ph = activeBenchRepair.phone;
    const cust = activeBenchRepair.customer;
    const agreedPrice = activeBenchRepair.agreedPrice;
    const partCost = activeBenchRepair.partCost;

    if (success) {
      audio.playCash();
      const netProfit = agreedPrice - partCost;
      store.addMoney(agreedPrice);
      store.addReputation(4);
      cust.lastResponse = "Harikasın usta! Telefon sıfır gibi olmuş, eline emeğine sağlık.";
      notify(`✓ Telefon teslim edildi! +₺${agreedPrice.toLocaleString("tr-TR")} alındı (+4 İtibar).`);
      lastTransactionSummary = {
        intent: "repair",
        phoneModel: ph.brand + " " + ph.model,
        boughtPrice: agreedPrice,
        actualValue: agreedPrice,
        netProfit,
        repDelta: 4,
        foundDefects: [],
        missedDefects: [],
        stockUid: ph.uid,
        sold: true,
        repairTitle: activeBenchRepair.defect.title,
        repairPartCost: partCost,
      };
    } else {
      audio.playFail();
      store.addReputation(-5);
      cust.lastResponse = "1 saat geçti telefon hala yapılmamış! Böyle esnaflık olmaz, puanınızı kırıyorum!";
      notify("❌ Telefon vaktinde tamir edilmediği için müşteri öfkelendi! (-5 İtibar)");
    }
    dealFinished = true;
    customersServedToday += 1;
    activeBenchRepair = null;
    isReturningCustomerActive = false;
    titleEl.textContent = success ? "Tamir teslim edildi · Müşteri memnun" : "Tamir gecikti · Müşteri öfkeli";
    copyEl.textContent = cust.lastResponse;
    updateCustomerHeader();
    updateHUD(store.getState());
    renderDiagnosticArea();
  };

  const bringReturningCustomerToCounter = (): void => {
    if (!activeBenchRepair) return;
    isReturningCustomerActive = true;
    dealFinished = false;
    repairAgreed = false;
    workshopRepaired = activeBenchRepair.isRepaired;
    encounter = {
      phone: activeBenchRepair.phone,
      customer: {
        ...activeBenchRepair.customer,
        intent: "repair",
        speechText: activeBenchRepair.isRepaired
          ? "Selam usta! 1 saat doldu, telefonumu almaya geldim."
          : "Selam usta! 1 saat doldu, telefonum hazır mı?",
      },
    };
    customerState = "WALKING_IN";
    customerGroup.position.set(0, 0, 5.2);
    customerGroup.rotation.y = Math.PI;
    customerGroup.visible = true;
    phone.visible = false;
    audio.playDoorBell();
    notify(`🔔 Kapı zili çaldı: ${activeBenchRepair.customer.name} telefonunu almaya geldi!`);
    sync3DSceneToEncounter();
    updateCustomerHeader();
    updateHUD(store.getState());
    setStation("counter");
    if (!workshop.isWorkshopActive) {
      openSpeechBubble(encounter.customer.speechText);
    }
  };

  const renderDiagnosticArea = (): void => {
    if (station === "display" || station === "stock") {
      mainActionsEl.hidden = true;
      diagnosticEl.hidden = false;
      if (stockItems.length === 0) {
        diagnosticEl.innerHTML = `<div class="result-row"><span>STOKTA CİHAZ YOK</span><b class="warn">BOŞ</b></div>
          <div class="quote-row"><span>Kasadan ikinci el telefon satın aldığında burada listelenir.</span></div>`;
        return;
      }

      const rowsHtml = stockItems
        .map((item) => {
          const profit = item.actualValue - item.boughtPrice;
          const pClass = profit >= 0 ? "good" : "bad";
          const sign = profit >= 0 ? "+" : "";
          return `<div class="result-row">
            <span>${item.model} (${item.ageYears}Y) · Alış ₺${item.boughtPrice.toLocaleString("tr-TR")}</span>
            <b class="${pClass}">${sign}₺${profit.toLocaleString("tr-TR")}</b>
          </div>`;
        })
        .join("");

      const totalSaleVal = stockItems.reduce((s, i) => s + i.actualValue, 0);
      diagnosticEl.innerHTML = `${rowsHtml}
        <div class="quote-row"><span>Toplam gerçek satış değeri</span><strong>₺${totalSaleVal.toLocaleString("tr-TR")}</strong></div>
        <div class="action-row">
          <button class="primary-btn sell-all-stock-btn">STOĞU GERÇEK DEĞERİNDEN SAT (+₺${totalSaleVal.toLocaleString("tr-TR")}) <span>→</span></button>
        </div>`;

      diagnosticEl.querySelector(".sell-all-stock-btn")?.addEventListener("click", () => {
        audio.unlock();
        audio.playCash();
        let netProfitTotal = 0;
        while (stockItems.length > 0) {
          const sold = stockItems.pop()!;
          store.addMoney(sold.actualValue);
          netProfitTotal += sold.actualValue - sold.boughtPrice;
        }
        if (lastTransactionSummary) lastTransactionSummary.sold = true;
        const sign = netProfitTotal >= 0 ? "+" : "";
        notify(`Stok satıldı · Net kâr/zarar: ${sign}₺${netProfitTotal.toLocaleString("tr-TR")}`);
        updateHUD(store.getState());
        renderDiagnosticArea();
      });
      return;
    }

    if (customerState === "WAITING" || customerState === "WALKING_IN") {
      mainActionsEl.hidden = false;
      inspectBtn.disabled = true;
      diagnoseBtn.disabled = true;
      diagnosticEl.hidden = true;
      return;
    }

    if (dealFinished && lastTransactionSummary) {
      mainActionsEl.hidden = true;
      diagnosticEl.hidden = false;
      const s = lastTransactionSummary;
      const pClass = s.netProfit >= 0 ? "good" : "bad";
      const pSign = s.netProfit >= 0 ? "+" : "";

      if (s.intent === "repair") {
        diagnosticEl.innerHTML = `
          <div class="result-row"><span>TAMİR EDİLEN ARIZA</span><b class="good">${s.repairTitle || "Donanım Onarımı"}</b></div>
          <div class="result-row"><span>MÜŞTERİDEN ALINAN: ₺${s.boughtPrice.toLocaleString("tr-TR")} · PARÇA MASRAFI: ₺${(s.repairPartCost || 0).toLocaleString("tr-TR")}</span><b class="good">İTİBAR +${s.repDelta}</b></div>
          <div class="quote-row"><span>Net Tamir Kazancı</span><strong class="good">+₺${s.netProfit.toLocaleString("tr-TR")}</strong></div>
          <div class="action-row">
            <button class="primary-btn dismiss-cust-btn">TEZGAHTA BEKLE <span>→</span></button>
          </div>`;
      } else if (s.intent === "buy") {
        diagnosticEl.innerHTML = `
          <div class="result-row"><span>SATIŞI YAPILAN CİHAZ</span><b class="good">${s.phoneModel}</b></div>
          <div class="result-row"><span>ALIŞ MALİYETİMİZ: ₺${s.boughtPrice.toLocaleString("tr-TR")} · SATIŞ GELİRİ: ₺${s.actualValue.toLocaleString("tr-TR")}</span><b class="good">İTİBAR +${s.repDelta}</b></div>
          <div class="quote-row"><span>Net Satış Kârı</span><strong class="${pClass}">${pSign}₺${s.netProfit.toLocaleString("tr-TR")}</strong></div>
          <div class="action-row">
            <button class="primary-btn dismiss-cust-btn">TEZGAHTA BEKLE <span>→</span></button>
          </div>`;
      } else {
        const foundHtml = s.foundDefects
          .map(
            (d) =>
              `<div class="result-row"><span>BULUNAN / ${d.title}</span><b class="good">−₺${d.valueLoss.toLocaleString("tr-TR")}</b></div>`,
          )
          .join("");

        const missedHtml = s.missedDefects
          .map(
            (d) =>
              `<div class="result-row"><span>KAÇIRILAN GİZLİ ARIZA / ${d.title}</span><b class="bad">−₺${d.valueLoss.toLocaleString("tr-TR")}</b></div>`,
          )
          .join("");

        const noDefectHtml =
          s.foundDefects.length === 0 && s.missedDefects.length === 0
            ? `<div class="result-row"><span>CİHAZ DURUMU</span><b class="good">KUSURSUZ (0 ARIZA)</b></div>`
            : "";

        diagnosticEl.innerHTML = `${noDefectHtml}${foundHtml}${missedHtml}
          <div class="result-row"><span>ALIŞ FİYATI: ₺${s.boughtPrice.toLocaleString("tr-TR")} · GERÇEK DEĞER: ₺${s.actualValue.toLocaleString("tr-TR")}</span><b class="good">İTİBAR +${s.repDelta}</b></div>
          <div class="quote-row"><span>Net Kâr / Zarar Özeti</span><strong class="${pClass}">${pSign}₺${s.netProfit.toLocaleString("tr-TR")}</strong></div>
          <div class="action-row">
            ${
              !s.sold
                ? `<button class="secondary-btn keep-stock-btn">STOKTA TUT</button>
                   <button class="primary-btn sell-now-btn">GERÇEK DEĞERİNE SAT (+₺${s.actualValue.toLocaleString("tr-TR")}) <span>→</span></button>`
                : `<button class="primary-btn dismiss-cust-btn">TEZGAHTA BEKLE <span>→</span></button>`
            }
          </div>`;

        diagnosticEl.querySelector(".keep-stock-btn")?.addEventListener("click", () => {
          audio.playTap();
          notify("Cihaz vitrin/depo stoğuna kaldırıldı.");
          dismissCustomerAndStartWaiting();
        });

        diagnosticEl.querySelector(".sell-now-btn")?.addEventListener("click", () => {
          const idx = stockItems.findIndex((item) => item.uid === s.stockUid);
          if (idx !== -1) {
            const item = stockItems[idx]!;
            stockItems.splice(idx, 1);
            store.addMoney(item.actualValue);
            if (item.missedDefects.length > 0 && s.netProfit < 0) {
              store.addReputation(-1);
            } else if (s.netProfit > 0) {
              store.addReputation(1);
            }
          }
          s.sold = true;
          audio.playCash();
          notify(
            `Cihaz ₺${s.actualValue.toLocaleString("tr-TR")} bedelle satıldı (${pSign}₺${s.netProfit.toLocaleString("tr-TR")})`,
          );
          updateHUD(store.getState());
          renderDiagnosticArea();
        });
      }

      diagnosticEl.querySelector(".dismiss-cust-btn")?.addEventListener("click", () => {
        dismissCustomerAndStartWaiting();
      });
      return;
    }

    if (dealFinished && !lastTransactionSummary) {
      mainActionsEl.hidden = true;
      diagnosticEl.hidden = false;
      diagnosticEl.innerHTML = `<div class="result-row"><span>İŞLEM SONUCU</span><b class="warn">ANLAŞMA SAĞLANAMADI</b></div>
        <div class="action-row"><button class="primary-btn dismiss-cust-btn">TEZGAHTA BEKLE <span>→</span></button></div>`;
      diagnosticEl.querySelector(".dismiss-cust-btn")?.addEventListener("click", () => {
        dismissCustomerAndStartWaiting();
      });
      return;
    }

    if (isReturningCustomerActive && activeBenchRepair) {
      mainActionsEl.hidden = true;
      diagnosticEl.hidden = false;
      const ph = activeBenchRepair.phone;
      const cust = activeBenchRepair.customer;
      const defectTitle = activeBenchRepair.defect.title;
      const isRep = activeBenchRepair.isRepaired;

      if (isRep) {
        diagnosticEl.innerHTML = `
          <div class="result-row">
            <span>MÜŞTERİ TELEFONU ALMAYA GELDİ</span>
            <b class="good">✓ TAMİR EDİLDİ</b>
          </div>
          <div class="quote-row">
            <span><b>${cust.name}:</b> "Selam usta, 1 saat doldu telefonumu almaya geldim!"</span>
          </div>
          <div class="result-row">
            <span>${ph.brand} ${ph.model} · ${defectTitle}</span>
            <b class="good">ALINACAK: ₺${activeBenchRepair.agreedPrice.toLocaleString("tr-TR")}</b>
          </div>
          <div class="action-row">
            <button class="primary-btn deliver-success-btn">TELEFONU TESLİM ET VE ÜCRETİ AL (+4 Puan) <span>→</span></button>
          </div>
        `;
        diagnosticEl.querySelector(".deliver-success-btn")?.addEventListener("click", () => {
          finishReturningCustomerDelivery(true);
        });
      } else {
        diagnosticEl.innerHTML = `
          <div class="result-row">
            <span>MÜŞTERİ TELEFONU ALMAYA GELDİ</span>
            <b class="bad">❌ TAMİR EDİLMEDİ!</b>
          </div>
          <div class="quote-row">
            <span><b>${cust.name}:</b> "1 saat doldu usta! Telefonum hazır mı?"</span>
          </div>
          <div class="result-row">
            <span>${ph.brand} ${ph.model} · ${defectTitle}</span>
            <b class="bad">PUAN DÜŞECEK (-5 İtibar)</b>
          </div>
          <div class="action-row">
            <button class="secondary-btn go-workshop-rush-btn">HEMEN ATÖLYEDE YAP (2)</button>
            <button class="primary-btn deliver-fail-btn" style="background:#dc2626;">YAPILAMADI / ÖZÜR DİLE (-5 Puan) <span>→</span></button>
          </div>
        `;
        diagnosticEl.querySelector(".go-workshop-rush-btn")?.addEventListener("click", () => {
          workshop.enter();
        });
        diagnosticEl.querySelector(".deliver-fail-btn")?.addEventListener("click", () => {
          finishReturningCustomerDelivery(false);
        });
      }
      return;
    }

    if (encounter.customer.intent === "repair" && activeBenchRepair !== null && !isReturningCustomerActive) {
      mainActionsEl.hidden = true;
      diagnosticEl.hidden = false;
      diagnosticEl.innerHTML = `
        <div class="result-row" style="background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:6px;padding:8px;">
          <span style="color:#fca5a5;">⚠️ ATÖLYE DOLU (TEK İŞÇİ)</span>
          <b class="bad">İŞÇİ MEŞGUL</b>
        </div>
        <div class="quote-row">
          <span>Şu an tezgahta <b>${activeBenchRepair.phone.brand} ${activeBenchRepair.phone.model}</b> tamir ediliyor. Tek işçi çalıştığı için yeni tamir alamayız.</span>
        </div>
        <div class="action-row">
          <button class="primary-btn busy-dismiss-btn">MÜŞTERİYİ UĞURLA (KAPASİTE DOLU) <span>→</span></button>
        </div>
      `;
      diagnosticEl.querySelector(".busy-dismiss-btn")?.addEventListener("click", () => {
        audio.playTap();
        encounter.customer.lastResponse = "Usta meşgulmüşsün, başka dükkana bakayım o zaman.";
        notify("Atölye kapasitesi dolu olduğu için müşteri başka dükkana yönlendirildi.");
        dismissCustomerAndStartWaiting();
      });
      return;
    }

    if (repairAgreed) {
      mainActionsEl.hidden = true;
      diagnosticEl.hidden = false;
      const defectTitle = encounter.customer.repairTargetDefect?.title || "Donanım Onarımı";
      diagnosticEl.innerHTML = workshopRepaired
        ? '<div class="result-row"><span>ATÖLYE TAMİRİ TAMAMLANDI</span><b class="good">' + defectTitle + '</b></div><div class="quote-row"><span>₺' + currentOffer.toLocaleString("tr-TR") + ' tutarındaki anlaşma hazır. Telefonu müşteriye teslim et.</span></div><div class="action-row"><button class="primary-btn repair-delivery-btn">TAMİR EDİLDİ · MÜŞTERİYE TESLİM ET <span>→</span></button></div>'
        : '<div class="result-row"><span>TAMİR ANLAŞMASI SAĞLANDI</span><b class="warn">ATÖLYE BEKLİYOR</b></div><div class="quote-row"><span>' + defectTitle + ' için ₺' + currentOffer.toLocaleString("tr-TR") + ' üzerinde anlaşıldı. Önce atölyede tamir et.</span></div><div class="action-row"><button class="primary-btn repair-workshop-btn">ATÖLYEYE GİT <span>→</span></button></div>';
      diagnosticEl.querySelector(".repair-workshop-btn")?.addEventListener("click", () => workshop.enter());
      diagnosticEl.querySelector(".repair-delivery-btn")?.addEventListener("click", () => handleOfferSubmission());
      return;
    }
    // Aktif Pazarlık / Teklif Alanı
    mainActionsEl.hidden = true;
    diagnosticEl.hidden = false;
    const { phone: ph, customer: cust } = encounter;
    const remRounds = cust.maxBargainRounds - cust.bargainRound;

    if (cust.intent === "repair") {
      const partCost = cust.repairPartCost || 350;
      const estProfit = currentOffer - partCost;
      const pSign = estProfit >= 0 ? "+" : "";
      const pClass = estProfit >= 0 ? "good" : "bad";

      diagnosticEl.innerHTML = `
        <div class="result-row">
          <span>ARIZA: ${cust.repairTargetDefect?.title || "Donanım Onarımı"}</span>
          <b class="good">${remRounds} TUR HAKKIN VAR</b>
        </div>
        <div class="result-row">
          <span>YEDEK PARÇA: ₺${partCost.toLocaleString("tr-TR")} · MÜŞTERİ BÜTÇESİ: ₺${cust.currentAskPrice.toLocaleString("tr-TR")}</span>
          <b class="${pClass}">TAHMİNİ KÂR: ${pSign}₺${estProfit.toLocaleString("tr-TR")}</b>
        </div>
        <div class="offer-Adjust-row">
          <button class="step-btn" data-step="-200">−200</button>
          <button class="step-btn" data-step="-100">−100</button>
          <div class="offer-box">₺${currentOffer.toLocaleString("tr-TR")}</div>
          <button class="step-btn" data-step="100">+100</button>
          <button class="step-btn" data-step="200">+200</button>
          <button class="step-btn" data-match="ask">BÜTÇESİ</button>
        </div>
        <div class="action-row">
          <button class="secondary-btn decline-btn">TAMİRİ REDDET</button>
          <button class="primary-btn offer-btn">₺${currentOffer.toLocaleString("tr-TR")} TAMİR TEKLİF ET <span>→</span></button>
        </div>`;

      diagnosticEl.querySelector("[data-match='ask']")?.addEventListener("click", () => {
        audio.unlock();
        audio.playTap();
        currentOffer = cust.currentAskPrice;
        renderDiagnosticArea();
      });
    } else if (cust.intent === "buy") {
      if (stockItems.length === 0) {
        diagnosticEl.innerHTML = `
          <div class="result-row">
            <span>VİTRİNDE SATILIK CİHAZ YOK</span>
            <b class="warn">BOŞ</b>
          </div>
          <div class="quote-row">
            <span>Müşteri ikinci el telefon satın almak istedi fakat stoğunuzda satılık telefon bulunmuyor.</span>
          </div>
          <div class="action-row">
            <button class="primary-btn dismiss-cust-btn">TEZGAHTA BEKLE <span>→</span></button>
          </div>`;
        diagnosticEl.querySelector(".dismiss-cust-btn")?.addEventListener("click", () => {
          dismissCustomerAndStartWaiting();
        });
        return;
      }

      selectedStockIdx = Math.max(0, Math.min(selectedStockIdx, stockItems.length - 1));
      const selItem = stockItems[selectedStockIdx]!;
      const estProfit = currentOffer - selItem.boughtPrice;
      const pSign = estProfit >= 0 ? "+" : "";
      const pClass = estProfit >= 0 ? "good" : "bad";
      const selKnownValue = getKnownStockValue(selItem);

      const stockChipsHtml = stockItems
        .map((item, idx) => {
          const isSel = idx === selectedStockIdx;
          return `<button class="stock-item-pick-btn" data-stock-idx="${idx}" style="padding:6px 12px;border-radius:10px;border:1px solid ${isSel ? "var(--gold)" : "rgba(255,255,255,0.15)"};background:${isSel ? "rgba(229,183,101,0.22)" : "rgba(0,0,0,0.3)"};color:#fff;text-align:left;font-size:12px;cursor:pointer;white-space:nowrap;">
            <strong>${item.brand} ${item.model}</strong><br>
            <small style="opacity:0.8;">Maliyet: ₺${item.boughtPrice.toLocaleString("tr-TR")}</small>
          </button>`;
        })
        .join("");

      diagnosticEl.innerHTML = `
        <div class="result-row">
          <span>ARANAN: ${cust.buyerTargetBrand ?? "Herhangi"} · BİLDİĞİN DEĞER: ₺${selKnownValue.toLocaleString("tr-TR")}</span>
          <b class="good">${remRounds} TUR HAKKIN VAR</b>
        </div>
        <div style="display:flex;gap:8px;overflow-x:auto;padding:6px 2px;">
          ${stockChipsHtml}
        </div>
        <div class="result-row">
          <span>SEÇİLEN: ${selItem.brand} ${selItem.model} · ALIŞ: ₺${selItem.boughtPrice.toLocaleString("tr-TR")}</span>
          <b class="${pClass}">TAHMİNİ KÂR: ${pSign}₺${estProfit.toLocaleString("tr-TR")}</b>
        </div>
        <div class="offer-Adjust-row">
          <button class="step-btn" data-step="-500">−500</button>
          <button class="step-btn" data-step="-200">−200</button>
          <div class="offer-box">₺${currentOffer.toLocaleString("tr-TR")}</div>
          <button class="step-btn" data-step="200">+200</button>
          <button class="step-btn" data-step="500">+500</button>
          <button class="step-btn" data-match="value">EDERİ</button>
        </div>
        <div class="action-row">
          <button class="secondary-btn decline-btn">CİHAZ YOK DE</button>
          <button class="primary-btn offer-btn">₺${currentOffer.toLocaleString("tr-TR")} SATIŞ YAP <span>→</span></button>
        </div>`;

      diagnosticEl.querySelectorAll<HTMLButtonElement>("[data-stock-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          audio.unlock();
          audio.playTap();
          selectedStockIdx = Number(btn.dataset["stockIdx"]);
          const sItem = stockItems[selectedStockIdx]!;
          currentOffer = getSuggestedBuyerPrice(sItem);
          renderDiagnosticArea();
        });
      });

      diagnosticEl.querySelector("[data-match='value']")?.addEventListener("click", () => {
        audio.unlock();
        audio.playTap();
        currentOffer = selKnownValue;
        renderDiagnosticArea();
      });
    } else {
      const knownVal = getKnownPhoneValue(ph);
      const battDef = ph.defects.find((d) => d.category === "battery");
      const scrDef = ph.defects.find((d) => d.category === "screen");
      const camDef = ph.defects.find((d) => d.category === "camera");

      const battRating: BatteryRating = getBatteryRating(ph.batteryHealth, !!battDef);
      const battBadge = ph.inspected["battery"]
        ? battDef
          ? `<b class="bad">⚠ Pil: %${ph.batteryHealth} (${battRating}) (−₺${battDef.valueLoss.toLocaleString("tr-TR")})</b>`
          : `<b class="good">✓ Pil: %${ph.batteryHealth} (${battRating})</b>`
        : `<span style="opacity:0.55;">? Pil Ölçülmedi</span>`;

      const scrBadge = ph.inspected["screen"]
        ? scrDef
          ? `<b class="bad">⚠ Ekran: ${scrDef.title} (−₺${scrDef.valueLoss.toLocaleString("tr-TR")})</b>`
          : `<b class="good">✓ Ekran Camı Temiz</b>`
        : `<span style="opacity:0.55;">? Ekran İncelenmedi</span>`;

      const camBadge = ph.inspected["camera"]
        ? camDef
          ? `<b class="bad">⚠ Kamera Arızalı (−₺${camDef.valueLoss.toLocaleString("tr-TR")})</b>`
          : `<b class="good">✓ Kamera Sağlam</b>`
        : `<span style="opacity:0.55;">? Kamera Test Edilmedi</span>`;

      diagnosticEl.innerHTML = `
        <div class="result-row">
          <span>${ph.brand} ${ph.model} (${ph.storage}) · Taban: ₺${ph.baseValue.toLocaleString("tr-TR")}</span>
          <b class="good">${remRounds} TUR HAKKIN VAR</b>
        </div>
        <div class="result-row" style="font-size:11px;gap:6px;flex-wrap:wrap;padding:4px 0;">
          ${battBadge} · ${scrBadge} · ${camBadge}
        </div>
        <div class="result-row">
          <span>NET BİLİNEN DEĞERİ: ₺${knownVal.toLocaleString("tr-TR")} · MÜŞTERİ TALEBİ:</span>
          <b class="warn">₺${cust.currentAskPrice.toLocaleString("tr-TR")}</b>
        </div>
        <div class="offer-Adjust-row">
          <button class="step-btn" data-step="-500">−500</button>
          <button class="step-btn" data-step="-200">−200</button>
          <div class="offer-box">₺${currentOffer.toLocaleString("tr-TR")}</div>
          <button class="step-btn" data-step="200">+200</button>
          <button class="step-btn" data-step="500">+500</button>
          <button class="step-btn" data-match="ask">İSTEDİĞİ</button>
        </div>
        <div class="action-row">
          <button class="secondary-btn decline-btn">PAS GEÇ</button>
          <button class="primary-btn offer-btn">₺${currentOffer.toLocaleString("tr-TR")} TEKLİF ET <span>→</span></button>
        </div>`;

      diagnosticEl.querySelector("[data-match='ask']")?.addEventListener("click", () => {
        audio.unlock();
        audio.playTap();
        currentOffer = cust.currentAskPrice;
        renderDiagnosticArea();
      });
    }

    diagnosticEl.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.unlock();
        audio.playTap();
        const delta = Number(btn.dataset["step"] || 0);
        currentOffer = roundTo50(Math.max(50, currentOffer + delta));
        renderDiagnosticArea();
      });
    });

    diagnosticEl.querySelector(".decline-btn")?.addEventListener("click", () => {
      audio.unlock();
      audio.playTap();
      dealFinished = true;
      lastTransactionSummary = null;
      customersServedToday += 1;
      timeMinutes = Math.min(19 * 60, timeMinutes + 10);
      notify("Müşteriyle işlem pas geçildi.");
      renderDiagnosticArea();
    });

    diagnosticEl.querySelector(".offer-btn")?.addEventListener("click", () => {
      audio.unlock();
      const offerText = pendingPlayerOfferText || "Telefonu inceledim. Teklifim ₺" + currentOffer.toLocaleString("tr-TR") + ".";
      pendingPlayerOfferText = "";
      openSpeechBubble(offerText + " Kabul ediyor musunuz?", "player");
    });
  };


  const handleOfferSubmission = (): void => {
    const { phone: ph, customer: cust } = encounter;

    if (cust.intent === "repair") {
      if (activeBenchRepair !== null && !isReturningCustomerActive) {
        audio.playFail();
        notify("⚠️ Atölye dolu! Tek işçi şu anda başka bir telefon tamir ediyor.");
        return;
      }
      const partCost = cust.repairPartCost || 350;
      if (store.getState().money < partCost) {
        audio.playFail();
        notify("Yedek parça temin etmek için kasada yeterli nakit yok!");
        return;
      }

      cust.bargainRound += 1;
      timeMinutes = Math.min(19 * 60, timeMinutes + 10);

      if (currentOffer <= cust.minAcceptPrice) {
        const targetId = cust.repairTargetDefect?.id;
        const targetDefect =
          ph.defects.find((item) => item.id === targetId) ??
          ph.defects[0] ?? {
            id: "repair_defect",
            category: "battery" as InspectionCategoryId,
            title: cust.repairTargetDefect?.title || "Donanım Onarımı",
            description: "Onarım işlemi",
            valueLoss: 500,
            found: false,
            lossRatio: 0.2,
          };

        activeBenchRepair = {
          customer: { ...cust },
          phone: { ...ph, defects: [...ph.defects] },
          defect: targetDefect,
          agreedPrice: currentOffer,
          partCost,
          remainingSeconds: 900,
          totalSeconds: 900,
          isRepaired: false,
        };

        audio.playTap();
        cust.lastResponse = "Tamam usta anlaştık! 1 saat sonra (15 dk) gelip telefonu alırım.";
        titleEl.textContent = "Cihaz tamire alındı (Tek İşçi meşgul)";
        copyEl.textContent = `${ph.brand} ${ph.model} tamir tezgahına gönderildi. Müşteri 15 dakika sonra teslim almaya gelecek.`;
        notify("📱 Telefon tamire alındı! 15 dk sonra müşteri dönecek. Tamir Tezgâhı'ndan (2) durumu görebilirsin.");
        updateCustomerHeader();
        renderDiagnosticArea();
        setTimeout(() => {
          dismissCustomerAndStartWaiting();
        }, 1200);
        return;
      }

      const patiencePenalty = Math.round(20 * cust.personality.patienceDecay);
      cust.patience = Math.max(0, cust.patience - patiencePenalty);

      if (cust.patience <= 0 || cust.bargainRound >= cust.maxBargainRounds) {
        audio.playFail();
        dealFinished = true;
        lastTransactionSummary = null;
        customersServedToday += 1;
        store.addReputation(-1);
        cust.lastResponse =
          cust.bargainRound >= cust.maxBargainRounds
            ? `3 turda da anlaşamadık usta, ₺${currentOffer.toLocaleString("tr-TR")} tamir için çok fazla.`
            : `₺${currentOffer.toLocaleString("tr-TR")} çok pahalı usta, başka tamirciye gideyim!`;
        titleEl.textContent = "Tamir teklifi reddedildi";
        copyEl.textContent = cust.lastResponse;
        notify("Müşteri tamir teklifini reddetti.");
        sync3DSceneToEncounter();
        updateCustomerHeader();
        updateHUD(store.getState());
        renderInspectionGrid();
        renderDiagnosticArea();
        return;
      }

      audio.playTap();
      const bump = roundTo50((cust.minAcceptPrice - cust.currentAskPrice) * 0.45);
      cust.currentAskPrice = Math.min(cust.minAcceptPrice, cust.currentAskPrice + bump);
      const rem = cust.maxBargainRounds - cust.bargainRound;
      cust.lastResponse = `₺${currentOffer.toLocaleString("tr-TR")} pahalı usta. En fazla ₺${cust.currentAskPrice.toLocaleString("tr-TR")} verebilirim (${rem} teklif hakkın kaldı).`;
      titleEl.textContent = `Müşteri bütçesini ₺${cust.currentAskPrice.toLocaleString("tr-TR")} yaptı`;
      copyEl.textContent = cust.lastResponse;
      notify(`Karşı teklif: ₺${cust.currentAskPrice.toLocaleString("tr-TR")} (${rem} tur kaldı)`);
      updateCustomerHeader();
      updateHUD(store.getState());
      renderDiagnosticArea();
      return;
    }

    if (cust.intent === "buy") {
      if (stockItems.length === 0) return;
      selectedStockIdx = Math.max(0, Math.min(selectedStockIdx, stockItems.length - 1));
      const selItem = stockItems[selectedStockIdx]!;
      // Alıcı fiyatı telefonun gerçek ederine göre rastgele kabul eder ya da etmez.
      const buyerAccepts = rng.nextFloat() < getBuyerAcceptChance(currentOffer, selItem.actualValue);
      store.setRngState(rng.getState());
      const offerRatio = currentOffer / Math.max(selItem.actualValue, 1);

      cust.bargainRound += 1;
      timeMinutes = Math.min(19 * 60, timeMinutes + 10);

      if (buyerAccepts) {
        audio.playCash();
        stockItems.splice(selectedStockIdx, 1);
        store.addMoney(currentOffer);
        const netProfit = currentOffer - selItem.boughtPrice;
        const repDelta = netProfit >= 0 ? 3 : 1;
        store.addReputation(repDelta);

        lastTransactionSummary = {
          intent: "buy",
          phoneModel: `${selItem.brand} ${selItem.model}`,
          boughtPrice: selItem.boughtPrice,
          actualValue: currentOffer,
          netProfit,
          repDelta,
          foundDefects: selItem.foundDefects,
          missedDefects: selItem.missedDefects,
          stockUid: selItem.uid,
          sold: true,
        };

        dealFinished = true;
        customersServedToday += 1;
        titleEl.textContent = "Telefon satıldı · Vitrin işlemi başarılı";
        copyEl.textContent = `${selItem.brand} ${selItem.model} müşteriye ₺${currentOffer.toLocaleString("tr-TR")} bedelle satıldı. Net kâr: ${netProfit >= 0 ? "+" : ""}₺${netProfit.toLocaleString("tr-TR")}.`;

        sync3DSceneToEncounter();
        updateCustomerHeader();
        updateHUD(store.getState());
        renderInspectionGrid();
        renderDiagnosticArea();
        return;
      }

      const patiencePenalty = Math.round(22 * cust.personality.patienceDecay);
      cust.patience = Math.max(0, cust.patience - patiencePenalty);

      if (cust.patience <= 0 || cust.bargainRound >= cust.maxBargainRounds) {
        audio.playFail();
        dealFinished = true;
        lastTransactionSummary = null;
        customersServedToday += 1;
        store.addReputation(-1);
        cust.lastResponse = `₺${currentOffer.toLocaleString("tr-TR")} bu telefona fazla geldi usta, vazgeçtim.`;
        titleEl.textContent = "Satış gerçekleşmedi";
        copyEl.textContent = cust.lastResponse;
        notify("Müşteri bütçesine uygun bulmadı ve ayrıldı.");
        sync3DSceneToEncounter();
        updateCustomerHeader();
        updateHUD(store.getState());
        renderInspectionGrid();
        renderDiagnosticArea();
        return;
      }

      audio.playTap();
      const rem = cust.maxBargainRounds - cust.bargainRound;
      cust.lastResponse = `${offerRatio > 1.25 ? "Bu fiyat çok yüksek usta!" : "Biraz pahalı geldi usta."} Fiyatı düşürürsen düşünürüm (${rem} teklif hakkın kaldı).`;
      titleEl.textContent = "Müşteri kararsız kaldı";
      copyEl.textContent = cust.lastResponse;
      notify("Müşteri fiyatı kabul etmedi · indirim istiyor");
      updateCustomerHeader();
      updateHUD(store.getState());
      renderDiagnosticArea();
      return;
    }

    // "sell" intent (telefon satın alma)
    if (currentOffer > store.getState().money) {
      audio.playFail();
      notify("Kasada bu teklifi karşılayacak nakit yok!");
      return;
    }

    cust.bargainRound += 1;
    timeMinutes = Math.min(19 * 60, timeMinutes + 10);

    if (currentOffer >= cust.minAcceptPrice) {
      audio.playCash();
      store.addMoney(-currentOffer);
      const repDelta = currentOffer >= cust.initialAskPrice * 0.9 ? 4 : 2;
      store.addReputation(repDelta);

      const foundDefects = ph.defects
        .filter((d) => d.found)
        .map((d) => ({ id: d.id, category: d.category, title: d.title, valueLoss: d.valueLoss }));
      const missedDefects = ph.defects
        .filter((d) => !d.found)
        .map((d) => ({ id: d.id, category: d.category, title: d.title, valueLoss: d.valueLoss }));

      const stockItem: StockPhoneItem = {
        uid: ph.uid,
        brand: ph.brand,
        model: ph.model,
        ageYears: ph.ageYears,
        boughtPrice: currentOffer,
        baseValue: ph.baseValue,
        actualValue: ph.actualValue,
        foundDefects,
        missedDefects,
        dayBought: store.getState().day,
      };
      stockItems.push(stockItem);

      const netProfit = ph.actualValue - currentOffer;
      lastTransactionSummary = {
        intent: "sell",
        phoneModel: `${ph.brand} ${ph.model}`,
        boughtPrice: currentOffer,
        actualValue: ph.actualValue,
        netProfit,
        repDelta,
        foundDefects,
        missedDefects,
        stockUid: ph.uid,
        sold: false,
      };

      dealFinished = true;
      customersServedToday += 1;
      titleEl.textContent =
        missedDefects.length > 0
          ? "Cihaz alındı · Gizli arıza çıktı!"
          : "Cihaz satın alındı · Ekspertiz başarılı";
      copyEl.textContent =
        missedDefects.length > 0
          ? `Kontrol etmediğin başlıktan ${missedDefects.length} gizli arıza çıktı. Gerçek piyasa değeri ₺${ph.actualValue.toLocaleString("tr-TR")}.`
          : `Tüm arızaları doğru tespit ettin! Cihazı ₺${ph.actualValue.toLocaleString("tr-TR")} gerçek değerinden satabilirsin.`;

      sync3DSceneToEncounter();
      updateCustomerHeader();
      updateHUD(store.getState());
      renderInspectionGrid();
      renderDiagnosticArea();
      return;
    }

    const offerRatio = currentOffer / cust.minAcceptPrice;
    const patiencePenalty = Math.round((offerRatio < 0.65 ? 35 : 16) * cust.personality.patienceDecay);
    cust.patience = Math.max(0, cust.patience - patiencePenalty);

    if (cust.patience <= 0 || cust.bargainRound >= cust.maxBargainRounds) {
      audio.playFail();
      dealFinished = true;
      lastTransactionSummary = null;
      customersServedToday += 1;
      store.addReputation(-1);
      cust.lastResponse =
        cust.bargainRound >= cust.maxBargainRounds
          ? `3 turda da anlaşamadık usta, en son ₺${cust.minAcceptPrice.toLocaleString("tr-TR")} olurdu.`
          : `₺${currentOffer.toLocaleString("tr-TR")} çok ölü fiyat usta, başka dükkâna gidiyorum!`;
      titleEl.textContent = "Pazarlık sonuçsuz kaldı";
      copyEl.textContent = cust.lastResponse;
      notify("Müşteri teklifi reddetti.");
      sync3DSceneToEncounter();
      updateCustomerHeader();
      updateHUD(store.getState());
      renderInspectionGrid();
      renderDiagnosticArea();
      return;
    }

    audio.playTap();
    const dropStep = roundTo50((cust.currentAskPrice - cust.minAcceptPrice) * 0.45);
    cust.currentAskPrice = Math.max(cust.minAcceptPrice, cust.currentAskPrice - dropStep);
    const rem = cust.maxBargainRounds - cust.bargainRound;
    cust.lastResponse = `₺${currentOffer.toLocaleString("tr-TR")} kurtarmaz usta. Son ₺${cust.currentAskPrice.toLocaleString("tr-TR")} yaparım (${rem} teklif hakkın kaldı).`;
    titleEl.textContent = `Müşteri ₺${cust.currentAskPrice.toLocaleString("tr-TR")} fiyatına indi`;
    copyEl.textContent = cust.lastResponse;
    notify(`Karşı teklif: ₺${cust.currentAskPrice.toLocaleString("tr-TR")} (${rem} tur kaldı)`);
    updateCustomerHeader();
    updateHUD(store.getState());
    renderDiagnosticArea();
  };

  // Birinci şahıs kamera noktaları
  const setStation = (id: StationId, resetPhoneScale = true): void => {
    station = id;
    resetLookOffset();
    stationNav
      .querySelectorAll(".station-button")
      .forEach((button) =>
        button.classList.toggle("active", (button as HTMLElement).dataset["station"] === id),
      );

    const views: Record<
      StationId,
      {
        eye: string;
        heading: string;
        body: string;
        position: [number, number, number];
        look: [number, number, number];
      }
    > = {
      counter: {
        eye: "TEZGÂH · BİRİNCİ ŞAHIS",
        heading:
          customerState === "WAITING"
            ? "Tezgâhta bekliyorsun"
            : customerState === "WALKING_IN"
              ? "Müşteri tezgâha yaklaşıyor"
              : dealFinished
                ? "İşlem tamamlandı"
                : `${encounter.phone.brand} ${encounter.phone.model}`,
        body:
          customerState === "WAITING"
            ? "Dükkân açık, tezgâhın başında bekliyorsun. 30-40 saniyede bir yeni bir müşteri içeri girecek."
            : customerState === "WALKING_IN"
              ? "Müşteri kapıdan girdi ve tezgâhına doğru yürüyor."
              : dealFinished
                ? "İşlem özeti aşağıda. Yeni müşteri için tezgâhta beklemeye geçebilirsin."
                : `${encounter.customer.lastResponse}`,
        position: [0, 1.68, -0.85],
        look: [0, 1.40, 1.45],
      },
      repair: {
        eye: "CİHAZI İNCELE · 90° KUŞBAKIŞI TEZGÂH",
        heading: `${encounter.phone.brand} ${encounter.phone.model} (${encounter.phone.storage})`,
        body: "Tezgâhtaki aletleri kullan: Çift dokunarak aç, batarya test kablosunu telefonun yan şarj girişine bağla (3 sn analiz), kamera uygulamasını açarak sensörü test et.",
        position: [0, 1.95, 0.2201],
        look: [0, 1.266, 0.22],
      },
      display: {
        eye: "VİTRİN · İKİNCİ EL SATIŞ",
        heading: `Stokta ${stockItems.length} cihaz bekliyor`,
        body: "Satın aldığın telefonlar gerçek değerine göre burada satılır.",
        position: [0, 1.68, -0.85],
        look: [3.8, 1.6, 0.2],
      },
      stock: {
        eye: "DEPO · STOK & KAPASİTE",
        heading: "Yedek parça ve kapasite",
        body: `İtibarın (${Math.round(store.getState().reputation)}/100) sayesinde günde ${getDailyCustomerQuota(store.getState().reputation)} müşteri dükkâna uğrar.`,
        position: [0, 1.68, -0.85],
        look: [-3.8, 1.5, -0.2],
      },
    };

    const view = views[id];
    camTargetPos.set(...view.position);
    camTargetLook.set(...view.look);

    if (id === "repair") {
      phone.position.set(0, 1.278, 0.22);
      phone.rotation.set(0, 0, 0);
      phone.scale.setScalar(1);
      isInspecting = true;
      customerCardEl.classList.add("hidden-in-inspect");
      workPanelEl.classList.add("hidden-in-inspect");
      stationNav.classList.add("hidden-in-inspect");
      inspectionHud.hidden = false;
      inspectionHud.classList.add("active");
      if (!isChargerPlugged) {
        batteryLiveOverlay.hidden = true;
      }
      updateScreenDisplay();
      updateInspectionHud();
    } else {
      camera.up.set(0, 1, 0);
      phone.position.set(0, 1.278, 0.22);
      phone.rotation.x = -0.05;
      isInspecting = false;
      inCameraApp = false;
      updateScreenDisplay();
      inspectionHud.classList.remove("active");
      window.setTimeout(() => {
        if (!isInspecting) inspectionHud.hidden = true;
      }, 260);
      customerCardEl.classList.remove("hidden-in-inspect");
      workPanelEl.classList.remove("hidden-in-inspect");
      stationNav.classList.remove("hidden-in-inspect");
      if (batteryTestInterval !== null) {
        clearInterval(batteryTestInterval);
        batteryTestInterval = null;
      }
      batteryLiveOverlay.hidden = true;
      if (isChargerPlugged) {
        isChargerPlugged = false;
        cablePlugGroup.position.copy(chargerDockPos);
        cablePlugGroup.rotation.set(0, 0, 0);
        updateCableMesh(false);
        updateBatteryLcd("idle");
        ammeterDisplayMat.color.set("#0d9488");
      }
    }

    if (resetPhoneScale) {
      phone.scale.setScalar(1);
    }

    kickerEl.textContent = view.eye;
    titleEl.textContent = view.heading;
    copyEl.textContent = view.body;
    renderInspectionGrid();
    renderDiagnosticArea();
    wakeRender(1600);
  };

  const triggerCustomerArrival = (): void => {
    audio.unlock();
    const quota = getDailyCustomerQuota(store.getState().reputation);
    if (customersServedToday >= quota || timeMinutes >= 18 * 60) {
      backdropEl.hidden = false;
      notify("Bugünkü mesai kotası doldu · Günü kapatıp yeni güne geçin.");
      return;
    }

    encounter = generateCustomerEncounter(rng, store.getState().reputation, stockItems.length);
    store.setRngState(rng.getState());
    currentOffer =
      encounter.customer.intent === "sell"
        ? roundTo50(encounter.phone.baseValue * 0.82)
        : encounter.customer.intent === "repair"
          ? roundTo50(encounter.customer.initialAskPrice * 0.95)
          : stockItems.length > 0
            ? getSuggestedBuyerPrice(stockItems[Math.max(0, Math.min(selectedStockIdx, stockItems.length - 1))]!)
            : (encounter.customer.buyerBudget ?? 10000);
    dealFinished = false;
    repairAgreed = false;
    workshopRepaired = false;
    diagnosedCategories.clear();
    pendingPlayerOfferText = "";
    falseDiagnosisClaimed = false;
    rejectedClaims.clear();
    claimLines.length = 0;
    caughtLies = 0;
    successfulLies = 0;
    successfulLieDiscount = 0;
    lastTransactionSummary = null;
    phonePlacedSoundPlayed = false;
    isScreenPoweredOn = false;
    isChargerPlugged = false;
    inCameraApp = false;
    if (batteryTestInterval !== null) {
      clearInterval(batteryTestInterval);
      batteryTestInterval = null;
    }
    batteryLiveOverlay.hidden = true;
    cablePlugGroup.position.copy(chargerDockPos);
    cablePlugGroup.rotation.set(0, 0, 0);
    updateCableMesh(false);
    updateBatteryLcd("idle");

    customerState = "WALKING_IN";
    customerGroup.position.set(0, 0, 5.2);
    customerGroup.rotation.y = Math.PI;
    customerGroup.visible = true;
    phone.visible = false;

    audio.playDoorBell();
    notify(`🔔 Kapı zili çaldı: ${encounter.customer.name} dükkâna girdi!`);

    sync3DSceneToEncounter();
    updateCustomerHeader();
    updateHUD(store.getState());
    setStation("counter");
    if (workshop.isWorkshopActive) {
      openSpeechBubble("Müşteri geldi, tezgâhta bekliyor. Atölyedeki işini bitirince Müşteri Tezgâhı sekmesine dönebilirsin.", "customer");
      bubbleAction = "close";
      const acknowledgeButton = speechBubbleOverlay.querySelector<HTMLButtonElement>(".bubble-dismiss-btn");
      if (acknowledgeButton) acknowledgeButton.innerHTML = "ANLADIM <span>→</span>";
      bubbleFooterText.textContent = "Müşteri tezgâhta seni bekliyor";
    }
  };

  const dismissCustomerAndStartWaiting = (): void => {
    customerState = "WALKING_OUT";
    customerGroup.rotation.y = 0;
    phone.visible = false;
    if (isInspecting) {
      setStation("counter");
    }

    customerWaitTimer = rng.nextInt(30, 40);
    dealFinished = false;
    repairAgreed = false;
    workshopRepaired = false;
    diagnosedCategories.clear();
    pendingPlayerOfferText = "";
    falseDiagnosisClaimed = false;
    rejectedClaims.clear();
    claimLines.length = 0;
    caughtLies = 0;
    successfulLies = 0;
    successfulLieDiscount = 0;
    lastTransactionSummary = null;
    if (batteryTestInterval !== null) {
      clearInterval(batteryTestInterval);
      batteryTestInterval = null;
    }
    batteryLiveOverlay.hidden = true;
    cablePlugGroup.position.copy(chargerDockPos);
    cablePlugGroup.rotation.set(0, 0, 0);
    updateCableMesh(false);
    isChargerPlugged = false;
    isScreenPoweredOn = false;
    inCameraApp = false;
    updateBatteryLcd("idle");

    setStation("counter");
    if (activeBenchRepair !== null && activeBenchRepair.remainingSeconds <= 0 && !isReturningCustomerActive) {
      setTimeout(() => {
        bringReturningCustomerToCounter();
      }, 700);
      return;
    }
    notify(`Müşteri uğurlandı · Yeni müşteri ~${customerWaitTimer} sn sonra gelecek.`);
    updateCustomerHeader();
    updateHUD(store.getState());
  };

  // Buton dinleyicileri
  exitInspectBtn.addEventListener("click", () => {
    audio.unlock();
    audio.playTap();
    setStation("counter");
  });

  toBargainBtn.addEventListener("click", () => {
    audio.unlock();
    audio.playTap();
    setStation("counter");
    renderDiagnosticArea();
  });

  shell.querySelector("[data-tool='charger']")?.addEventListener("click", runChargerTest);
  shell.querySelector("[data-tool='screen']")?.addEventListener("click", runScreenPowerToggle);
  shell.querySelector("[data-tool='battery']")?.addEventListener("click", runBatteryAnalyzerTest);
  shell.querySelector("[data-tool='camera']")?.addEventListener("click", runCameraTest);
  shell.querySelector("[data-tool='flip']")?.addEventListener("click", runPhoneFlip);

  inspectBtn.addEventListener("click", () => {
    audio.unlock();
    audio.playScan();
    if (encounter.customer.intent === "buy") {
      setStation("display");
    } else {
      setStation("repair", false);
    }
  });
  select<HTMLButtonElement>(".small-icon").addEventListener("click", () => {
    audio.unlock();
    audio.playScan();
    setStation(station === "repair" ? "counter" : "repair", false);
  });
  diagnoseBtn.addEventListener("click", () => {
    audio.unlock();
    renderDiagnosticArea();
  });
  nextCustomerBtn.addEventListener("click", () => {
    if (customerState === "WAITING") {
      triggerCustomerArrival();
    } else if (dealFinished) {
      dismissCustomerAndStartWaiting();
    }
  });

  const orientationManager = new OrientationManager({
    onPause: () => {
      audio.suspend();
    },
    onResume: () => {
      audio.resume();
      wakeRender(1000);
    },
  });
  orientationManager.bindFullscreenButton(
    shell.querySelector<HTMLButtonElement>(".fullscreen-toggle"),
  );

  shell.querySelector(".settings-open")?.addEventListener("click", () => {
    audio.unlock();
    audio.playTap();
    backdropEl.hidden = false;
  });
  shell.querySelector(".modal-close")?.addEventListener("click", () => {
    backdropEl.hidden = true;
  });
  backdropEl.addEventListener("click", (event) => {
    if (event.target === backdropEl) backdropEl.hidden = true;
  });

  qualityRowEl.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-q]");
    if (!target) return;
    audio.unlock();
    audio.playTap();
    const pref = target.dataset["q"] as QualityPreference;
    store.updateSettings({ quality: pref });
    notify(`Grafik kalitesi: ${pref.toUpperCase()}`);
  });

  toggleAudioBtn.addEventListener("click", () => {
    audio.unlock();
    const nextAudio = !store.getState().settings.audioEnabled;
    store.updateSettings({ audioEnabled: nextAudio });
    if (nextAudio) audio.playTap();
  });

  shell.querySelector(".manual-save-btn")?.addEventListener("click", () => {
    audio.unlock();
    audio.playTap();
    void saveSystem.saveNow().then(() => notify("Oyun kaydedildi."));
  });

  shell.querySelector(".close-day")?.addEventListener("click", () => {
    audio.unlock();
    audio.playCash();
    store.addMoney(-420);
    store.advanceDay();
    timeMinutes = 9 * 60;
    customersServedToday = 0;
    backdropEl.hidden = true;
    customerState = "WAITING";
    customerWaitTimer = rng.nextInt(30, 40);
    customerGroup.visible = false;
    phone.visible = false;
    setStation("counter");
    notify(`Gün ${store.getState().day} başladı · Kira ve elektrik (−₺420) ödendi.`);
    updateCustomerHeader();
    updateHUD(store.getState());
  });

  stationNav.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-station]");
    if (target) {
      audio.unlock();
      audio.playTap();
      setStation(target.dataset["station"] as StationId);
    }
  });

  // Dokunmatik Kontroller (Raycasting + Parmakla etrafa bakma + Telefondan 360° döndürme)
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let isPointerDown = false;
  let isDraggingPhone = false;
  let lastX = 0;
  let lastY = 0;
  let totalDragDist = 0;

  const canvas = document.querySelector<HTMLCanvasElement>("#game-root canvas");

  const onPointerDown = (event: PointerEvent): void => {
    if (workshop.isWorkshopActive) return;
    audio.unlock();
    isPointerDown = true;
    totalDragDist = 0;
    lastX = event.clientX;
    lastY = event.clientY;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    if (isInspecting) {
      const plugHits = raycaster.intersectObject(cablePlugGroup, true);
      const ammeterHits = raycaster.intersectObject(ammeterUnit, true);
      const battHits = raycaster.intersectObject(batteryTesterGroup, true);
      if (plugHits.length > 0 || ammeterHits.length > 0 || battHits.length > 0) {
        activeToolDragging = "charger";
        audio.playTap();
        wakeRender(1000);
        return;
      }
      isDraggingPhone = false;
      return;
    }

    const phoneHits = raycaster.intersectObject(phone, true);
    isDraggingPhone = phoneHits.length > 0 && phone.visible;
    wakeRender(1500);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (workshop.isWorkshopActive || !isPointerDown) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    totalDragDist += Math.hypot(dx, dy);

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    if (isInspecting) {
      if (activeToolDragging !== "none") {
        const intersect = new Vector3();
        raycaster.ray.intersectPlane(benchPlane, intersect);
        if (intersect) {
          if (activeToolDragging === "charger") {
            cablePlugGroup.position.x = Math.max(-0.35, Math.min(0.35, intersect.x));
            cablePlugGroup.position.z = Math.max(-0.05, Math.min(0.50, intersect.z));
            updateCableMesh(false);
            wakeRender(400);        }
      }
      }
      return;
    }

    if (isDraggingPhone) {
      phone.rotation.y += dx * 0.012;
      phone.rotation.x = Math.max(-0.95, Math.min(0.75, phone.rotation.x + dy * 0.009));
      wakeRender(800);
    } else {
      applyLookDrag(dx, dy);
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (workshop.isWorkshopActive || !isPointerDown) return;
    isPointerDown = false;

    if (isInspecting) {
      if (activeToolDragging !== "none") {
        if (activeToolDragging === "charger") {
          const dist = cablePlugGroup.position.distanceTo(chargePortPos);
          if (dist < 0.12) {
            cablePlugGroup.position.set(0.119, 1.278, 0.22);
            cablePlugGroup.rotation.set(0, 0, 0);
            isChargerPlugged = true;
            updateCableMesh(true);
            audio.playCablePlug();
            runBatteryTest3Seconds();
          } else {
            cablePlugGroup.position.copy(chargerDockPos);
            cablePlugGroup.rotation.set(0, 0, 0);
            isChargerPlugged = false;
            updateCableMesh(false);
            if (batteryTestInterval !== null) {
              clearInterval(batteryTestInterval);
              batteryTestInterval = null;
            }
            batteryLiveOverlay.hidden = true;
            updateBatteryLcd("idle");
          }
        }
        activeToolDragging = "none";
        wakeRender(800);
        return;
      }

      if (totalDragDist < 14) {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const phoneHits = raycaster.intersectObject(phone, true);
        if (phoneHits.length > 0) {
          const now = performance.now();
          if (now - lastPhoneTapTime < 380) {
            lastPhoneTapTime = 0;
            runScreenPowerToggle();
            return;
          }
          lastPhoneTapTime = now;

          if (isScreenPoweredOn) {
            const hit = phoneHits[0]!;
            const localX = hit.point.x - phone.position.x;
            const localZ = hit.point.z - phone.position.z;
            const normX = Math.max(0, Math.min(1, (localX + 0.089) / 0.178));
            const normZ = Math.max(0, Math.min(1, (localZ + 0.184) / 0.368));
            const cx = normX * 512;
            const cy = normZ * 1024;

            if (!inCameraApp) {
              if (cx >= 50 && cx <= 190 && cy >= 540 && cy <= 740) {
                inCameraApp = true;
                audio.playTap();
                updateScreenDisplay();
                runCategoryInspection("camera");
                const isCamWorking = !encounter.phone.defects.some(
                  (d) => d.category === "camera",
                );
                if (isCamWorking) {
                  cameraLiveOverlay.className = "camera-live-overlay good";
                  cameraLiveOverlay.textContent =
                    "📸 KAMERA SAĞLAM · Zemin & 'CEP DÜKKÂNI' logosu vizörde net görünüyor!";
                  cameraLiveOverlay.hidden = false;
                  notify("📸 Fotoğraf uygulaması açıldı · Zemin ve masa logosu net görülüyor (Kamera sağlam)");
                } else {
                  cameraLiveOverlay.className = "camera-live-overlay bad";
                  cameraLiveOverlay.textContent = "⚠ KAMERA HATASI · Siyah ekran, zemin ve logo görülemiyor!";
                  cameraLiveOverlay.hidden = false;
                  notify("⚠ Fotoğraf uygulaması açıldı · Siyah ekran! Sensör arızalı.");
                }
                window.setTimeout(() => {
                  cameraLiveOverlay.hidden = true;
                }, 4500);
                updateInspectionHud();
                wakeRender(1200);
                return;
              }
            } else {
              if (cx >= 350 && cy <= 130) {
                inCameraApp = false;
                cameraLiveOverlay.hidden = true;
                audio.playTap();
                updateScreenDisplay();
                notify("Kamera vizöründen çıkıldı.");
                wakeRender(1000);
                return;
              }
              if (cx >= 180 && cx <= 330 && cy >= 840) {
                audio.playCameraShutter();
                shutterFlash = true;
                updateScreenDisplay();
                window.setTimeout(() => {
                  shutterFlash = false;
                  updateScreenDisplay();
                  wakeRender(600);
                }, 120);
                wakeRender(1000);
                return;
              }
            }
          }
          return;
        }

        const plugHits = raycaster.intersectObject(cablePlugGroup, true);
        const battHits = raycaster.intersectObject(batteryTesterGroup, true);
        if (plugHits.length > 0 || battHits.length > 0) {
          if (!isChargerPlugged) {
            cablePlugGroup.position.set(0.119, 1.278, 0.22);
            cablePlugGroup.rotation.set(0, 0, 0);
            isChargerPlugged = true;
            updateCableMesh(true);
            audio.playCablePlug();
            runBatteryTest3Seconds();
          } else {
            cablePlugGroup.position.copy(chargerDockPos);
            cablePlugGroup.rotation.set(0, 0, 0);
            isChargerPlugged = false;
            updateCableMesh(false);
            if (batteryTestInterval !== null) {
              clearInterval(batteryTestInterval);
              batteryTestInterval = null;
            }
            batteryLiveOverlay.hidden = true;
            updateBatteryLcd("idle");
          }
          wakeRender(800);
          return;
        }      }
      return;
    }

    isDraggingPhone = false;
    if (totalDragDist < 10) {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const phoneHits = raycaster.intersectObject(phone, true);
      if (phoneHits.length > 0 && customerState === "INTERACTING" && !dealFinished) {
        audio.playScan();
        setStation("repair", false);
        return;
      }

      const sceneHits = raycaster.intersectObjects(scene.children, true);
      for (const hit of sceneHits) {
        const targetStation = hit.object.userData["stationTarget"] as StationId | undefined;
        if (targetStation) {
          audio.playTap();
          setStation(targetStation);
          break;
        }
      }
    }
  };

  canvas?.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });

  void phoneBody;
  void phoneBack;

  // Başlangıç durumu
  sync3DSceneToEncounter();
  updateCustomerHeader();
  updateHUD(store.getState());
  setStation("counter");

  return {
    update: updateHUD,
    updateTick: (deltaSeconds: number): void => {
      if (activeBenchRepair !== null) {
        activeBenchRepair.remainingSeconds = Math.max(0, activeBenchRepair.remainingSeconds - deltaSeconds);
        if (activeBenchRepair.remainingSeconds <= 0 && !isReturningCustomerActive && customerState === "WAITING") {
          bringReturningCustomerToCounter();
        }
      }
      if (customerState === "WAITING") {
        customerWaitTimer -= deltaSeconds;
        updateCustomerHeader();
        updateHUD(store.getState());
        if (customerWaitTimer <= 0) {
          triggerCustomerArrival();
        }
      } else if (customerState === "WALKING_IN") {
        walkAnimCycle += deltaSeconds * 7.5;
        customerGroup.position.z -= deltaSeconds * 1.6;
        legLeft.rotation.x = Math.sin(walkAnimCycle) * 0.45;
        legRight.rotation.x = -Math.sin(walkAnimCycle) * 0.45;
        armLeft.rotation.x = -Math.sin(walkAnimCycle) * 0.35;
        armRight.rotation.x = Math.sin(walkAnimCycle) * 0.35;
        customerGroup.position.y = Math.abs(Math.sin(walkAnimCycle * 2)) * 0.03;
        wakeRender(200);

        if (customerGroup.position.z <= 1.48) {
          customerGroup.position.z = 1.45;
          customerGroup.position.y = 0;
          legLeft.rotation.x = 0;
          legRight.rotation.x = 0;
          armLeft.rotation.x = -0.15;
          armRight.rotation.x = 0.2;

          if (encounter.customer.intent === "buy") {
            customerState = "INTERACTING";
            phone.visible = false;
            inspectBtn.disabled = false;
            diagnoseBtn.disabled = false;
            updateCustomerHeader();
            updateHUD(store.getState());
            notify(`🗣️ ${encounter.customer.name}: "${encounter.customer.speechText}"`);
            if (!workshop.isWorkshopActive) openSpeechBubble(encounter.customer.speechText);
          } else {
            customerState = "PLACING_PHONE";
            placingTimer = 0;
            phonePlacedSoundPlayed = false;
            phone.visible = true;
            updateCustomerHeader();
            updateHUD(store.getState());
          }
        }
      } else if (customerState === "PLACING_PHONE") {
        placingTimer += deltaSeconds;
        const t = Math.min(1, placingTimer / 1.7);

        // Müşteri hızlı konuşurken kafasını sallar
        headMesh.rotation.x = Math.sin(t * 24) * 0.08;
        headMesh.rotation.y = Math.cos(t * 12) * 0.06;

        if (t < 0.45) {
          // 1. Aşama: Müşteri kolunu öne doğru kaldırıp telefonu tezgâha uzatır
          const p = t / 0.45;
          armRight.rotation.x = -0.15 - p * 1.15;
          armRight.rotation.z = 0.3 - p * 0.25;
          phone.visible = true;
          phone.position.set(0.16 * (1 - p * 0.4), 1.34 + Math.sin(p * Math.PI) * 0.08, 1.15 - p * 0.65);
          phone.rotation.set(-0.35, 0.25 * (1 - p), 0);
        } else if (t < 0.85) {
          // 2. Aşama: Kolunu indirip telefonu inceleme matının üzerine bırakır
          const p = (t - 0.45) / 0.4;
          phone.position.set(0, 1.34 - p * 0.062, 0.5 - p * 0.28);
          phone.rotation.set(-0.35 + p * 0.30, 0, 0);
          armRight.rotation.x = -1.30 + p * 0.45;
        } else {
          // 3. Aşama: Telefon artık mat üzerinde, elini tezgâha geri çeker
          const p = (t - 0.85) / 0.15;
          phone.position.set(0, 1.278, 0.22);
          phone.rotation.set(-0.05, 0, 0);
          if (!phonePlacedSoundPlayed) {
            phonePlacedSoundPlayed = true;
            audio.playTap();
          }
          armRight.rotation.x = -0.85 + p * 0.53;
          armRight.rotation.z = 0.05 + p * 0.25;
          headMesh.rotation.set(0, 0, 0);
        }

        wakeRender(250);

        if (placingTimer >= 1.7) {
          customerState = "INTERACTING";
          inspectBtn.disabled = false;
          diagnoseBtn.disabled = false;
          armRight.rotation.x = -0.32;
          armRight.rotation.z = 0.3;
          headMesh.rotation.set(0, 0, 0);
          updateCustomerHeader();
          updateHUD(store.getState());
          notify(
            encounter.customer.intent === "repair"
              ? "Cihaz tezgâha bırakıldı. 'ARIZAYI İNCELE' butonuna dokunarak test aletlerini kullan."
              : "Cihaz tezgâha bırakıldı. 'CİHAZI İNCELE' butonuna dokunarak test aletlerini kullan."
          );
          if (!workshop.isWorkshopActive) openSpeechBubble(encounter.customer.speechText);
        }
      } else if (customerState === "WALKING_OUT") {
        walkAnimCycle += deltaSeconds * 7.5;
        customerGroup.position.z += deltaSeconds * 1.6;
        legLeft.rotation.x = Math.sin(walkAnimCycle) * 0.45;
        legRight.rotation.x = -Math.sin(walkAnimCycle) * 0.45;
        armLeft.rotation.x = -Math.sin(walkAnimCycle) * 0.35;
        armRight.rotation.x = Math.sin(walkAnimCycle) * 0.35;
        customerGroup.position.y = Math.abs(Math.sin(walkAnimCycle * 2)) * 0.03;
        wakeRender(200);

        if (customerGroup.position.z >= 5.1) {
          customerGroup.visible = false;
          legLeft.rotation.x = 0;
          legRight.rotation.x = 0;
          armLeft.rotation.x = 0;
          armRight.rotation.x = 0;
          customerState = "WAITING";
          inspectBtn.disabled = true;
          diagnoseBtn.disabled = true;
          updateCustomerHeader();
          updateHUD(store.getState());
          setStation("counter");
        }
      } else if (customerState === "INTERACTING") {
        customerGroup.position.y = Math.sin(performance.now() * 0.002) * 0.012;
      }
    },
    isUserDraggingPhone: () => isDraggingPhone,
    isInspecting: () => isInspecting,
    getWorkshopRepairJob: () => {
      if (activeBenchRepair) {
        return {
          uid: activeBenchRepair.phone.uid,
          modelKey: activeBenchRepair.phone.brand + "|" + activeBenchRepair.phone.model,
          modelLabel: activeBenchRepair.phone.brand + " " + activeBenchRepair.phone.model,
          defectId: activeBenchRepair.defect.id,
          defectCategory: activeBenchRepair.defect.category,
          defectTitle: activeBenchRepair.defect.title,
          remainingSeconds: activeBenchRepair.remainingSeconds,
          isRepaired: activeBenchRepair.isRepaired,
        };
      }
      if (customerState === "INTERACTING" && encounter.customer.intent === "repair" && !dealFinished && repairAgreed) {
        const phoneData = encounter.phone;
        const targetId = encounter.customer.repairTargetDefect?.id;
        const defect =
          phoneData.defects.find((item) => item.id === targetId) ??
          phoneData.defects.find((item) => diagnosedCategories.has(item.category));
        if (defect) {
          return {
            uid: phoneData.uid,
            modelKey: phoneData.brand + "|" + phoneData.model,
            modelLabel: phoneData.brand + " " + phoneData.model,
            defectId: defect.id,
            defectCategory: defect.category,
            defectTitle: defect.title,
          };
        }
      }

      // Stoktaki arızalı telefonları da tamir masasında onarabilme (satın alıp tamir edip pahalıya satma)
      const stockPhone =
        stockItems.find((s) => s.uid === activeStockRepairUid && (s.foundDefects.length > 0 || s.missedDefects.length > 0)) ??
        stockItems.find((s) => s.foundDefects.length > 0 || s.missedDefects.length > 0);
      if (!stockPhone) return null;
      const d = stockPhone.foundDefects[0] ?? stockPhone.missedDefects[0]!;
      const cat: InspectionCategoryId = d.category ?? "battery";
      return {
        uid: stockPhone.uid,
        modelKey: stockPhone.brand + "|" + stockPhone.model,
        modelLabel: stockPhone.brand + " " + stockPhone.model + " (Stok)",
        defectId: d.id ?? "stock_defect",
        defectCategory: cat,
        defectTitle: d.title,
      };
    },
    completeWorkshopRepair: (job: WorkshopRepairJob) => {
      if (activeBenchRepair && activeBenchRepair.phone.uid === job.uid) {
        activeBenchRepair.isRepaired = true;
        const defectIndex = activeBenchRepair.phone.defects.findIndex((item) => item.id === job.defectId);
        if (defectIndex >= 0) activeBenchRepair.phone.defects.splice(defectIndex, 1);
        workshopRepaired = true;
        sync3DSceneToEncounter();
        updateCustomerHeader();
        updateHUD(store.getState());
        renderDiagnosticArea();
        notify("✓ Telefon atölyede başarıyla onarıldı! Müşteri geldiğinde teslim edebilirsin.");
        return;
      }
      const stockPhone = stockItems.find((s) => s.uid === job.uid);
      if (stockPhone) {
        const fIdx = stockPhone.foundDefects.findIndex((d) => (d.id ?? "stock_defect") === job.defectId || d.title === job.defectTitle);
        let restoredLoss = 0;
        if (fIdx >= 0) {
          restoredLoss = stockPhone.foundDefects[fIdx]!.valueLoss;
          stockPhone.foundDefects.splice(fIdx, 1);
        } else {
          const mIdx = stockPhone.missedDefects.findIndex((d) => (d.id ?? "stock_defect") === job.defectId || d.title === job.defectTitle);
          if (mIdx >= 0) {
            restoredLoss = stockPhone.missedDefects[mIdx]!.valueLoss;
            stockPhone.missedDefects.splice(mIdx, 1);
          }
        }
        stockPhone.actualValue = Math.min(stockPhone.baseValue, stockPhone.actualValue + restoredLoss);
        const remaining = stockPhone.foundDefects.length + stockPhone.missedDefects.length;
        renderStockMenu();
        renderDiagnosticArea();
        updateHUD(store.getState());
        notify(
          remaining === 0
            ? `✨ ${stockPhone.brand} ${stockPhone.model} tamamen yenilendi! Yeni piyasa değeri: ₺${stockPhone.actualValue.toLocaleString("tr-TR")}`
            : `🔧 Parça onarıldı (+₺${restoredLoss.toLocaleString("tr-TR")} değer). Kalan arıza: ${remaining}`,
        );
        return;
      }

      const defectIndex = encounter.phone.defects.findIndex((item) => item.id === job.defectId);
      if (defectIndex >= 0) encounter.phone.defects.splice(defectIndex, 1);
      const targetId = encounter.customer.repairTargetDefect?.id;
      const remainingDiagnosedDefect = encounter.phone.defects.some(
        (item) => item.id === targetId || diagnosedCategories.has(item.category),
      );
      workshopRepaired = !remainingDiagnosedDefect;
      sync3DSceneToEncounter();
      updateCustomerHeader();
      updateHUD(store.getState());
      renderDiagnosticArea();
      notify(
        workshopRepaired
          ? "🔧 Tamir tamamlandı. Tezgâha dönüp telefonu müşteriye teslim et."
          : "🔧 Bu arıza onarıldı. Tezgâha dönüp sıradaki tespiti atölyede tamir et.",
      );
    },
    advanceBenchTimer: (seconds: number) => {
      if (activeBenchRepair) {
        activeBenchRepair.remainingSeconds = Math.max(0, activeBenchRepair.remainingSeconds - seconds);
        updateHUD(store.getState());
      }
    },
    returnToCounter: () => setStation("counter"),
    destroy: () => {
      if (batteryTestInterval !== null) {
        clearInterval(batteryTestInterval);
        batteryTestInterval = null;
      }
      shell.remove();
      canvas?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.clearTimeout(toastTimer);
      window.removeEventListener("pointerdown", onStockMenuOutsidePress);
    },
  };
}
