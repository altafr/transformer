import * as THREE from 'three';

// 2D overlay drawn after the 3D frame is tone mapped, so text stays crisp and colour-true.
export const SANS = '"InterW", "Inter", "DejaVu Sans", sans-serif';
export const MONO = '"MonoW", "JetBrains Mono", "DejaVu Sans Mono", monospace';
const INK = '#161a2b';
const INK2 = '#424860';
const INDIGO = '#4f46e5';

export class Overlay {
  constructor(canvas, camera) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.camera = camera;
    this.W = canvas.width; this.H = canvas.height; this._v = new THREE.Vector3();
  }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H); }

  project(p) {
    const v = this._v.set(p[0], p[1], p[2]).project(this.camera);
    return [(v.x + 1) / 2 * this.W, (1 - v.y) / 2 * this.H, v.z < 1];
  }

  rr(x, y, w, h, r) {
    const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  scrim(x, y, w, h, r, alpha, fill = 'rgba(252,251,249,0.86)') {
    const c = this.ctx; c.save(); c.globalAlpha = alpha;
    c.shadowColor = 'rgba(40,36,30,0.10)'; c.shadowBlur = 28; c.shadowOffsetY = 6;
    this.rr(x, y, w, h, r); c.fillStyle = fill; c.fill(); c.restore();
  }

  // Large heading, top centre.
  headline(text, a, sub = null, subA = a) {
    if (a <= 0.001 && subA <= 0.001) return;
    const c = this.ctx; c.save();
    c.font = `700 50px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width;
    let subW = 0;
    if (sub) { c.font = `500 27px ${SANS}`; subW = c.measureText(sub).width; }
    const boxW = Math.max(w, subW * Math.min(1, subA * 3)) + 88, boxH = sub ? 92 + 46 * Math.min(1, subA * 2) : 92, y0 = 44 + (1 - a) * -10;
    this.scrim(this.W / 2 - boxW / 2, y0, boxW, boxH, 26, Math.max(a, subA) * 0.95);
    c.globalAlpha = a; c.fillStyle = INK; c.font = `700 50px ${SANS}`;
    c.fillText(text, this.W / 2, y0 + 48);
    if (sub) { c.globalAlpha = subA; c.fillStyle = INK2; c.font = `500 27px ${SANS}`; c.fillText(sub, this.W / 2, y0 + 101); }
    c.restore();
  }

  title(text, a, kicker) {
    if (a <= 0.001) return;
    const c = this.ctx; c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 64px ${SANS}`; const w = c.measureText(text).width;
    this.scrim(this.W / 2 - w / 2 - 56, 70, w + 112, 160, 32, a * 0.95);
    c.fillStyle = INDIGO; c.font = `600 22px ${MONO}`; c.fillText(kicker, this.W / 2, 112);
    c.fillStyle = INK; c.font = `700 64px ${SANS}`; c.fillText(text, this.W / 2, 172);
    c.restore();
  }

  // Bottom caption in a pill.
  caption(text, a, y = this.H - 92, opts = {}) {
    if (a <= 0.001) return;
    const c = this.ctx; c.save(); c.font = `${opts.weight ?? 500} ${opts.size ?? 26}px ${opts.mono ? MONO : SANS}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width + 60, h = (opts.size ?? 26) + 30;
    const x = opts.x ?? this.W / 2;
    this.scrim(x - w / 2, y - h / 2, w, h, h / 2, a * 0.92);
    c.globalAlpha = a; c.fillStyle = opts.color ?? INK2; c.fillText(text, x, y + 1); c.restore();
  }

  // Monospace label pinned to a world point, offset in pixels with a thin leader line.
  tag(world, text, a, o = {}) {
    if (a <= 0.001) return;
    const [px, py, ok] = this.project(world); if (!ok) return;
    const dx = o.dx ?? 0, dy = o.dy ?? -40;
    const c = this.ctx; c.save();
    const size = o.size ?? 20;
    c.font = `${o.weight ?? 500} ${size}px ${o.sans ? SANS : MONO}`; c.textBaseline = 'middle';
    const lines = Array.isArray(text) ? text : [text];
    const tw = Math.max(...lines.map((l) => c.measureText(l).width));
    const padX = 14, lh = size * 1.35, h = lines.length * lh + 14, w = tw + padX * 2;
    const align = o.align ?? 'center';
    const bx = align === 'center' ? px + dx - w / 2 : align === 'left' ? px + dx : px + dx - w;
    const by = py + dy - h / 2;
    if (o.leader !== false && (Math.abs(dx) + Math.abs(dy)) > 18) {
      c.globalAlpha = a * 0.7; c.strokeStyle = o.accent ?? '#9aa1b8'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px, py);
      const ex = Math.min(Math.max(px, bx + 8), bx + w - 8), ey = py < by ? by : py > by + h ? by + h : py;
      c.lineTo(ex, ey); c.stroke();
      c.beginPath(); c.arc(px, py, 3.5, 0, Math.PI * 2); c.fillStyle = o.accent ?? '#9aa1b8'; c.fill();
    }
    this.scrim(bx, by, w, h, 12, a * (o.scrim ?? 0.9), o.fill);
    if (o.accent) { c.globalAlpha = a; c.fillStyle = o.accent; this.rr(bx, by, 5, h, 2.5); c.fill(); }
    c.globalAlpha = a; c.fillStyle = o.color ?? INK; c.textAlign = 'left';
    lines.forEach((l, i) => c.fillText(l, bx + padX, by + 7 + lh * (i + 0.5)));
    c.restore();
  }

  // Plain text pinned to a world point (no scrim) — used for small token names under vectors.
  text(world, text, a, o = {}) {
    if (a <= 0.001) return;
    const [px, py, ok] = this.project(world); if (!ok) return;
    const c = this.ctx; c.save(); c.globalAlpha = a;
    c.font = `${o.weight ?? 600} ${o.size ?? 20}px ${o.sans ? SANS : MONO}`;
    c.textAlign = o.align ?? 'center'; c.textBaseline = 'middle';
    if (o.halo !== false) { c.lineWidth = 6; c.strokeStyle = 'rgba(250,249,246,0.9)'; c.lineJoin = 'round'; c.strokeText(text, px + (o.dx ?? 0), py + (o.dy ?? 0)); }
    c.fillStyle = o.color ?? INK; c.fillText(text, px + (o.dx ?? 0), py + (o.dy ?? 0)); c.restore();
  }

  // Screen-space panel of candidate next tokens.
  candidates(x, y, rows, a, opts = {}) {
    if (a <= 0.001) return;
    const c = this.ctx; c.save();
    const w = 360, rowH = 50, h = 92 + rows.length * rowH + 40;
    this.scrim(x, y, w, h, 22, a * 0.95);
    c.globalAlpha = a; c.textBaseline = 'middle';
    c.fillStyle = INK; c.font = `700 24px ${SANS}`; c.fillText(opts.title ?? 'Next-token candidates', x + 26, y + 40);
    rows.forEach((r, i) => {
      const yy = y + 92 + i * rowH; const sel = opts.selected === i;
      if (sel) { c.globalAlpha = a * opts.selA; this.rr(x + 14, yy - 22, w - 28, 44, 12); c.fillStyle = 'rgba(79,70,229,0.12)'; c.fill(); c.globalAlpha = a; }
      c.font = `600 23px ${MONO}`; c.fillStyle = sel && opts.selA > 0.5 ? INDIGO : INK;
      c.fillText(`"${r[0]}"`, x + 28, yy);
      const bw = 130 * r[1] / 0.64;
      this.rr(x + 170, yy - 8, Math.max(bw, 4), 16, 8); c.fillStyle = sel && opts.selA > 0.5 ? INDIGO : r[2]; c.fill();
      c.font = `600 22px ${MONO}`; c.fillStyle = INK2; c.textAlign = 'right';
      c.fillText(`${Math.round(r[1] * 100)}%`, x + w - 24, yy); c.textAlign = 'left';
    });
    c.font = `500 18px ${MONO}`; c.fillStyle = '#7b8199';
    c.fillText('Illustrative probabilities', x + 26, y + h - 30);
    c.restore();
  }

  // The generation cycle as a row of chips; `k` (fractional) marks the active step.
  cycle(steps, a, k, y) {
    if (a <= 0.001) return;
    const c = this.ctx; c.save(); c.font = `600 22px ${MONO}`; c.textBaseline = 'middle';
    const gap = 40, widths = steps.map((s) => c.measureText(s).width + 36);
    const total = widths.reduce((p, q) => p + q, 0) + gap * (steps.length - 1);
    let x = this.W / 2 - total / 2;
    this.scrim(x - 22, y - 38, total + 44, 76, 38, a * 0.93);
    steps.forEach((s, i) => {
      const on = Math.max(0, 1 - Math.abs(k - i) * 1.4);
      c.globalAlpha = a; this.rr(x, y - 22, widths[i], 44, 22);
      c.fillStyle = `rgba(79,70,229,${0.08 + 0.85 * on})`; c.fill();
      c.fillStyle = on > 0.5 ? '#ffffff' : INK; c.textAlign = 'center'; c.fillText(s, x + widths[i] / 2, y + 1);
      if (i < steps.length - 1) { c.fillStyle = '#8b90a8'; c.fillText('→', x + widths[i] + gap / 2, y); }
      x += widths[i] + gap;
    });
    c.restore();
  }

  // Thin chapter progress in the bottom-left corner.
  // Small design credit, bottom-right on every frame.
  credit(text, a) {
    if (a <= 0.001) return;
    const c = this.ctx; c.save(); c.globalAlpha = a * 0.85;
    c.font = `500 18px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = INK2; c.fillText(text, this.W - 56, this.H - 52);
    c.restore();
  }

  // Loss curve panel: one point per training step; `upto` (fractional) reveals them in order.
  lossChart(x, y, values, upto, a) {
    if (a <= 0.001) return;
    const c = this.ctx; c.save();
    const w = 380, h = 230, px = x + 56, py = y + 64, pw = w - 84, ph = h - 112, vmax = 1.4;
    this.scrim(x, y, w, h, 22, a * 0.95);
    c.globalAlpha = a; c.textBaseline = 'middle';
    c.fillStyle = INK; c.font = `700 22px ${SANS}`; c.fillText('Loss (error)', x + 24, y + 34);
    c.font = `500 15px ${MONO}`; c.fillStyle = '#7b8199'; c.textAlign = 'right'; c.fillText('lower is better', x + w - 22, y + 34);
    c.strokeStyle = '#d9d6d0'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px, py + ph); c.lineTo(px + pw, py + ph); c.stroke();
    c.fillStyle = '#7b8199'; c.font = `500 14px ${MONO}`;
    [0, 0.5, 1.0].forEach((v) => c.fillText(v.toFixed(1), px - 10, py + ph - (v / vmax) * ph));
    c.textAlign = 'center';
    values.forEach((_, i) => c.fillText(String(i), px + (i / (values.length - 1)) * pw, py + ph + 18));
    c.fillText('training step', px + pw / 2, py + ph + 38);
    const pts = values.map((v, i) => [px + (i / (values.length - 1)) * pw, py + ph - (v / vmax) * ph]);
    const n = Math.min(values.length - 1, Math.floor(upto));
    c.strokeStyle = INDIGO; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath();
    for (let i = 0; i <= n; i++) i ? c.lineTo(...pts[i]) : c.moveTo(...pts[i]);
    const f = upto - n;
    if (n < values.length - 1 && f > 0) c.lineTo(pts[n][0] + (pts[n + 1][0] - pts[n][0]) * f, pts[n][1] + (pts[n + 1][1] - pts[n][1]) * f);
    c.stroke();
    for (let i = 0; i <= n; i++) {
      c.beginPath(); c.arc(...pts[i], i === n ? 6 : 4.5, 0, Math.PI * 2); c.fillStyle = i === n ? INDIGO : '#a5a1f2'; c.fill();
    }
    c.fillStyle = INDIGO; c.font = `600 17px ${MONO}`; c.textAlign = 'left';
    c.fillText(values[n].toFixed(2), Math.min(pts[n][0] + 12, x + w - 60), pts[n][1] - 16);
    c.restore();
  }

  chapter(n, label, a, progress, count = 7) {
    if (a <= 0.001) return;
    const c = this.ctx; c.save(); c.globalAlpha = a * 0.9;
    c.font = `600 18px ${MONO}`; c.fillStyle = INDIGO; c.textBaseline = 'middle';
    c.fillText(`0${n}`, 56, this.H - 52);
    c.fillStyle = INK2; c.font = `500 18px ${MONO}`; c.fillText(label, 92, this.H - 52);
    for (let i = 0; i < count; i++) {
      this.rr(56 + i * 34, this.H - 30, 28, 4, 2); c.fillStyle = i < n - 1 ? '#a5a1f2' : i === n - 1 ? INDIGO : '#d9d6d0';
      c.globalAlpha = a * (i === n - 1 ? 0.35 + 0.65 * progress : 0.9); c.fill();
    }
    c.restore();
  }
}
