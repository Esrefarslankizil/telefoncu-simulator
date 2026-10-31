import type { AudioSystem } from "../core/AudioSystem";
import type { GameStore } from "../core/GameStore";
import type { CustomerIntent, InspectionCategoryId, StockPhoneItem } from "../data/PhoneCatalog";
import { roundTo50 } from "../data/PhoneCatalog";
import type { CustomerEncounter, PhoneDefect } from "./GameTypes";
import type { WorkerManager } from "./WorkerManager";

export interface TransactionSummary {
  intent?: CustomerIntent;
  phoneModel: string;
  boughtPrice: number;
  actualValue: number;
  netProfit: number;
  repDelta: number;
  foundDefects: Array<{ title: string; valueLoss: number }>;
  missedDefects: Array<{ title: string; valueLoss: number }>;
  stockUid?: string;
  sold?: boolean;
  repairTitle?: string;
  repairPartCost?: number;
}

export interface BargainControllerOptions {
  readonly audio: AudioSystem;
  readonly store: GameStore;
  readonly workerManager: WorkerManager;
  readonly notify: (msg: string) => void;
  readonly onTransactionCompleted: () => void;
  readonly dismissCustomer: () => void;
  readonly openSpeechBubble: (text: string, speaker?: "customer" | "player") => void;
  readonly onOpenWorkersModal: () => void;
  readonly getStockItems: () => StockPhoneItem[];
}

export class BargainController {
  public currentOffer = 0;
  public dealFinished = false;
  public isReturningCustomerActive = false;
  public lastSummary: TransactionSummary | null = null;

  public falseDiagnosisClaimed = false;
  public successfulLieDiscount = 0;
  public caughtLies = 0;
  public successfulLies = 0;
  public readonly rejectedClaims = new Set<InspectionCategoryId>();
  public readonly claimLines: string[] = [];
  public readonly diagnosedCategories = new Set<InspectionCategoryId>();

  private readonly options: BargainControllerOptions;
  private readonly diagnosticEl: HTMLElement;
  private readonly mainActionsEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly copyEl: HTMLElement;
  private encounter: CustomerEncounter | null = null;

  public constructor(shell: HTMLElement, options: BargainControllerOptions) {
    this.options = options;
    this.diagnosticEl = shell.querySelector<HTMLElement>(".diagnostic")!;
    this.mainActionsEl = shell.querySelector<HTMLElement>("[data-main-actions]")!;
    this.titleEl = shell.querySelector<HTMLElement>("[data-panel-title]")!;
    this.copyEl = shell.querySelector<HTMLElement>("[data-panel-copy]")!;
  }

  public setEncounter(encounter: CustomerEncounter): void {
    this.encounter = encounter;
    this.dealFinished = false;
    this.lastSummary = null;
    this.falseDiagnosisClaimed = false;
    this.successfulLieDiscount = 0;
    this.caughtLies = 0;
    this.successfulLies = 0;
    this.rejectedClaims.clear();
    this.claimLines.length = 0;
    this.diagnosedCategories.clear();

    const cust = encounter.customer;
    this.currentOffer =
      cust.intent === "sell"
        ? roundTo50(encounter.phone.baseValue * 0.82)
        : cust.intent === "repair"
          ? roundTo50(cust.initialAskPrice * 0.95)
          : cust.initialAskPrice;
  }

  public finishReturningDelivery(success: boolean): void {
    const repair = this.options.workerManager.repair;
    if (!repair) return;

    if (success) {
      this.options.audio.playCash();
      const netProfit = repair.agreedPrice - repair.partCost;
      this.options.store.addMoney(repair.agreedPrice);
      this.options.store.addReputation(4);
      repair.customer.lastResponse = "Harikasın usta! Telefon sıfır gibi olmuş, eline emeğine sağlık.";
      this.options.notify(`✓ Telefon teslim edildi! +₺${repair.agreedPrice.toLocaleString("tr-TR")} alındı (+4 İtibar).`);
      this.lastSummary = {
        intent: "repair",
        phoneModel: `${repair.phone.brand} ${repair.phone.model}`,
        boughtPrice: repair.agreedPrice,
        actualValue: repair.agreedPrice,
        netProfit,
        repDelta: 4,
        foundDefects: [],
        missedDefects: [],
        stockUid: repair.phone.uid,
        sold: true,
        repairTitle: repair.defect.title,
        repairPartCost: repair.partCost,
      };
    } else {
      this.options.audio.playFail();
      this.options.store.addReputation(-5);
      repair.customer.lastResponse = "1 saat geçti telefon hala yapılmamış! Böyle esnaflık olmaz, puanınızı kırıyorum!";
      this.options.notify("❌ Telefon vaktinde tamir edilmediği için müşteri öfkelendi! (-5 İtibar)");
    }

    this.dealFinished = true;
    this.options.workerManager.clearRepair();
    this.isReturningCustomerActive = false;
    this.titleEl.textContent = success ? "Tamir teslim edildi · Müşteri memnun" : "Tamir gecikti · Müşteri öfkeli";
    this.copyEl.textContent = repair.customer.lastResponse;
    this.options.onTransactionCompleted();
    this.renderDiagnosticArea();
  }

  public renderDiagnosticArea(): void {
    if (!this.encounter) return;
    const repair = this.options.workerManager.repair;

    if (this.isReturningCustomerActive && repair) {
      this.mainActionsEl.hidden = true;
      this.diagnosticEl.hidden = false;
      const ph = repair.phone;
      const cust = repair.customer;
      const isRep = repair.isRepaired;

      if (isRep) {
        this.diagnosticEl.innerHTML = `
          <div class="result-row"><span>MÜŞTERİ TELEFONU ALMAYA GELDİ</span><b class="good">✓ TAMİR EDİLDİ</b></div>
          <div class="quote-row"><span><b>${cust.name}:</b> "Selam usta, 1 saat doldu telefonumu almaya geldim!"</span></div>
          <div class="result-row"><span>${ph.brand} ${ph.model} · ${repair.defect.title}</span><b class="good">ALINACAK: ₺${repair.agreedPrice.toLocaleString("tr-TR")}</b></div>
          <div class="action-row"><button class="primary-btn deliver-success-btn">TELEFONU TESLİM ET VE ÜCRETİ AL (+4 Puan) <span>→</span></button></div>`;
        this.diagnosticEl.querySelector(".deliver-success-btn")?.addEventListener("click", () => this.finishReturningDelivery(true));
      } else {
        this.diagnosticEl.innerHTML = `
          <div class="result-row"><span>MÜŞTERİ TELEFONU ALMAYA GELDİ</span><b class="bad">❌ TAMİR EDİLMEDİ!</b></div>
          <div class="quote-row"><span><b>${cust.name}:</b> "1 saat doldu usta! Telefonum hazır mı?"</span></div>
          <div class="result-row"><span>${ph.brand} ${ph.model} · ${repair.defect.title}</span><b class="bad">PUAN DÜŞECEK (-5 İtibar)</b></div>
          <div class="action-row">
            <button class="secondary-btn go-workshop-rush-btn">İŞÇİLERİ AÇ (2)</button>
            <button class="primary-btn deliver-fail-btn" style="background:#dc2626;">YAPILAMADI / ÖZÜR DİLE (-5 Puan) <span>→</span></button>
          </div>`;
        this.diagnosticEl.querySelector(".go-workshop-rush-btn")?.addEventListener("click", () => this.options.onOpenWorkersModal());
        this.diagnosticEl.querySelector(".deliver-fail-btn")?.addEventListener("click", () => this.finishReturningDelivery(false));
      }
      return;
    }

    if (this.encounter.customer.intent === "repair" && repair && !this.isReturningCustomerActive) {
      this.mainActionsEl.hidden = true;
      this.diagnosticEl.hidden = false;
      this.diagnosticEl.innerHTML = `
        <div class="result-row" style="background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:6px;padding:8px;">
          <span style="color:#fca5a5;">⚠️ ATÖLYE DOLU (TEK İŞÇİ)</span>
          <b class="bad">İŞÇİ MEŞGUL</b>
        </div>
        <div class="quote-row">
          <span>Şu an tezgahta <b>${repair.phone.brand} ${repair.phone.model}</b> tamir ediliyor. Tek işçi çalıştığı için yeni tamir alamayız.</span>
        </div>
        <div class="action-row">
          <button class="primary-btn busy-dismiss-btn">MÜŞTERİYİ UĞURLA (KAPASİTE DOLU) <span>→</span></button>
        </div>`;
      this.diagnosticEl.querySelector(".busy-dismiss-btn")?.addEventListener("click", () => {
        this.options.audio.playTap();
        this.encounter!.customer.lastResponse = "Usta meşgulmüşsün, başka dükkana bakayım o zaman.";
        this.options.notify("Atölye kapasitesi dolu olduğu için müşteri başka dükkana yönlendirildi.");
        this.options.dismissCustomer();
      });
      return;
    }

    if (this.dealFinished && !this.lastSummary) {
      this.mainActionsEl.hidden = true;
      this.diagnosticEl.hidden = false;
      this.diagnosticEl.innerHTML = `<div class="result-row"><span>İŞLEM SONUCU</span><b class="warn">ANLAŞMA SAĞLANAMADI</b></div>
        <div class="action-row"><button class="primary-btn dismiss-cust-btn">TEZGAHTA BEKLE <span>→</span></button></div>`;
      this.diagnosticEl.querySelector(".dismiss-cust-btn")?.addEventListener("click", () => this.options.dismissCustomer());
      return;
    }

    const { customer: cust } = this.encounter;
    const remRounds = cust.maxBargainRounds - cust.bargainRound;

    if (cust.intent === "repair") {
      const partCost = cust.repairPartCost || 350;
      const estProfit = this.currentOffer - partCost;
      const pSign = estProfit >= 0 ? "+" : "";
      const pClass = estProfit >= 0 ? "good" : "bad";

      this.diagnosticEl.innerHTML = `
        <div class="result-row"><span>ARIZA: ${cust.repairTargetDefect?.title || "Donanım Onarımı"}</span><b class="good">${remRounds} TUR HAKKIN VAR</b></div>
        <div class="result-row"><span>YEDEK PARÇA: ₺${partCost.toLocaleString("tr-TR")} · MÜŞTERİ BÜTÇESİ: ₺${cust.currentAskPrice.toLocaleString("tr-TR")}</span><b class="${pClass}">TAHMİNİ KÂR: ${pSign}₺${estProfit.toLocaleString("tr-TR")}</b></div>
        <div class="offer-Adjust-row">
          <button class="step-btn" data-step="-200">−200</button>
          <button class="step-btn" data-step="-100">−100</button>
          <div class="offer-box">₺${this.currentOffer.toLocaleString("tr-TR")}</div>
          <button class="step-btn" data-step="100">+100</button>
          <button class="step-btn" data-step="200">+200</button>
          <button class="step-btn" data-match="ask">BÜTÇESİ</button>
        </div>
        <div class="action-row">
          <button class="secondary-btn decline-btn">TAMİRİ REDDET</button>
          <button class="primary-btn offer-btn">₺${this.currentOffer.toLocaleString("tr-TR")} TAMİR TEKLİF ET <span>→</span></button>
        </div>`;

      this.bindAdjustButtons(cust.currentAskPrice);
      this.diagnosticEl.querySelector(".offer-btn")?.addEventListener("click", () => this.submitOffer());
      this.diagnosticEl.querySelector(".decline-btn")?.addEventListener("click", () => {
        this.options.audio.playTap();
        cust.lastResponse = "Teklif vermediğin için başka tamirciye gideyim.";
        this.dealFinished = true;
        this.options.store.addReputation(-1);
        this.renderDiagnosticArea();
      });
    }
  }

  public submitOffer(): void {
    if (!this.encounter) return;
    const { phone: ph, customer: cust } = this.encounter;

    if (cust.intent === "repair") {
      if (this.options.workerManager.hasActiveRepair && !this.isReturningCustomerActive) {
        this.options.audio.playFail();
        this.options.notify("⚠️ Atölye dolu! Tek işçi şu anda başka bir telefon tamir ediyor.");
        return;
      }
      const partCost = cust.repairPartCost || 350;
      if (this.options.store.getState().money < partCost) {
        this.options.audio.playFail();
        this.options.notify("Yedek parça temin etmek için kasada yeterli nakit yok!");
        return;
      }

      cust.bargainRound += 1;
      if (this.currentOffer <= cust.minAcceptPrice) {
        const targetId = cust.repairTargetDefect?.id;
        const targetDefect =
          ph.defects.find((d: PhoneDefect) => d.id === targetId) ??
          ph.defects[0] ?? {
            id: "repair_defect",
            category: "battery" as InspectionCategoryId,
            title: cust.repairTargetDefect?.title || "Donanım Onarımı",
            description: "Onarım işlemi",
            valueLoss: 500,
            found: false,
            lossRatio: 0.2,
          };

        this.options.workerManager.startRepair(cust, ph, targetDefect, this.currentOffer, partCost, 900);
        this.options.audio.playTap();
        cust.lastResponse = "Tamam usta anlaştık! 1 saat sonra (15 dk) gelip telefonu alırım.";
        this.titleEl.textContent = "Cihaz tamire alındı (Tek İşçi meşgul)";
        this.copyEl.textContent = `${ph.brand} ${ph.model} tamir tezgahına gönderildi. Müşteri 15 dakika sonra teslim almaya gelecek.`;
        this.options.notify("📱 Telefon tamire alındı! 15 dk sonra müşteri dönecek.");
        this.options.onTransactionCompleted();
        setTimeout(() => this.options.dismissCustomer(), 1200);
        return;
      }

      const bump = roundTo50((cust.minAcceptPrice - cust.currentAskPrice) * 0.45);
      cust.currentAskPrice = Math.min(cust.minAcceptPrice, cust.currentAskPrice + bump);
      this.options.audio.playTap();
      this.options.notify(`Karşı teklif: ₺${cust.currentAskPrice.toLocaleString("tr-TR")}`);
      this.renderDiagnosticArea();
    }
  }

  private bindAdjustButtons(askPrice: number): void {
    this.diagnosticEl.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) => {
      b.addEventListener("click", () => {
        this.options.audio.playTap();
        const delta = Number(b.dataset["step"]);
        this.currentOffer = Math.max(50, this.currentOffer + delta);
        this.renderDiagnosticArea();
      });
    });
    this.diagnosticEl.querySelector("[data-match='ask']")?.addEventListener("click", () => {
      this.options.audio.playTap();
      this.currentOffer = askPrice;
      this.renderDiagnosticArea();
    });
  }
}
