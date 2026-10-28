import { CanvasTexture } from "three";

/** Tezgâh üzerindeki antistatik mat için "CEP DÜKKÂNI" logolu ve alet yuvalı dinamik kanvas dokusu */
export function createWorkbenchMatTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  // Antistatik koyu yeşil kauçuk zemin
  ctx.fillStyle = "#102622";
  ctx.fillRect(0, 0, 1024, 1024);

  // Kılavuz ızgarası
  ctx.strokeStyle = "#183a34";
  ctx.lineWidth = 1.5;
  for (let x = 32; x < 1024; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x, 992);
    ctx.stroke();
  }
  for (let y = 32; y < 1024; y += 36) {
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(992, y);
    ctx.stroke();
  }

  // Dış çerçeve cetvel şeritleri
  ctx.strokeStyle = "#d7a958";
  ctx.lineWidth = 4;
  ctx.strokeRect(32, 32, 960, 960);

  ctx.fillStyle = "#d7a958";
  ctx.font = "bold 13px monospace";
  for (let x = 50; x <= 970; x += 50) {
    ctx.fillRect(x - 1, 32, 2, 12);
    ctx.fillRect(x - 1, 980, 2, 12);
    ctx.fillText(`${(x - 50) / 10}cm`, x - 12, 58);
  }

  // Sol alet yuvaları (Tornavida)
  ctx.strokeStyle = "#38bdf888";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(55, 170, 260, 340);
  ctx.fillStyle = "#38bdf8aa";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("🔍 BÜYÜTEÇ DOKU", 85, 205);

  ctx.strokeStyle = "#a78bfa88";
  ctx.strokeRect(55, 540, 260, 360);
  ctx.fillStyle = "#a78bfaaa";
  ctx.fillText("🪛 TORNAVİDA DOKU", 85, 575);

  // Sağ alet yuvası (Batarya Test Aleti)
  ctx.strokeStyle = "#f59e0b88";
  ctx.strokeRect(709, 170, 260, 730);
  ctx.fillStyle = "#f59e0baa";
  ctx.fillText("⚡ BATARYA TEST CİHAZI", 725, 205);
  ctx.font = "12px monospace";
  ctx.fillText("Şarj & Akım Analizörü", 745, 230);

  // Orta telefon kılavuz çerçevesi
  ctx.strokeStyle = "#94a3b866";
  ctx.strokeRect(386, 220, 252, 530);
  ctx.setLineDash([]);

  // Üstte ve altta büyük oyun logosu ve ismi: "CEP DÜKKÂNI"
  ctx.fillStyle = "#f3ca7f";
  ctx.font = "900 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CEP DÜKKÂNI", 512, 115);

  ctx.fillStyle = "#94d2bd";
  ctx.font = "bold 15px monospace";
  ctx.fillText("PROFESYONEL TELEFON EKSPERTİZ & TAMİR TEZGÂHI", 512, 142);

  // Alt ESD Logosu
  ctx.fillStyle = "#d7a95899";
  ctx.font = "bold 14px monospace";
  ctx.fillText("⚡ ESD SAFE ANTISTATIC WORKSTATION · AGY-2026", 512, 950);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
