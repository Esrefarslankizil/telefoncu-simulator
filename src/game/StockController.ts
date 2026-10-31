import type { StockPhoneItem } from "../data/PhoneCatalog";
import { PHONE_MODELS } from "../data/PhoneCatalog";
import type { AudioSystem } from "../core/AudioSystem";

export interface StockControllerOptions {
  readonly audio: AudioSystem;
  readonly onStockRepairRequested: (uid: string) => void;
  readonly notify: (msg: string) => void;
  readonly wakeRender: (ms?: number) => void;
}

export class StockController {
  public readonly items: StockPhoneItem[] = [];
  public activeStockRepairUid: string | null = null;

  private readonly options: StockControllerOptions;
  private readonly menuBtn: HTMLButtonElement;
  private readonly menuPanel: HTMLElement;
  private readonly stockModal: HTMLElement;
  private readonly priceGuideModal: HTMLElement;
  private readonly stockListEl: HTMLElement;
  private readonly priceGuideListEl: HTMLElement;
  private readonly stockCountBadge: HTMLElement;
  private readonly stockSummaryEl: HTMLElement;
  private readonly menuStockBadge: HTMLElement;
  private readonly priceHelpBox: HTMLElement;
  private readonly priceHelpBtn: HTMLButtonElement;

  public constructor(shell: HTMLElement, options: StockControllerOptions) {
    this.options = options;
    this.menuBtn = shell.querySelector<HTMLButtonElement>("[data-stock-menu-btn]")!;
    this.menuPanel = shell.querySelector<HTMLElement>("[data-stock-menu]")!;
    this.stockModal = shell.querySelector<HTMLElement>("[data-stock-modal]")!;
    this.priceGuideModal = shell.querySelector<HTMLElement>("[data-price-guide-modal]")!;
    this.stockListEl = shell.querySelector<HTMLElement>("[data-stock-list]")!;
    this.priceGuideListEl = shell.querySelector<HTMLElement>("[data-price-guide-list]")!;
    this.stockCountBadge = shell.querySelector<HTMLElement>("[data-stock-count]")!;
    this.stockSummaryEl = shell.querySelector<HTMLElement>("[data-stock-summary]")!;
    this.menuStockBadge = shell.querySelector<HTMLElement>("[data-menu-stock-badge]")!;
    this.priceHelpBox = shell.querySelector<HTMLElement>("[data-price-help-box]")!;
    this.priceHelpBtn = shell.querySelector<HTMLButtonElement>("[data-price-help-btn]")!;

    this.bindEvents(shell);
    this.renderPriceGuide();
  }

  public addItem(item: StockPhoneItem): void {
    this.items.push(item);
    this.renderMenu();
  }

  public setMenuOpen(open: boolean): void {
    this.menuPanel.hidden = !open;
    this.menuBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      this.options.audio.playTap();
      this.renderMenu();
    }
    this.options.wakeRender(400);
  }

  public setStockModalOpen(open: boolean): void {
    this.stockModal.hidden = !open;
    if (open) {
      this.priceGuideModal.hidden = true;
      this.menuPanel.hidden = true;
      this.menuBtn.setAttribute("aria-expanded", "false");
      this.options.audio.playTap();
      this.renderMenu();
    }
    this.options.wakeRender(400);
  }

  public setPriceGuideOpen(open: boolean): void {
    this.priceGuideModal.hidden = !open;
    if (open) {
      this.stockModal.hidden = true;
      this.menuPanel.hidden = true;
      this.menuBtn.setAttribute("aria-expanded", "false");
      this.options.audio.playTap();
    }
    this.options.wakeRender(400);
  }

  public renderMenu(): void {
    const count = this.items.length;
    this.stockCountBadge.textContent = String(count);
    this.stockCountBadge.hidden = count === 0;
    this.menuStockBadge.textContent = `${count} Cihaz →`;

    if (count === 0) {
      this.stockSummaryEl.innerHTML = `<span class="empty">Envanterde telefon yok. Müşterilerden satın aldığında burada listelenir.</span>`;
      this.stockListEl.innerHTML = `<div class="stock-empty-state">Stok boş</div>`;
      return;
    }

    const totalBought = this.items.reduce((s, i) => s + i.boughtPrice, 0);
    const totalVal = this.items.reduce((s, i) => s + i.actualValue, 0);
    const totalDiff = totalVal - totalBought;
    const diffSign = totalDiff >= 0 ? "+" : "";
    const diffClass = totalDiff >= 0 ? "good" : "bad";

    this.stockSummaryEl.innerHTML = `
      <div>Toplam <b>${count}</b> cihaz</div>
      <div>Maliyet: <b>₺${totalBought.toLocaleString("tr-TR")}</b></div>
      <div>Piyasa: <b class="${diffClass}">₺${totalVal.toLocaleString("tr-TR")} (${diffSign}₺${totalDiff.toLocaleString("tr-TR")})</b></div>`;

    this.stockListEl.innerHTML = this.items
      .map((item) => {
        const diff = item.actualValue - item.boughtPrice;
        const sign = diff >= 0 ? "+" : "";
        const cls = diff >= 0 ? "good" : "bad";
        const brokenCount = item.foundDefects.length + item.missedDefects.length;
        const defectsHtml = brokenCount > 0
          ? `<span class="stock-badge-defect">⚠️ ${brokenCount} Arızalı</span>`
          : `<span class="stock-badge-clean">✓ Kusursuz</span>`;
        return `
          <article class="stock-row-item">
            <div class="stock-col-info">
              <strong>${item.brand} ${item.model}</strong>
              <small>${item.ageYears} Yıllık · ${defectsHtml}</small>
            </div>
            <div class="stock-col-bought">
              <b>₺${item.boughtPrice.toLocaleString("tr-TR")}</b>
              <small>Aldığı Fiyat</small>
            </div>
            <div class="stock-col-market ${cls}">
              <b>₺${item.actualValue.toLocaleString("tr-TR")}</b>
              <small>${sign}₺${diff.toLocaleString("tr-TR")} fark</small>
            </div>
          </article>`;
      })
      .join("");
  }

  private renderPriceGuide(): void {
    const list = [...PHONE_MODELS].sort((a, b) => b.basePrice - a.basePrice);
    this.priceGuideListEl.innerHTML = list
      .map(
        (m) => `
        <article class="stock-row-item price-guide-row">
          <div class="stock-col-info">
            <strong>${m.brand} ${m.model}</strong>
            <small>Akıllı Telefon</small>
          </div>
          <div class="stock-col-market good">
            <b>₺${m.basePrice.toLocaleString("tr-TR")}</b>
            <small>Kusursuz İkinci El</small>
          </div>
        </article>`,
      )
      .join("");
  }

  private bindEvents(shell: HTMLElement): void {
    this.menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMenuOpen(Boolean(this.menuPanel.hidden));
    });

    shell.querySelector("[data-open-stock-list]")?.addEventListener("click", () => this.setStockModalOpen(true));
    shell.querySelector("[data-open-price-guide]")?.addEventListener("click", () => this.setPriceGuideOpen(true));

    this.priceHelpBtn.addEventListener("click", () => {
      this.options.audio.playTap();
      this.priceHelpBox.classList.remove("pulse");
      void this.priceHelpBox.offsetWidth;
      this.priceHelpBox.classList.add("pulse");
      this.options.notify("💡 Batarya bozuksa −%20, Ekran bozuksa −%20, Kamera bozuksa −%20 değer düşer.");
    });

    shell.querySelector("[data-stock-menu-close]")?.addEventListener("click", () => this.setMenuOpen(false));
    shell.querySelector("[data-stock-modal-close]")?.addEventListener("click", () => this.setStockModalOpen(false));
    shell.querySelector("[data-price-guide-close]")?.addEventListener("click", () => this.setPriceGuideOpen(false));

    this.stockModal.addEventListener("click", (e) => {
      if (e.target === this.stockModal) this.setStockModalOpen(false);
    });
    this.priceGuideModal.addEventListener("click", (e) => {
      if (e.target === this.priceGuideModal) this.setPriceGuideOpen(false);
    });

    window.addEventListener("pointerdown", (e) => {
      if (this.menuPanel.hidden) return;
      const target = e.target;
      if (target instanceof Node && (this.menuPanel.contains(target) || this.menuBtn.contains(target))) return;
      this.setMenuOpen(false);
    });
  }
}
