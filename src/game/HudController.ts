import type { AudioSystem } from "../core/AudioSystem";
import type { GameStore } from "../core/GameStore";
import type { TimeManager } from "./TimeManager";
import type { WorkerManager } from "./WorkerManager";
import type { CustomerController } from "./CustomerController";
import type { BargainController } from "./BargainController";

export class HudController {
  private moneyEl: HTMLElement;
  private repEl: HTMLElement;
  private dayEl: HTMLElement;
  private shopStatusEl: HTMLElement;
  private workersBadgeEl: HTMLElement | null;
  private toastEl: HTMLElement;
  private toastTimer = 0;

  private customerInitials: HTMLElement;
  private customerEyebrow: HTMLElement;
  private customerName: HTMLElement;
  private customerRequest: HTMLElement;
  public nextCustomerBtn: HTMLButtonElement;

  private speechBubbleOverlay: HTMLElement;
  private bubbleAvatar: HTMLElement;
  private bubbleName: HTMLElement;
  private bubbleText: HTMLElement;
  private bubbleIntent: HTMLElement;

  private workersModalEl: HTMLElement | null;
  private workersListEl: HTMLElement | null;

  constructor(
    private shell: HTMLElement,
    private audio: AudioSystem,
    private timeManager: TimeManager,
    private workerManager: WorkerManager,
    private wakeRender: (ms?: number) => void,
  ) {
    const select = <T extends HTMLElement>(sel: string): T => this.shell.querySelector<T>(sel)!;

    this.moneyEl = select<HTMLElement>("[data-money]");
    this.repEl = select<HTMLElement>("[data-rep]");
    this.dayEl = select<HTMLElement>("[data-day]");
    this.shopStatusEl = select<HTMLElement>("[data-shop-status]");
    this.workersBadgeEl = this.shell.querySelector<HTMLElement>("[data-workers-badge]");
    this.toastEl = select<HTMLElement>(".toast");

    this.customerInitials = select<HTMLElement>("[data-customer-initials]");
    this.customerEyebrow = select<HTMLElement>("[data-customer-eyebrow]");
    this.customerName = select<HTMLElement>("[data-customer-name]");
    this.customerRequest = select<HTMLElement>("[data-customer-request]");
    this.nextCustomerBtn = select<HTMLButtonElement>(".next-customer");

    this.speechBubbleOverlay = select<HTMLElement>(".speech-bubble-overlay");
    this.bubbleAvatar = select<HTMLElement>(".bubble-avatar");
    this.bubbleName = select<HTMLElement>(".bubble-name");
    this.bubbleText = select<HTMLElement>(".bubble-text");
    this.bubbleIntent = select<HTMLElement>(".bubble-intent-badge");
    const bubbleDismissBtn = select<HTMLButtonElement>(".bubble-dismiss-btn");

    this.workersModalEl = this.shell.querySelector<HTMLElement>("[data-workers-modal]");
    this.workersListEl = this.shell.querySelector<HTMLElement>("[data-workers-list]");
    const openWorkersBtn = this.shell.querySelector<HTMLButtonElement>("[data-open-workers-btn]");
    const menuWorkersBtn = this.shell.querySelector<HTMLButtonElement>("[data-open-workers]");
    const workersModalClose = this.shell.querySelector<HTMLButtonElement>("[data-workers-modal-close]");

    openWorkersBtn?.addEventListener("click", () => this.openWorkersModal());
    menuWorkersBtn?.addEventListener("click", () => this.openWorkersModal());
    workersModalClose?.addEventListener("click", () => this.closeWorkersModal());
    this.workersModalEl?.addEventListener("click", (e) => {
      if (e.target === this.workersModalEl) this.closeWorkersModal();
    });

    bubbleDismissBtn.addEventListener("click", () => {
      this.speechBubbleOverlay.hidden = true;
      this.audio.stopCustomerSpeech();
      this.audio.playTap();
    });

    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLElement && e.target.matches("input,textarea,[contenteditable=true]")) return;
      if (e.key === "2") this.openWorkersModal();
      if (e.key === "1" || e.key === "Escape") this.closeWorkersModal();
    });
  }

  public notify = (msg: string): void => {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("visible");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("visible"), 3200);
  };

  public openWorkersModal(): void {
    if (!this.workersModalEl || !this.workersListEl) return;
    this.audio.playTap();
    this.workersModalEl.hidden = false;
    this.workerManager.renderModal(this.workersListEl);
    this.wakeRender(400);
  }

  public closeWorkersModal(): void {
    if (!this.workersModalEl) return;
    this.audio.playTap();
    this.workersModalEl.hidden = true;
    this.wakeRender(400);
  }

  public renderWorkersModalIfOpen(): void {
    if (this.workersModalEl && !this.workersModalEl.hidden && this.workersListEl) {
      this.workerManager.renderModal(this.workersListEl);
    }
  }

  public openSpeechBubble(
    text: string,
    speaker: "customer" | "player",
    initials: string,
    name: string,
    intent: string,
  ): void {
    this.speechBubbleOverlay.classList.toggle("player-speech", speaker === "player");
    this.bubbleAvatar.textContent = speaker === "player" ? "🧑‍🔧" : initials;
    this.bubbleName.textContent = speaker === "player" ? "Sen · Telefoncu" : name;
    this.bubbleText.textContent = text;
    this.bubbleIntent.className = "bubble-intent-badge " + (speaker === "player" ? "repair" : intent);
    this.bubbleIntent.textContent = speaker === "player" ? "TEKLİF" : intent.toUpperCase();
    this.speechBubbleOverlay.hidden = false;
    if (speaker === "customer") this.audio.playCustomerSpeech();
    else this.audio.playTap();
  }

  public updateHUD(state: ReturnType<GameStore["getState"]>): void {
    this.moneyEl.textContent = `₺${Math.floor(state.money).toLocaleString("tr-TR")}`;
    this.repEl.textContent = `${Math.round(state.reputation)} / 100`;
    this.dayEl.textContent = `G${String(state.day).padStart(2, "0")}`;
    this.shopStatusEl.textContent = "DÜKKÂN AÇIK";
    this.timeManager.render();
    if (this.workersBadgeEl) {
      this.workersBadgeEl.hidden = !this.workerManager.hasActiveRepair;
      if (this.workerManager.repair) {
        this.workersBadgeEl.textContent = this.workerManager.repair.isRepaired ? "✓" : "1";
      }
    }
  }

  public updateCustomerHeader(
    customerController: CustomerController,
    bargainController: BargainController,
  ): void {
    const repair = this.workerManager.repair;
    if (bargainController.isReturningCustomerActive && repair) {
      this.customerInitials.textContent = repair.customer.initials;
      this.customerEyebrow.textContent = repair.isRepaired
        ? "CİHAZI ALMAYA GELDİ · TAMİR EDİLDİ"
        : "CİHAZI ALMAYA GELDİ · SÜRE DOLDU!";
      this.customerName.textContent = repair.customer.name;
      this.customerRequest.textContent = repair.isRepaired
        ? `"Selam usta, 1 saat doldu telefonumu almaya geldim!"`
        : `"Selam usta! 1 saat doldu, telefonum hazır mı?"`;
      this.nextCustomerBtn.textContent = "TESLİMAT";
      return;
    }

    if (customerController.state === "WAITING") {
      this.customerInitials.textContent = "⏳";
      if (repair) {
        const sec = Math.max(0, Math.ceil(repair.remainingSeconds));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        this.customerEyebrow.textContent = `ATÖLYEDE TAMİRDE (TEK İŞÇİ) · KALAN: ${timeStr}`;
        this.customerName.textContent = repair.isRepaired ? "✓ Tamir Bitti (Müşteri Bekleniyor)" : "Tamir Devam Ediyor";
        this.customerRequest.textContent = `${repair.phone.brand} ${repair.phone.model} onarılıyor (~${timeStr} sonra müşteri gelecek).`;
        this.nextCustomerBtn.textContent = "BEKLE";
        return;
      }
      this.customerEyebrow.textContent = "DÜKKÂN SAKİN · MÜŞTERİ BEKLENİYOR";
      this.customerName.textContent = "Tezgâhta Bekliyorsun";
      this.customerRequest.textContent = `Sıradaki müşteri ~${Math.max(1, Math.ceil(customerController.waitTimer))} saniye içinde kapıdan girecek.`;
      this.nextCustomerBtn.textContent = "🔔 KAPIDAN ÇAĞIR";
      return;
    }

    const cust = customerController.encounter.customer;
    this.customerInitials.textContent = cust.initials;
    this.customerEyebrow.textContent = `${cust.intent.toUpperCase()} TALEBİ`;
    this.customerName.textContent = cust.name;
    this.customerRequest.textContent = cust.speechText;
  }
}
