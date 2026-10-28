/** DÃ¼kkÃ¢ndaki birinci ÅŸahÄ±s kamera istasyonlarÄ±. */
export type StationId = "counter" | "repair" | "display" | "stock";

export const STATIONS: ReadonlyArray<{ id: StationId; title: string; description: string }> = [
  { id: "counter", title: "KASA", description: "Tezgâhta birinci şahıs" },
  { id: "repair", title: "CİHAZI İNCELE", description: "Yakın plan 4 kontrol" },
  { id: "display", title: "VİTRİN", description: "Satış & stok rafı" },
  { id: "stock", title: "DEPO", description: "Yedek parça & durum" },
];
