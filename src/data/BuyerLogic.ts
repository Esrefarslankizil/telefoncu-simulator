import type { StockPhoneItem } from "./PhoneCatalog";
import { roundTo50 } from "./PhoneCatalog";

/**
 * Alıcı müşterinin fiyatı kabul etme olasılığı (0–1).
 * `offer / marketValue` oranına göre azalır: ucuza kesin alır, ederinde şansa bağlı, çok pahalıya almaz.
 */
export function getBuyerAcceptChance(offer: number, marketValue: number): number {
  const ratio = offer / Math.max(marketValue, 1);
  const points: ReadonlyArray<readonly [number, number]> = [
    [0.85, 0.95],
    [1.0, 0.65],
    [1.25, 0.15],
    [1.5, 0],
  ];
  if (ratio <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    if (ratio <= x1) return y0 + ((y1 - y0) * (ratio - x0)) / (x1 - x0);
  }
  return 0;
}

/** Oyuncunun stoktaki cihaz için bildiği değer: taban değer − bulunmuş arızaların değer kaybı. */
export function getKnownStockValue(item: StockPhoneItem): number {
  const found = item.foundDefects.reduce((sum, defect) => sum + defect.valueLoss, 0);
  return Math.max(500, roundTo50(item.baseValue - found));
}

/** Alıcıya ilk önerilecek fiyat: bilinen değer, maliyetin en az 300 TL üstünde. */
export function getSuggestedBuyerPrice(item: StockPhoneItem): number {
  return Math.max(roundTo50(item.boughtPrice + 300), getKnownStockValue(item));
}
