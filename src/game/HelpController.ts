import type { AudioSystem } from "../core/AudioSystem";

export interface HelpTopic {
  title: string;
  icon: string;
  desc: string;
}

export const HELP_TOPICS: Record<string, HelpTopic> = {
  menu: {
    title: "Ana Menü",
    icon: "📱",
    desc: "Dükkânındaki mevcut envanteri (stoktaki telefonlar), ikinci el piyasa fiyat rehberini ve atölye durumunu bu menüden inceleyebilirsin.",
  },
  workers: {
    title: "Tamir Atölyesi & İşçiler",
    icon: "🛠️",
    desc: "Müşterilerden tamire aldığın telefonlar burada işçiye devredilir. Tek işçiyle bir telefonun tamiri 15 gerçek dakika (oyunda 1 saat) sürer. Süre dolunca müşteri cihazını teslim almaya gelir.",
  },
  casino: {
    title: "Şans Oyunları & Kumar",
    icon: "🎰",
    desc: "Dükkân kasandaki paranla Slot, At Yarışı, Yazı-Tura, Çark ve Yüksek/Alçak oynayabilirsin. Bahis kazanırsa paran katlanır, kaybederse kasadan düşer.",
  },
  inspect: {
    title: "Telefon İnceleme Masası",
    icon: "🔍",
    desc: "Müşterinin bıraktığı telefonu şarja takıp ampermetre değerini ölçebilir, güç tuşuna basarak ekranını açabilir, batarya analizini çalıştırabilir ve kamerasını test edebilirsin.",
  },
  diagnose: {
    title: "Arıza Tespiti ve Teklif",
    icon: "📋",
    desc: "İnceleme masasında bulduğun batarya, ekran ve kamera arızalarını müşteriye aktarır. Tamir ücretini veya cihazı satın alma teklifini buradan belirleyip anlaşırsın.",
  },
  next_customer: {
    title: "Sıradaki Müşteriyi Çağırma",
    icon: "🔔",
    desc: "Dükkân sakinken bir sonraki müşterinin geliş süresini beklemek istemiyorsan bu butona basarak müşteriyi kapıdan içeri hemen çağırabilirsin.",
  },
  clock: {
    title: "Oyun Saati & Zaman Akışı",
    icon: "🕒",
    desc: "Dükkân her gün sabah 09:00'da açılır, akşam 21:00'e kadar sürer. 15 gerçek dakika oyun içinde 1 saate karşılık gelir. Gün bitince kasanı kapatıp yeni güne geçebilirsin.",
  },
  bargain: {
    title: "Pazarlık ve Fiyat Adımları",
    icon: "🤝",
    desc: "+100, +200, -100 gibi adımlarla teklifini müşteriyle eşleştirmeye çalışırsın. Anlaşma sağlandığında para kasana girer ve itibarın artar.",
  },
  stock: {
    title: "Stoktaki Telefonlar (Envanter)",
    icon: "📦",
    desc: "Müşterilerden ucuza aldığın ikinci el telefonlar burada birikir. İster arızalarını atölyede onarıp değerini katla, ister gelen alıcılara sat.",
  },
};

export class HelpController {
  private modalEl: HTMLElement | null;
  private titleEl: HTMLElement | null;
  private iconEl: HTMLElement | null;
  private descEl: HTMLElement | null;

  constructor(
    private shell: HTMLElement,
    private audio: AudioSystem,
    private wakeRender: (ms?: number) => void,
  ) {
    this.modalEl = this.shell.querySelector<HTMLElement>("[data-help-modal]");
    this.titleEl = this.shell.querySelector<HTMLElement>("[data-help-title]");
    this.iconEl = this.shell.querySelector<HTMLElement>("[data-help-icon]");
    this.descEl = this.shell.querySelector<HTMLElement>("[data-help-desc]");

    const closeBtn = this.shell.querySelector<HTMLButtonElement>("[data-help-close]");
    const okBtn = this.shell.querySelector<HTMLButtonElement>("[data-help-ok-btn]");

    closeBtn?.addEventListener("click", () => this.close());
    okBtn?.addEventListener("click", () => this.close());
    this.modalEl?.addEventListener("click", (e) => {
      if (e.target === this.modalEl) this.close();
    });

    this.shell.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-help-topic]");
      if (target) {
        e.stopPropagation();
        const topicKey = target.dataset["helpTopic"];
        if (topicKey) this.show(topicKey);
      }
    });
  }

  public show(topicKey: string): void {
    const topic = HELP_TOPICS[topicKey];
    if (!topic || !this.modalEl || !this.titleEl || !this.descEl || !this.iconEl) return;
    this.audio.playTap();
    this.titleEl.textContent = topic.title;
    this.iconEl.textContent = topic.icon;
    this.descEl.textContent = topic.desc;
    this.modalEl.hidden = false;
    this.wakeRender(400);
  }

  public close(): void {
    if (!this.modalEl) return;
    this.audio.playTap();
    this.modalEl.hidden = true;
    this.wakeRender(400);
  }
}
