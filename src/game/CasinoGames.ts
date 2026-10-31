export interface SlotResult {
  reels: [string, string, string];
  isWin: boolean;
  multiplier: number;
  payout: number;
  message: string;
}

export interface Horse {
  name: string;
  emoji: string;
  odds: number;
  color: string;
}

export const HORSES: Horse[] = [
  { name: "Rüzgarın Oğlu", emoji: "🔴", odds: 2.0, color: "#ef4444" },
  { name: "Şimşek Batur", emoji: "🔵", odds: 3.5, color: "#3b82f6" },
  { name: "Kara İnci", emoji: "🟢", odds: 5.0, color: "#10b981" },
  { name: "Altın Yele", emoji: "🟡", odds: 8.0, color: "#facc15" },
];

export const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];

export function rollSlot(bet: number): SlotResult {
  const r1 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)] ?? "🍒";
  const r2 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)] ?? "🍋";
  const r3 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)] ?? "7️⃣";

  if (r1 === r2 && r2 === r3) {
    let mult = 5;
    if (r1 === "7️⃣") mult = 20;
    else if (r1 === "💎") mult = 12;
    else if (r1 === "⭐") mult = 8;
    return { reels: [r1, r2, r3], isWin: true, multiplier: mult, payout: bet * mult, message: `JACKPOT! 3x ${r1} (${mult}x Katı)!` };
  }

  if (r1 === r2 || r2 === r3 || r1 === r3) {
    const pairSymbol = r1 === r2 ? r1 : r3;
    return { reels: [r1, r2, r3], isWin: true, multiplier: 1.5, payout: Math.floor(bet * 1.5), message: `Çift Geldi! (${pairSymbol}) 1.5x Katı!` };
  }

  return { reels: [r1, r2, r3], isWin: false, multiplier: 0, payout: 0, message: "Kazanamadın! Tekrar dene." };
}

export function rollHorseRace(chosenIndex: number, bet: number): { winnerIndex: number; payout: number; isWin: boolean } {
  const weights = [45, 28, 18, 9];
  const total = weights.reduce((a, b) => a + b, 0);
  let rnd = Math.random() * total;
  let winner = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    if (rnd < w) {
      winner = i;
      break;
    }
    rnd -= w;
  }
  const isWin = winner === chosenIndex;
  const horse = HORSES[chosenIndex] ?? HORSES[0]!;
  const payout = isWin ? Math.floor(bet * horse.odds) : 0;
  return { winnerIndex: winner, payout, isWin };
}

export function rollCoinFlip(choice: "yazi" | "tura", bet: number): { result: "yazi" | "tura"; isWin: boolean; payout: number } {
  const result = Math.random() < 0.5 ? "yazi" : "tura";
  const isWin = result === choice;
  return { result, isWin, payout: isWin ? bet * 2 : 0 };
}

export function rollWheel(choice: "red" | "black" | "green", bet: number): { outcome: "red" | "black" | "green"; num: number; isWin: boolean; payout: number } {
  const num = Math.floor(Math.random() * 37);
  let outcome: "red" | "black" | "green" = "green";
  if (num === 0) {
    outcome = "green";
  } else if (num % 2 === 0) {
    outcome = "red";
  } else {
    outcome = "black";
  }

  const isWin = outcome === choice;
  const mult = choice === "green" ? 14 : 2;
  return { outcome, num, isWin, payout: isWin ? bet * mult : 0 };
}

export function rollHiLo(choice: "hi" | "lo", currentVal: number, bet: number): { nextVal: number; isWin: boolean; payout: number } {
  let nextVal = Math.floor(Math.random() * 13) + 1;
  while (nextVal === currentVal) {
    nextVal = Math.floor(Math.random() * 13) + 1;
  }
  const isWin = choice === "hi" ? nextVal > currentVal : nextVal < currentVal;
  return { nextVal, isWin, payout: isWin ? Math.floor(bet * 1.8) : 0 };
}
