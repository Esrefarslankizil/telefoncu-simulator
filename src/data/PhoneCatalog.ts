import type { SeededRNG } from "../core/SeededRNG";

export type InspectionCategoryId = "battery" | "screen" | "camera";
export type PersonalityId = "stingy" | "hurried" | "savvy" | "flexible";
export type CameraStyleType = "elma" | "elma_duo" | "samsam" | "shaomi" | "redmi" | "poco";
export type CustomerIntent = "sell" | "repair" | "buy";

export interface InspectionCategoryInfo {
  readonly id: InspectionCategoryId;
  readonly title: string;
  readonly shortDesc: string;
  readonly timeMinutes: number;
  readonly patienceCost: number;
}

export interface DefectTemplate {
  readonly id: string;
  readonly category: InspectionCategoryId;
  readonly title: string;
  readonly lossRatio: number;
}

export interface PhoneDefect extends DefectTemplate {
  readonly valueLoss: number;
  found: boolean;
}

export interface PhoneModelTemplate {
  readonly brand: string;
  readonly model: string;
  readonly storage: string;
  readonly basePrice: number;
  readonly bodyColor: string;
  readonly frameColor: string;
  readonly screenTint: string;
  readonly cameraStyle: CameraStyleType;
  readonly cameraColor: string;
}

export interface CustomerPersonality {
  readonly id: PersonalityId;
  readonly label: string;
  readonly askingMultiplier: number;
  readonly minAcceptMultiplier: number;
  readonly patienceDecay: number;
  readonly defectConcession: number;
  readonly jacketColor: string;
  readonly apronColor: string;
}

export type BatteryRating = "ÇOK KÖTÜ" | "KÖTÜ" | "ORTA" | "İYİ" | "ÇOK İYİ";

export function getBatteryRating(healthPct: number, hasDefect = false): BatteryRating {
  if (hasDefect || healthPct < 60) return "ÇOK KÖTÜ";
  if (healthPct < 75) return "KÖTÜ";
  if (healthPct < 85) return "ORTA";
  if (healthPct < 95) return "İYİ";
  return "ÇOK İYİ";
}

export interface GeneratedPhone {
  readonly uid: string;
  readonly brand: string;
  readonly model: string;
  readonly storage: string;
  readonly ageYears: number;
  readonly baseValue: number;
  readonly actualValue: number;
  readonly batteryHealth: number;
  readonly bodyColor: string;
  readonly frameColor: string;
  readonly screenTint: string;
  readonly cameraStyle: CameraStyleType;
  readonly cameraColor: string;
  readonly defects: PhoneDefect[];
  readonly inspected: Record<InspectionCategoryId, boolean>;
}

export interface GeneratedCustomer {
  readonly name: string;
  readonly initials: string;
  readonly personality: CustomerPersonality;
  readonly intent: CustomerIntent;
  readonly speechText: string;
  readonly initialAskPrice: number;
  currentAskPrice: number;
  minAcceptPrice: number;
  patience: number;
  bargainRound: number;
  readonly maxBargainRounds: number;
  lastResponse: string;
  repairTargetDefect?: PhoneDefect | undefined;
  repairPartCost?: number | undefined;
  buyerTargetBrand?: string | undefined;
  buyerBudget?: number | undefined;
}

export interface StockPhoneItem {
  readonly uid: string;
  readonly brand: string;
  readonly model: string;
  readonly ageYears: number;
  readonly boughtPrice: number;
  readonly baseValue: number;
  readonly actualValue: number;
  readonly foundDefects: ReadonlyArray<{ title: string; valueLoss: number }>;
  readonly missedDefects: ReadonlyArray<{ title: string; valueLoss: number }>;
  readonly dayBought: number;
}

export const INSPECTION_CATEGORIES: ReadonlyArray<InspectionCategoryInfo> = [
  {
    id: "battery",
    title: "BATARYA & PİL",
    shortDesc: "Pil sağlığı ve voltaj kontrolü · 15dk",
    timeMinutes: 15,
    patienceCost: 8,
  },
  {
    id: "screen",
    title: "EKRAN & CAM",
    shortDesc: "Kılcal çatlak ve kırık cam kontrolü · 15dk",
    timeMinutes: 15,
    patienceCost: 8,
  },
  {
    id: "camera",
    title: "KAMERA SENSÖRÜ",
    shortDesc: "Fotoğraf vizörü ve sensör testi · 15dk",
    timeMinutes: 15,
    patienceCost: 8,
  },
];

// Gerçek modellere gönderme yapan ama telifsiz & akılda kalıcı Türkiye parodi modelleri
export const PHONE_MODELS: ReadonlyArray<PhoneModelTemplate> = [
  // 1. Apple / Amasya Elması (iPhone & Duo Parodisi)
  {
    brand: "Elma",
    model: "Amasya iElma 15 Pro Max",
    storage: "256 GB",
    basePrice: 35000,
    bodyColor: "#32273d", // Derin Mor
    frameColor: "#4d3d5e",
    screenTint: "#0b0e14",
    cameraStyle: "elma",
    cameraColor: "#22192b",
  },
  {
    brand: "Elma",
    model: "Amasya iElma 14 Pro",
    storage: "128 GB",
    basePrice: 28500,
    bodyColor: "#23262b", // Uzay Siyahı
    frameColor: "#3e434d",
    screenTint: "#0b0e14",
    cameraStyle: "elma",
    cameraColor: "#171a1f",
  },
  {
    brand: "Elma",
    model: "Amasya iElma 13 Pro",
    storage: "128 GB",
    basePrice: 24200,
    bodyColor: "#1e3a5f", // Dağ Mavisi
    frameColor: "#2c4a63",
    screenTint: "#0b0e14",
    cameraStyle: "elma",
    cameraColor: "#101d29",
  },
  {
    brand: "Elma",
    model: "Amasya iElma Duo",
    storage: "128 GB",
    basePrice: 20500,
    bodyColor: "#1e293b", // Geceyarısı Çift Lens
    frameColor: "#334155",
    screenTint: "#0b0e14",
    cameraStyle: "elma_duo",
    cameraColor: "#0f172a",
  },
  {
    brand: "Elma",
    model: "Amasya iElma 11 Mini",
    storage: "64 GB",
    basePrice: 11500,
    bodyColor: "#dcfce7", // Nane Yeşili
    frameColor: "#bbf7d0",
    screenTint: "#0b0e14",
    cameraStyle: "elma_duo",
    cameraColor: "#86efac",
  },

  // 2. SamSam (Samsung Galaxy Parodisi)
  {
    brand: "SamSam",
    model: "SamSam Galaksi S23 Ultra",
    storage: "256 GB",
    basePrice: 32000,
    bodyColor: "#14171a", // Hayalet Siyah
    frameColor: "#252b33",
    screenTint: "#0b0e14",
    cameraStyle: "samsam",
    cameraColor: "#101214",
  },
  {
    brand: "SamSam",
    model: "SamSam Galaksi Katla 5",
    storage: "256 GB",
    basePrice: 39000,
    bodyColor: "#202329", // Titanyum
    frameColor: "#383d47",
    screenTint: "#0b0e14",
    cameraStyle: "samsam",
    cameraColor: "#15171c",
  },
  {
    brand: "SamSam",
    model: "SamSam Galaksi S22",
    storage: "128 GB",
    basePrice: 17500,
    bodyColor: "#1c3830", // Nil Yeşili
    frameColor: "#2b574a",
    screenTint: "#0b0e14",
    cameraStyle: "samsam",
    cameraColor: "#142621",
  },
  {
    brand: "SamSam",
    model: "SamSam Galaksi A54 5G",
    storage: "128 GB",
    basePrice: 11200,
    bodyColor: "#332c3d", // Lavanta
    frameColor: "#4a3f59",
    screenTint: "#0b0e14",
    cameraStyle: "samsam",
    cameraColor: "#241f2b",
  },

  // 3. Şaomi (Xiaomi Parodisi)
  {
    brand: "Şaomi",
    model: "Şaomi 13 Ultra",
    storage: "256 GB",
    basePrice: 23500,
    bodyColor: "#18181b", // Deri Dokulu Siyah
    frameColor: "#27272a",
    screenTint: "#0b0e14",
    cameraStyle: "shaomi",
    cameraColor: "#09090b",
  },
  {
    brand: "Şaomi",
    model: "Şaomi 12 Pro",
    storage: "256 GB",
    basePrice: 18200,
    bodyColor: "#2e3440", // Metalik Gri
    frameColor: "#3b4252",
    screenTint: "#0b0e14",
    cameraStyle: "shaomi",
    cameraColor: "#242933",
  },
  {
    brand: "Şaomi",
    model: "Şaomi Mi 11 Lite",
    storage: "128 GB",
    basePrice: 8900,
    bodyColor: "#38bdf8", // Gökyüzü Mavisi
    frameColor: "#0284c7",
    screenTint: "#0b0e14",
    cameraStyle: "shaomi",
    cameraColor: "#0369a1",
  },

  // 4. Redmi Parodisi
  {
    brand: "Redmi",
    model: "Redmi Not 13 Pro+",
    storage: "256 GB",
    basePrice: 14500,
    bodyColor: "#f8fafc", // İnci Beyazı
    frameColor: "#e2e8f0",
    screenTint: "#0b0e14",
    cameraStyle: "redmi",
    cameraColor: "#0f172a",
  },
  {
    brand: "Redmi",
    model: "Redmi Not 12 Pro",
    storage: "128 GB",
    basePrice: 10200,
    bodyColor: "#1e293b", // Grafit
    frameColor: "#334155",
    screenTint: "#0b0e14",
    cameraStyle: "redmi",
    cameraColor: "#0f172a",
  },
  {
    brand: "Redmi",
    model: "Redmi 12C",
    storage: "64 GB",
    basePrice: 5900,
    bodyColor: "#3b82f6", // Okyanus Mavisi
    frameColor: "#1d4ed8",
    screenTint: "#0b0e14",
    cameraStyle: "redmi",
    cameraColor: "#1e3a8a",
  },

  // 5. Poco Parodisi
  {
    brand: "Poco",
    model: "Poco F5 Pro",
    storage: "256 GB",
    basePrice: 19800,
    bodyColor: "#18181b", // Karbon Siyah
    frameColor: "#eab308", // Poco Sarısı Şasi
    screenTint: "#0b0e14",
    cameraStyle: "poco",
    cameraColor: "#09090b",
  },
  {
    brand: "Poco",
    model: "Poco X5 Pro",
    storage: "128 GB",
    basePrice: 12800,
    bodyColor: "#eab308", // Canlı Poco Sarısı
    frameColor: "#ca8a04",
    screenTint: "#0b0e14",
    cameraStyle: "poco",
    cameraColor: "#000000",
  },
  {
    brand: "Poco",
    model: "Poco M5s",
    storage: "128 GB",
    basePrice: 7600,
    bodyColor: "#0284c7", // Gece Mavisi
    frameColor: "#0369a1",
    screenTint: "#0b0e14",
    cameraStyle: "poco",
    cameraColor: "#0c4a6e",
  },
];

export const DEFECT_POOL: Readonly<Record<InspectionCategoryId, ReadonlyArray<DefectTemplate>>> = {
  battery: [
    { id: "bat_cap", category: "battery", title: "Düşük pil sağlığı (%64 - Servis uyarısı)", lossRatio: 0.18 },
    { id: "bat_swell", category: "battery", title: "Batarya şişmiş & hücre arızası", lossRatio: 0.25 },
    { id: "bat_drop", category: "battery", title: "Pil sağlığı %58 (Ani voltaj düşmesi)", lossRatio: 0.28 },
  ],
  screen: [
    { id: "scr_crack", category: "screen", title: "Ön camda kılcal çatlak", lossRatio: 0.18 },
    { id: "scr_broken", category: "screen", title: "Kırık / çatlamış ön cam paneli", lossRatio: 0.30 },
    { id: "scr_touch", category: "screen", title: "Dokunmatik ve piksel paneli arızası", lossRatio: 0.22 },
  ],
  camera: [
    { id: "cam_lens", category: "camera", title: "Kamera lensinde çatlak & leke", lossRatio: 0.18 },
    { id: "cam_sensor", category: "camera", title: "Ana kamera sensör arızası (Görüntü yok)", lossRatio: 0.24 },
  ],
};

export const PERSONALITIES: ReadonlyArray<CustomerPersonality> = [
  {
    id: "stingy",
    label: "CİMRİ",
    askingMultiplier: 1.18,
    minAcceptMultiplier: 0.95,
    patienceDecay: 1.15,
    defectConcession: 0.85,
    jacketColor: "#3b2824",
    apronColor: "#8a4b38",
  },
  {
    id: "hurried",
    label: "ACELESİ OLAN",
    askingMultiplier: 1.04,
    minAcceptMultiplier: 0.78,
    patienceDecay: 1.65,
    defectConcession: 1.0,
    jacketColor: "#294947",
    apronColor: "#b57c3e",
  },
  {
    id: "savvy",
    label: "BİLGİLİ",
    askingMultiplier: 1.12,
    minAcceptMultiplier: 0.89,
    patienceDecay: 1.0,
    defectConcession: 1.15,
    jacketColor: "#25384a",
    apronColor: "#755a3c",
  },
  {
    id: "flexible",
    label: "UYUMLU",
    askingMultiplier: 1.09,
    minAcceptMultiplier: 0.83,
    patienceDecay: 0.85,
    defectConcession: 1.0,
    jacketColor: "#2e473b",
    apronColor: "#9a5b3f",
  },
];

const CUSTOMER_NAMES = [
  "Mert Yılmaz",
  "Selin Kaya",
  "Can Demir",
  "Zeynep Arslan",
  "Burak Şahin",
  "Elif Çelik",
  "Kaan Aydın",
  "Derya Koç",
  "Emre Yıldız",
  "Gökçe Özkan",
  "Tolga Doğan",
  "Büşra Aksoy",
];

export function roundTo50(value: number): number {
  return Math.max(300, Math.round(value / 50) * 50);
}

/** İtibara göre günlük müşteri sayısını hesaplar (2 - 6 arası). */
export function getDailyCustomerQuota(reputation: number): number {
  if (reputation < 25) return 2;
  if (reputation < 45) return 3;
  if (reputation < 70) return 4;
  if (reputation < 88) return 5;
  return 6;
}

/** Rastgele kurgusal telefon ve müşteri karşılaşması üretir (Satma, Tamir, Alma niyetleri). */
export function generateCustomerEncounter(
  rng: SeededRNG,
  reputation: number,
  stockCount = 0,
): { phone: GeneratedPhone; customer: GeneratedCustomer } {
  const modelTpl = PHONE_MODELS[rng.nextInt(0, PHONE_MODELS.length - 1)] ?? PHONE_MODELS[0]!;
  const ageYears = rng.nextInt(1, 4);
  const ageDiscount = 1 - (ageYears - 1) * 0.12;
  const baseValue = roundTo50(modelTpl.basePrice * ageDiscount);

  // Müşteri niyetini belirle: Satma (%45), Tamire Getirme (%35), İkinci El Almaya Gelme (%20)
  let intent: CustomerIntent = "sell";
  const intentRoll = rng.nextInt(1, 100);
  if (stockCount > 0) {
    if (intentRoll <= 45) {
      intent = "sell";
    } else if (intentRoll <= 75) {
      intent = "repair";
    } else {
      intent = "buy";
    }
  } else {
    // Stokta cihaz yoksa müşteri ya satmaya ya tamire gelir
    intent = intentRoll <= 55 ? "sell" : "repair";
  }

  // Arıza sayısı belirleme:
  // Tamire gelen cihazda mutlaka 1 veya 2 arıza olur
  let defectCount = 0;
  if (intent === "repair") {
    defectCount = rng.nextInt(1, 2);
  } else {
    const roll = rng.nextInt(1, 100);
    defectCount = roll <= 25 ? 0 : roll <= 72 ? 1 : 2;
  }

  const allCategories: InspectionCategoryId[] = ["battery", "screen", "camera"];
  for (let i = allCategories.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(0, i);
    const temp = allCategories[i]!;
    allCategories[i] = allCategories[j]!;
    allCategories[j] = temp;
  }

  const chosenCategories = allCategories.slice(0, defectCount);
  const defects: PhoneDefect[] = chosenCategories.map((catId) => {
    const pool = DEFECT_POOL[catId];
    const tpl = pool[rng.nextInt(0, pool.length - 1)] ?? pool[0]!;
    return {
      ...tpl,
      valueLoss: roundTo50(baseValue * tpl.lossRatio),
      found: false,
    };
  });

  const totalLoss = defects.reduce((sum, d) => sum + d.valueLoss, 0);
  const actualValue = Math.max(500, baseValue - totalLoss);

  const hasBatteryDefect = defects.some((d) => d.category === "battery");
  let batteryHealth: number;
  if (hasBatteryDefect) {
    batteryHealth = rng.nextInt(45, 59);
  } else if (ageYears >= 4) {
    batteryHealth = rng.nextInt(60, 74);
  } else if (ageYears === 3) {
    batteryHealth = rng.nextInt(75, 84);
  } else if (ageYears === 2) {
    batteryHealth = rng.nextInt(82, 92);
  } else if (ageYears === 1) {
    batteryHealth = rng.nextInt(88, 96);
  } else {
    batteryHealth = rng.nextInt(95, 100);
  }

  const phone: GeneratedPhone = {
    uid: `ph_${Date.now()}_${rng.nextInt(100, 999)}`,
    brand: modelTpl.brand,
    model: modelTpl.model,
    storage: modelTpl.storage,
    ageYears,
    baseValue,
    actualValue,
    batteryHealth,
    bodyColor: modelTpl.bodyColor,
    frameColor: modelTpl.frameColor,
    screenTint: modelTpl.screenTint,
    cameraStyle: modelTpl.cameraStyle,
    cameraColor: modelTpl.cameraColor,
    defects,
    inspected: {
      battery: false,
      screen: false,
      camera: false,
    },
  };

  const personality = PERSONALITIES[rng.nextInt(0, PERSONALITIES.length - 1)] ?? PERSONALITIES[0]!;
  const name = CUSTOMER_NAMES[rng.nextInt(0, CUSTOMER_NAMES.length - 1)] ?? "Mert Yılmaz";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("");

  const repModifier = (reputation - 50) * 0.001;

  let initialAskPrice = 0;
  let minAcceptPrice = 0;
  let speechText = "";
  let repairTargetDefect: PhoneDefect | undefined = undefined;
  let repairPartCost: number | undefined = undefined;
  let buyerTargetBrand: string | undefined = undefined;
  let buyerBudget: number | undefined = undefined;

  if (intent === "sell") {
    initialAskPrice = roundTo50(baseValue * (personality.askingMultiplier - repModifier));
    minAcceptPrice = Math.min(
      initialAskPrice,
      roundTo50(baseValue * (personality.minAcceptMultiplier - repModifier)),
    );
    speechText = `Selam usta! Elimde ${ageYears} yıllık ${phone.brand} ${phone.model} (${phone.storage}) var. Nakite ihtiyacım olduğu için satmak istiyorum. Telefonu inceleyip ne kadar verebileceğini söyler misin?`;
  } else if (intent === "repair") {
    repairTargetDefect = defects[0]!;
    repairPartCost = roundTo50(repairTargetDefect.valueLoss * 0.40);
    // Müşterinin tamir için kafasındaki ideal ücret ve çıkabileceği maksimum tavan ücret
    initialAskPrice = roundTo50(repairTargetDefect.valueLoss * 0.85);
    minAcceptPrice = roundTo50(repairTargetDefect.valueLoss * 1.25);

    if (repairTargetDefect.category === "screen") {
      speechText = `Usta kolay gelsin! ${phone.brand} ${phone.model} telefonumun ekranı yere düştü, camı çatladı ve dokunmatiği zor basıyor. Kaça tamir edersin?`;
    } else if (repairTargetDefect.category === "battery") {
      speechText = `Selam usta! ${phone.brand} ${phone.model} telefonumun bataryası şişti, şarjı hemen bitiyor. Yeni batarya kaça patlar?`;
    } else {
      speechText = `Merhaba usta! ${phone.brand} ${phone.model} telefonumun kamerası bozuldu, siyah ekran veriyor. Kamera tamir maliyeti ne kadar tutar?`;
    }
  } else {
    // "buy" (İkinci el telefon satın alma)
    const brandPool = ["Elma", "SamSam", "Şaomi", "Redmi", "Poco"];
    buyerTargetBrand = brandPool[rng.nextInt(0, brandPool.length - 1)] ?? "Elma";
    buyerBudget = roundTo50(rng.nextInt(9000, 32000));
    initialAskPrice = buyerBudget;
    minAcceptPrice = roundTo50(buyerBudget * 1.15);
    speechText = `Merhaba usta! İkinci el temiz bir ${buyerTargetBrand} telefon arıyorum. Yaklaşık ₺${buyerBudget.toLocaleString("tr-TR")} bütçem var. Vitrinde bana uygun güzel bir cihaz var mı?`;
  }

  const customer: GeneratedCustomer = {
    name,
    initials,
    personality,
    intent,
    speechText,
    initialAskPrice,
    currentAskPrice: initialAskPrice,
    minAcceptPrice,
    patience: Math.min(100, Math.max(70, 90 + Math.round((reputation - 50) * 0.2))),
    bargainRound: 0,
    maxBargainRounds: 3,
    lastResponse: speechText,
    repairTargetDefect,
    repairPartCost,
    buyerTargetBrand,
    buyerBudget,
  };

  return { phone, customer };
}

/** Oyuncunun şu ana kadar tespit ettiği arızalara göre bilinen tahmini değer. */
export function getKnownPhoneValue(phone: GeneratedPhone): number {
  const knownLoss = phone.defects
    .filter((d) => d.found)
    .reduce((sum, d) => sum + d.valueLoss, 0);
  return Math.max(500, phone.baseValue - knownLoss);
}
