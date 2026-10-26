import {
  AmbientLight,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Raycaster,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Material, Object3D } from "three";
import "./styles/main.css";
import { AssetLoader } from "./assets/AssetLoader";
import { AudioSystem } from "./core/AudioSystem";
import { EventBus } from "./core/EventBus";
import type { GameEvents } from "./core/GameEvents";
import { GameLoop } from "./core/GameLoop";
import { GameStore } from "./core/GameStore";
import type { QualityPreference } from "./core/GameStore";
import { SeededRNG } from "./core/SeededRNG";
import {
  INSPECTION_CATEGORIES,
  generateCustomerEncounter,
  getDailyCustomerQuota,
  getKnownPhoneValue,
  roundTo50,
} from "./data/PhoneCatalog";
import type {
  CustomerIntent,
  GeneratedPhone,
  InspectionCategoryId,
  StockPhoneItem,
} from "./data/PhoneCatalog";
import { DebugOverlay } from "./debug/DebugOverlay";
import { QualityManager } from "./performance/QualityManager";
import { SaveSystem } from "./persistence/SaveSystem";
import { OrientationManager } from "./core/OrientationManager";

type StationId = "counter" | "repair" | "display" | "stock";

const STATIONS: ReadonlyArray<{ id: StationId; title: string; description: string }> = [
  { id: "counter", title: "KASA", description: "Tezgâhta birinci şahıs" },
  { id: "repair", title: "CİHAZI İNCELE", description: "Yakın plan 4 kontrol" },
  { id: "display", title: "VİTRİN", description: "Satış & stok rafı" },
  { id: "stock", title: "DEPO", description: "Yedek parça & durum" },
];

const mats: Material[] = [];
const geometries: BufferGeometry[] = [];

// Paylaşılan temel geometriler
const unitBoxGeo = new BoxGeometry(1, 1, 1);
const unitCylGeo = new CylinderGeometry(1, 1, 1, 14);
const unitSphereGeo = new SphereGeometry(1, 12, 8);
geometries.push(unitBoxGeo, unitCylGeo, unitSphereGeo);

/** Tezgâh üzerindeki antistatik mat için "CEP DÜKKÂNI" logolu ve alet yuvalı dinamik kanvas dokusu */
function createWorkbenchMatTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  // Antistatik koyu yeşil kauçuk zemin
  ctx.fillStyle = "#102622";
  ctx.fillRect(0, 0, 1024, 1024);

  // Kılavuz ızgarası
  ctx.strokeStyle = "#183a34";
  ctx.lineWidth = 1.5;
  for (let x = 32; x < 1024; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x, 992);
    ctx.stroke();
  }
  for (let y = 32; y < 1024; y += 36) {
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(992, y);
    ctx.stroke();
  }

  // Dış çerçeve cetvel şeritleri
  ctx.strokeStyle = "#d7a958";
  ctx.lineWidth = 4;
  ctx.strokeRect(32, 32, 960, 960);

  ctx.fillStyle = "#d7a958";
  ctx.font = "bold 13px monospace";
  for (let x = 50; x <= 970; x += 50) {
    ctx.fillRect(x - 1, 32, 2, 12);
    ctx.fillRect(x - 1, 980, 2, 12);
    ctx.fillText(`${(x - 50) / 10}cm`, x - 12, 58);
  }

  // Sol alet yuvaları (Büyüteç ve Tornavida)
  ctx.strokeStyle = "#38bdf888";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(55, 170, 260, 340);
  ctx.fillStyle = "#38bdf8aa";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("🔍 BÜYÜTEÇ DOKU", 85, 205);

  ctx.strokeStyle = "#a78bfa88";
  ctx.strokeRect(55, 540, 260, 360);
  ctx.fillStyle = "#a78bfaaa";
  ctx.fillText("🪛 TORNAVİDA DOKU", 85, 575);

  // Sağ alet yuvası (Batarya Test Aleti)
  ctx.strokeStyle = "#f59e0b88";
  ctx.strokeRect(709, 170, 260, 730);
  ctx.fillStyle = "#f59e0baa";
  ctx.fillText("⚡ BATARYA TEST CİHAZI", 725, 205);
  ctx.font = "12px monospace";
  ctx.fillText("Şarj & Akım Analizörü", 745, 230);

  // Orta telefon kılavuz çerçevesi
  ctx.strokeStyle = "#94a3b866";
  ctx.strokeRect(386, 220, 252, 530);
  ctx.setLineDash([]);
  ctx.fillStyle = "#94a3b888";
  ctx.font = "bold 13px monospace";
  ctx.fillText("📱 CİHAZ EKSPERTİZ ALANI", 408, 250);

  // Üstte ve altta büyük oyun logosu ve ismi: "CEP DÜKKÂNI"
  ctx.fillStyle = "#f3ca7f";
  ctx.font = "900 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CEP DÜKKÂNI", 512, 115);

  ctx.fillStyle = "#94d2bd";
  ctx.font = "bold 15px monospace";
  ctx.fillText("PROFESYONEL TELEFON EKSPERTİZ & TAMİR TEZGÂHI", 512, 142);

  // Alt ESD Logosu
  ctx.fillStyle = "#d7a95899";
  ctx.font = "bold 14px monospace";
  ctx.fillText("⚡ ESD SAFE ANTISTATIC WORKSTATION · AGY-2026", 512, 950);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Telefon camındaki gerçekçi kılcal çatlak veya büyük kırıkları çizen fonksiyon */
function drawGlassCracks(ctx: CanvasRenderingContext2D, isMajor: boolean, uid: string): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "bevel";

  // Sabit ve tutarlı pozisyonlar için UID'den türetilen basit tohum
  let seed = 0;
  for (let i = 0; i < uid.length; i++) {
    seed = (seed * 31 + uid.charCodeAt(i)) % 10000;
  }
  const pseudoRng = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  if (isMajor) {
    // 1. BÜYÜK KIRIK / ÖRÜMCEK AĞI PARÇALANMIŞ CAM (Büyük Kırıklar)
    const impactX = 140 + Math.floor(pseudoRng(1) * 230);
    const impactY = 280 + Math.floor(pseudoRng(2) * 360);

    // Ezilmiş cam çekirdeği (Impact core)
    const impactGrad = ctx.createRadialGradient(impactX, impactY, 2, impactX, impactY, 32);
    impactGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    impactGrad.addColorStop(0.3, "rgba(230, 245, 255, 0.75)");
    impactGrad.addColorStop(0.7, "rgba(180, 210, 230, 0.45)");
    impactGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = impactGrad;
    ctx.beginPath();
    ctx.arc(impactX, impactY, 32, 0, Math.PI * 2);
    ctx.fill();

    // Dairesel örümcek ağı halkaları
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.6;
    for (const r of [18, 36, 62, 95]) {
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2; a += 0.28) {
        const rad = r + Math.sin(a * 5.2 + seed) * (r * 0.16);
        const px = impactX + Math.cos(a) * rad;
        const py = impactY + Math.sin(a) * rad;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Ana yayılım kırık hatları (10 adet dışa yayılan kesik hat)
    const angles = [0.15, 0.65, 1.25, 1.85, 2.5, 3.15, 3.8, 4.45, 5.1, 5.75];
    for (let idx = 0; idx < angles.length; idx++) {
      const ang = angles[idx]!;
      let curX = impactX + Math.cos(ang) * 14;
      let curY = impactY + Math.sin(ang) * 14;
      const rayLen = 160 + pseudoRng(idx * 7) * 260;

      ctx.beginPath();
      ctx.moveTo(curX, curY);

      let dist = 0;
      let curAngle = ang;
      while (dist < rayLen) {
        const step = 20 + pseudoRng(dist + idx) * 22;
        dist += step;
        curAngle += (pseudoRng(dist * 3 + idx) - 0.48) * 0.4;
        curX += Math.cos(curAngle) * step;
        curY += Math.sin(curAngle) * step;

        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = Math.max(2.0, 3.8 - (dist / rayLen) * 2.0);
        ctx.lineTo(curX, curY);
      }
      ctx.stroke();

      // Üst parlak ışık kırılması hattı
      curX = impactX + Math.cos(ang) * 14;
      curY = impactY + Math.sin(ang) * 14;
      dist = 0;
      curAngle = ang;
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      while (dist < rayLen) {
        const step = 20 + pseudoRng(dist + idx) * 22;
        dist += step;
        curAngle += (pseudoRng(dist * 3 + idx) - 0.48) * 0.4;
        curX += Math.cos(curAngle) * step;
        curY += Math.sin(curAngle) * step;

        ctx.strokeStyle = "rgba(240, 248, 255, 0.9)";
        ctx.lineWidth = Math.max(1.1, 2.2 - (dist / rayLen) * 1.2);
        ctx.lineTo(curX, curY);
      }
      ctx.stroke();
    }
  } else {
    // 2. KÜÇÜK VE KILCAL ÇATLAKLAR (Genellikle küçük, ince çizgiler)
    const crackSets = [
      [
        { x: 42, y: 180 },
        { x: 105, y: 235 },
        { x: 175, y: 270 },
        { x: 250, y: 320 },
        { x: 310, y: 385 },
        { x: 360, y: 440 },
      ],
      [
        { x: 175, y: 270 },
        { x: 215, y: 240 },
        { x: 270, y: 215 },
        { x: 320, y: 195 },
      ],
      [
        { x: 480, y: 650 },
        { x: 410, y: 695 },
        { x: 335, y: 735 },
        { x: 260, y: 790 },
      ],
    ];

    for (const path of crackSets) {
      // Gölge / derinlik çizgisi
      ctx.beginPath();
      ctx.moveTo(path[0]!.x, path[0]!.y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i]!.x, path[i]!.y);
      }
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // İnce ve keskin parlak kılcal çizgi
      ctx.beginPath();
      ctx.moveTo(path[0]!.x, path[0]!.y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i]!.x, path[i]!.y);
      }
      ctx.strokeStyle = "rgba(240, 248, 255, 0.92)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Telefon ekranının 2B arayüzünü (Kilit ekranı, Fotoğraf uygulaması / zemin vizörü) dinamik çizen fonksiyon */
function renderSmartphoneScreen(
  canvas: HTMLCanvasElement,
  ph: GeneratedPhone,
  powerOn: boolean,
  inCameraApp: boolean,
  cameraWorking: boolean,
  shutterFlash: boolean,
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 1024);

  if (!powerOn) {
    // KAPALI EKRAN (OLED Siyah)
    ctx.fillStyle = "#070b10";
    ctx.fillRect(0, 0, 512, 1024);

    // Çift dokunma rehber ikonu
    ctx.fillStyle = "#e5b765aa";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("👆👆", 256, 480);
    ctx.font = "bold 20px monospace";
    ctx.fillText("ÇİFT DOKUNARAK AÇ", 256, 520);
    ctx.fillStyle = "#94a3b844";
    ctx.font = "14px monospace";
    ctx.fillText("Telefonu açmak için ekrana 2 kez tıkla", 256, 550);
  } else if (inCameraApp) {
    // KAMERA / FOTOĞRAF UYGULAMASI EKRANI
    if (cameraWorking) {
      // 1. KAMERA SAĞLAM: ZEMİN VE LOGOYU GÖRÜYOR!
      ctx.fillStyle = "#112623";
      ctx.fillRect(0, 0, 512, 1024);

      // Kılavuz ızgaraları
      ctx.strokeStyle = "#1b403a";
      ctx.lineWidth = 2;
      for (let x = 0; x < 512; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 1024);
        ctx.stroke();
      }
      for (let y = 0; y < 1024; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }

      // Kameranın gördüğü zemin logosu
      ctx.fillStyle = "#d7a958cc";
      ctx.font = "900 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CEP DÜKKÂNI", 256, 420);
      ctx.font = "bold 15px monospace";
      ctx.fillStyle = "#94d2bd";
      ctx.fillText("MASA VE ZEMİN GÖRÜLÜYOR", 256, 455);
      ctx.fillStyle = "#cbd5e188";
      ctx.fillText("⚡ ANTISTATIC WORKSTATION", 256, 485);

      // Otomatik Odaklama Çerçevesi
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 3;
      ctx.strokeRect(176, 360, 160, 160);
      ctx.fillStyle = "#10b981";
      ctx.font = "bold 16px monospace";
      ctx.fillText("✓ SENSÖR NET · 60 FPS", 256, 550);
      ctx.fillText("✓ KAMERA SAĞLAM", 256, 580);
    } else {
      // 2. KAMERA ARIZALI: SİMSİYAH EKRAN VE HATA MESAJI!
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, 512, 1024);

      // Parazit çizgisi
      ctx.strokeStyle = "#ef444455";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 200 + i * 80);
        ctx.lineTo(512, 205 + i * 80);
        ctx.stroke();
      }

      ctx.fillStyle = "#f87171";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("⚠ KAMERA HATASI", 256, 420);
      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold 16px monospace";
      ctx.fillText("Görüntü Yok (Zemin Görülemiyor)", 256, 460);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Kamera sensörü veya flex kablosu kopuk!", 256, 495);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 15px monospace";
      ctx.fillText("✗ KAMERA ARIZALI", 256, 540);
    }

    if (shutterFlash) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 512, 1024);
    } else {
      // Kamera vizör üst çubuğu
      ctx.fillStyle = "#000000cc";
      ctx.fillRect(0, 0, 512, 120);
      ctx.fillStyle = "#f3eee1";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "left";
      ctx.fillText("📸 KAMERA VİZÖRÜ", 24, 65);
      ctx.textAlign = "right";
      ctx.fillStyle = "#f87171";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("✕ ÇIK", 488, 65);

      // Kamera vizör alt çubuğu ve Deklanşör butonu
      ctx.fillStyle = "#000000cc";
      ctx.fillRect(0, 840, 512, 184);
      ctx.beginPath();
      ctx.arc(256, 920, 44, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(256, 920, 36, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  } else {
    // AÇIK EKRAN (Ana Ekran / Home Screen)
    const grad = ctx.createLinearGradient(0, 0, 512, 1024);
    grad.addColorStop(0, "#0c3b37");
    grad.addColorStop(0.5, "#14253d");
    grad.addColorStop(1, "#1e1338");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 1024);

    // Üst Durum Çubuğu (Status Bar)
    ctx.fillStyle = "#f3eee1";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("12:45", 36, 56);
    ctx.textAlign = "right";
    ctx.font = "18px monospace";
    ctx.fillText("5G  WiFi  🔋%86", 476, 56);

    // Dinamik Ada / Çentik
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.roundRect(196, 26, 120, 36, 18);
    ctx.fill();

    // Büyük Saat & Tarih Widget
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("12:45", 256, 220);
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Pazartesi, 26 Ekim", 256, 265);

    // Model etiketi
    ctx.fillStyle = "#d7a958cc";
    ctx.font = "bold 15px monospace";
    ctx.fillText(`${ph.brand} OS`, 256, 305);

    // Uygulama Simgeleri Tablosu
    // 1. 📸 KAMERA / FOTOĞRAF UYGULAMASI (ÖN PLANDA!)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(70, 560, 100, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.font = "46px sans-serif";
    ctx.fillText("📸", 120, 628);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("Kamera", 120, 685);
    ctx.fillStyle = "#d7a958";
    ctx.font = "bold 11px monospace";
    ctx.fillText("TEST ET", 120, 702);

    // 2. 📞 Telefon
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.roundRect(190, 560, 100, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "44px sans-serif";
    ctx.fillText("📞", 240, 628);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("Telefon", 240, 685);

    // 3. 💬 Mesajlar
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(310, 560, 100, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "44px sans-serif";
    ctx.fillText("💬", 360, 628);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("Mesajlar", 360, 685);

    // 4. ⚙️ Ayarlar
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.roundRect(430, 560, 60, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "34px sans-serif";
    ctx.fillText("⚙", 460, 628);

    // Alt Kısayol Göstergesi
    ctx.fillStyle = "#ffffff22";
    ctx.beginPath();
    ctx.roundRect(40, 760, 432, 60, 14);
    ctx.fill();
    ctx.fillStyle = "#d7a958";
    ctx.font = "bold 14px monospace";
    ctx.fillText("📸 'Kamera' simgesine dokunarak test et", 256, 796);

    // Alt swipe çubuğu
    ctx.fillStyle = "#ffffffbb";
    ctx.beginPath();
    ctx.roundRect(186, 980, 140, 6, 3);
    ctx.fill();
  }

  // EN ÜST KATMAN: Cam Kırıkları & Kılcal Çatlaklar (Telefon açıkken de kapalıyken de cam yüzeyinde görünür)
  const scrDef = ph.defects.find((d) => d.category === "screen");
  if (scrDef) {
    const isMajor = scrDef.id === "scr_broken";
    drawGlassCracks(ctx, isMajor, ph.uid);
  }
}

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

  const material = (color: string, roughness = 0.8, metalness = 0): MeshStandardMaterial => {
    const value = new MeshStandardMaterial({ color, roughness, metalness });
    mats.push(value);
    return value;
  };
  const wood = material("#8b5638");
  const darkWood = material("#402b25");
  const wall = material("#c7b99e");
  const teal = material("#1c5550");
  const black = material("#0f172a", 0.3, 0.3);
  const gold = material("#d7a958", 0.36, 0.48);
  const green = material("#477553");
  const warnMat = material("#e59952", 0.35, 0.15);
  const badMat = material("#d9534f", 0.35, 0.15);
  const metalColor = material("#718096", 0.4, 0.6);

  const addBox = (
    parent: Object3D,
    size: [number, number, number],
    position: [number, number, number],
    mat: Material,
  ): Mesh => {
    const mesh = new Mesh(unitBoxGeo, mat);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  const addCylinder = (
    parent: Object3D,
    radius: number,
    height: number,
    position: [number, number, number],
    mat: Material,
  ): Mesh => {
    const mesh = new Mesh(unitCylGeo, mat);
    mesh.scale.set(radius, height, radius);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  const addSphere = (
    parent: Object3D,
    size: [number, number, number],
    position: [number, number, number],
    mat: Material,
  ): Mesh => {
    const mesh = new Mesh(unitSphereGeo, mat);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };

  // Zemin
  const floorGeo = new PlaneGeometry(14, 14);
  geometries.push(floorGeo);
  const floor = new Mesh(floorGeo, material("#b5a58b"));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.035, 1.2);
  scene.add(floor);

  // Arka Duvar (Oyuncunun arkasında, z = -2.85)
  addBox(scene, [14, 6, 0.25], [0, 3, -2.85], wall);
  addBox(scene, [13.8, 0.16, 0.18], [0, 5.6, -2.72], darkWood);
  addBox(scene, [3.2, 0.9, 0.16], [0, 4.55, -2.7], teal);
  addBox(scene, [2.75, 0.08, 0.2], [0, 4.13, -2.58], gold);

  // Ön Duvar ve Cam Giriş Kapısı (Müşterilerin geldiği yer, z = 5.5)
  addBox(scene, [5.5, 6, 0.25], [-4.25, 3, 5.5], wall);
  addBox(scene, [5.5, 6, 0.25], [4.25, 3, 5.5], wall);
  addBox(scene, [3.0, 1.8, 0.25], [0, 5.1, 5.5], wall);
  addBox(scene, [2.6, 4.25, 0.12], [0, 2.1, 5.48], darkWood);
  addBox(scene, [2.3, 3.95, 0.06], [0, 2.1, 5.5], material("#8fc7c2", 0.2, 0.05));
  addBox(scene, [0.08, 0.6, 0.15], [-0.15, 1.9, 5.42], gold);
  addBox(scene, [0.08, 0.6, 0.15], [0.15, 1.9, 5.42], gold);
  addBox(scene, [2.4, 0.35, 0.16], [0, 4.35, 5.38], teal);
  addBox(scene, [2.1, 0.06, 0.18], [0, 4.16, 5.34], gold);

  // Yan Duvarlar
  addBox(scene, [0.25, 6, 12], [-6.8, 3, 1.4], wall);
  addBox(scene, [0.25, 6, 12], [6.8, 3, 1.4], wall);

  // Raflar ve kutulu aksesuarlar
  for (const x of [-5.35, -3.9, 3.9, 5.35]) {
    const shelfUnit = addBox(scene, [1.15, 3.15, 0.35], [x, 2.0, -2.35], darkWood);
    shelfUnit.userData["stationTarget"] = x > 0 ? "display" : "stock";
    for (const y of [0.95, 1.8, 2.65, 3.48]) {
      addBox(scene, [1.35, 0.1, 0.58], [x, y, -2.12], wood);
      for (let i = 0; i < 3; i += 1) {
        const box = addBox(
          scene,
          [0.25, 0.35, 0.23],
          [x - 0.4 + i * 0.38, y + 0.22, -2.02],
          i % 2 === 0 ? teal : gold,
        );
        box.rotation.z = (i - 1) * 0.08;
        box.userData["stationTarget"] = x > 0 ? "display" : "stock";
      }
    }
  }

  // Tezgâh (Oyuncunun hemen önünde)
  const counterMain = addBox(scene, [5.8, 1.15, 0.95], [0, 0.58, 0.25], wood);
  counterMain.userData["stationTarget"] = "counter";
  const counterTop = addBox(scene, [6.05, 0.12, 1.15], [0, 1.2, 0.24], darkWood);
  counterTop.userData["stationTarget"] = "counter";

  // Tezgâh üstü antistatik telefon inceleme matı ("CEP DÜKKÂNI" logolu ve yuvalı)
  const matTexture = createWorkbenchMatTexture();
  const matPadMat = new MeshStandardMaterial({
    map: matTexture,
    roughness: 0.85,
    metalness: 0.08,
  });
  mats.push(matPadMat);
  const matPad = addBox(scene, [0.86, 0.012, 0.58], [0, 1.266, 0.22], matPadMat);
  matPad.userData["stationTarget"] = "repair";

  // =========================================================================
  // TEZGÂHTAKİ FİZİKSEL TEST ALETLERİ (3D)
  // 1. Şarj Cihazı & Dijital Ampermetre Ünitesi (Matın sağında)
  // =========================================================================
  const ammeterUnit = new Group();
  ammeterUnit.position.set(0.30, 1.272, 0.20);
  scene.add(ammeterUnit);
  const ammeterBody = addBox(ammeterUnit, [0.15, 0.042, 0.14], [0, 0.021, 0], material("#1e293b", 0.35, 0.6));
  ammeterBody.userData["stationTarget"] = "repair";
  ammeterBody.userData["benchTool"] = "charger";

  const ammeterDisplayMat = material("#0d9488", 0.2, 0.1); // Dijital ekran parlama rengi
  const ammeterDisplay = addBox(ammeterUnit, [0.10, 0.003, 0.07], [0, 0.043, 0], ammeterDisplayMat);
  ammeterDisplay.userData["stationTarget"] = "repair";
  ammeterDisplay.userData["benchTool"] = "charger";

  addCylinder(ammeterUnit, 0.012, 0.008, [0.045, 0.044, -0.045], gold);
  addCylinder(ammeterUnit, 0.012, 0.008, [-0.045, 0.044, -0.045], badMat);

  // Şarj Kablosu ve Type-C Fiş Grubu (Batarya test probu)
  const cablePlugGroup = new Group();
  cablePlugGroup.position.set(0.22, 1.274, 0.36);
  cablePlugGroup.rotation.y = 0.4;
  scene.add(cablePlugGroup);
  const plugHandle = addBox(cablePlugGroup, [0.024, 0.014, 0.045], [0, 0.007, 0], material("#334155", 0.4, 0.3));
  plugHandle.userData["stationTarget"] = "repair";
  plugHandle.userData["benchTool"] = "charger";
  const plugPin = addBox(cablePlugGroup, [0.014, 0.005, 0.016], [0, 0.007, 0.028], metalColor);
  plugPin.userData["stationTarget"] = "repair";
  plugPin.userData["benchTool"] = "charger";
  const cableWire = addCylinder(cablePlugGroup, 0.004, 0.14, [0, 0.007, -0.08], black);
  cableWire.rotation.x = Math.PI / 2;

  // 2. Büyüteç (Şeffaf camlı ve altın çerçeveli - Ekranda kılcal çatlak ve kırıkları aramak için)
  const magnifierGroup = new Group();
  magnifierGroup.position.set(-0.28, 1.274, 0.22);
  magnifierGroup.rotation.y = 0.1;
  scene.add(magnifierGroup);

  const magRim = addCylinder(magnifierGroup, 0.046, 0.008, [0, 0.006, 0], gold);
  magRim.userData["stationTarget"] = "repair";
  magRim.userData["benchTool"] = "magnifier";

  // Tamamen şeffaf cam mercek (Altındaki ekranı ve çatlakları net gösterir)
  const magLensMat = new MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.02,
    metalness: 0.05,
    transmission: 0.96,
    ior: 1.52,
    depthWrite: false,
  });
  mats.push(magLensMat);
  const magLensGeo = new CylinderGeometry(0.043, 0.043, 0.003, 28);
  geometries.push(magLensGeo);
  const magLens = new Mesh(magLensGeo, magLensMat);
  magLens.position.set(0, 0.006, 0);
  magLens.userData["stationTarget"] = "repair";
  magLens.userData["benchTool"] = "magnifier";
  magnifierGroup.add(magLens);

  const magHandle = addCylinder(magnifierGroup, 0.009, 0.11, [0, 0.006, -0.08], darkWood);
  magHandle.rotation.x = Math.PI / 2;
  magHandle.userData["stationTarget"] = "repair";
  magHandle.userData["benchTool"] = "magnifier";

  // 3. Batarya Test Analizörü & Canlı LCD Ekranı (Matın sağ üst köşesinde)
  const batteryTesterGroup = new Group();
  batteryTesterGroup.position.set(0.30, 1.272, 0.06);
  scene.add(batteryTesterGroup);

  const battBody = addBox(batteryTesterGroup, [0.12, 0.035, 0.09], [0, 0.018, 0], warnMat);
  battBody.userData["stationTarget"] = "repair";
  battBody.userData["benchTool"] = "battery";

  // 3B Cihaz üzerindeki dinamik dijital LCD gösterge
  const battLcdCanvas = document.createElement("canvas");
  battLcdCanvas.width = 256;
  battLcdCanvas.height = 128;
  const battLcdCtx = battLcdCanvas.getContext("2d")!;
  const battLcdTexture = new CanvasTexture(battLcdCanvas);
  const battLcdMat = new MeshBasicMaterial({ map: battLcdTexture });
  mats.push(battLcdMat);

  const updateBatteryLcd = (
    state: "idle" | "testing" | "done",
    progress = 0,
    isHealthy = true,
    healthPct = 98,
  ): void => {
    battLcdCtx.clearRect(0, 0, 256, 128);

    if (state === "idle") {
      battLcdCtx.fillStyle = "#0c2820";
      battLcdCtx.fillRect(0, 0, 256, 128);
      battLcdCtx.fillStyle = "#10b981";
      battLcdCtx.font = "bold 19px monospace";
      battLcdCtx.textAlign = "center";
      battLcdCtx.fillText("PIL TEST CIHAZI", 128, 44);
      battLcdCtx.fillStyle = "#d7a958";
      battLcdCtx.font = "bold 15px monospace";
      battLcdCtx.fillText("Prob'u Şarja Tak", 128, 78);
      battLcdCtx.fillStyle = "#94a3b8";
      battLcdCtx.font = "12px monospace";
      battLcdCtx.fillText("5.1V / 0.0A HAZIR", 128, 106);
    } else if (state === "testing") {
      battLcdCtx.fillStyle = "#09252c";
      battLcdCtx.fillRect(0, 0, 256, 128);
      battLcdCtx.fillStyle = "#38bdf8";
      battLcdCtx.font = "bold 20px monospace";
      battLcdCtx.textAlign = "center";
      battLcdCtx.fillText(`ÖLÇÜM: %${progress}`, 128, 42);

      battLcdCtx.fillStyle = "#03151b";
      battLcdCtx.fillRect(28, 62, 200, 20);
      battLcdCtx.fillStyle = "#38bdf8";
      battLcdCtx.fillRect(28, 62, Math.round(200 * (progress / 100)), 20);

      battLcdCtx.fillStyle = "#94a3b8";
      battLcdCtx.font = "13px monospace";
      battLcdCtx.fillText("Hücre & Akım Ölçülüyor", 128, 110);
    } else {
      if (isHealthy) {
        battLcdCtx.fillStyle = "#07301c";
        battLcdCtx.fillRect(0, 0, 256, 128);
        battLcdCtx.fillStyle = "#4ade80";
        battLcdCtx.font = "bold 18px monospace";
        battLcdCtx.textAlign = "center";
        battLcdCtx.fillText("✓ ÖLÇÜM %100 TAMAM", 128, 38);
        battLcdCtx.fillStyle = "#ffffff";
        battLcdCtx.font = "900 24px monospace";
        battLcdCtx.fillText(`PİL SAĞLIĞI: %${healthPct}`, 128, 74);
        battLcdCtx.fillStyle = "#86efac";
        battLcdCtx.font = "bold 15px monospace";
        battLcdCtx.fillText("DURUM: İYİ / SAĞLAM", 128, 106);
      } else {
        battLcdCtx.fillStyle = "#3b0c0c";
        battLcdCtx.fillRect(0, 0, 256, 128);
        battLcdCtx.fillStyle = "#f87171";
        battLcdCtx.font = "bold 18px monospace";
        battLcdCtx.textAlign = "center";
        battLcdCtx.fillText("⚠ ÖLÇÜM %100 TAMAM", 128, 38);
        battLcdCtx.fillStyle = "#ffffff";
        battLcdCtx.font = "900 24px monospace";
        battLcdCtx.fillText(`PİL SAĞLIĞI: %${healthPct}`, 128, 74);
        battLcdCtx.fillStyle = "#fca5a5";
        battLcdCtx.font = "bold 15px monospace";
        battLcdCtx.fillText("DURUM: ARIZALI / ŞİŞMİŞ", 128, 106);
      }
    }
    battLcdTexture.needsUpdate = true;
    wakeRender(120);
  };
  updateBatteryLcd("idle");

  const battLcd = addBox(batteryTesterGroup, [0.09, 0.002, 0.05], [0, 0.036, 0], battLcdMat);
  battLcd.userData["stationTarget"] = "repair";
  battLcd.userData["benchTool"] = "battery";

  const probeRed = addCylinder(batteryTesterGroup, 0.005, 0.06, [0.035, 0.006, 0.065], badMat);
  probeRed.rotation.x = Math.PI / 2;
  const probeBlack = addCylinder(batteryTesterGroup, 0.005, 0.06, [-0.035, 0.006, 0.065], black);
  probeBlack.rotation.x = Math.PI / 2;

  // Masa üstü aksesuarları (Kasa POS cihazı, çalışma lambası)
  const posBase = addBox(scene, [0.38, 0.16, 0.28], [2.2, 1.34, 0.2], metalColor);
  posBase.rotation.y = -0.3;
  addBox(scene, [0.26, 0.04, 0.16], [2.2, 1.44, 0.22], teal).rotation.y = -0.3;

  const lampBase = addCylinder(scene, 0.14, 0.04, [-2.2, 1.28, 0.2], darkWood);
  lampBase.rotation.y = 0.2;
  addCylinder(scene, 0.02, 0.52, [-2.2, 1.54, 0.2], gold);
  const lampHead = addCylinder(scene, 0.16, 0.18, [-2.1, 1.78, 0.22], teal);
  lampHead.rotation.z = -0.45;

  // Sol tamir masası ve sağ vitrin bitkisi
  const benchBody = addBox(scene, [3.2, 0.72, 1.25], [-4.8, 0.38, 0.2], darkWood);
  benchBody.userData["stationTarget"] = "stock";
  const benchTop = addBox(scene, [3.35, 0.12, 1.38], [-4.8, 0.8, 0.2], wood);
  benchTop.userData["stationTarget"] = "stock";

  addCylinder(scene, 0.32, 0.12, [-5.15, 0.45, 1.5], teal);
  addCylinder(scene, 0.06, 0.85, [-5.15, 0.0, 1.5], darkWood);
  addCylinder(scene, 0.25, 0.32, [5.45, 0.16, 1.2], gold);
  const plant = new Group();
  scene.add(plant);
  addCylinder(plant, 0.2, 0.4, [5.45, 0.52, 1.2], darkWood);
  const leafGeo = new SphereGeometry(0.22, 6, 4);
  geometries.push(leafGeo);
  for (let i = 0; i < 5; i += 1) {
    const leaf = new Mesh(leafGeo, green);
    leaf.position.set(
      5.45 + Math.cos(i * 1.25) * 0.17,
      0.82 + (i % 2) * 0.13,
      1.2 + Math.sin(i * 1.25) * 0.12,
    );
    leaf.scale.set(0.55, 1.45, 0.55);
    scene.add(leaf);
  }

  // Müşteri Figürü (Gövde, bacaklar, kollar, yüz)
  const customer = new Group();
  scene.add(customer);
  const skin = material("#c8916b");
  const hair = material("#382c28");
  const jacket = material("#294947");
  const pantsMat = material("#374151");
  const shoesMat = material("#1f2937");
  const shirt = material("#e6d6b8");
  const faceDetail = material("#49352f", 0.64);
  const eyeWhite = material("#f3eee1", 0.45);

  const legLeft = addBox(customer, [0.15, 0.72, 0.16], [-0.17, 0.42, 0], pantsMat);
  const legRight = addBox(customer, [0.15, 0.72, 0.16], [0.17, 0.42, 0], pantsMat);
  addBox(customer, [0.16, 0.1, 0.24], [-0.17, 0.05, 0.04], shoesMat);
  addBox(customer, [0.16, 0.1, 0.24], [0.17, 0.05, 0.04], shoesMat);

  const torsoMesh = addSphere(customer, [0.58, 0.54, 0.36], [0, 1.15, 0], jacket);
  torsoMesh.userData["stationTarget"] = "counter";
  addSphere(customer, [0.13, 0.05, 0.04], [0, 1.48, 0.19], shirt);

  const armLeft = addCylinder(customer, 0.075, 0.58, [-0.38, 1.2, 0.05], jacket);
  armLeft.rotation.z = -0.3;
  const armRight = addCylinder(customer, 0.075, 0.58, [0.38, 1.2, 0.05], jacket);
  armRight.rotation.z = 0.3;
  addSphere(customer, [0.08, 0.05, 0.07], [-0.44, 0.92, 0.14], skin);
  addSphere(customer, [0.08, 0.05, 0.07], [0.44, 0.92, 0.14], skin);

  const neckGeo = new CylinderGeometry(0.09, 0.12, 0.3, 10);
  geometries.push(neckGeo);
  const neck = new Mesh(neckGeo, skin);
  neck.position.set(0, 1.55, 0);
  customer.add(neck);

  const headMesh = addSphere(customer, [0.24, 0.28, 0.24], [0, 1.82, 0], skin);
  headMesh.userData["stationTarget"] = "counter";
  addSphere(customer, [0.05, 0.08, 0.05], [-0.24, 1.82, 0], skin);
  addSphere(customer, [0.05, 0.08, 0.05], [0.24, 1.82, 0], skin);
  addSphere(customer, [0.26, 0.15, 0.25], [0, 2.01, 0], hair);
  addSphere(customer, [0.08, 0.17, 0.1], [-0.19, 1.9, 0], hair);
  addSphere(customer, [0.08, 0.17, 0.1], [0.19, 1.9, 0], hair);

  for (const eyeX of [-0.09, 0.09]) {
    addSphere(customer, [0.04, 0.03, 0.018], [eyeX, 1.85, 0.22], eyeWhite);
    addSphere(customer, [0.016, 0.02, 0.012], [eyeX + 0.006, 1.85, 0.235], faceDetail);
    const brow = addBox(customer, [0.08, 0.016, 0.025], [eyeX, 1.91, 0.22], hair);
    brow.rotation.z = eyeX < 0 ? -0.08 : 0.08;
  }
  addSphere(customer, [0.038, 0.06, 0.055], [0, 1.78, 0.25], skin);
  addSphere(customer, [0.055, 0.024, 0.02], [-0.04, 1.74, 0.24], faceDetail);
  addSphere(customer, [0.055, 0.024, 0.02], [0.04, 1.74, 0.24], faceDetail);
  addBox(customer, [0.08, 0.012, 0.018], [0, 1.71, 0.22], faceDetail);

  customer.position.set(0, 0, 5.2);
  customer.rotation.y = Math.PI;
  customer.visible = false;

  // =========================================================================
  // GERÇEKÇİ, KOMPAKT AKILLI TELEFON 3D MODELİ
  // Boyutlar: En ~0.19m (7.5cm), Boy ~0.38m (15cm), Kalınlık ~0.016m (8mm)
  // iPhone (Amasya Elması), Samsung (SamSam), Pixel (Gözlem Piksel) kamera modülleri
  // =========================================================================
  const phone = new Group();
  phone.position.set(0, 1.278, 0.22);
  phone.rotation.x = -0.05;
  phone.visible = false;
  scene.add(phone);

  const phoneFrameMat = material("#334155", 0.35, 0.7); // Alüminyum / Titanyum şasi
  const phoneBackMat = material("#1e293b", 0.2, 0.1);  // Parlak arka cam kapak
  const phoneScreenCanvas = document.createElement("canvas");
  phoneScreenCanvas.width = 512;
  phoneScreenCanvas.height = 1024;
  const phoneScreenTexture = new CanvasTexture(phoneScreenCanvas);
  const phoneScreenMat = material("#ffffff", 0.2, 0.05); // OLED ekran
  phoneScreenMat.map = phoneScreenTexture;
  phoneScreenMat.emissiveMap = phoneScreenTexture;
  phoneScreenMat.emissive = new Color(0xffffff);
  phoneScreenMat.emissiveIntensity = 0.95;
  const cameraBumpMat = material("#1e293b", 0.3, 0.3); // Kamera adası
  const lensGlassMat = material("#05080c", 0.08, 0.95); // Yansımalı lens camı
  const lensRimMat = material("#94a3b8", 0.25, 0.85);   // Metalik lens halkası

  // 1. Metal Yan Şasi (Alüminyum / Titanyum çerçeve)
  const phoneBody = addBox(phone, [0.19, 0.016, 0.38], [0, 0, 0], phoneFrameMat);

  // 2. Arka Cam Panel
  const phoneBack = addBox(phone, [0.184, 0.003, 0.374], [0, -0.009, 0], phoneBackMat);

  // 3. Ön OLED Ekran (İnce çerçeveli)
  const screen = addBox(phone, [0.178, 0.003, 0.368], [0, 0.009, 0], phoneScreenMat);

  // 4. Ekran Üstü Dinamik Ada / Çentik ve Ahize yarığı
  addBox(phone, [0.038, 0.002, 0.011], [0, 0.011, -0.165], black);
  addBox(phone, [0.035, 0.002, 0.003], [0, 0.011, -0.182], darkWood);

  // 5. Yan Tuşlar (Güç tuşu ve Ses aç/kapa)
  addBox(phone, [0.003, 0.005, 0.045], [0.096, 0, -0.04], phoneFrameMat);
  addBox(phone, [0.003, 0.005, 0.07], [-0.096, 0, -0.04], phoneFrameMat);

  // 6. Alt Type-C Şarj Girişi ve Hoparlör Delikleri
  addBox(phone, [0.024, 0.005, 0.003], [0, 0, 0.191], black);
  addBox(phone, [0.028, 0.003, 0.003], [-0.05, 0, 0.191], black);
  addBox(phone, [0.028, 0.003, 0.003], [0.05, 0, 0.191], black);

  // 7. Kamera Modülleri
  const createLensRing = (parent: Object3D, x: number, z: number, r: number): void => {
    const rim = addCylinder(parent, r, 0.005, [x, -0.004, z], lensRimMat);
    rim.rotation.x = Math.PI / 2;
    const lens = addCylinder(parent, r * 0.76, 0.006, [x, -0.0042, z], lensGlassMat);
    lens.rotation.x = Math.PI / 2;
  };

  // A1) Elma (Amasya iElma Pro) Üçgen Kamera Adası
  const elmaCamGroup = new Group();
  elmaCamGroup.position.set(-0.045, -0.011, -0.135);
  phone.add(elmaCamGroup);
  addBox(elmaCamGroup, [0.072, 0.005, 0.072], [0, 0, 0], cameraBumpMat);
  createLensRing(elmaCamGroup, -0.018, -0.018, 0.016);
  createLensRing(elmaCamGroup, -0.018, 0.018, 0.016);
  createLensRing(elmaCamGroup, 0.018, 0, 0.016);
  addBox(elmaCamGroup, [0.008, 0.002, 0.008], [0.018, -0.0035, -0.02], gold);
  addBox(elmaCamGroup, [0.006, 0.002, 0.006], [0.018, -0.0035, 0.02], black);

  // A2) Elma Duo (Amasya iElma Duo) Çapraz Çift Lens Modülü
  const elmaDuoCamGroup = new Group();
  elmaDuoCamGroup.position.set(-0.045, -0.011, -0.135);
  phone.add(elmaDuoCamGroup);
  addBox(elmaDuoCamGroup, [0.065, 0.005, 0.065], [0, 0, 0], cameraBumpMat);
  createLensRing(elmaDuoCamGroup, -0.015, -0.015, 0.016);
  createLensRing(elmaDuoCamGroup, 0.015, 0.015, 0.016);
  addBox(elmaDuoCamGroup, [0.006, 0.002, 0.006], [0.015, -0.0035, -0.015], gold);

  // B) SamSam Galaksi 3'lü Dikey Lensler
  const samsamCamGroup = new Group();
  samsamCamGroup.position.set(-0.058, -0.011, 0);
  phone.add(samsamCamGroup);
  createLensRing(samsamCamGroup, 0, -0.155, 0.015);
  createLensRing(samsamCamGroup, 0, -0.122, 0.015);
  createLensRing(samsamCamGroup, 0, -0.089, 0.015);
  addBox(samsamCamGroup, [0.007, 0.002, 0.007], [0.022, -0.003, -0.138], gold);

  // C) Şaomi Büyük Dairesel Modül (Ultra & Pro)
  const shaomiCamGroup = new Group();
  shaomiCamGroup.position.set(0, -0.011, -0.13);
  phone.add(shaomiCamGroup);
  const shaomiDisc = addCylinder(shaomiCamGroup, 0.048, 0.007, [0, -0.0035, 0], cameraBumpMat);
  shaomiDisc.rotation.x = Math.PI / 2;
  createLensRing(shaomiCamGroup, -0.018, -0.018, 0.015);
  createLensRing(shaomiCamGroup, 0.018, -0.018, 0.015);
  createLensRing(shaomiCamGroup, 0, 0.018, 0.015);

  // D) Redmi Dikdörtgen Şık Modül
  const redmiCamGroup = new Group();
  redmiCamGroup.position.set(-0.046, -0.011, -0.13);
  phone.add(redmiCamGroup);
  addBox(redmiCamGroup, [0.066, 0.006, 0.092], [0, 0, 0], cameraBumpMat);
  createLensRing(redmiCamGroup, 0, -0.026, 0.019);
  createLensRing(redmiCamGroup, -0.015, 0.022, 0.012);
  createLensRing(redmiCamGroup, 0.015, 0.022, 0.012);

  // E) Poco Geniş Sarı/Karbon Vizör Şeridi
  const pocoCamGroup = new Group();
  pocoCamGroup.position.set(0, -0.011, -0.13);
  phone.add(pocoCamGroup);
  addBox(pocoCamGroup, [0.188, 0.007, 0.07], [0, 0, 0], cameraBumpMat);
  addBox(pocoCamGroup, [0.07, 0.003, 0.05], [0.045, -0.004, 0], material("#eab308", 0.4, 0.2));
  createLensRing(pocoCamGroup, -0.055, -0.014, 0.014);
  createLensRing(pocoCamGroup, -0.055, 0.014, 0.014);
  createLensRing(pocoCamGroup, -0.018, 0, 0.016);

  // 8. İnce ve Gerçekçi Arıza Göstergeleri (Gerçekçi boyutlara tam uyarlanmış)
  const crack1 = addBox(phone, [0.0025, 0.003, 0.22], [0.02, 0.011, -0.02], material("#f1f5f9", 0.1, 0.9));
  crack1.rotation.y = -0.55;
  crack1.visible = false;
  const crack2 = addBox(phone, [0.0025, 0.003, 0.14], [-0.03, 0.011, 0.06], material("#e2e8f0", 0.1, 0.9));
  crack2.rotation.y = 0.65;
  crack2.visible = false;

  const batteryMarker = addBox(phone, [0.12, 0.008, 0.18], [0, -0.013, 0.03], warnMat);
  batteryMarker.visible = false;

  const bodyMarker = addBox(phone, [0.003, 0.008, 0.03], [0.096, 0, 0.06], badMat);
  bodyMarker.visible = false;

  const funcMarker = addBox(phone, [0.04, 0.004, 0.04], [-0.045, -0.016, -0.135], badMat);
  funcMarker.visible = false;

  const phoneHit = addBox(phone, [0.26, 0.06, 0.44], [0, 0, 0], material("#ffffff", 1, 0));
  (phoneHit.material as MeshStandardMaterial).transparent = true;
  (phoneHit.material as MeshStandardMaterial).opacity = 0;
  phoneHit.userData["interactivePhone"] = true;

  const events = new EventBus<GameEvents>();
  const store = new GameStore(events);
  const saveSystem = new SaveSystem(store, events);
  await saveSystem.initialize();

  const audio = new AudioSystem(store.getState().settings.audioEnabled);
  const rng = new SeededRNG(store.getState().rngState);
  const qualityManager = new QualityManager(renderer, events, store.getState().settings.quality);
  const assetLoader = new AssetLoader(renderer, events);
  const debugOverlay = new DebugOverlay(renderer);

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

  const ui = buildInterface(
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
    magnifierGroup,
    batteryTesterGroup,
    phoneScreenCanvas,
    phoneScreenTexture,
    updateBatteryLcd,
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
        if (phone.visible && !ui.isInspecting() && !ui.isUserDraggingPhone()) {
          phone.rotation.y += seconds * 0.16;
        }
      },
      render: () => {
        const now = performance.now();
        const isBusy = now < activeWakeUntil;
        const minIntervalMs = isBusy ? 32 : 160;
        if (now - previousRenderTime < minIntervalMs) {
          return;
        }
        const frameDelta = Math.max(0, (now - previousRenderTime) / 1000);
        qualityManager.recordFrame(frameDelta);
        previousRenderTime = now;

        if (ui.isInspecting()) {
          camera.up.set(0, 0, -1);
          camera.position.lerp(camTargetPos, 0.18);
          camCurrentLook.lerp(camTargetLook, 0.18);
          camera.lookAt(camCurrentLook);
        } else {
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

        renderer.render(scene, camera);
        debugOverlay.update(frameDelta);
      },
    },
    events,
  );

  const onResize = (): void => {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    wakeRender(1000);
  };
  const onPageHide = (): void => {
    window.removeEventListener("resize", onResize);
    gameLoop.destroy();
    qualityManager.destroy();
    assetLoader.destroy();
    debugOverlay.destroy();
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

interface ShopUiHandle {
  update: (state: ReturnType<GameStore["getState"]>) => void;
  updateTick: (deltaSeconds: number) => void;
  isUserDraggingPhone: () => boolean;
  isInspecting: () => boolean;
  destroy: () => void;
}

function buildInterface(
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
  magnifierGroup: Group,
  batteryTesterGroup: Group,
  phoneScreenCanvas: HTMLCanvasElement,
  phoneScreenTexture: CanvasTexture,
  updateBatteryLcd: (
    state: "idle" | "testing" | "done",
    progress?: number,
    isHealthy?: boolean,
    healthPct?: number,
  ) => void,
  camTargetPos: Vector3,
  camTargetLook: Vector3,
  resetLookOffset: () => void,
  applyLookDrag: (dx: number, dy: number) => void,
  wakeRender: (ms?: number) => void,
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
  let activeToolDragging: "none" | "charger" | "magnifier" = "none";
  let lastPhoneTapTime = 0;
  let isSpeechBubbleOpen = false;
  let typewriterTimer: number | null = null;
  let selectedStockIdx = 0;

  const chargerDockPos = new Vector3(0.22, 1.274, 0.36);
  const magnifierDockPos = new Vector3(-0.28, 1.274, 0.22);
  const chargePortPos = new Vector3(0, 1.278, 0.40);
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
  shell.innerHTML = `<header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-label="Telefon tamir logosu">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect x="7" y="3" width="14" height="25" rx="2.5"></rect>
            <path d="M11 6h6M13 24.5h2"></path>
            <path d="m18 17 7.5 7.5M25.5 13.5a4.5 4.5 0 0 1-5.8 5.8l-6.3 6.3a1.7 1.7 0 0 1-2.4-2.4l6.3-6.3a4.5 4.5 0 0 1 5.8-5.8l-2.5 2.5.4 2.1 2.1.4z"></path>
          </svg>
        </span>
        <div><b>CEP DÜKKÂNI</b><small>BİRİNCİ ŞAHIS · TEZGÂHTASIN</small></div>
      </div>
      <div class="stats">
        <div><small>KASA</small><b data-money></b></div>
        <div><small>İTİBAR</small><b data-rep></b></div>
        <div><small>GÜN · SAAT</small><b data-day></b></div>
      </div>
      <button class="icon-btn fullscreen-toggle" aria-label="Tam Ekran ve Yatay Mod" title="Tam Ekran (Yatay Mod)">⛶</button>
      <button class="icon-btn settings-open" aria-label="Ayarlar ve Gün Sonu">⚙</button>
    </header>

    <section class="customer-card">
      <div class="customer-avatar" data-customer-initials>⏳</div>
      <div class="customer-copy">
        <div class="eyebrow" data-customer-eyebrow>DÜKKÂN SAKİN · MÜŞTERİ BEKLENİYOR</div>
        <strong data-customer-name>Tezgâhta Bekliyorsun</strong>
        <span data-customer-request>Sıradaki müşteri kapıdan girmek üzere...</span>
      </div>
      <button class="quiet-btn next-customer" title="Beklemeden hemen çağır">🔔 KAPIDAN ÇAĞIR</button>
    </section>

    <div class="scene-label">
      <span class="live-dot"></span> <span data-shop-status>DÜKKÂN AÇIK</span>
      <span class="scene-tip">BİRİNCİ ŞAHIS · SÜRÜKLEYEREK ETRAFA BAK</span>
    </div>

    <nav class="station-nav" aria-label="Dükkân istasyonları"></nav>

    <section class="work-panel">
      <div class="panel-grip"></div>
      <div class="panel-title">
        <div>
          <div class="eyebrow" data-panel-kicker>TEZGÂH · BİRİNCİ ŞAHIS</div>
          <strong data-panel-title>Tezgâhta bekliyorsun</strong>
        </div>
        <button class="small-icon inspect-phone" aria-label="Cihazı yakından incele" title="Yakın Plan İncele">⌕</button>
      </div>
      <p data-panel-copy>Dükkânın tezgâhında bekliyorsun. Her 30-40 saniyede bir kapıdan yeni bir müşteri ikinci el telefonunu satmaya gelecek.</p>

      <div class="inspect-grid" data-inspect-grid hidden></div>

      <div class="action-row" data-main-actions>
        <button class="secondary-btn inspect-btn" disabled>CİHAZI İNCELE</button>
        <button class="primary-btn diagnose-btn" disabled>PAZARLIĞA GEÇ <span>→</span></button>
      </div>

      <div class="diagnostic" hidden></div>
    </section>

    <!-- ÖZEL İNCELEME EKRANI & KUŞBAKIŞI TEZGÂH (HUD) -->
    <section class="inspection-hud" hidden>
      <div class="inspect-top-card">
        <button class="secondary-btn exit-inspect-btn">← TEZGÂHA DÖN</button>
        <div style="flex:1;">
          <div class="eyebrow" data-inspect-brand>ELMA · AMASYA iELMA 14 PRO MAX</div>
          <strong data-inspect-title>Cihaz Tezgâhta · Test Aletlerini Kullan</strong>
          <span data-inspect-status>Prob'u şarj soketine tak, büyüteçle ekranı tara veya ekrana çift dokun.</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span data-dock-summary class="eyebrow" style="margin:0;font-size:11px;">0/4 KONTROL</span>
          <button class="primary-btn to-bargain-btn">PAZARLIĞA GEÇ <span>→</span></button>
        </div>
      </div>

      <div class="inspect-hints-bar">
        <span class="hint-pill" data-hint="battery"><b>⚡ Test Probunu Sürükle:</b> Bataryayı Ölç</span>
        <span class="hint-pill" data-hint="magnifier"><b>🔍 Büyüteci Gezdir:</b> Çatlak & Kırık Ara</span>
        <span class="hint-pill" data-hint="screen"><b>👆👆 Çift Dokun:</b> Ekranı Aç/Kapat</span>
        <span class="hint-pill" data-hint="camera"><b>📸 Kamera:</b> Uygulamayı Aç</span>
      </div>

      <div class="battery-live-overlay" hidden>
        <strong>⚡ BATARYA ANALİZİ YAPILIYOR...</strong>
        <span data-battery-val>%0</span>
        <div class="battery-live-bar">
          <div class="battery-live-fill"></div>
        </div>
        <small style="font: 11px monospace; color: #cbd5e1;">Şarj akımı ve pil sağlığı ölçülüyor</small>
      </div>

      <div class="camera-live-overlay good" hidden></div>
    </section>

    <aside class="toast" aria-live="polite"></aside>

    <div class="modal-backdrop" hidden>
      <section class="settings-card">
        <button class="modal-close" aria-label="Kapat">×</button>
        <div class="eyebrow">DÜKKÂN YÖNETİMİ & PERFORMANS</div>
        <h2>Gün sonu & ayarlar</h2>
        <p>Grafik kalitesini cihazına göre seçebilir veya kira/elektrik giderlerini ödeyip yeni güne geçebilirsin.</p>
        <div class="eyebrow" style="margin-top:8px;">GRAFİK KALİTESİ (MAKS 1.5x PİKSEL)</div>
        <div class="quality-row" data-quality-row>
          <button class="quality-pill" data-q="low">DÜŞÜK</button>
          <button class="quality-pill" data-q="medium">ORTA</button>
          <button class="quality-pill" data-q="high">YÜKSEK</button>
        </div>
        <div class="expense-line">
          <span>Ses Efektleri (İlk dokunuşla aktif)</span>
          <button class="quiet-btn toggle-audio-btn" style="margin:0;">AÇIK</button>
        </div>
        <div class="expense-line">
          <span>Günlük kira + elektrik gideri</span>
          <b>−₺420</b>
        </div>
        <div class="action-row">
          <button class="secondary-btn manual-save-btn">KAYDET</button>
          <button class="primary-btn close-day">GÜNÜ KAPAT <span>→</span></button>
        </div>
      </section>
    </div>

    <!-- KONUŞMA BALONU (Speech Bubble) -->
    <div class="speech-bubble-overlay" hidden>
      <div class="speech-bubble">
        <div class="bubble-header">
          <div class="bubble-customer-info">
            <span class="bubble-avatar" data-bubble-avatar>👤</span>
            <div>
              <strong data-bubble-name>Müşteri</strong>
              <span class="bubble-intent-badge sell" data-bubble-intent>🏷️ SATIŞ</span>
            </div>
          </div>
          <span class="bubble-voice-icon">🔊 8-BIT SES</span>
        </div>
        <div class="bubble-content" data-bubble-text>
          ...
        </div>
        <div class="bubble-footer">
          <span>👆 Kapatmak ve tezgâha geçmek için ekrana dokun</span>
          <button class="bubble-dismiss-btn">DEVAM ET <span>→</span></button>
        </div>
      </div>
    </div>`;

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

  const customerCardEl = select<HTMLElement>(".customer-card");
  const workPanelEl = select<HTMLElement>(".work-panel");

  // Özel İnceleme Ekranı DOM öğeleri
  const inspectionHud = select<HTMLElement>(".inspection-hud");
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

  let toastTimer = 0;

  const notify = (message: string): void => {
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("visible"), 2500);
  };

  const openSpeechBubble = (text: string): void => {
    isSpeechBubbleOpen = true;
    speechBubbleOverlay.hidden = false;
    bubbleAvatar.textContent = encounter.customer.initials;
    bubbleName.textContent = encounter.customer.name;

    const intent = encounter.customer.intent;
    bubbleIntent.className = `bubble-intent-badge ${intent}`;
    bubbleIntent.textContent =
      intent === "sell"
        ? "🏷️ TELEFON SATIŞI"
        : intent === "repair"
          ? "🔧 TAMİR TALEBİ"
          : "🛒 TELEFON ALIMI";

    bubbleText.textContent = "";
    audio.playCustomerSpeech();

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

    if (encounter.customer.intent === "buy" && stockItems.length === 0) {
      notify("Vitrinde satılık telefon olmadığı için müşteri ayrıldı.");
      window.setTimeout(() => {
        dismissCustomerAndStartWaiting();
      }, 700);
    }
  };

  speechBubbleOverlay.addEventListener("click", closeSpeechBubble);
  speechBubbleOverlay.querySelector(".bubble-dismiss-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeSpeechBubble();
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
    if (customerState === "WAITING") {
      customerInitials.textContent = "⏳";
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
        ? `${cust.name} · Bütçe: ₺${cust.buyerBudget?.toLocaleString("tr-TR")}`
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
      inspectStatusEl.textContent = `Gizli kusurları bulmak için aşağıdaki test aletlerine dokun. Müşteri Sabrı: %${cust.patience}`;
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
    const magHint = shell.querySelector<HTMLElement>("[data-hint='magnifier']");
    const screenHint = shell.querySelector<HTMLElement>("[data-hint='screen']");
    const cameraHint = shell.querySelector<HTMLElement>("[data-hint='camera']");

    // 1. Batarya test durumu
    if (ph.inspected["battery"]) {
      const battDefect = ph.defects.find((d) => d.category === "battery");
      if (batteryHint) {
        if (battDefect) {
          batteryHint.className = "hint-pill warn";
          batteryHint.innerHTML = `<b>⚠ Batarya:</b> %${ph.batteryHealth} (Arızalı/Şişmiş)`;
        } else {
          batteryHint.className = "hint-pill good";
          batteryHint.innerHTML = `<b>✓ Batarya:</b> %${ph.batteryHealth} (Sağlıklı / Orijinal)`;
        }
      }
    } else if (batteryHint) {
      batteryHint.className = "hint-pill";
      batteryHint.innerHTML = "<b>⚡ Test Probunu Sürükle:</b> Bataryayı Ölç (3 sn)";
    }

    // 2. Ekran durumu (Büyüteç ile inceleme)
    if (ph.inspected["screen"]) {
      const scrDef = ph.defects.find((d) => d.category === "screen");
      if (magHint) {
        if (scrDef) {
          magHint.className = "hint-pill warn";
          magHint.innerHTML = `<b>⚠ Ekran:</b> ${scrDef.title}`;
        } else {
          magHint.className = "hint-pill good";
          magHint.innerHTML = "<b>✓ Ekran:</b> Kılcal Çatlak Yok, Cam Temiz";
        }
      }
    } else if (magHint) {
      magHint.className = "hint-pill";
      magHint.innerHTML = "<b>🔍 Büyüteci Gezdir:</b> Ekranda Çatlak / Kırık Ara";
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
  };

  const runBatteryTest3Seconds = (): void => {
    if (batteryTestInterval !== null) {
      clearInterval(batteryTestInterval);
      batteryTestInterval = null;
    }
    audio.unlock();
    isChargerPlugged = true;
    cablePlugGroup.position.copy(chargePortPos);
    cablePlugGroup.rotation.set(0, 0, 0);
    audio.playCablePlug();
    ammeterDisplayMat.color.set("#38bdf8"); // Canlı camgöbeği elektrik akımı

    batteryLiveOverlay.hidden = false;
    batteryLiveVal.style.color = "var(--gold)";
    batteryLiveVal.textContent = "Ölçüm: %0";
    batteryLiveFill.style.width = "0%";
    notify("⚡ Batarya test probu takıldı. Ölçüm %0'dan %100'e yapılıyor (3 sn)...");
    updateBatteryLcd("testing", 0);

    const startTime = performance.now();
    const durationMs = 3000;

    batteryTestInterval = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, Math.floor((elapsed / durationMs) * 100));
      batteryLiveVal.textContent = `Ölçüm: %${progress}`;
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
        const healthPct = ph.batteryHealth ?? (isHealthy ? 96 : 64);

        updateBatteryLcd("done", 100, isHealthy, healthPct);

        if (!isHealthy) {
          audio.playDefect();
          batteryMarker.visible = true; // 3B Şişmiş batarya göstergesi
          batteryLiveVal.textContent = `⚠ ÖLÇÜM %100 TAMAMLANDI · PİL: %${healthPct} (ARIZALI / ŞİŞMİŞ)`;
          batteryLiveVal.style.color = "#f87171";
          ammeterDisplayMat.color.set("#ef4444"); // Kırmızı uyarı
          runCategoryInspection("battery");
          notify(`⚠ Batarya Testi: Pil Sağlığı %${healthPct} (${defect?.title || "Arızalı Batarya"})`);
        } else {
          audio.playClean();
          batteryLiveVal.textContent = `✓ ÖLÇÜM %100 TAMAMLANDI · PİL: %${healthPct} (İYİ / SAĞLAM)`;
          batteryLiveVal.style.color = "#4ade80";
          ammeterDisplayMat.color.set("#10b981"); // Yeşil temiz akım
          runCategoryInspection("battery");
          notify(`✓ Batarya Testi: Ölçüm %100 Tamamlandı. Pil Sağlığı %${healthPct} (İyi / Orijinal).`);
        }
        updateInspectionHud();
        window.setTimeout(() => {
          batteryLiveOverlay.hidden = true;
        }, 4500);
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
      if (catId === "screen") {
        phoneScreenMat.color.set("#162322");
      }
      const discount = roundTo50(defect.valueLoss * cust.personality.defectConcession);
      cust.minAcceptPrice = Math.max(400, cust.minAcceptPrice - discount);
      cust.currentAskPrice = Math.max(
        cust.minAcceptPrice,
        cust.currentAskPrice - roundTo50(discount * 0.85),
      );
      cust.lastResponse = `${catInfo.title} arızasını (${defect.title}) kabul ediyorum; fiyatı ₺${cust.currentAskPrice.toLocaleString("tr-TR")} yaptım.`;
      titleEl.textContent = `${catInfo.title}: Gizli arıza tespit edildi!`;
      copyEl.textContent = `${defect.title} (−₺${defect.valueLoss.toLocaleString("tr-TR")}). Müşteri fiyatı ₺${cust.currentAskPrice.toLocaleString("tr-TR")} seviyesine çekti.`;
      notify(`⚠ ${catInfo.title}: ${defect.title} bulundu!`);
    } else {
      audio.playClean();
      cust.lastResponse = `Gördüğün gibi ${catInfo.title.toLowerCase()} tarafı saat gibi çalışıyor.`;
      titleEl.textContent = `${catInfo.title} kontrolü temiz çıktı`;
      copyEl.textContent = `${ph.model} · ${catInfo.title} testinde kusur görülmedi.`;
      notify(`✓ ${catInfo.title} sorunsuz.`);
    }

    currentOffer = roundTo50(getKnownPhoneValue(ph) * 0.85);

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
      const buyerBudget = cust.buyerBudget ?? 10000;

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
          <span>ARANAN: ${cust.buyerTargetBrand ?? "Herhangi"} · MÜŞTERİ BÜTÇESİ: ₺${buyerBudget.toLocaleString("tr-TR")}</span>
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
          <button class="step-btn" data-match="budget">BÜTÇE</button>
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
          currentOffer = Math.min(buyerBudget, Math.max(sItem.boughtPrice + 300, sItem.actualValue));
          renderDiagnosticArea();
        });
      });

      diagnosticEl.querySelector("[data-match='budget']")?.addEventListener("click", () => {
        audio.unlock();
        audio.playTap();
        currentOffer = buyerBudget;
        renderDiagnosticArea();
      });
    } else {
      const knownVal = getKnownPhoneValue(ph);
      const battDef = ph.defects.find((d) => d.category === "battery");
      const scrDef = ph.defects.find((d) => d.category === "screen");
      const camDef = ph.defects.find((d) => d.category === "camera");

      const battBadge = ph.inspected["battery"]
        ? battDef
          ? `<b class="bad">⚠ Pil: %${ph.batteryHealth} (−₺${battDef.valueLoss.toLocaleString("tr-TR")})</b>`
          : `<b class="good">✓ Pil: %${ph.batteryHealth} (İyi)</b>`
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
      handleOfferSubmission();
    });
  };

  const handleOfferSubmission = (): void => {
    const { phone: ph, customer: cust } = encounter;

    if (cust.intent === "repair") {
      const partCost = cust.repairPartCost || 350;
      if (store.getState().money < partCost) {
        audio.playFail();
        notify("Yedek parça temin etmek için kasada yeterli nakit yok!");
        return;
      }

      cust.bargainRound += 1;
      timeMinutes = Math.min(19 * 60, timeMinutes + 10);

      if (currentOffer <= cust.minAcceptPrice) {
        audio.playCash();
        const netProfit = currentOffer - partCost;
        store.addMoney(netProfit);
        store.addReputation(3);

        lastTransactionSummary = {
          intent: "repair",
          phoneModel: `${ph.brand} ${ph.model}`,
          boughtPrice: currentOffer,
          actualValue: currentOffer,
          netProfit,
          repDelta: 3,
          foundDefects: [],
          missedDefects: [],
          stockUid: ph.uid,
          sold: true,
          repairTitle: cust.repairTargetDefect?.title || "Donanım Onarımı",
          repairPartCost: partCost,
        };

        dealFinished = true;
        customersServedToday += 1;
        titleEl.textContent = "Tamir tamamlandı · Müşteri memnun";
        copyEl.textContent = `${cust.repairTargetDefect?.title || "Arıza"} başarıyla onarıldı. ₺${currentOffer.toLocaleString("tr-TR")} tahsil edildi. Net kâr: +₺${netProfit.toLocaleString("tr-TR")}.`;

        sync3DSceneToEncounter();
        updateCustomerHeader();
        updateHUD(store.getState());
        renderInspectionGrid();
        renderDiagnosticArea();
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
      const buyerBudget = cust.buyerBudget ?? cust.minAcceptPrice;

      cust.bargainRound += 1;
      timeMinutes = Math.min(19 * 60, timeMinutes + 10);

      if (currentOffer <= buyerBudget) {
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
        cust.lastResponse = `Bütçem en fazla ₺${buyerBudget.toLocaleString("tr-TR")} usta, ₺${currentOffer.toLocaleString("tr-TR")} beni aşıyor.`;
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
      cust.lastResponse = `₺${currentOffer.toLocaleString("tr-TR")} bütçemi aşıyor usta! En fazla ₺${buyerBudget.toLocaleString("tr-TR")} verebilirim (${rem} teklif hakkın kaldı).`;
      titleEl.textContent = `Müşteri bütçesi: ₺${buyerBudget.toLocaleString("tr-TR")}`;
      copyEl.textContent = cust.lastResponse;
      notify(`Müşteri indirim istiyor (Bütçe: ₺${buyerBudget.toLocaleString("tr-TR")})`);
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
        .map((d) => ({ title: d.title, valueLoss: d.valueLoss }));
      const missedDefects = ph.defects
        .filter((d) => !d.found)
        .map((d) => ({ title: d.title, valueLoss: d.valueLoss }));

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
        body: "Tezgâhtaki aletleri kullan: Çift dokunarak aç, batarya probunu şarj girişine sürükle (3sn sayaç), büyüteçle çizik ara, kamera uygulamasından zemini test et.",
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
      if (isChargerPlugged) {
        isChargerPlugged = false;
        cablePlugGroup.position.copy(chargerDockPos);
        cablePlugGroup.rotation.set(0, 0.4, 0);
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
          : (encounter.customer.buyerBudget ?? 10000);
    dealFinished = false;
    lastTransactionSummary = null;
    phonePlacedSoundPlayed = false;
    isScreenPoweredOn = false;
    isChargerPlugged = false;
    inCameraApp = false;
    cablePlugGroup.position.copy(chargerDockPos);
    cablePlugGroup.rotation.set(0, 0.4, 0);
    magnifierGroup.position.copy(magnifierDockPos);
    magnifierGroup.rotation.set(0, 0.1, 0);
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
    lastTransactionSummary = null;
    cablePlugGroup.position.copy(chargerDockPos);
    cablePlugGroup.rotation.set(0, 0.4, 0);
    magnifierGroup.position.copy(magnifierDockPos);
    magnifierGroup.rotation.set(0, 0.1, 0);
    isChargerPlugged = false;
    isScreenPoweredOn = false;
    inCameraApp = false;
    updateBatteryLcd("idle");

    setStation("counter");
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
      const magHits = raycaster.intersectObject(magnifierGroup, true);
      if (magHits.length > 0) {
        activeToolDragging = "magnifier";
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
    if (!isPointerDown) return;
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
            wakeRender(400);
          } else if (activeToolDragging === "magnifier") {
            magnifierGroup.position.x = Math.max(-0.35, Math.min(0.35, intersect.x));
            magnifierGroup.position.y = 1.30;
            magnifierGroup.position.z = Math.max(-0.05, Math.min(0.50, intersect.z));
            if (
              Math.abs(magnifierGroup.position.x) < 0.12 &&
              Math.abs(magnifierGroup.position.z - 0.22) < 0.20
            ) {
              const scrDef = encounter.phone.defects.find((d) => d.category === "screen");
              if (scrDef && !scrDef.found) {
                scrDef.found = true;
                runCategoryInspection("screen");
                audio.playScan();
                notify(`🔍 Büyüteç ile ekranda tespit edildi: ${scrDef.title}`);
                updateInspectionHud();
              } else if (!encounter.phone.inspected["screen"]) {
                runCategoryInspection("screen");
                audio.playClean();
                notify("🔍 Büyüteç ile incelendi: Ekran camı temiz, çatlak yok.");
                updateInspectionHud();
              }
            }
            wakeRender(400);
          }
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
    if (!isPointerDown) return;
    isPointerDown = false;

    if (isInspecting) {
      if (activeToolDragging !== "none") {
        if (activeToolDragging === "charger") {
          const dist = cablePlugGroup.position.distanceTo(chargePortPos);
          if (dist < 0.15) {
            cablePlugGroup.position.copy(chargePortPos);
            cablePlugGroup.rotation.set(0, 0, 0);
            isChargerPlugged = true;
            audio.playCablePlug();
            runBatteryTest3Seconds();
          } else {
            cablePlugGroup.position.copy(chargerDockPos);
            cablePlugGroup.rotation.set(0, 0.4, 0);
            isChargerPlugged = false;
          }
        } else if (activeToolDragging === "magnifier") {
          if (magnifierGroup.position.distanceTo(magnifierDockPos) < 0.14) {
            magnifierGroup.position.copy(magnifierDockPos);
            magnifierGroup.rotation.set(0, 0.1, 0);
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

        const ammeterHits = raycaster.intersectObject(ammeterUnit, true);
        const plugHits = raycaster.intersectObject(cablePlugGroup, true);
        const battHits = raycaster.intersectObject(batteryTesterGroup, true);
        if (ammeterHits.length > 0 || plugHits.length > 0 || battHits.length > 0) {
          runBatteryTest3Seconds();
          return;
        }
        const magHits = raycaster.intersectObject(magnifierGroup, true);
        if (magHits.length > 0) {
          audio.playTap();
          notify("🔍 Büyüteci basılı tutup telefonun üzerinde gezdirerek çatlakları ara.");
          return;
        }
      }
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
            openSpeechBubble(encounter.customer.speechText);
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
          openSpeechBubble(encounter.customer.speechText);
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
    },
  };
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
