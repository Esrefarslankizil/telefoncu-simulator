import type { Customer, GeneratedPhone, PhoneDefect } from "./GameTypes";
import type { AudioSystem } from "../core/AudioSystem";

export interface ActiveBenchRepair {
  customer: Customer;
  phone: GeneratedPhone;
  defect: PhoneDefect;
  agreedPrice: number;
  partCost: number;
  remainingSeconds: number;
  totalSeconds: number;
  isRepaired: boolean;
}

export class WorkerManager {
  private activeRepair: ActiveBenchRepair | null = null;
  private readonly audio: AudioSystem;
  private readonly onRepairStatusChanged: () => void;

  public constructor(audio: AudioSystem, onRepairStatusChanged: () => void) {
    this.audio = audio;
    this.onRepairStatusChanged = onRepairStatusChanged;
  }

  public get repair(): ActiveBenchRepair | null {
    return this.activeRepair;
  }

  public get hasActiveRepair(): boolean {
    return this.activeRepair !== null;
  }

  public startRepair(
    customer: Customer,
    phone: GeneratedPhone,
    defect: PhoneDefect,
    agreedPrice: number,
    partCost: number,
    durationSeconds = 900
  ): void {
    this.activeRepair = {
      customer: { ...customer },
      phone: { ...phone, defects: [...phone.defects] },
      defect,
      agreedPrice,
      partCost,
      remainingSeconds: durationSeconds,
      totalSeconds: durationSeconds,
      isRepaired: false,
    };
    this.onRepairStatusChanged();
  }

  public updateTick(deltaSeconds: number): boolean {
    if (!this.activeRepair) return false;
    this.activeRepair.remainingSeconds = Math.max(0, this.activeRepair.remainingSeconds - deltaSeconds);
    return this.activeRepair.remainingSeconds <= 0;
  }

  public advanceTimer(seconds: number): void {
    if (!this.activeRepair) return;
    this.activeRepair.remainingSeconds = Math.max(0, this.activeRepair.remainingSeconds - seconds);
    this.onRepairStatusChanged();
  }

  public completeNow(): void {
    if (!this.activeRepair) return;
    this.activeRepair.isRepaired = true;
    this.activeRepair.remainingSeconds = 0;
    this.onRepairStatusChanged();
  }

  public clearRepair(): void {
    this.activeRepair = null;
    this.onRepairStatusChanged();
  }

  public renderModal(container: HTMLElement): void {
    if (!this.activeRepair) {
      container.innerHTML = `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:26px;">👨‍🔧</span>
            <div>
              <strong style="color:#f8fafc;font-size:15px;display:block;">1. İŞÇİ (USTA TEKNİSYEN)</strong>
              <small style="color:#94a3b8;">Aktif Tamir Masası · 1. Kadro</small>
            </div>
          </div>
          <b style="background:rgba(34,197,94,0.15);color:#4ade80;padding:4px 10px;border-radius:4px;border:1px solid #22c55e;font-size:12px;">🟢 BOŞTA (YENİ CİHAZ BEKLİYOR)</b>
        </div>
        <div class="quote-row" style="margin:4px 0;"><span>Tezgâhtan tamir müşterisiyle anlaştığında telefon bu işçiye verilir ve 1 saatlik (15 dk) onarım süreci başlar.</span></div>
        <div style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.12);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;opacity:0.75;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:24px;">🔒</span>
            <div>
              <strong style="color:#cbd5e1;font-size:14px;display:block;">2. İŞÇİ KADROSU</strong>
              <small style="color:#64748b;">Dükkân Büyütme &amp; Eleman Alma (Yakında)</small>
            </div>
          </div>
          <span style="color:#94a3b8;font-size:12px;font-weight:700;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;">KİLİTLİ</span>
        </div>`;
      return;
    }

    const cur = this.activeRepair;
    const sec = Math.max(0, Math.ceil(cur.remainingSeconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const timeStr = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    const statusBadge = cur.isRepaired
      ? '<b style="background:rgba(34,197,94,0.2);color:#4ade80;padding:3px 8px;border-radius:4px;border:1px solid #22c55e;font-size:11px;">✓ TAMİR TAMAMLANDI (MÜŞTERİ BEKLENİYOR)</b>'
      : `<b style="background:rgba(234,179,8,0.2);color:#facc15;padding:3px 8px;border-radius:4px;border:1px solid #eab308;font-size:11px;">🔧 TAMİR EDİLİYOR (${timeStr} KALDI)</b>`;

    container.innerHTML = `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:26px;">👨‍🔧</span>
            <div>
              <strong style="color:#f8fafc;font-size:15px;display:block;">1. İŞÇİ (USTA TEKNİSYEN)</strong>
              <small style="color:#94a3b8;">Aktif Tamir Masası · 1/1 Kadro Dolu</small>
            </div>
          </div>
          ${statusBadge}
        </div>
        <div style="background:rgba(0,0,0,0.35);border-radius:8px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
          <div><span style="color:#94a3b8;">Müşteri:</span> <strong style="color:#f8fafc;">${cur.customer.name}</strong></div>
          <div><span style="color:#94a3b8;">Model:</span> <strong style="color:#facc15;">${cur.phone.brand} ${cur.phone.model}</strong></div>
          <div><span style="color:#94a3b8;">İşlem:</span> <strong style="color:#f8fafc;">${cur.defect.title}</strong></div>
          <div><span style="color:#94a3b8;">Ücret:</span> <strong style="color:#4ade80;">₺${cur.agreedPrice.toLocaleString("tr-TR")}</strong></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button type="button" class="primary-btn worker-ff-btn" style="flex:1;background:rgba(234,179,8,0.18);border:1px solid #eab308;color:#fef08a;font-size:11px;font-weight:700;padding:8px;border-radius:6px;cursor:pointer;">⏩ SÜREYİ 2 DK İLERLET (+2 Dk)</button>
          <button type="button" class="primary-btn worker-finish-btn" style="flex:1;background:rgba(34,197,94,0.2);border:1px solid #22c55e;color:#86efac;font-size:11px;font-weight:700;padding:8px;border-radius:6px;cursor:pointer;" ${cur.isRepaired ? "disabled" : ""}>⚡ HEMEN TAMAMLAT</button>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.12);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;opacity:0.75;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:24px;">🔒</span>
          <div>
            <strong style="color:#cbd5e1;font-size:14px;display:block;">2. İŞÇİ KADROSU</strong>
            <small style="color:#64748b;">Dükkân Büyütme &amp; Eleman Alma (Yakında)</small>
          </div>
        </div>
        <span style="color:#94a3b8;font-size:12px;font-weight:700;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;">KİLİTLİ</span>
      </div>`;

    container.querySelector(".worker-ff-btn")?.addEventListener("click", () => {
      this.audio.playTap();
      this.advanceTimer(120);
      this.renderModal(container);
    });
    container.querySelector(".worker-finish-btn")?.addEventListener("click", () => {
      this.audio.playCash();
      this.completeNow();
      this.renderModal(container);
    });
  }
}
