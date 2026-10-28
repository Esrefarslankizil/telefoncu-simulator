import type { InspectionCategoryId } from "../data/PhoneCatalog";

export type ToolId = "heatGun" | "screwdriver" | "remover" | "cleaner";
export type StepId = "heat" | "screwsOut" | "remove" | "clean" | "install" | "screwsIn" | "test" | "done";

export interface StepInfo {
  readonly id: StepId;
  readonly label: string;
  readonly hint: string;
  readonly tool?: ToolId;
  readonly dwell?: number;
}

export const TOOLS: ReadonlyArray<{ id: ToolId; label: string; color: string }> = [
  { id: "heatGun", label: "Isı Tabancası", color: "#e38157" },
  { id: "screwdriver", label: "Tornavida", color: "#d5b36c" },
  { id: "remover", label: "Sökme Aparatı", color: "#53b5a0" },
  { id: "cleaner", label: "Temizlik Bezi", color: "#6aa7d8" },
];

const PART_LABELS: Record<InspectionCategoryId, { acc: string; nom: string }> = {
  screen: { acc: "ekranı", nom: "Yeni ekran" },
  battery: { acc: "bataryayı", nom: "Yeni batarya" },
  camera: { acc: "kamerayı", nom: "Yeni kamera" },
};

/**
 * Arıza türüne göre tamir masası döngüsü:
 * - Ekran: Kasayı ısıt -> Cıvataları sök -> Arızalı parçayı çıkar -> Temizle -> Yeni parçayı tak -> Cıvataları kapat -> Test et
 * - Batarya / Kamera: Cıvataları sök -> Arızalı parçayı çıkar -> Temizle -> Yeni parçayı tak -> Cıvataları kapat -> Test et
 */
export function buildSteps(category: InspectionCategoryId): StepInfo[] {
  const part = PART_LABELS[category];
  const steps: StepInfo[] = [];

  if (category === "screen") {
    steps.push({
      id: "heat",
      label: "Kasayı ısıt",
      hint: "Masadaki ısı tabancasını basılı tutup telefonun üzerinde gezdir.",
      tool: "heatGun",
      dwell: 1.5,
    });
  }

  steps.push(
    {
      id: "screwsOut",
      label: "Cıvataları sök",
      hint: "Tornavidayı veya köşelerdeki cıvataları tutup telefonun üzerinde sök.",
      tool: "screwdriver",
      dwell: 1.4,
    },
    {
      id: "remove",
      label: "Arızalı " + part.acc + " çıkar",
      hint: "Sökme aparatını veya arızalı parçayı tutup telefondan dışarı çek.",
      tool: "remover",
      dwell: 1.2,
    },
    {
      id: "clean",
      label: "Yuvayı temizle",
      hint: "Temizlik bezini tutup telefonun içini silerek temizle.",
      tool: "cleaner",
      dwell: 1.4,
    },
    {
      id: "install",
      label: part.nom + " tak",
      hint: "Masadaki yeni " + part.acc + " tutup telefonun üzerine bırak.",
      dwell: 0.8,
    },
    {
      id: "screwsIn",
      label: "Cıvataları geri tak",
      hint: "Sökülen cıvataları veya tornavidayı tutup telefonun üzerine getir.",
      tool: "screwdriver",
      dwell: 1.3,
    },
    {
      id: "test",
      label: "Cihazı test et",
      hint: "Telefonun üzerine dokun veya sağdaki TEST ET butonuna bas.",
    },
    {
      id: "done",
      label: "Tamir tamamlandı",
      hint: "Tezgâha dönüp müşteriye teslim et.",
    },
  );

  return steps;
}
