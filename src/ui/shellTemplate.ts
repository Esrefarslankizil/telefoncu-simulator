/** Oyun arayÃ¼zÃ¼nÃ¼n (Ã¼st bar, mÃ¼ÅŸteri kartÄ±, Ã§alÄ±ÅŸma paneli, inceleme HUD vb.) statik HTML iskeleti. */
export const SHELL_HTML = `<header class="topbar">
      <div class="brand">

        <div><b>CEP DÜKKÂNI</b><small>BİRİNCİ ŞAHIS · TEZGÂHTASIN</small></div>
      </div>
      <div class="stats">
        <div><small>KASA</small><b data-money></b></div>
        <div><small>İTİBAR</small><b data-rep></b></div>
        <div><small>GÜN · SAAT</small><b data-day></b></div>
      </div>
      <button class="icon-btn fullscreen-toggle" aria-label="Tam Ekran ve Yatay Mod" title="Tam Ekran (Yatay Mod)">⛶</button>
      <button class="icon-btn settings-open" aria-label="Ayarlar ve Gün Sonu">⚙</button>
    </header>

    <section class="customer-card">
      <div class="customer-avatar" data-customer-initials>⏳</div>
      <div class="customer-copy">
        <div class="eyebrow" data-customer-eyebrow>DÜKKÂN SAKİN · MÜŞTERİ BEKLENİYOR</div>
        <strong data-customer-name>Tezgâhta Bekliyorsun</strong>
        <span data-customer-request>Sıradaki müşteri kapıdan girmek üzere...</span>
      </div>
      <button class="quiet-btn next-customer" title="Beklemeden hemen çağır">🔔 KAPIDAN ÇAĞIR</button>
    </section>

    <div class="scene-label">
      <span class="live-dot"></span> <span data-shop-status>DÜKKÂN AÇIK</span>
      <span class="scene-tip">BİRİNCİ ŞAHIS · SÜRÜKLEYEREK ETRAFA BAK</span>
    </div>

    <nav class="station-nav" aria-label="Dükkân istasyonları"></nav>

    <section class="work-panel">
      <div class="panel-grip"></div>
      <div class="panel-title">
        <div>
          <div class="eyebrow" data-panel-kicker>TEZGÂH · BİRİNCİ ŞAHIS</div>
          <strong data-panel-title>Tezgâhta bekliyorsun</strong>
        </div>
        <button class="small-icon inspect-phone" aria-label="Cihazı yakından incele" title="Yakın Plan İncele">⌕</button>
      </div>
      <p data-panel-copy>Dükkânın tezgâhında bekliyorsun. Her 30-40 saniyede bir kapıdan yeni bir müşteri ikinci el telefonunu satmaya gelecek.</p>

      <div class="inspect-grid" data-inspect-grid hidden></div>

      <div class="action-row" data-main-actions>
        <button class="secondary-btn inspect-btn" disabled>CİHAZI İNCELE</button>
        <button class="primary-btn diagnose-btn" disabled>PAZARLIĞA GEÇ <span>→</span></button>
      </div>

      <div class="diagnostic" hidden></div>
    </section>

    <!-- ÖZEL İNCELEME EKRANI & KUŞBAKIŞI TEZGÂH (HUD) -->
    <section class="inspection-hud" hidden>
      <div class="inspect-top-card">
        <button class="secondary-btn exit-inspect-btn">← TEZGÂHA DÖN</button>
        <div style="flex:1;">
          <div class="eyebrow" data-inspect-brand>ELMA · AMASYA iELMA 14 PRO MAX</div>
          <strong data-inspect-title>Cihaz Tezgâhta · Test Aletlerini Kullan</strong>
          <span data-inspect-status>Prob'u şarj soketine tak, ekrana çift dokunarak ekranı kontrol et.</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span data-dock-summary class="eyebrow" style="margin:0;font-size:11px;">0/3 KONTROL</span>
          <button class="primary-btn to-bargain-btn">PAZARLIĞA GEÇ <span>→</span></button>
        </div>
      </div>

      <aside class="diagnosis-side-panel" data-diagnosis-panel hidden><div class="diagnosis-panel-title">ARIZA TESPİTİ</div><p>Önce telefonu test et, sonra doğru arızayı seç.</p><div data-diagnosis-options></div></aside>
      <div class="inspect-hints-bar">
        <span class="hint-pill" data-hint="battery"><b>⚡ Test Kablosunu Bağla:</b> Batarya Test Cihazı</span>
        <span class="hint-pill" data-hint="screen"><b>👆👆 Çift Dokun:</b> Ekranı Aç/Kapat</span>
        <span class="hint-pill" data-hint="camera"><b>📸 Kamera:</b> Uygulamayı Aç</span>
      </div>

      <div class="battery-live-overlay" hidden>
        <strong>⚡ BATARYA ANALİZİ YAPILIYOR...</strong>
        <span data-battery-val>%0</span>
        <div class="battery-live-bar">
          <div class="battery-live-fill"></div>
        </div>
        <small style="font: 11px monospace; color: #cbd5e1;">Şarj akımı ve pil sağlığı ölçülüyor</small>
      </div>

      <div class="camera-live-overlay good" hidden></div>
    </section>

    <aside class="toast" aria-live="polite"></aside>

    <div class="modal-backdrop" hidden>
      <section class="settings-card">
        <button class="modal-close" aria-label="Kapat">×</button>
        <div class="eyebrow">DÜKKÂN YÖNETİMİ & PERFORMANS</div>
        <h2>Gün sonu & ayarlar</h2>
        <p>Grafik kalitesini cihazına göre seçebilir veya kira/elektrik giderlerini ödeyip yeni güne geçebilirsin.</p>
        <div class="eyebrow" style="margin-top:8px;">GRAFİK KALİTESİ (MAKS 1.5x PİKSEL)</div>
        <div class="quality-row" data-quality-row>
          <button class="quality-pill" data-q="low">DÜŞÜK</button>
          <button class="quality-pill" data-q="medium">ORTA</button>
          <button class="quality-pill" data-q="high">YÜKSEK</button>
        </div>
        <div class="expense-line">
          <span>Ses Efektleri (İlk dokunuşla aktif)</span>
          <button class="quiet-btn toggle-audio-btn" style="margin:0;">AÇIK</button>
        </div>
        <div class="expense-line">
          <span>Günlük kira + elektrik gideri</span>
          <b>−₺420</b>
        </div>
        <div class="action-row">
          <button class="secondary-btn manual-save-btn">KAYDET</button>
          <button class="primary-btn close-day">GÜNÜ KAPAT <span>→</span></button>
        </div>
      </section>
    </div>

    <!-- KONUŞMA BALONU (Speech Bubble) -->
    <div class="speech-bubble-overlay" hidden>
      <div class="speech-bubble">
        <div class="bubble-header">
          <div class="bubble-customer-info">
            <span class="bubble-avatar" data-bubble-avatar>👤</span>
            <div>
              <strong data-bubble-name>Müşteri</strong>
              <span class="bubble-intent-badge sell" data-bubble-intent>🏷️ SATIŞ</span>
            </div>
          </div>
          <span class="bubble-voice-icon">🔊 8-BIT SES</span>
        </div>
        <div class="bubble-content" data-bubble-text>
          ...
        </div>
        <div class="bubble-footer">
          <span data-bubble-footer-copy>👆 Kapatmak ve tezgâha geçmek için ekrana dokun</span>
          <button class="bubble-dismiss-btn">DEVAM ET <span>→</span></button>
        </div>
      </div>
    </div>`;
