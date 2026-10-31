export class TimeManager {
  private timeMinutes: number = 9 * 60; // 09:00
  private readonly startMinutes: number = 9 * 60;
  private readonly endMinutes: number = 19 * 60; // 19:00
  private readonly clockEl: HTMLElement | null;

  public constructor(clockEl: HTMLElement | null) {
    this.clockEl = clockEl;
    this.render();
  }

  public get minutes(): number {
    return this.timeMinutes;
  }

  public get formattedTime(): string {
    const h = Math.floor(this.timeMinutes / 60);
    const m = Math.floor(this.timeMinutes % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  public get isWorkdayOver(): boolean {
    return this.timeMinutes >= 18 * 60;
  }

  public resetDay(): void {
    this.timeMinutes = this.startMinutes;
    this.render();
  }

  public advanceMinutes(amount: number): void {
    this.timeMinutes = Math.min(this.endMinutes, this.timeMinutes + amount);
    this.render();
  }

  /**
   * Oyunda 1 saat = gerçekte 15 dakika (900 saniye).
   * Dolayısıyla her gerçek saniyede (60 / 900) oyun dakikası ilerler.
   */
  public updateTick(deltaSeconds: number): void {
    this.advanceMinutes(deltaSeconds * (60 / 900));
  }

  public render(): void {
    if (this.clockEl) {
      this.clockEl.textContent = this.formattedTime;
    }
  }
}
