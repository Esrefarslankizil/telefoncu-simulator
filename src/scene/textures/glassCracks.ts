/** Telefon camındaki gerçekçi kılcal çatlak veya büyük kırıkları çizen fonksiyon */
export function drawGlassCracks(ctx: CanvasRenderingContext2D, isMajor: boolean, uid: string): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "bevel";

  // Sabit ve tutarlı pozisyonlar için UID'den türetilen basit tohum
  let seed = 0;
  for (let i = 0; i < uid.length; i++) {
    seed = (seed * 31 + uid.charCodeAt(i)) % 10000;
  }
  const pseudoRng = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  if (isMajor) {
    // 1. BÜYÜK KIRIK / ÖRÜMCEK AĞI PARÇALANMIŞ CAM (Büyük Kırıklar)
    const impactX = 140 + Math.floor(pseudoRng(1) * 230);
    const impactY = 280 + Math.floor(pseudoRng(2) * 360);

    // Ezilmiş cam çekirdeği (Impact core)
    const impactGrad = ctx.createRadialGradient(impactX, impactY, 2, impactX, impactY, 32);
    impactGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    impactGrad.addColorStop(0.3, "rgba(230, 245, 255, 0.75)");
    impactGrad.addColorStop(0.7, "rgba(180, 210, 230, 0.45)");
    impactGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = impactGrad;
    ctx.beginPath();
    ctx.arc(impactX, impactY, 32, 0, Math.PI * 2);
    ctx.fill();

    // Dairesel örümcek ağı halkaları
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.6;
    for (const r of [18, 36, 62, 95]) {
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2; a += 0.28) {
        const rad = r + Math.sin(a * 5.2 + seed) * (r * 0.16);
        const px = impactX + Math.cos(a) * rad;
        const py = impactY + Math.sin(a) * rad;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Ana yayılım kırık hatları (10 adet dışa yayılan kesik hat)
    const angles = [0.15, 0.65, 1.25, 1.85, 2.5, 3.15, 3.8, 4.45, 5.1, 5.75];
    for (let idx = 0; idx < angles.length; idx++) {
      const ang = angles[idx]!;
      let curX = impactX + Math.cos(ang) * 14;
      let curY = impactY + Math.sin(ang) * 14;
      const rayLen = 160 + pseudoRng(idx * 7) * 260;

      ctx.beginPath();
      ctx.moveTo(curX, curY);

      let dist = 0;
      let curAngle = ang;
      while (dist < rayLen) {
        const step = 20 + pseudoRng(dist + idx) * 22;
        dist += step;
        curAngle += (pseudoRng(dist * 3 + idx) - 0.48) * 0.4;
        curX += Math.cos(curAngle) * step;
        curY += Math.sin(curAngle) * step;

        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = Math.max(2.0, 3.8 - (dist / rayLen) * 2.0);
        ctx.lineTo(curX, curY);
      }
      ctx.stroke();

      // Üst parlak ışık kırılması hattı
      curX = impactX + Math.cos(ang) * 14;
      curY = impactY + Math.sin(ang) * 14;
      dist = 0;
      curAngle = ang;
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      while (dist < rayLen) {
        const step = 20 + pseudoRng(dist + idx) * 22;
        dist += step;
        curAngle += (pseudoRng(dist * 3 + idx) - 0.48) * 0.4;
        curX += Math.cos(curAngle) * step;
        curY += Math.sin(curAngle) * step;

        ctx.strokeStyle = "rgba(240, 248, 255, 0.9)";
        ctx.lineWidth = Math.max(1.1, 2.2 - (dist / rayLen) * 1.2);
        ctx.lineTo(curX, curY);
      }
      ctx.stroke();
    }
  } else {
    // 2. KÜÇÜK VE KILCAL ÇATLAKLAR (Genellikle küçük, ince çizgiler)
    const crackSets = [
      [
        { x: 42, y: 180 },
        { x: 105, y: 235 },
        { x: 175, y: 270 },
        { x: 250, y: 320 },
        { x: 310, y: 385 },
        { x: 360, y: 440 },
      ],
      [
        { x: 175, y: 270 },
        { x: 215, y: 240 },
        { x: 270, y: 215 },
        { x: 320, y: 195 },
      ],
      [
        { x: 480, y: 650 },
        { x: 410, y: 695 },
        { x: 335, y: 735 },
        { x: 260, y: 790 },
      ],
    ];

    for (const path of crackSets) {
      // Gölge / derinlik çizgisi
      ctx.beginPath();
      ctx.moveTo(path[0]!.x, path[0]!.y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i]!.x, path[i]!.y);
      }
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // İnce ve keskin parlak kılcal çizgi
      ctx.beginPath();
      ctx.moveTo(path[0]!.x, path[0]!.y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i]!.x, path[i]!.y);
      }
      ctx.strokeStyle = "rgba(240, 248, 255, 0.92)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  ctx.restore();
}
