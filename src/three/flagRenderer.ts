export function drawCountryFlagOnCanvas(
  ctx: CanvasRenderingContext2D,
  code: string,
  w: number,
  h: number,
  fallbackEmoji: string,
  accentHex: string,
  countryName?: string
) {
  const upper = code.toUpperCase();

  if (upper === 'TR') {
    // Türkiye Bayrağı: Al zemin + beyaz hilal ve 5 köşeli yıldız
    ctx.fillStyle = '#E30A17';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.41;
    const cy = h * 0.5;
    const outerR = h * 0.25;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E30A17';
    ctx.beginPath();
    ctx.arc(cx + h * 0.0625, cy, h * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 5 köşeli yıldız
    const starCx = cx + h * 0.27;
    const starCy = cy;
    const starOuter = h * 0.115;
    const starInner = h * 0.045;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? starOuter : starInner;
      const angle = Math.PI + (i * Math.PI) / 5;
      const px = starCx + Math.cos(angle) * r;
      const py = starCy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (upper === 'DE') {
    // Almanya Bayrağı: Siyah - Kırmızı - Altın Sarısı
    const band = h / 3;
    ctx.fillStyle = '#0B0F14';
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#DD0000';
    ctx.fillRect(0, band, w, band);
    ctx.fillStyle = '#FFCE00';
    ctx.fillRect(0, band * 2, w, band + 1);
    return;
  }

  if (upper === 'FR') {
    const bw = w / 3;
    ctx.fillStyle = '#0055A4';
    ctx.fillRect(0, 0, bw, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bw, 0, bw, h);
    ctx.fillStyle = '#EF4135';
    ctx.fillRect(bw * 2, 0, bw + 1, h);
    return;
  }

  if (upper === 'IT') {
    const bw = w / 3;
    ctx.fillStyle = '#009246';
    ctx.fillRect(0, 0, bw, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bw, 0, bw, h);
    ctx.fillStyle = '#CE2B37';
    ctx.fillRect(bw * 2, 0, bw + 1, h);
    return;
  }

  if (upper === 'RU') {
    const band = h / 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#0039A6';
    ctx.fillRect(0, band, w, band);
    ctx.fillStyle = '#D52B1E';
    ctx.fillRect(0, band * 2, w, band + 1);
    return;
  }

  if (upper === 'UA') {
    ctx.fillStyle = '#0057B7';
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(0, h / 2, w, h / 2 + 1);
    return;
  }

  if (upper === 'AZ') {
    const band = h / 3;
    ctx.fillStyle = '#00B5E2';
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#EF3340';
    ctx.fillRect(0, band, w, band);
    ctx.fillStyle = '#509E2F';
    ctx.fillRect(0, band * 2, w, band + 1);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(w * 0.48, h * 0.5, h * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#EF3340';
    ctx.beginPath();
    ctx.arc(w * 0.51, h * 0.5, h * 0.095, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (upper === 'US') {
    const stripeH = h / 13;
    for (let i = 0; i < 13; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#B22234' : '#FFFFFF';
      ctx.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    ctx.fillStyle = '#3C3B6E';
    ctx.fillRect(0, 0, w * 0.42, stripeH * 7);
    ctx.fillStyle = '#FFFFFF';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        ctx.beginPath();
        ctx.arc(w * 0.04 + c * w * 0.065, h * 0.055 + r * h * 0.095, h * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  if (upper === 'GB') {
    ctx.fillStyle = '#012169';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = h * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
    ctx.strokeStyle = '#C8102E';
    ctx.lineWidth = h * 0.09;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(w * 0.41, 0, w * 0.18, h);
    ctx.fillRect(0, h * 0.36, w, h * 0.28);
    ctx.fillStyle = '#C8102E';
    ctx.fillRect(w * 0.44, 0, w * 0.12, h);
    ctx.fillRect(0, h * 0.41, w, h * 0.18);
    return;
  }

  if (upper === 'CN') {
    ctx.fillStyle = '#DE2910';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFDE00';
    ctx.beginPath();
    ctx.arc(w * 0.18, h * 0.28, h * 0.12, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(w * 0.33, h * (0.12 + i * 0.12), h * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (upper === 'JP') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#BC002D';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, h * 0.3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (upper === 'NL') {
    const band = h / 3;
    ctx.fillStyle = '#AE1C28';
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, band, w, band);
    ctx.fillStyle = '#21468B';
    ctx.fillRect(0, band * 2, w, band + 1);
    return;
  }

  if (upper === 'ES') {
    ctx.fillStyle = '#AA151B';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#F1BF00';
    ctx.fillRect(0, h * 0.25, w, h * 0.5);
    return;
  }

  if (upper === 'BR') {
    ctx.fillStyle = '#009C3B';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFDF00';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.12);
    ctx.lineTo(w * 0.88, h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.88);
    ctx.lineTo(w * 0.12, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#002776';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, h * 0.21, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Fallback high-contrast tactical national banner for any other country
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, accentHex || '#2563EB');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(2, h * 0.04);
  ctx.strokeRect(4, 4, w - 8, h - 8);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(h * 0.34)}px "Chakra Petch", sans-serif`;
  ctx.fillText(upper, w * 0.5, h * 0.42);
  if (countryName) {
    ctx.font = `600 ${Math.round(h * 0.14)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(countryName.slice(0, 16), w * 0.5, h * 0.74);
  } else if (fallbackEmoji) {
    ctx.font = `${Math.round(h * 0.25)}px sans-serif`;
    ctx.fillText(fallbackEmoji, w * 0.5, h * 0.74);
  }
}
