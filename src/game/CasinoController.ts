import type { AudioSystem } from "../core/AudioSystem";
import type { GameStore } from "../core/GameStore";
import {
  rollSlot,
  rollHorseRace,
  rollCoinFlip,
  rollWheel,
  rollHiLo,
  HORSES,
} from "./CasinoGames";

type CasinoTab = "slot" | "horse" | "coin" | "wheel" | "hilo";

export class CasinoController {
  private activeTab: CasinoTab = "slot";
  private bet = 100;
  private currentHiLoCard = 7;
  private isBusy = false;

  private modalEl: HTMLElement | null;
  private bodyEl: HTMLElement | null;

  constructor(
    private shell: HTMLElement,
    private store: GameStore,
    private audio: AudioSystem,
    private notify: (msg: string) => void,
    private onMoneyChanged: () => void,
    private wakeRender: (ms?: number) => void,
  ) {
    this.modalEl = this.shell.querySelector<HTMLElement>("[data-casino-modal]");
    this.bodyEl = this.shell.querySelector<HTMLElement>("[data-casino-body]");

    const openBtn = this.shell.querySelector<HTMLButtonElement>("[data-open-casino-btn]");
    const menuBtn = this.shell.querySelector<HTMLButtonElement>("[data-open-casino]");
    const closeBtn = this.shell.querySelector<HTMLButtonElement>("[data-casino-modal-close]");

    openBtn?.addEventListener("click", () => this.open());
    menuBtn?.addEventListener("click", () => this.open());
    closeBtn?.addEventListener("click", () => this.close());
    this.modalEl?.addEventListener("click", (e) => {
      if (e.target === this.modalEl) this.close();
    });
  }

  public open(): void {
    if (!this.modalEl || !this.bodyEl) return;
    this.audio.playTap();
    this.modalEl.hidden = false;
    this.render();
    this.wakeRender(400);
  }

  public close(): void {
    if (!this.modalEl) return;
    this.audio.playTap();
    this.modalEl.hidden = true;
    this.wakeRender(400);
  }

  private setBet(amount: number): void {
    this.bet = amount;
    this.audio.playTap();
    this.render();
  }

  private checkFunds(): boolean {
    if (this.store.getState().money < this.bet) {
      this.audio.playFail();
      this.notify("⚠️ Yetersiz bakiye! Bahis için paran yetmiyor.");
      return false;
    }
    return true;
  }

  private handlePayout(isWin: boolean, payout: number, winMsg: string, loseMsg: string): void {
    if (isWin) {
      const profit = payout - this.bet;
      this.store.addMoney(profit);
      this.audio.playCash();
      this.notify(`🎉 KAZANDIN! +₺${profit.toLocaleString("tr-TR")} (${winMsg})`);
    } else {
      this.store.addMoney(-this.bet);
      this.audio.playFail();
      this.notify(`❌ KAYBETTİN! -₺${this.bet.toLocaleString("tr-TR")} (${loseMsg})`);
    }
    this.onMoneyChanged();
    this.isBusy = false;
    this.render();
  }

  public render(): void {
    if (!this.bodyEl) return;
    const balance = Math.floor(this.store.getState().money);

    const tabsHtml = `
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);">
        ${[
          { id: "slot", label: "🎰 Slot" },
          { id: "horse", label: "🏇 At Yarışı" },
          { id: "coin", label: "🪙 Yazı-Tura" },
          { id: "wheel", label: "🎡 Çark" },
          { id: "hilo", label: "🃏 Yüksek/Alçak" },
        ].map(t => `<button type="button" class="tab-btn" data-tab="${t.id}" style="padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid ${this.activeTab === t.id ? '#c084fc' : 'rgba(255,255,255,0.1)'};background:${this.activeTab === t.id ? '#6b21a8' : 'rgba(0,0,0,0.3)'};color:#fff;cursor:pointer;">${t.label}</button>`).join("")}
      </div>
    `;

    const betHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.3);padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
        <div><small style="color:#aaa;display:block;font-size:10px;">CÜZDAN</small><b style="color:#facc15;font-size:15px;">₺${balance.toLocaleString("tr-TR")}</b></div>
        <div style="display:flex;gap:6px;align-items:center;">
          <small style="color:#aaa;font-size:10px;">BAHİS:</small>
          ${[100, 250, 500, 1000].map(amt => `<button type="button" class="bet-btn" data-amt="${amt}" style="padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid ${this.bet === amt ? '#eab308' : 'rgba(255,255,255,0.15)'};background:${this.bet === amt ? '#ca8a04' : '#1f2937'};color:#fff;cursor:pointer;">₺${amt}</button>`).join("")}
        </div>
      </div>
    `;

    let gameHtml = "";
    if (this.activeTab === "slot") {
      gameHtml = `
        <div style="text-align:center;padding:16px;background:rgba(107,33,168,0.15);border:1px solid rgba(168,85,247,0.3);border-radius:10px;">
          <div style="font-size:38px;letter-spacing:14px;background:#000;border:2px solid #a855f7;border-radius:8px;padding:12px;margin-bottom:14px;" id="slot-reels">🍒 🍋 7️⃣</div>
          <button type="button" id="btn-spin-slot" style="width:100%;padding:12px;background:#9333ea;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;font-size:14px;">🎰 KOLU ÇEK (₺${this.bet})</button>
          <small style="display:block;color:#cbd5e1;margin-top:8px;font-size:11px;">3 aynı: 5x-20x katı | Çift sembol: 1.5x katı</small>
        </div>
      `;
    } else if (this.activeTab === "horse") {
      gameHtml = `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <small style="color:#cbd5e1;font-size:11px;">Bahis oynamak istediğin atı seç:</small>
          ${HORSES.map((h, i) => `
            <button type="button" class="horse-btn" data-index="${i}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(0,0,0,0.4);border:1.5px solid ${h.color};border-radius:8px;color:#fff;cursor:pointer;">
              <span>${h.emoji} <b>${h.name}</b></span>
              <span style="color:${h.color};font-weight:800;">${h.odds.toFixed(1)}x Katı</span>
            </button>
          `).join("")}
          <div id="race-track" style="display:none;background:#111;padding:10px;border-radius:8px;border:1px solid #333;margin-top:4px;"></div>
        </div>
      `;
    } else if (this.activeTab === "coin") {
      gameHtml = `
        <div style="text-align:center;padding:18px;background:rgba(0,0,0,0.3);border-radius:10px;">
          <div style="font-size:52px;margin-bottom:12px;">🪙</div>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button type="button" class="coin-btn" data-choice="yazi" style="flex:1;padding:12px;background:#2563eb;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;">YAZI (2.0x)</button>
            <button type="button" class="coin-btn" data-choice="tura" style="flex:1;padding:12px;background:#d97706;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;">TURA (2.0x)</button>
          </div>
        </div>
      `;
    } else if (this.activeTab === "wheel") {
      gameHtml = `
        <div style="text-align:center;padding:16px;background:rgba(0,0,0,0.3);border-radius:10px;">
          <div style="font-size:42px;margin-bottom:12px;">🎡</div>
          <div style="display:flex;gap:8px;">
            <button type="button" class="wheel-btn" data-color="red" style="flex:1;padding:10px;background:#dc2626;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;">KIRMIZI (2x)</button>
            <button type="button" class="wheel-btn" data-color="black" style="flex:1;padding:10px;background:#1f2937;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;">SİYAH (2x)</button>
            <button type="button" class="wheel-btn" data-color="green" style="flex:1;padding:10px;background:#16a34a;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;">YEŞİL 0 (14x)</button>
          </div>
        </div>
      `;
    } else if (this.activeTab === "hilo") {
      gameHtml = `
        <div style="text-align:center;padding:16px;background:rgba(0,0,0,0.3);border-radius:10px;">
          <div style="font-size:12px;color:#cbd5e1;margin-bottom:6px;">ŞU ANKİ KART:</div>
          <div style="font-size:48px;font-weight:900;background:#fff;color:#000;width:75px;height:105px;line-height:105px;margin:0 auto 14px;border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,0.5);">${this.currentHiLoCard}</div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="hilo-btn" data-choice="hi" style="flex:1;padding:12px;background:#059669;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;">🔼 DAHA YÜKSEK (1.8x)</button>
            <button type="button" class="hilo-btn" data-choice="lo" style="flex:1;padding:12px;background:#dc2626;color:#fff;font-weight:800;border:none;border-radius:8px;cursor:pointer;">🔽 DAHA ALÇAK (1.8x)</button>
          </div>
        </div>
      `;
    }

    this.bodyEl.innerHTML = tabsHtml + betHtml + gameHtml;
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.bodyEl) return;

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (this.isBusy) return;
        this.activeTab = btn.dataset["tab"] as CasinoTab;
        this.audio.playTap();
        this.render();
      });
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".bet-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (this.isBusy) return;
        this.setBet(Number(btn.dataset["amt"]));
      });
    });

    const slotBtn = this.bodyEl.querySelector<HTMLButtonElement>("#btn-spin-slot");
    slotBtn?.addEventListener("click", () => {
      if (this.isBusy || !this.checkFunds()) return;
      this.isBusy = true;
      this.audio.playTap();
      const reelEl = this.bodyEl?.querySelector<HTMLElement>("#slot-reels");
      let counter = 0;
      const interval = setInterval(() => {
        if (reelEl) {
          const syms = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
          reelEl.textContent = `${syms[Math.floor(Math.random() * 6)]} ${syms[Math.floor(Math.random() * 6)]} ${syms[Math.floor(Math.random() * 6)]}`;
        }
        counter++;
        if (counter > 8) {
          clearInterval(interval);
          const res = rollSlot(this.bet);
          if (reelEl) reelEl.textContent = `${res.reels[0]} ${res.reels[1]} ${res.reels[2]}`;
          this.handlePayout(res.isWin, res.payout, res.message, res.message);
        }
      }, 70);
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".horse-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (this.isBusy || !this.checkFunds()) return;
        this.isBusy = true;
        const index = Number(btn.dataset["index"]);
        const chosen = HORSES[index] ?? HORSES[0]!;
        this.notify(`🏇 Yarış başladı! Bahsin: ${chosen.name}`);
        const res = rollHorseRace(index, this.bet);
        const winner = HORSES[res.winnerIndex] ?? HORSES[0]!;
        setTimeout(() => {
          this.handlePayout(res.isWin, res.payout, `${winner.name} kazandı!`, `${winner.name} 1. geldi, senin at kaybetti.`);
        }, 1200);
      });
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".coin-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (this.isBusy || !this.checkFunds()) return;
        this.isBusy = true;
        const choice = btn.dataset["choice"] as "yazi" | "tura";
        this.notify(`🪙 Para havaya atıldı...`);
        const res = rollCoinFlip(choice, this.bet);
        setTimeout(() => {
          const text = res.result === "yazi" ? "YAZI" : "TURA";
          this.handlePayout(res.isWin, res.payout, `${text} geldi!`, `${text} geldi!`);
        }, 800);
      });
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".wheel-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (this.isBusy || !this.checkFunds()) return;
        this.isBusy = true;
        const color = btn.dataset["color"] as "red" | "black" | "green";
        this.notify(`🎡 Çark dönüyor...`);
        const res = rollWheel(color, this.bet);
        setTimeout(() => {
          const colorName = res.outcome === "red" ? "KIRMIZI" : res.outcome === "black" ? "SİYAH" : "YEŞİL 0";
          this.handlePayout(res.isWin, res.payout, `${res.num} (${colorName}) geldi!`, `${res.num} (${colorName}) geldi!`);
        }, 1000);
      });
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>(".hilo-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (this.isBusy || !this.checkFunds()) return;
        this.isBusy = true;
        const choice = btn.dataset["choice"] as "hi" | "lo";
        const res = rollHiLo(choice, this.currentHiLoCard, this.bet);
        const prev = this.currentHiLoCard;
        this.currentHiLoCard = res.nextVal;
        this.handlePayout(res.isWin, res.payout, `Yeni kart ${res.nextVal} geldi! (${prev}'e göre)`, `Yeni kart ${res.nextVal} geldi! (${prev}'e göre)`);
      });
    });
  }
}
