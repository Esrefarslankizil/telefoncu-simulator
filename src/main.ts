import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import "./styles/main.css";
import { AssetLoader } from "./assets/AssetLoader";
import { AudioSystem } from "./core/AudioSystem";
import { EventBus } from "./core/EventBus";
import type { GameEvents } from "./core/GameEvents";
import { GameLoop } from "./core/GameLoop";
import { GameStore } from "./core/GameStore";
import { SeededRNG } from "./core/SeededRNG";
import { QualityManager } from "./performance/QualityManager";
import { SaveSystem } from "./persistence/SaveSystem";
import { RepairWorkshop } from "./workshop/RepairWorkshop";
import { mats, geometries } from "./scene/resources";
import { buildShopScene } from "./scene/ShopScene";
import { buildInterface, type ShopUiHandle } from "./ui/ShopInterface";

async function bootstrap(): Promise<void> {

  const appRoot = document.querySelector<HTMLElement>("#app");
  const gameRoot = document.querySelector<HTMLElement>("#game-root");
  const uiRoot = document.querySelector<HTMLElement>("#ui-root");
  if (!appRoot || !gameRoot || !uiRoot) throw new Error("App roots missing from index.html.");

  window.addEventListener("contextmenu", (e) => e.preventDefault());

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "Telefoncu dükkânı birinci şahıs 3B sahnesi");
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch (error: unknown) {
    showError(uiRoot, "3B sahne başlatılamadı. Tarayıcıda donanım hızlandırmayı açıp yenileyin.");
    console.error(error);
    return;
  }
  // Piksel oranı en fazla 1.5 ile sınırlandırılır
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = false;
  gameRoot.append(canvas);

  const scene = new Scene();
  scene.background = new Color("#182322");

  let activeWakeUntil = performance.now() + 2500;
  const wakeRender = (ms = 1800): void => {
    const until = performance.now() + ms;
    if (until > activeWakeUntil) activeWakeUntil = until;
  };

  // Birinci şahıs kamera: Oyuncu tezgâhın arkasında göz hizasında (y = 1.68) durur
  const camera = new PerspectiveCamera(52, window.innerWidth / Math.max(window.innerHeight, 1), 0.08, 35);
  camera.position.set(0, 1.68, -0.85);
  camera.lookAt(0, 1.40, 1.45);

  scene.add(new AmbientLight("#dce8d9", 1.85));
  const keyLight = new DirectionalLight("#ffe4b5", 2.1);
  keyLight.position.set(-2, 5.5, 2);
  keyLight.castShadow = false;
  scene.add(keyLight);

  const {
    phone,
    phoneBody,
    phoneBack,
    screen,
    crack1,
    crack2,
    batteryMarker,
    bodyMarker,
    funcMarker,
    phoneFrameMat,
    phoneBackMat,
    phoneScreenMat,
    cameraBumpMat,
    elmaCamGroup,
    elmaDuoCamGroup,
    samsamCamGroup,
    shaomiCamGroup,
    redmiCamGroup,
    pocoCamGroup,
    jacket,
    customer,
    legLeft,
    legRight,
    armLeft,
    armRight,
    headMesh,
    ammeterUnit,
    ammeterDisplayMat,
    cablePlugGroup,
    batteryTesterGroup,
    phoneScreenCanvas,
    phoneScreenTexture,
    updateBatteryLcd,
    updateCableMesh,
  } = buildShopScene(scene, wakeRender);
  const events = new EventBus<GameEvents>();
  const store = new GameStore(events);
  const saveSystem = new SaveSystem(store, events);
  await saveSystem.initialize();

  const audio = new AudioSystem(store.getState().settings.audioEnabled);
  const rng = new SeededRNG(store.getState().rngState);
  const qualityManager = new QualityManager(renderer, events, store.getState().settings.quality);
  const assetLoader = new AssetLoader(renderer, events);
  let ui: ShopUiHandle | null = null;
  const workshop = new RepairWorkshop({
    uiRoot, shopScene: scene, phone, phoneBack, phoneScreen: screen, store, audio,
    getRepairJob: () => ui?.getWorkshopRepairJob() ?? null,
    onRepairComplete: (job) => ui?.completeWorkshopRepair(job),
    onSceneChange: (active) => { if (!active) ui?.returnToCounter(); wakeRender(1800); },
    onAdvanceTimer: (sec) => ui?.advanceBenchTimer(sec),
  });

  // Birinci şahıs kamera hedefleri
  const camTargetPos = new Vector3(0, 1.68, -0.85);
  const camTargetLook = new Vector3(0, 1.40, 1.45);
  const camCurrentLook = new Vector3(0, 1.40, 1.45);
  let lookYawOffset = 0;
  let lookPitchOffset = 0;

  events.on("game:paused", () => {
    audio.suspend();
    void saveSystem.saveNow();
  });
  events.on("game:resumed", () => {
    audio.resume();
    wakeRender(1500);
  });

  ui = buildInterface(
    uiRoot,
    store,
    saveSystem,
    audio,
    rng,
    phone,
    phoneBody,
    phoneBack,
    screen,
    crack1,
    crack2,
    batteryMarker,
    bodyMarker,
    funcMarker,
    phoneFrameMat,
    phoneBackMat,
    phoneScreenMat,
    cameraBumpMat,
    elmaCamGroup,
    elmaDuoCamGroup,
    samsamCamGroup,
    shaomiCamGroup,
    redmiCamGroup,
    pocoCamGroup,
    jacket,
    customer,
    legLeft,
    legRight,
    armLeft,
    armRight,
    headMesh,
    ammeterUnit,
    ammeterDisplayMat,
    cablePlugGroup,
    batteryTesterGroup,
    phoneScreenCanvas,
    phoneScreenTexture,
    updateBatteryLcd,
    updateCableMesh,
    camTargetPos,
    camTargetLook,
    () => {
      lookYawOffset = 0;
      lookPitchOffset = 0;
    },
    (dx, dy) => {
      lookYawOffset = Math.max(-1.1, Math.min(1.1, lookYawOffset - dx * 0.0035));
      lookPitchOffset = Math.max(-0.45, Math.min(0.35, lookPitchOffset - dy * 0.0028));
      wakeRender(900);
    },
    wakeRender,
    workshop,
    camera,
    scene,
  );

  let activeQualityPreference = store.getState().settings.quality;
  const unsubscribeSettings = store.subscribe((state) => {
    if (state.settings.quality !== activeQualityPreference) {
      activeQualityPreference = state.settings.quality;
      qualityManager.setQuality(state.settings.quality, "user");
    }
    audio.setEnabled(state.settings.audioEnabled);
    ui.update(state);
    wakeRender(800);
  });

  // Sabit 30 FPS hedefi ve bekleme anında düşük çizim sıklığı
  let previousRenderTime = performance.now();
  const gameLoop = new GameLoop(
    {
      fixedUpdate: (seconds) => {
        ui.updateTick(seconds);
        if (workshop.isWorkshopActive) workshop.update(seconds);
        if (!workshop.isWorkshopActive && phone.visible && !ui!.isInspecting() && !ui!.isUserDraggingPhone()) {
          phone.rotation.y += seconds * 0.16;
        }
      },
      render: () => {
        const now = performance.now();
        const isBusy = now < activeWakeUntil || workshop.isWorkshopActive;
        const minIntervalMs = isBusy ? 32 : 160;
        if (now - previousRenderTime < minIntervalMs) {
          return;
        }
        const frameDelta = Math.max(0, (now - previousRenderTime) / 1000);
        qualityManager.recordFrame(frameDelta);
        previousRenderTime = now;

        if (!workshop.isWorkshopActive && ui!.isInspecting()) {
          camera.up.set(0, 0, -1);
          camera.position.lerp(camTargetPos, 0.18);
          camCurrentLook.lerp(camTargetLook, 0.18);
          camera.lookAt(camCurrentLook);
        } else if (!workshop.isWorkshopActive) {
          camera.up.set(0, 1, 0);
          camera.position.lerp(camTargetPos, 0.14);
          const desiredLook = new Vector3(
            camTargetLook.x + lookYawOffset,
            camTargetLook.y + lookPitchOffset,
            camTargetLook.z,
          );
          camCurrentLook.lerp(desiredLook, 0.16);
          camera.lookAt(camCurrentLook);
        }

        renderer.render(workshop.isWorkshopActive ? workshop.scene : scene, workshop.isWorkshopActive ? workshop.camera : camera);
      },
    },
    events,
  );

  const onResize = (): void => {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    workshop.resize(window.innerWidth, window.innerHeight);
    wakeRender(1000);
  };
  const onPageHide = (): void => {
    window.removeEventListener("resize", onResize);
    gameLoop.destroy();
    qualityManager.destroy();
    assetLoader.destroy();
    workshop.destroy();
    unsubscribeSettings();
    saveSystem.destroy();
    ui.destroy();
    for (const geometry of geometries) geometry.dispose();
    for (const value of mats) value.dispose();
    renderer.dispose();
  };
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(onResize, 120), { passive: true });
  window.addEventListener("pagehide", onPageHide, { once: true });
  gameLoop.start();
}


function showError(root: HTMLElement, message: string): void {
  const panel = document.createElement("div");
  panel.className = "startup-error";
  panel.setAttribute("role", "alert");
  panel.textContent = message;
  root.append(panel);
}
void bootstrap().catch((error: unknown) => {
  console.error("Game startup failed.", error);
  const root = document.querySelector<HTMLElement>("#ui-root");
  if (root) showError(root, "Oyun başlatılamadı. Geliştirici konsolundaki hata ayrıntılarına bakın.");
});
