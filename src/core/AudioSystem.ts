/**
 * Mobil tarayıcı kurallarına uygun olarak ilk dokunuşta (pointerdown) aktifleşen,
 * harici ses dosyası gerektirmeyen prosedürel Web Audio ses modülü.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private unlocked = false;

  public constructor(enabled = true) {
    this.enabled = enabled;
  }

  public unlock(): void {
    if (this.unlocked) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      this.unlocked = true;
    } catch {
      // Ses desteklenmiyorsa sessiz devam et
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public suspend(): void {
    this.stopCustomerSpeech();
    if (this.ctx && this.ctx.state === "running") {
      void this.ctx.suspend();
    }
  }

  public resume(): void {
    if (this.enabled && this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    gainVal = 0.06,
    endFreq?: number,
  ): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
      }
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Yoksay
    }
  }

  /** Müşteri tezgâha gelince konuşurken çıkan hızlı, sevimli "bla-bla-bla" mırıldanma sesi */
  public playGibberishTalk(length = 8): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const basePitches = [340, 420, 380, 520, 460, 390, 490, 560];
    for (let i = 0; i < length; i += 1) {
      const pitch = basePitches[i % basePitches.length]! + Math.random() * 80 - 40;
      window.setTimeout(() => {
        this.playTone(pitch, "triangle", 0.045, 0.045, pitch + (Math.random() > 0.5 ? 40 : -30));
      }, i * 55);
    }
  }

  public playTap(): void {
    this.playTone(520, "triangle", 0.055, 0.05, 680);
  }

  public playDoorBell(): void {
    this.playTone(640, "sine", 0.12, 0.07);
    window.setTimeout(() => this.playTone(860, "sine", 0.18, 0.07), 110);
  }

  public playScan(): void {
    this.playTone(390, "sine", 0.11, 0.055, 740);
  }

  public playClean(): void {
    this.playTone(580, "triangle", 0.09, 0.06);
    window.setTimeout(() => this.playTone(840, "triangle", 0.14, 0.06), 85);
  }

  public playDefect(): void {
    this.playTone(290, "sawtooth", 0.13, 0.065, 195);
    window.setTimeout(() => this.playTone(215, "sawtooth", 0.16, 0.065, 155), 120);
  }

  public playCash(): void {
    this.playTone(960, "sine", 0.08, 0.075);
    window.setTimeout(() => this.playTone(1280, "sine", 0.2, 0.08), 80);
  }

  public playFail(): void {
    this.playTone(310, "triangle", 0.18, 0.07, 175);
  }

  /** Şarj kablosu sokete takılma mekanik sesi */
  public playCablePlug(): void {
    this.playTone(280, "sine", 0.04, 0.08, 180);
    window.setTimeout(() => this.playTone(720, "triangle", 0.08, 0.06, 920), 40);
  }

  /** Ekran aç/kapa kilit açılma sesi */
  public playScreenClick(powerOn = true): void {
    if (powerOn) {
      this.playTone(480, "sine", 0.04, 0.06, 680);
      window.setTimeout(() => this.playTone(880, "sine", 0.09, 0.07), 45);
    } else {
      this.playTone(320, "triangle", 0.05, 0.06, 200);
    }
  }

  /** Hassas tornavida vidalama sesi */
  public playScrewdriver(): void {
    this.playTone(850, "sawtooth", 0.04, 0.03, 1100);
    window.setTimeout(() => this.playTone(950, "sawtooth", 0.05, 0.03, 1250), 60);
    window.setTimeout(() => this.playTone(820, "sawtooth", 0.05, 0.03, 1050), 120);
  }

  /** Kamera deklanşör / flaş sesi */
  public playCameraShutter(): void {
    this.playTone(1100, "square", 0.02, 0.04, 700);
    window.setTimeout(() => this.playTone(550, "triangle", 0.07, 0.06, 300), 25);
  }

  /** Batarya 0-100% sayaç ritmik tıklama sesi */
  public playProgressTick(pitch = 750): void {
    this.playTone(pitch, "triangle", 0.025, 0.035, pitch + 50);
  }

  private talkAudio: HTMLAudioElement | null = null;

  /** Kullanıcının sağladığı YouTube videosunun ilk 4 saniyelik 8-bit konuşma ses efekti */
  public playCustomerSpeech(): void {
    if (!this.enabled) return;
    this.unlock();
    try {
      if (!this.talkAudio) {
        this.talkAudio = new Audio("./audio/talk_8bit.mp3");
        this.talkAudio.volume = 0.7;
      }
      this.talkAudio.currentTime = 0;
      const playPromise = this.talkAudio.play();
      if (playPromise) {
        playPromise.catch(() => {
          this.playGibberishTalk(12);
        });
      }
    } catch {
      this.playGibberishTalk(12);
    }
  }

  public stopCustomerSpeech(): void {
    if (this.talkAudio) {
      try {
        this.talkAudio.pause();
        this.talkAudio.currentTime = 0;
      } catch {
        // yoksay
      }
    }
  }
}
