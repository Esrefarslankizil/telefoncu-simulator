import { CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene, SphereGeometry, TubeGeometry, Vector3 } from "three";
import type { Material, Object3D } from "three";
import { getBatteryRating } from "../data/PhoneCatalog";
import type { BatteryRating } from "../data/PhoneCatalog";
import { mats, geometries, unitBoxGeo, unitCylGeo, unitSphereGeo } from "./resources";
import { createWorkbenchMatTexture } from "./textures/workbenchMat";

/** DÃ¼kkÃ¢n, mÃ¼ÅŸteri, telefon, batarya test cihazÄ± ve kablonun tÃ¼m 3B nesnelerini kurar; etkileÅŸim katmanÄ±nÄ±n ihtiyaÃ§ duyduÄŸu tutamaÃ§larÄ± dÃ¶ndÃ¼rÃ¼r. */
export function buildShopScene(scene: Scene, wakeRender: (ms?: number) => void) {
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
  // Batarya test cihazı ve servis ekipmanları
  // =========================================================================
  const ammeterUnit = new Group();
  ammeterUnit.visible = false;
  scene.add(ammeterUnit);
  const ammeterDisplayMat = material("#0d9488", 0.2, 0.1);

  // 1. Batarya Test Cihazı & Canlı LCD Ekranı (Telefonun sağında z=0.22 ekseninde 180° tam yatay hat)
  const batteryTesterGroup = new Group();
  batteryTesterGroup.position.set(0.32, 1.272, 0.22);
  scene.add(batteryTesterGroup);

  const battBody = addBox(batteryTesterGroup, [0.12, 0.038, 0.10], [0, 0.019, 0], material("#1e293b", 0.35, 0.5));
  battBody.userData["stationTarget"] = "repair";
  battBody.userData["benchTool"] = "battery";

  const bumperL = addBox(batteryTesterGroup, [0.01, 0.040, 0.102], [-0.06, 0.019, 0], teal);
  bumperL.userData["stationTarget"] = "repair";
  bumperL.userData["benchTool"] = "battery";
  const bumperR = addBox(batteryTesterGroup, [0.01, 0.040, 0.102], [0.06, 0.019, 0], teal);
  bumperR.userData["stationTarget"] = "repair";
  bumperR.userData["benchTool"] = "battery";

  // Kablo çıkış soketi / burcu (telefona bakan sol yüzde, x=-0.064, y=0.019, z=0)
  const socketCollar = addCylinder(batteryTesterGroup, 0.007, 0.012, [-0.064, 0.019, 0], material("#0f172a", 0.3, 0.2));
  socketCollar.rotation.z = Math.PI / 2;
  socketCollar.userData["stationTarget"] = "repair";
  socketCollar.userData["benchTool"] = "battery";

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
      battLcdCtx.fillStyle = "#081c17";
      battLcdCtx.fillRect(0, 0, 256, 128);
      battLcdCtx.fillStyle = "#10b981";
      battLcdCtx.font = "bold 19px monospace";
      battLcdCtx.textAlign = "center";
      battLcdCtx.fillText("BATARYA TEST CİHAZI", 128, 42);
      battLcdCtx.fillStyle = "#facc15";
      battLcdCtx.font = "bold 15px monospace";
      battLcdCtx.fillText("Kabloyu Telefona Tak", 128, 76);
      battLcdCtx.fillStyle = "#94a3b8";
      battLcdCtx.font = "12px monospace";
      battLcdCtx.fillText("5.1V / 0.0A HAZIR", 128, 106);
    } else if (state === "testing") {
      battLcdCtx.fillStyle = "#08202d";
      battLcdCtx.fillRect(0, 0, 256, 128);
      battLcdCtx.fillStyle = "#38bdf8";
      battLcdCtx.font = "bold 19px monospace";
      battLcdCtx.textAlign = "center";
      battLcdCtx.fillText(`ÖLÇÜM: %${progress}`, 128, 38);

      battLcdCtx.fillStyle = "#03151b";
      battLcdCtx.fillRect(28, 56, 200, 20);
      battLcdCtx.fillStyle = "#38bdf8";
      battLcdCtx.fillRect(28, 56, Math.round(200 * (progress / 100)), 20);

      battLcdCtx.fillStyle = "#cbd5e1";
      battLcdCtx.font = "13px monospace";
      battLcdCtx.fillText("Hücre & Akım Analizi...", 128, 104);
    } else {
      const rating: BatteryRating = getBatteryRating(healthPct, !isHealthy);
      let bg = "#07301c";
      let headerColor = "#4ade80";
      let ratingColor = "#86efac";

      if (rating === "ÇOK KÖTÜ") {
        bg = "#3b0c0c";
        headerColor = "#f87171";
        ratingColor = "#fca5a5";
      } else if (rating === "KÖTÜ") {
        bg = "#3a1908";
        headerColor = "#fb923c";
        ratingColor = "#fed7aa";
      } else if (rating === "ORTA") {
        bg = "#332a08";
        headerColor = "#facc15";
        ratingColor = "#fef08a";
      } else if (rating === "İYİ") {
        bg = "#07301c";
        headerColor = "#4ade80";
        ratingColor = "#86efac";
      } else if (rating === "ÇOK İYİ") {
        bg = "#08332a";
        headerColor = "#22d3ee";
        ratingColor = "#67e8f9";
      }

      battLcdCtx.fillStyle = bg;
      battLcdCtx.fillRect(0, 0, 256, 128);
      battLcdCtx.fillStyle = headerColor;
      battLcdCtx.font = "bold 17px monospace";
      battLcdCtx.textAlign = "center";
      const icon = rating === "ÇOK KÖTÜ" || rating === "KÖTÜ" ? "⚠" : "✓";
      battLcdCtx.fillText(`${icon} ANALİZ TAMAMLANDI`, 128, 36);
      battLcdCtx.fillStyle = "#ffffff";
      battLcdCtx.font = "900 24px monospace";
      battLcdCtx.fillText(`PİL: %${healthPct}`, 128, 72);
      battLcdCtx.fillStyle = ratingColor;
      battLcdCtx.font = "bold 15px monospace";
      battLcdCtx.fillText(`DURUM: ${rating}`, 128, 106);
    }
    battLcdTexture.needsUpdate = true;
    wakeRender(120);
  };
  updateBatteryLcd("idle");

  const battLcd = addBox(batteryTesterGroup, [0.095, 0.003, 0.060], [0, 0.039, 0], battLcdMat);
  battLcd.userData["stationTarget"] = "repair";
  battLcd.userData["benchTool"] = "battery";

  // Şarj Kablosu ve Type-C Fiş Grubu (Batarya test probu)
  const cablePlugGroup = new Group();
  cablePlugGroup.position.set(0.23, 1.274, 0.22);
  cablePlugGroup.rotation.set(0, 0, 0);
  scene.add(cablePlugGroup);

  const plugHandle = addBox(cablePlugGroup, [0.032, 0.012, 0.022], [0, 0.006, 0], material("#334155", 0.4, 0.3));
  plugHandle.userData["stationTarget"] = "repair";
  plugHandle.userData["benchTool"] = "charger";

  const plugPin = addBox(cablePlugGroup, [0.015, 0.005, 0.014], [-0.023, 0.006, 0], metalColor);
  plugPin.userData["stationTarget"] = "repair";
  plugPin.userData["benchTool"] = "charger";

  const plugBoot = addCylinder(cablePlugGroup, 0.005, 0.010, [0.021, 0.006, 0], material("#0f172a", 0.3, 0.2));
  plugBoot.rotation.z = Math.PI / 2;
  plugBoot.userData["stationTarget"] = "repair";
  plugBoot.userData["benchTool"] = "charger";

  // Batarya test cihazından fişe uzanan 3B Dinamik Kablo
  const cableMat = material("#0f172a", 0.45, 0.15);
  mats.push(cableMat);

  const buildCableCurve = (pStart: Vector3, pEnd: Vector3, isPlugged: boolean): CatmullRomCurve3 => {
    if (isPlugged) {
      const pMid = new Vector3((pStart.x + pEnd.x) * 0.5, 1.280, pStart.z);
      return new CatmullRomCurve3([pStart, pMid, pEnd]);
    }
    const midX = (pStart.x + pEnd.x) * 0.5;
    const dist = Math.hypot(pStart.x - pEnd.x, pStart.z - pEnd.z);
    const midZ = (pStart.z + pEnd.z) * 0.5 + Math.min(0.045, Math.max(0.01, dist * 0.28));
    const midY = 1.276;
    return new CatmullRomCurve3([pStart, new Vector3(midX, midY, midZ), pEnd]);
  };

  const initialPStart = new Vector3(0.32 - 0.064, 1.280, 0.22);
  const initialPEnd = new Vector3(0.23 + 0.021, 1.280, 0.22);
  let cableGeo = new TubeGeometry(buildCableCurve(initialPStart, initialPEnd, false), 16, 0.0035, 6, false);
  geometries.push(cableGeo);
  const cableMesh = new Mesh(cableGeo, cableMat);
  scene.add(cableMesh);

  const updateCableMesh = (isPlugged: boolean): void => {
    const pStart = new Vector3(batteryTesterGroup.position.x - 0.064, 1.280, batteryTesterGroup.position.z);
    const pEnd = new Vector3(cablePlugGroup.position.x + 0.021, 1.280, cablePlugGroup.position.z);
    cableGeo.dispose();
    cableGeo = new TubeGeometry(buildCableCurve(pStart, pEnd, isPlugged), 16, 0.0035, 6, false);
    cableMesh.geometry = cableGeo;
  };

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

  // 5. Yan Tuşlar (Ses tuşları sol yanda, Güç tuşu sağ yanda üst kısımda)
  addBox(phone, [0.003, 0.005, 0.035], [0.096, 0, -0.08], phoneFrameMat);
  addBox(phone, [0.003, 0.005, 0.07], [-0.096, 0, -0.04], phoneFrameMat);

  // 6. Sağ Yan Type-C Şarj Girişi (Batarya test cihazıyla 180° tam hizalı hat)
  addBox(phone, [0.004, 0.007, 0.026], [0.096, 0, 0], black);
  addBox(phone, [0.002, 0.009, 0.030], [0.0955, 0, 0], metalColor);

  // Alt Hoparlör & Mikrofon Izgaraları
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

  return {
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
  };
}
