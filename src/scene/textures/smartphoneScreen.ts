import type { GeneratedPhone } from "../../data/PhoneCatalog";
import { drawGlassCracks } from "./glassCracks";

/** Telefon ekranının 2B arayüzünü (Kilit ekranı, Fotoğraf uygulaması / zemin vizörü) dinamik çizen fonksiyon */
export function renderSmartphoneScreen(
  canvas: HTMLCanvasElement,
  ph: GeneratedPhone,
  powerOn: boolean,
  inCameraApp: boolean,
  cameraWorking: boolean,
  shutterFlash: boolean,
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 1024);

  if (!powerOn) {
    // KAPALI EKRAN (OLED Siyah)
    ctx.fillStyle = "#070b10";
    ctx.fillRect(0, 0, 512, 1024);

    // Çift dokunma rehber ikonu
    ctx.fillStyle = "#e5b765aa";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("👆👆", 256, 480);
    ctx.font = "bold 20px monospace";
    ctx.fillText("ÇİFT DOKUNARAK AÇ", 256, 520);
    ctx.fillStyle = "#94a3b844";
    ctx.font = "14px monospace";
    ctx.fillText("Telefonu açmak için ekrana 2 kez tıkla", 256, 550);
  } else if (inCameraApp) {
    // KAMERA / FOTOĞRAF UYGULAMASI EKRANI
    if (cameraWorking) {
      // 1. KAMERA SAĞLAM: ZEMİN VE LOGOYU GÖRÜYOR!
      ctx.fillStyle = "#112623";
      ctx.fillRect(0, 0, 512, 1024);

      // Kılavuz ızgaraları
      ctx.strokeStyle = "#1b403a";
      ctx.lineWidth = 2;
      for (let x = 0; x < 512; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 1024);
        ctx.stroke();
      }
      for (let y = 0; y < 1024; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }

      // Kameranın gördüğü zemin logosu
      ctx.fillStyle = "#d7a958cc";
      ctx.font = "900 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CEP DÜKKÂNI", 256, 420);
      ctx.font = "bold 15px monospace";
      ctx.fillStyle = "#94d2bd";
      ctx.fillText("MASA VE ZEMİN GÖRÜLÜYOR", 256, 455);
      ctx.fillStyle = "#cbd5e188";
      ctx.fillText("⚡ ANTISTATIC WORKSTATION", 256, 485);

      // Otomatik Odaklama Çerçevesi
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 3;
      ctx.strokeRect(176, 360, 160, 160);
      ctx.fillStyle = "#10b981";
      ctx.font = "bold 16px monospace";
      ctx.fillText("✓ SENSÖR NET · 60 FPS", 256, 550);
      ctx.fillText("✓ KAMERA SAĞLAM", 256, 580);
    } else {
      // 2. KAMERA ARIZALI: SİMSİYAH EKRAN VE HATA MESAJI!
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, 512, 1024);

      // Parazit çizgisi
      ctx.strokeStyle = "#ef444455";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 200 + i * 80);
        ctx.lineTo(512, 205 + i * 80);
        ctx.stroke();
      }

      ctx.fillStyle = "#f87171";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("⚠ KAMERA HATASI", 256, 420);
      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold 16px monospace";
      ctx.fillText("Görüntü Yok (Zemin Görülemiyor)", 256, 460);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Kamera sensörü veya flex kablosu kopuk!", 256, 495);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 15px monospace";
      ctx.fillText("✗ KAMERA ARIZALI", 256, 540);
    }

    if (shutterFlash) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 512, 1024);
    } else {
      // Kamera vizör üst çubuğu
      ctx.fillStyle = "#000000cc";
      ctx.fillRect(0, 0, 512, 120);
      ctx.fillStyle = "#f3eee1";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "left";
      ctx.fillText("📸 KAMERA VİZÖRÜ", 24, 65);
      ctx.textAlign = "right";
      ctx.fillStyle = "#f87171";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("✕ ÇIK", 488, 65);

      // Kamera vizör alt çubuğu ve Deklanşör butonu
      ctx.fillStyle = "#000000cc";
      ctx.fillRect(0, 840, 512, 184);
      ctx.beginPath();
      ctx.arc(256, 920, 44, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(256, 920, 36, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  } else {
    // AÇIK EKRAN (Ana Ekran / Home Screen)
    const grad = ctx.createLinearGradient(0, 0, 512, 1024);
    grad.addColorStop(0, "#0c3b37");
    grad.addColorStop(0.5, "#14253d");
    grad.addColorStop(1, "#1e1338");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 1024);

    // Üst Durum Çubuğu (Status Bar)
    ctx.fillStyle = "#f3eee1";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("12:45", 36, 56);
    ctx.textAlign = "right";
    ctx.font = "18px monospace";
    ctx.fillText("5G  WiFi  🔋%86", 476, 56);

    // Dinamik Ada / Çentik
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.roundRect(196, 26, 120, 36, 18);
    ctx.fill();

    // Büyük Saat & Tarih Widget
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("12:45", 256, 220);
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Pazartesi, 26 Ekim", 256, 265);

    // Model etiketi
    ctx.fillStyle = "#d7a958cc";
    ctx.font = "bold 15px monospace";
    ctx.fillText(`${ph.brand} OS`, 256, 305);

    // Uygulama Simgeleri Tablosu
    // 1. 📸 KAMERA / FOTOĞRAF UYGULAMASI (ÖN PLANDA!)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(70, 560, 100, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.font = "46px sans-serif";
    ctx.fillText("📸", 120, 628);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("Kamera", 120, 685);
    ctx.fillStyle = "#d7a958";
    ctx.font = "bold 11px monospace";
    ctx.fillText("TEST ET", 120, 702);

    // 2. 📞 Telefon
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.roundRect(190, 560, 100, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "44px sans-serif";
    ctx.fillText("📞", 240, 628);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("Telefon", 240, 685);

    // 3. 💬 Mesajlar
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(310, 560, 100, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "44px sans-serif";
    ctx.fillText("💬", 360, 628);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("Mesajlar", 360, 685);

    // 4. ⚙️ Ayarlar
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.roundRect(430, 560, 60, 100, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "34px sans-serif";
    ctx.fillText("⚙", 460, 628);

    // Alt Kısayol Göstergesi
    ctx.fillStyle = "#ffffff22";
    ctx.beginPath();
    ctx.roundRect(40, 760, 432, 60, 14);
    ctx.fill();
    ctx.fillStyle = "#d7a958";
    ctx.font = "bold 14px monospace";
    ctx.fillText("📸 'Kamera' simgesine dokunarak test et", 256, 796);

    // Alt swipe çubuğu
    ctx.fillStyle = "#ffffffbb";
    ctx.beginPath();
    ctx.roundRect(186, 980, 140, 6, 3);
    ctx.fill();
  }

  // EN ÜST KATMAN: Cam Kırıkları & Kılcal Çatlaklar (Telefon açıkken de kapalıyken de cam yüzeyinde görünür)
  const scrDef = ph.defects.find((d) => d.category === "screen");
  if (scrDef) {
    const isMajor = scrDef.id === "scr_broken";
    drawGlassCracks(ctx, isMajor, ph.uid);
  }
}
