// Builds "The Transformer Decoder, Explained" as an editable .pptx with native
// PowerPoint click animations and slide transitions.
//
//   npm install            (in this folder: pptxgenjs + jszip)
//   node build-deck.js     -> transformer-decoder-explained.pptx
//
// Every diagram is made of native shapes. A shape whose objectName starts with
// "anim-<click>-<effect>-<delayMs>-" is given an entrance animation on that click
// by addAnimations() after the deck is written.

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const JSZip = require("jszip");

// DECK=essentials builds the separate two-slide deck (decoder overview + neural-network basics)
const ESSENTIALS = process.env.DECK === "essentials";
const FULL = !ESSENTIALS;
const OUT = path.join(__dirname, ESSENTIALS ? "decoder-essentials.pptx" : "transformer-decoder-explained.pptx");
const F = "Inter"; // Google Font (fonts.google.com/specimen/Inter)

const C = {
  ink: "0F172A", body: "334155", muted: "64748B", faint: "94A3B8", line: "CBD5E1",
  bg2: "F1F5F9", card: "F8FAFC", white: "FFFFFF",
  tok: "D97706", tokL: "FEF3C7", tokM: "FBBF24",
  pos: "2563EB", posL: "DBEAFE",
  att: "7C3AED", attL: "EDE9FE", attM: "A78BFA",
  ffn: "0D9488", ffnL: "CCFBF1", ffnM: "5EEAD4",
  norm: "475569", normL: "E2E8F0",
  out: "E11D48", outL: "FFE4E6",
  dark: "12102B", dark2: "1E1B4B", darkText: "C7D2FE",
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.title = "The Transformer Decoder, Explained";
pres.author = "Transformer explainer";
pres.theme = { headFontFace: F, bodyFontFace: F };
const S = pres.shapes;

// ---------- helpers ----------
let uid = 0;
const A = (step, eff = "fade", delay = 0) => `anim-${step}-${eff}-${delay}-${uid++}`;

function mix(a, b, t) {
  const pa = [0, 2, 4].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [0, 2, 4].map((i) => parseInt(b.slice(i, i + 2), 16));
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
}
const chipW = (t, size = 13) => Math.max(0.42, 0.28 + t.length * size * 0.0088);

function text(s, t, o) {
  s.addText(t, Object.assign({ fontFace: F, fontSize: 12, color: C.body, margin: 0, valign: "top", isTextBox: true }, o));
}
function chip(s, t, x, y, o = {}) {
  const size = o.size || 13;
  const w = o.w || chipW(t, size);
  s.addText(t, {
    shape: S.ROUNDED_RECTANGLE, x, y, w, h: o.h || 0.46, rectRadius: 0.07,
    fill: { color: o.fill || C.white }, line: { color: o.line || C.line, width: o.lw || 1 },
    color: o.color || C.ink, fontFace: F, fontSize: size, bold: o.bold !== false,
    align: "center", valign: "middle", margin: 0, objectName: o.anim,
  });
  return w;
}
function box(s, t, x, y, w, h, o = {}) {
  s.addText(t, {
    shape: o.shape || S.ROUNDED_RECTANGLE, x, y, w, h, rectRadius: o.r ?? 0.1,
    fill: { color: o.fill || C.card }, line: o.line ? { color: o.line, width: o.lw || 1, dashType: o.dash } : { type: "none" },
    color: o.color || C.ink, fontFace: F, fontSize: o.size || 12, bold: !!o.bold,
    align: o.align || "center", valign: o.valign || "middle", margin: o.margin ?? 0.08,
    objectName: o.anim, shadow: o.shadow, rotate: o.rotate,
  });
}
function rect(s, x, y, w, h, o = {}) {
  s.addShape(o.shape || S.RECTANGLE, {
    x, y, w, h, rectRadius: o.r, fill: o.fill ? { color: o.fill, transparency: o.tr } : { type: "none" },
    line: o.line ? { color: o.line, width: o.lw || 1, dashType: o.dash } : { type: "none" },
    objectName: o.anim, rotate: o.rotate,
  });
}
function line(s, x1, y1, x2, y2, o = {}) {
  s.addShape(S.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color: o.color || C.faint, width: o.w || 1.75, dashType: o.dash, endArrowType: o.head === false ? undefined : "triangle" },
    objectName: o.anim,
  });
}
// a strip of colored cells = a vector
function vec(s, x, y, vals, colorFn, o = {}) {
  const cw = o.cw || 0.2, ch = o.ch || 0.3, gap = o.gap ?? 0.03;
  vals.forEach((v, i) => {
    const xx = o.vertical ? x : x + i * (cw + gap);
    const yy = o.vertical ? y + i * (ch + gap) : y;
    s.addShape(S.RECTANGLE, {
      x: xx, y: yy, w: cw, h: ch, fill: { color: colorFn(v) }, line: { color: C.white, width: 0.5 },
      objectName: o.anim ? o.anim(i) : undefined,
    });
  });
}
const diverge = (pos, neg) => (v) => (v >= 0 ? mix("FFFFFF", pos, 0.15 + 0.85 * v) : mix("FFFFFF", neg, 0.15 + 0.85 * -v));

// card with bold heading + body runs
function card(s, x, y, w, h, title, body, o = {}) {
  const runs = [{ text: title, options: { bold: true, color: o.tc || C.ink, fontSize: o.ts || 13, breakLine: true } }];
  const parts = Array.isArray(body) ? body : [body];
  parts.forEach((p, i) => {
    const r = typeof p === "string" ? { text: p, options: {} } : p;
    runs.push({ text: r.text, options: Object.assign({ fontSize: o.bs || 11, color: C.body, paraSpaceBefore: 4, breakLine: i < parts.length - 1 }, r.options) });
  });
  s.addText(runs, {
    shape: S.ROUNDED_RECTANGLE, x, y, w, h, rectRadius: 0.1,
    fill: { color: o.fill || C.card }, line: o.line ? { color: o.line, width: 1 } : { type: "none" },
    fontFace: F, valign: o.valign || "top", margin: o.margin ?? [10, 12, 10, 12], objectName: o.anim,
  });
}

// one row of the running sentence: tokens (strings; "*" prefix = model-generated) -> predicted token
function seqRow(s, x, y, toks, pred, o = {}) {
  const size = o.size || 13, h = o.h || 0.46, gap = o.gap ?? 0.08;
  let cx = x;
  toks.forEach((t) => {
    const gen = t.startsWith("*");
    const label = gen ? t.slice(1) : t;
    cx += chip(s, label, cx, y, { size, h, fill: gen ? C.outL : C.white, line: gen ? C.out : C.line, anim: o.anim && o.anim() }) + gap;
  });
  if (pred) {
    line(s, cx + 0.04, y + h / 2, cx + 0.42, y + h / 2, { color: C.out, w: 1.75, anim: o.anim && o.anim() });
    cx += 0.5;
    const pw = chip(s, pred, cx, y, { size, h, fill: C.out, line: C.out, color: C.white, anim: o.animPred ? o.animPred() : o.anim && o.anim() });
    cx += pw;
  }
  return cx;
}

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.white },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.6, w: 12.1, h: 0.55, fontFace: F, fontSize: 26, bold: true, color: C.ink, align: "left", valign: "top", margin: 0 }, text: "" } },
    { text: { text: "The Transformer Decoder, Explained", options: { x: 0.6, y: 7.02, w: 6, h: 0.25, fontFace: F, fontSize: 9, color: C.faint, margin: 0 } } },
  ],
  slideNumber: { x: 12.23, y: 7.02, w: 0.5, h: 0.25, fontFace: F, fontSize: 9, color: C.faint, align: "right" },
});
pres.defineSlideMaster({ title: "DARK", background: { color: C.dark }, objects: [] });

function contentSlide(section, kicker, kickerColor, title, lede) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  text(s, kicker, { x: 0.6, y: 0.34, w: 8, h: 0.24, fontSize: 10, bold: true, color: kickerColor, charSpacing: 2 });
  s.addText(title, { placeholder: "title" });
  if (lede) text(s, lede, { x: 0.6, y: 1.2, w: 12.1, h: 0.36, fontSize: 13, color: C.muted });
  return s;
}

const SENT = ["The", "cat", "sat", "on", "the"];

// =====================================================================
// 1. Title
// =====================================================================
if (FULL) pres.addSection({ title: "Introduction" });
if (FULL) {
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Introduction" });
  text(s, "HOW LARGE LANGUAGE MODELS WRITE", { x: 0.8, y: 0.85, w: 9, h: 0.3, fontSize: 11, bold: true, color: C.tokM, charSpacing: 3 });
  s.addText("The Transformer Decoder, Explained", { x: 0.8, y: 1.2, w: 11.5, h: 0.8, fontFace: F, fontSize: 38, bold: true, color: C.white, margin: 0, isTextBox: true });
  text(s, "How a model like GPT turns “The cat sat on the” into “mat” — one token at a time", { x: 0.8, y: 2.05, w: 11.5, h: 0.4, fontSize: 15, color: C.darkText });

  // input -> decoder -> next token
  let x = 0.8;
  SENT.forEach((t, i) => {
    x += chip(s, t, x, 3.95, { size: 16, h: 0.62, w: 0.92, fill: C.dark2, line: "4338CA", color: C.white, anim: A(1, "rise", i * 120) }) + 0.12;
  });
  line(s, 6.0, 4.26, 6.75, 4.26, { color: C.attM, w: 2.5, anim: A(2, "wipe") });
  // decoder: three stacked plates for depth
  rect(s, 7.16, 3.28, 2.7, 1.55, { shape: S.ROUNDED_RECTANGLE, r: 0.12, fill: "3B2A86", anim: A(2, "fade", 100) });
  rect(s, 7.0, 3.43, 2.7, 1.55, { shape: S.ROUNDED_RECTANGLE, r: 0.12, fill: "5B3FC4", anim: A(2, "fade", 200) });
  s.addText([
    { text: "Decoder", options: { fontSize: 20, bold: true, color: C.white, breakLine: true } },
    { text: "a stack of identical blocks", options: { fontSize: 11, color: "E9E5FF" } },
  ], { shape: S.ROUNDED_RECTANGLE, x: 6.84, y: 3.58, w: 2.7, h: 1.55, rectRadius: 0.12, fill: { color: C.att }, fontFace: F, align: "center", valign: "middle", margin: 0, objectName: A(2, "fade", 300) });
  line(s, 9.75, 4.26, 10.5, 4.26, { color: C.out, w: 2.5, anim: A(3, "wipe") });
  chip(s, "mat", 10.65, 3.95, { size: 18, h: 0.62, w: 1.3, fill: C.out, line: "FB7185", lw: 2, color: C.white, anim: A(3, "zoom", 300) });
  text(s, "next token", { x: 10.65, y: 4.65, w: 1.3, h: 0.3, fontSize: 10, color: "FDA4AF", align: "center", objectName: A(3, "fade", 500) });
  text(s, "input so far", { x: 0.8, y: 4.65, w: 5.1, h: 0.3, fontSize: 10, color: C.darkText, align: "center", objectName: A(1, "fade", 600) });

  box(s, [
    { text: "Core question  ", options: { bold: true, color: C.tokM } },
    { text: "Given the words so far, how does the model decide what comes next?", options: { color: C.white } },
  ], 0.8, 5.75, 11.15, 0.62, { fill: C.dark2, size: 14, align: "left", margin: [0, 16, 0, 16], anim: A(4, "rise") });

  s.addNotes(`Welcome. Today we open up the engine inside every GPT-style model: the transformer decoder.

We'll follow ONE sentence through the whole talk: “The cat sat on the mat.” Every slide uses it, so you always have something concrete to hold on to.

[CLICK] Here's our starting point: the model has already seen “The cat sat on the”.
[CLICK] Those words go into the decoder — a stack of identical blocks we'll open up one by one.
[CLICK] Out comes a single prediction: “mat”.
[CLICK] And that's the core question for today: given the words so far, how does the model decide what comes next?

Spoiler: everything an LLM does — chatting, coding, summarising — is this one trick repeated: predict the next token.`);
}

// ---------- plotting helpers (warm-up slides) ----------
// returns a mapper from data coords to slide coords; draws axes (at zero when o.zero)
function plotArea(s, x, y, w, h, o) {
  const map = (dx, dy) => [x + ((dx - o.x0) / (o.x1 - o.x0)) * w, y + h - ((dy - o.y0) / (o.y1 - o.y0)) * h];
  const [ax, ay] = o.zero ? map(0, 0) : [x, y + h];
  line(s, x, ay, x + w, ay, { color: C.line, w: 1, head: false, anim: o.anim });
  line(s, ax, y, ax, y + h, { color: C.line, w: 1, head: false, anim: o.anim });
  return map;
}
function polyline(s, pts, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    line(s, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { color: o.color, w: o.w || 2.25, dash: o.dash, head: false, anim: o.anim && o.anim(i) });
  }
}
function dot(s, x, y, d, fill, anim) { rect(s, x - d / 2, y - d / 2, d, d, { shape: S.OVAL, fill, anim }); }
// a "model" drawn as a box of weight sliders; knobs can be animated with "mv" motion effects
function sliderModel(s, x, y, w, h, fracs, o = {}) {
  rect(s, x, y, w, h, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: o.fill || C.attL, anim: o.anim && o.anim("box") });
  text(s, o.title || "Model", { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.26, fontSize: 11, bold: true, color: C.att, objectName: o.anim && o.anim("box") });
  const t0 = x + 0.4, t1 = x + w - 0.2;
  fracs.forEach((f, i) => {
    const yy = y + 0.55 + i * 0.27;
    text(s, `w${i + 1}`, { x: x + 0.1, y: yy - 0.1, w: 0.28, h: 0.2, fontSize: 8, color: C.muted, objectName: o.anim && o.anim("box") });
    line(s, t0, yy, t1, yy, { color: C.attM, w: 2, head: false, anim: o.anim && o.anim("box") });
    rect(s, t0 + f * (t1 - t0) - 0.08, yy - 0.08, 0.16, 0.16, { shape: S.OVAL, fill: C.att, line: C.white, lw: 1, anim: o.knob ? o.knob(i) : o.anim && o.anim("box") });
  });
}

// =====================================================================
// W0. Warm-up: weights are dials that learn
// =====================================================================
if (FULL) pres.addSection({ title: "Warm-up" });
// a round dial; the needle is a thin wedge centred on the knob so a spin effect turns it in place
function dial(s, cx, cy, r, val, o = {}) {
  rect(s, cx - r, cy - r, 2 * r, 2 * r, { shape: S.OVAL, fill: C.white, line: C.attM, lw: 2.5 });
  for (let v = -3; v <= 3; v++) {
    const a = (v * 45 * Math.PI) / 180, rr = r + 0.13;
    dot(s, cx + rr * Math.sin(a), cy - rr * Math.cos(a), v === 0 ? 0.07 : 0.05, v === 0 ? C.muted : C.line);
  }
  text(s, "−", { x: cx - r - 0.3, y: cy + r * 0.8, w: 0.3, h: 0.3, fontSize: 14, bold: true, color: C.out, align: "center" });
  text(s, "+", { x: cx + r, y: cy + r * 0.8, w: 0.3, h: 0.3, fontSize: 14, bold: true, color: C.ffn, align: "center" });
  // needle: a thin pie slice from the centre to the rim, pointing up at 0; its box is the whole knob, so it spins in place
  const nr = r * 0.88;
  s.addShape(S.PIE, { x: cx - nr, y: cy - nr, w: 2 * nr, h: 2 * nr, angleRange: [263, 277], rotate: val * 45, fill: { color: C.att }, line: { type: "none" }, objectName: o.spin });
  dot(s, cx, cy, 0.2, C.ink);
}
if (FULL) {
  const s = contentSlide("Warm-up", "02 · WARM-UP · WEIGHTS ARE DIALS", C.pos, "Weights are dials that learn",
    "A model’s knowledge is nothing more than where its dials are set. Learning = turning the dials, a little at a time.");
  text(s, "Toy model: “Will the cat sit here?”  3 inputs, 3 dials", { x: 0.6, y: 1.8, w: 7.4, h: 0.28, fontSize: 12, bold: true, color: C.ink });
  const dials = [
    { t: "soft?", x: 1.35, v: 0.2, turns: ["spp45", null, "spp36"] },
    { t: "warm?", x: 3.05, v: -0.5, turns: ["spp54", null, "spp36"] },
    { t: "wet?", x: 4.75, v: 0.6, turns: [null, "spn117", "spn23"] },
  ];
  const cy = 2.95, r = 0.55;
  dials.forEach((d) => line(s, d.x, cy, 5.85, cy, { color: C.line, w: 1.25 }));
  text(s, "input × dial, all added up", { x: 5.35, y: cy - 0.62, w: 1.7, h: 0.22, fontSize: 9, italic: true, color: C.muted, align: "center" });
  dials.forEach((d, i) => {
    // one needle, turned on several clicks: its name carries one anim token per turn
    const spins = d.turns.map((t, k) => (t ? A(k + 1, t, 300 + i * 150) : null)).filter(Boolean);
    dial(s, d.x, cy, r, d.v, { spin: spins.join("~") });
    text(s, d.t, { x: d.x - 0.6, y: cy + r + 0.22, w: 1.2, h: 0.26, fontSize: 12, bold: true, color: C.ink, align: "center" });
    text(s, `start ${d.v > 0 ? "+" : "−"}${Math.abs(d.v).toFixed(1)}`, { x: d.x - 0.6, y: cy + r + 0.48, w: 1.2, h: 0.22, fontSize: 9.5, color: C.muted, align: "center" });
  });
  box(s, "Σ", 5.9, cy - 0.3, 0.6, 0.6, { shape: S.OVAL, fill: C.att, color: C.white, size: 16, bold: true, margin: 0 });
  line(s, 6.53, cy, 6.8, cy, { color: C.faint, w: 1.5 });
  box(s, [{ text: "will sit?", options: { fontSize: 9, color: C.muted, breakLine: true } }, { text: "a yes / no guess", options: { fontSize: 10.5, bold: true, color: C.ink } }], 6.85, cy - 0.4, 1.3, 0.8, { fill: C.white, line: C.line });

  // training examples, one per click
  const ex = [
    { spot: "Mat", feat: "soft · warm · dry", truth: "cat sat ✓", said: "model said 30%", fix: "→ turn soft and warm up", c: C.ffn },
    { spot: "Puddle", feat: "wet · cold", truth: "cat left ✗", said: "model said 55%", fix: "→ turn wet way down", c: C.out },
    { spot: "Sofa", feat: "soft · warm · dry", truth: "cat sat ✓", said: "model said 85%", fix: "→ small nudges; nearly right", c: C.ffn },
  ];
  ex.forEach((e, k) => {
    const y = 4.15 + k * 0.62;
    s.addText([
      { text: `Example ${k + 1}: ${e.spot}  `, options: { bold: true, color: C.ink } },
      { text: `${e.feat}  ·  `, options: { color: C.muted } },
      { text: `${e.truth}  ·  `, options: { bold: true, color: e.c } },
      { text: `${e.said}  `, options: { color: C.body } },
      { text: e.fix, options: { bold: true, color: C.att } },
    ], { shape: S.ROUNDED_RECTANGLE, x: 0.6, y, w: 7.55, h: 0.5, rectRadius: 0.08, fill: { color: C.card }, line: { color: C.line, width: 1 }, fontFace: F, fontSize: 10.5, valign: "middle", margin: [10, 8, 0, 0], objectName: A(k + 1, "rise") });
  });
  s.addText([
    { text: "After training:  soft +2.0 · warm +1.5 · wet −2.5", options: { bold: true, color: C.att, breakLine: true } },
    { text: "Nobody wrote “cats like soft, warm, dry places”. It is stored in where the dials ended up.", options: { color: C.body, fontSize: 10.5 } },
  ], { shape: S.ROUNDED_RECTANGLE, x: 0.6, y: 6.05, w: 7.55, h: 0.68, rectRadius: 0.08, fill: { color: C.attL }, fontFace: F, fontSize: 11.5, valign: "middle", margin: [12, 8, 0, 0], objectName: A(4, "rise") });

  card(s, 8.45, 1.8, 4.25, 1.4, "A weight = how much an input matters", [
    "Turned to + : pushes the answer toward yes.",
    "Turned to − : pushes toward no.   Near 0 : ignored.",
  ], { fill: C.attL, tc: C.att, ts: 12, bs: 10.5 });
  card(s, 8.45, 3.35, 4.25, 1.55, "Learning = turning dials", [
    "After each example, every dial turns a little in the direction that would have shrunk the error.",
    "Bigger mistake → bigger turn.",
  ], { fill: C.posL, tc: C.pos, ts: 12, bs: 10.5, anim: A(1, "rise", 900) });
  card(s, 8.45, 5.05, 4.25, 1.68, "Same idea, enormous scale", [
    "This toy has 3 dials. GPT-2 small has 124 million. Frontier LLMs have hundreds of billions.",
    "The calculus that says which way to turn each dial is called backpropagation.",
  ], { fill: C.bg2, tc: C.ink, ts: 12, bs: 10.5, anim: A(4, "rise", 300) });

  s.addNotes(`Before anything else, one picture to carry through the whole talk: weights are dials.

Here is a toy model that answers one question: "will the cat sit here?" It looks at three facts about a spot — is it soft, is it warm, is it wet — and each fact has its own dial. The dial says how much that fact matters. Turned to plus, it pushes the answer toward yes; turned to minus, toward no; near zero, the fact is ignored. The model adds up the inputs, each weighted by its dial, and that sum becomes its guess.

At the start the dials are set randomly. Notice "warm" is even slightly negative and "wet" slightly positive — this model knows nothing about cats.

[CLICK] Example 1: a mat — soft, warm, dry — and the cat sat on it. The model only said 30%. Too low. So we turn the dials that were "on" for this example — soft and warm — up. Watch them turn.
[CLICK] Example 2: a puddle. Wet and cold, and the cat left. The model said 55% — too high. The wet dial was pushing toward yes, so we turn it way down.
[CLICK] Example 3: a sofa. The model now says 85% and the cat did sit. Small error, so only small nudges.
[CLICK] After training: soft +2.0, warm +1.5, wet −2.5. Nobody typed in "cats like soft, warm, dry places". That knowledge lives entirely in where the dials ended up.

That is all learning is: show an example, measure the error, turn every dial a little in the direction that shrinks it. The maths that tells each dial which way to turn is called backpropagation.

An LLM is exactly this — just with billions of dials instead of three, and instead of "will the cat sit here?" the question is "what's the next word?". Next slide: that full loop.`);
}

// =====================================================================
// W1. Warm-up: training and inference
// =====================================================================
if (FULL) {
  const s = contentSlide("Warm-up", "03 · WARM-UP · TRAINING AND INFERENCE", C.pos, "Deep learning in one slide: learn first, then use",
    "A model is a function with millions of adjustable dials (weights). Training sets the dials; inference uses them.");
  // training panel
  rect(s, 0.6, 1.8, 7.0, 4.95, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line });
  text(s, "TRAINING · learn from examples", { x: 0.85, y: 1.92, w: 5, h: 0.26, fontSize: 10, bold: true, color: C.pos, charSpacing: 1 });
  box(s, "“The cat sat on the”", 0.85, 2.48, 1.55, 0.9, { fill: C.white, line: C.line, size: 11, bold: true, anim: A(1, "rise") });
  text(s, "① show an example", { x: 0.85, y: 3.42, w: 1.6, h: 0.22, fontSize: 9, bold: true, color: C.pos, objectName: A(1, "fade") });
  line(s, 2.43, 2.93, 2.66, 2.93, { color: C.faint, w: 1.5, anim: A(1, "wipe", 150) });
  const moves = ["mvp35", "mvn28", "mvp22"];
  sliderModel(s, 2.7, 2.25, 2.1, 1.38, [0.2, 0.75, 0.35], { anim: () => A(1, "rise", 250), knob: (i) => A(3, moves[i], 400 + i * 150) });
  line(s, 4.83, 2.93, 5.06, 2.93, { color: C.faint, w: 1.5, anim: A(1, "wipe", 400) });
  box(s, [
    { text: "Guess", options: { fontSize: 9, color: C.muted, breakLine: true } },
    { text: "floor 30% · mat 5%", options: { fontSize: 12, bold: true, color: C.ink } },
  ], 5.1, 2.48, 2.3, 0.9, { fill: C.white, line: C.line, anim: A(1, "rise", 550) });
  box(s, [
    { text: "② compare with the answer: “mat”", options: { fontSize: 10, bold: true, color: C.out, breakLine: true } },
    { text: "error (loss) = 3.0 — way off!", options: { fontSize: 10.5, color: C.ink } },
  ], 5.1, 3.55, 2.3, 0.75, { fill: C.outL, anim: A(2, "rise") });
  line(s, 5.08, 4.1, 3.75, 4.1, { color: C.out, w: 1.5, dash: "dash", head: false, anim: A(3, "wipe") });
  line(s, 3.75, 4.1, 3.75, 3.67, { color: C.out, w: 1.5, dash: "dash", anim: A(3, "fade", 250) });
  text(s, "③ nudge every dial a little so “mat” becomes more likely (backpropagation)", { x: 0.85, y: 3.75, w: 2.75, h: 0.55, fontSize: 9.5, bold: true, color: C.out, objectName: A(3, "fade", 300) });

  text(s, "④ Repeat over billions of examples → the error falls", { x: 0.85, y: 4.45, w: 6.5, h: 0.26, fontSize: 10.5, bold: true, color: C.ink, objectName: A(4, "fade") });
  const map = plotArea(s, 1.05, 4.8, 6.2, 1.5, { x0: 0, x1: 10, y0: 0, y1: 3.2, anim: A(4, "fade") });
  const loss = (t) => 2.8 * Math.exp(-t / 2.2) + 0.3;
  const pts = Array.from({ length: 21 }, (_, i) => map(i / 2, loss(i / 2)));
  polyline(s, pts, { color: C.pos, w: 2.5, anim: (i) => A(4, "fade", 100 + i * 70) });
  [[0.3, "step 1 · P(mat) = 5%"], [3.5, "step 10k · 20%"], [9.3, "step 1M · 41%"]].forEach(([t, lab], k) => {
    const [px, py] = map(t, loss(t));
    dot(s, px, py, 0.13, C.out, A(4, "zoom", 300 + k * 600));
    text(s, lab, { x: k === 2 ? px - 1.6 : px + 0.1, y: py - 0.3, w: 1.5, h: 0.22, fontSize: 9, bold: true, color: C.out, align: k === 2 ? "right" : "left", objectName: A(4, "fade", 350 + k * 600) });
  });
  text(s, "error", { x: 0.6, y: 4.85, w: 0.42, h: 0.2, fontSize: 8.5, color: C.muted, align: "right" });
  text(s, "training steps →", { x: 5.6, y: 6.33, w: 1.65, h: 0.2, fontSize: 8.5, color: C.muted, align: "right" });

  // inference panel
  rect(s, 7.85, 1.8, 4.85, 4.95, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line, anim: A(5, "fade") });
  text(s, "INFERENCE · use the trained model", { x: 8.1, y: 1.92, w: 4.4, h: 0.26, fontSize: 10, bold: true, color: C.out, charSpacing: 1, objectName: A(5, "fade") });
  box(s, "“The cat sat on the”", 8.1, 2.48, 1.5, 0.9, { fill: C.white, line: C.line, size: 11, bold: true, anim: A(5, "rise", 200) });
  line(s, 9.63, 2.93, 9.86, 2.93, { color: C.faint, w: 1.5, anim: A(5, "wipe", 300) });
  sliderModel(s, 9.9, 2.25, 2.55, 1.38, [0.35, 0.55, 0.45], { title: "Trained model", anim: () => A(5, "rise", 400) });
  box(s, "FROZEN", 11.55, 2.12, 0.85, 0.26, { fill: C.ink, color: C.white, size: 8.5, bold: true, margin: 0, anim: A(5, "zoom", 700) });
  line(s, 11.17, 3.66, 11.17, 3.92, { color: C.out, w: 1.5, anim: A(5, "fade", 800) });
  box(s, [
    { text: "Answer", options: { fontSize: 9, color: C.muted, breakLine: true } },
    { text: "mat 41% · floor 14%", options: { fontSize: 12, bold: true, color: C.out } },
  ], 9.9, 3.95, 2.55, 0.75, { fill: C.outL, anim: A(5, "zoom", 950) });
  text(s, "No answer key, no error, no learning — just one pass forward through the frozen dials. This is what runs when you chat with an LLM.", { x: 8.1, y: 4.85, w: 4.4, h: 0.8, fontSize: 10.5, color: C.body, objectName: A(5, "fade", 1100) });
  box(s, [
    { text: "Training: ", options: { bold: true, color: C.pos } }, { text: "weeks on thousands of GPUs, done once.", options: { breakLine: true } },
    { text: "Inference: ", options: { bold: true, color: C.out } }, { text: "milliseconds, every message.", options: {} },
  ], 8.1, 5.75, 4.4, 0.8, { fill: C.white, line: C.line, size: 10.5, color: C.body, align: "left", margin: [10, 10, 4, 4], anim: A(6, "rise") });

  s.addNotes(`Now the same dial idea, applied to language. A language model is a function with a huge number of dials — GPT-2 small has 124 million; frontier models have hundreds of billions. Nobody sets them by hand; training does, exactly like the cat example.

[CLICK] Training step 1: show the model an example. Here, the text “The cat sat on the”. With random dials, its guess is poor: floor 30%, mat only 5%.
[CLICK] Step 2: compare with the real answer from the text, “mat”. The gap is measured by a single number, the loss. Here it's big.
[CLICK] Step 3: backpropagation works out, for every single dial, which direction would have reduced the error, and nudges each one a tiny bit. Watch the dials move.
[CLICK] Step 4: repeat over billions of examples. The error curve drops. After a million steps, P(mat) is 41%. Nobody programmed "cats sit on mats" — it emerged from nudging dials.

[CLICK] Inference is the other mode: the dials are frozen. We feed in text, do one pass forward, read off the answer. No answer key, no error, no learning. Every time you chat with an LLM, this is what's running.
[CLICK] The economics: training is enormously expensive but happens once; inference is cheap per call but happens billions of times.

Keep these two modes in mind — we'll come back to them at the end, specifically for the decoder.`);
}

// =====================================================================
// W2. Warm-up: non-linearity
// =====================================================================
if (FULL) {
  const s = contentSlide("Warm-up", "04 · WARM-UP · NON-LINEARITY", C.pos, "Non-linearity: why networks need a bend",
    "Without bends, stacking a hundred layers is no smarter than one. Example: when is a banana good to eat?");
  const P = [0.6, 4.65, 8.7], PW = [3.85, 3.85, 4.0], py = 1.8, ph = 3.65;
  P.forEach((x, i) => rect(s, x, py, PW[i], ph, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line, anim: A(i + 1, "fade") }));

  // panel 1: straight steps collapse
  text(s, "① Straight steps stack into one straight step", { x: 0.78, y: 1.92, w: 3.5, h: 0.45, fontSize: 11, bold: true, color: C.ink, objectName: A(1, "fade") });
  let bx = 0.8;
  [["x", C.white, C.ink], ["× 2", C.posL, C.pos], ["× 3, + 1", C.posL, C.pos]].forEach(([t, f, c], k) => {
    const w = k === 0 ? 0.42 : k === 1 ? 0.6 : 0.95;
    box(s, t, bx, 2.48, w, 0.42, { fill: f, color: c, size: 11, bold: true, margin: 0, anim: A(1, "rise", k * 200) });
    bx += w;
    line(s, bx + 0.03, 2.69, bx + 0.2, 2.69, { color: C.faint, w: 1.25, anim: A(1, "rise", k * 200 + 100) });
    bx += 0.23;
  });
  box(s, "= × 6, + 1", bx, 2.48, 1.0, 0.42, { fill: C.pos, color: C.white, size: 11, bold: true, margin: 0, anim: A(1, "zoom", 700) });
  const m1 = plotArea(s, 1.0, 3.05, 3.1, 1.55, { x0: -1, x1: 1, y0: -3, y1: 5, zero: true, anim: A(1, "fade", 800) });
  polyline(s, [m1(-1, -2), m1(1, 2)], { color: C.faint, w: 1.75, anim: () => A(1, "wipe", 900) });
  polyline(s, [m1(-0.65, -2.9), m1(0.65, 4.9)], { color: C.pos, w: 2.5, anim: () => A(1, "wipe", 1100) });
  text(s, "Any stack of “multiply and add” layers is still just one line.", { x: 0.78, y: 4.75, w: 3.5, h: 0.55, fontSize: 10, color: C.body, objectName: A(1, "fade", 1300) });

  // panel 2: ReLU and GELU
  text(s, "② The fix: a bend after each layer", { x: 4.83, y: 1.92, w: 3.5, h: 0.45, fontSize: 11, bold: true, color: C.ink, objectName: A(2, "fade") });
  const m2 = plotArea(s, 5.0, 2.45, 3.15, 2.2, { x0: -3, x1: 3, y0: -0.6, y1: 3, zero: true, anim: A(2, "fade") });
  const erf = (z) => { const t = 1 / (1 + 0.3275911 * Math.abs(z)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); return z >= 0 ? y : -y; };
  const gelu = (v) => 0.5 * v * (1 + erf(v / Math.SQRT2));
  polyline(s, [m2(-3, 0), m2(0, 0), m2(3, 3)], { color: C.ffn, w: 2.75, anim: (i) => A(2, "wipe", 200 + i * 400) });
  polyline(s, Array.from({ length: 25 }, (_, i) => { const v = -3 + i * 0.25; return m2(v, gelu(v)); }), { color: C.att, w: 1.75, dash: "dash", anim: (i) => A(2, "fade", 1000 + i * 30) });
  text(s, "ReLU", { x: 7.35, y: 2.55, w: 0.7, h: 0.22, fontSize: 9.5, bold: true, color: C.ffn, objectName: A(2, "fade", 700) });
  text(s, "GELU", { x: 6.95, y: 3.25, w: 0.7, h: 0.22, fontSize: 9.5, bold: true, color: C.att, objectName: A(2, "fade", 1600) });
  text(s, "ReLU: negative → 0, positive → keep. GELU is the smooth version GPT uses. It’s an on/off switch for each neuron.", { x: 4.83, y: 4.75, w: 3.5, h: 0.65, fontSize: 10, color: C.body, objectName: A(2, "fade", 1700) });

  // panel 3: banana tastiness
  text(s, "③ Bends let the model fit real curves", { x: 8.88, y: 1.92, w: 3.7, h: 0.45, fontSize: 11, bold: true, color: C.ink, objectName: A(3, "fade") });
  const m3 = plotArea(s, 9.15, 2.45, 3.35, 2.15, { x0: 0, x1: 10, y0: 0, y1: 10.5, anim: A(3, "fade") });
  text(s, "tasty", { x: 8.72, y: 2.45, w: 0.4, h: 0.2, fontSize: 8, color: C.muted, align: "right", objectName: A(3, "fade") });
  text(s, "days since picked →", { x: 10.8, y: 4.62, w: 1.7, h: 0.2, fontSize: 8, color: C.muted, align: "right", objectName: A(3, "fade") });
  [[1, 1.5], [2, 3], [3, 5.5], [4, 8], [5, 9.2], [6, 9], [7, 7.5], [8, 4.5], [9, 2]].forEach(([dx, dy], k) => {
    const [px, py2] = m3(dx, dy);
    dot(s, px, py2, 0.13, C.tok, A(3, "zoom", 200 + k * 80));
  });
  polyline(s, [m3(0.5, 4.73), m3(9.5, 6.44)], { color: C.faint, w: 2, dash: "dash", anim: () => A(4, "wipe") });
  text(s, "straight line: misses the hump ✕", { x: 9.2, y: 4.85, w: 3.4, h: 0.22, fontSize: 9.5, bold: true, color: C.muted, objectName: A(4, "fade", 300) });
  polyline(s, [m3(0.5, 0.6), m3(4.6, 9.2), m3(6.0, 9.4), m3(9.5, 1.0)], { color: C.ffn, w: 2.75, anim: (i) => A(5, "wipe", i * 350) });
  text(s, "a few bends: fits “too early, just right, too late” ✓", { x: 9.2, y: 5.1, w: 3.45, h: 0.22, fontSize: 9.5, bold: true, color: C.ffn, objectName: A(5, "fade", 900) });

  box(s, [
    { text: "In an LLM  ", options: { bold: true, color: C.pos } },
    { text: "the bends let a neuron fire only when its pattern is present — e.g. only if the verb is “sat” AND the subject is an animal. Without them, 96 layers would collapse into one simple linear map.", options: { color: C.body } },
  ], 0.6, 5.7, 12.1, 0.95, { fill: C.posL, size: 11.5, align: "left", margin: [14, 14, 4, 4], anim: A(6, "rise") });

  s.addNotes(`Second warm-up: non-linearity. It sounds scary; the idea is simple.

[CLICK] A neural network layer, at its core, multiplies and adds. Multiply by 2, then multiply by 3 and add 1 — and you get... multiply by 6 and add 1. Still a straight line. Stack a hundred such layers and you still get one straight line. All that depth would buy you nothing.

[CLICK] The fix is a bend after each layer. The simplest is ReLU: negative numbers become 0, positive numbers pass through unchanged. GPT models use GELU, a smooth version (the dashed curve). Think of it as an on/off switch on each neuron: it stays quiet unless its input is positive.

[CLICK] Why does that matter? A real example: when is a banana good to eat? Too early, it's hard; a few days in, it's perfect; too late, it's mush. The data makes a hump.
[CLICK] A straight line can't fit a hump — the best it can do is a near-flat line that's wrong everywhere.
[CLICK] Add a few bends and you can follow the shape: up, flat, down. With enough bends you can approximate almost any curve.

[CLICK] In an LLM, the bends are what let a neuron implement a rule like "fire only if the verb is sat AND the subject is an animal". We'll see exactly this inside the MLP later.`);
}

// =====================================================================
// W3. Warm-up: dot product
// =====================================================================
if (FULL) {
  const s = contentSlide("Warm-up", "05 · WARM-UP · THE DOT PRODUCT", C.pos, "The dot product: a match score for two lists of numbers",
    "Multiply matching positions, add them up. A big result means the two vectors “agree”.");
  // header
  text(s, "feature", { x: 0.6, y: 1.95, w: 1.6, h: 0.24, fontSize: 9, bold: true, color: C.muted, charSpacing: 1 });
  box(s, "question", 2.35, 1.86, 1.05, 0.38, { fill: C.att, color: C.white, size: 10.5, bold: true, margin: 0, anim: A(1, "fade") });
  box(s, "cat", 3.95, 1.86, 0.9, 0.38, { fill: C.tokL, line: C.tok, color: C.ink, size: 10.5, bold: true, margin: 0, anim: A(1, "fade", 150) });
  text(s, "product", { x: 5.3, y: 1.95, w: 1.6, h: 0.24, fontSize: 9, bold: true, color: C.muted, charSpacing: 1, objectName: A(2, "fade") });
  text(s, "“who could be sitting?”", { x: 2.1, y: 2.27, w: 1.6, h: 0.22, fontSize: 8.5, italic: true, color: C.att, align: "center", objectName: A(1, "fade") });
  const feats = [["animal-ness", 1.0, 0.9], ["surface-ness", 0.1, 0.0], ["action-ness", 0.2, 0.1]];
  feats.forEach(([f, q, c], i) => {
    const y = 2.6 + i * 0.55;
    text(s, f, { x: 0.6, y: y + 0.1, w: 1.65, h: 0.26, fontSize: 11, bold: true, color: C.ink });
    box(s, q.toFixed(1), 2.5, y, 0.75, 0.44, { fill: C.attL, color: C.att, size: 12, bold: true, margin: 0, anim: A(1, "fade", 200 + i * 100) });
    text(s, "×", { x: 3.35, y: y + 0.08, w: 0.5, h: 0.28, fontSize: 13, bold: true, color: C.muted, align: "center", objectName: A(2, "fade", i * 300) });
    box(s, c.toFixed(1), 4.03, y, 0.75, 0.44, { fill: C.tokL, color: C.tok, size: 12, bold: true, margin: 0, anim: A(1, "fade", 250 + i * 100) });
    text(s, "=", { x: 4.85, y: y + 0.08, w: 0.4, h: 0.28, fontSize: 13, bold: true, color: C.muted, align: "center", objectName: A(2, "fade", i * 300 + 100) });
    const p = q * c;
    rect(s, 5.3, y + 0.1, Math.max(0.03, p * 1.4), 0.24, { fill: C.pos, anim: A(2, "wipe", i * 300 + 150) });
    text(s, p.toFixed(2), { x: 5.36 + Math.max(0.03, p * 1.4), y: y + 0.08, w: 0.6, h: 0.28, fontSize: 11, bold: true, color: C.pos, objectName: A(2, "fade", i * 300 + 250) });
  });
  box(s, [
    { text: "add them up:  0.90 + 0.00 + 0.02 = ", options: { color: C.ink } },
    { text: "0.92", options: { bold: true, color: C.pos, fontSize: 15 } },
    { text: "   ← the dot product", options: { color: C.muted, fontSize: 10.5 } },
  ], 0.6, 4.3, 6.4, 0.52, { fill: C.posL, size: 12, align: "left", margin: [12, 10, 0, 0], anim: A(3, "rise") });

  text(s, "Same question, other words:", { x: 0.6, y: 5.02, w: 4, h: 0.26, fontSize: 10.5, bold: true, color: C.ink, objectName: A(4, "fade") });
  [["cat", 0.92, "[0.9, 0.0, 0.1]"], ["sat", 0.28, "[0.1, 0.0, 0.9]"], ["mat", 0.09, "[0.0, 0.9, 0.0]"]].forEach(([w, v, vecS], k) => {
    const y = 5.38 + k * 0.42;
    chip(s, w, 0.6, y, { w: 0.62, h: 0.34, size: 10.5, fill: C.tokL, line: C.tok, anim: A(4, "fade", 100 + k * 200) });
    text(s, vecS, { x: 1.3, y: y + 0.06, w: 1.35, h: 0.22, fontSize: 9, color: C.muted, objectName: A(4, "fade", 100 + k * 200) });
    rect(s, 2.75, y + 0.06, Math.max(0.03, v * 3.2), 0.22, { fill: k === 0 ? C.pos : "93C5FD", anim: A(4, "wipe", 150 + k * 200) });
    text(s, v.toFixed(2) + (k === 0 ? "  best match" : ""), { x: 2.82 + Math.max(0.03, v * 3.2), y: y + 0.03, w: 1.4, h: 0.26, fontSize: 10, bold: k === 0, color: k === 0 ? C.pos : C.muted, objectName: A(4, "fade", 250 + k * 200) });
  });

  // geometric view
  rect(s, 7.35, 1.8, 5.35, 3.85, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line, anim: A(5, "fade") });
  text(s, "Picture it as arrows", { x: 7.55, y: 1.92, w: 4, h: 0.26, fontSize: 11, bold: true, color: C.ink, objectName: A(5, "fade") });
  const ox = 7.9, oy = 4.85, L = 2.35;
  const arrows = [["question", 12, C.att, 3], ["cat · 0.92", 18, C.tok, 2.25], ["sat · 0.28", 64, C.norm, 2], ["mat · 0.09", 86, C.faint, 2]];
  arrows.forEach(([lab, ang, c, w], k) => {
    const a = (ang * Math.PI) / 180, ex = ox + L * Math.cos(a), ey = oy - L * Math.sin(a);
    line(s, ox, oy, ex, ey, { color: c, w, anim: A(5, "wipe", 200 + k * 300) });
    text(s, lab, { x: ex + (k === 0 ? 0.05 : 0.08), y: ey - (k === 0 ? -0.02 : 0.24), w: 1.3, h: 0.22, fontSize: 9.5, bold: true, color: c === C.faint ? C.muted : c, objectName: A(5, "fade", 400 + k * 300) });
  });
  dot(s, ox, oy, 0.1, C.ink);
  text(s, "Same direction → big score. Right angle → about 0. Opposite → negative.", { x: 7.55, y: 5.15, w: 5.0, h: 0.4, fontSize: 9.5, italic: true, color: C.muted, objectName: A(5, "fade", 1500) });

  card(s, 7.35, 5.85, 5.35, 0.85, "You’ll meet it everywhere", "Attention (query · key), every MLP neuron, and the final layer that scores all 50,257 tokens.", { fill: C.posL, tc: C.pos, ts: 11.5, bs: 10.5, margin: [8, 12, 6, 12], anim: A(6, "rise") });

  s.addNotes(`Third warm-up: the dot product. It is the single most common operation inside an LLM, and it's simple.

To make it concrete, imagine describing words with just three numbers: how animal-like, how surface-like, how action-like. (Real models use hundreds of numbers, learned rather than hand-picked, but the idea is identical.)

[CLICK] Here's a "question" vector — think of it as "who could be sitting?" It cares mostly about animal-ness. And here's the word “cat”.
[CLICK] The dot product: multiply matching positions. Animal times animal: 1.0 × 0.9 = 0.90. Surface: 0. Action: 0.02.
[CLICK] Add them up: 0.92. That one number is the match score.
[CLICK] Do the same with other words: “sat” scores 0.28, “mat” 0.09. Highest score wins: “cat” is the best answer to "who could be sitting?". This is exactly what attention does with queries and keys a few slides from now.

[CLICK] Geometric intuition: picture each vector as an arrow. The dot product is big when arrows point the same way, near zero at right angles, and negative when they point in opposite directions.

[CLICK] You'll see this everywhere: attention compares a query with each key, every MLP neuron is a dot product with its detector, and the final layer computes a dot product with all 50,257 token vectors.`);
}

// =====================================================================
// W4. Warm-up: softmax
// =====================================================================
if (FULL) {
  const s = contentSlide("Warm-up", "06 · WARM-UP · SOFTMAX", C.pos, "Softmax: turning scores into probabilities",
    "Scores can be any number, even negative. Softmax turns them into percentages that add up to 100%.");
  const rows = [["mat", 3.0], ["floor", 2.0], ["sofa", 1.5], ["banana", -1.0]];
  const ex = rows.map(([, v]) => Math.exp(v));
  const tot = ex.reduce((a, b) => a + b, 0);
  const cols = [
    { x: 0.6, w: 3.75, t: "① Raw scores", sub: "any number, even negative", step: 1, c: C.att },
    { x: 4.65, w: 3.75, t: "② eˢᶜᵒʳᵉ: make all positive", sub: "big scores grow much bigger", step: 2, c: C.tok },
    { x: 8.7, w: 4.0, t: "③ Divide by the total", sub: `total = ${tot.toFixed(1)} → shares of 100%`, step: 3, c: C.out },
  ];
  cols.forEach((c, k) => {
    rect(s, c.x, 1.8, c.w, 3.35, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line, anim: A(c.step, "fade") });
    text(s, c.t, { x: c.x + 0.18, y: 1.92, w: c.w - 0.3, h: 0.28, fontSize: 12, bold: true, color: c.c, objectName: A(c.step, "fade") });
    text(s, c.sub, { x: c.x + 0.18, y: 2.2, w: c.w - 0.3, h: 0.24, fontSize: 9.5, color: C.muted, objectName: A(c.step, "fade") });
    if (k < 2) line(s, c.x + c.w + 0.03, 3.5, c.x + c.w + 0.27, 3.5, { color: C.faint, w: 1.75, anim: A(c.step + 1, "wipe") });
  });
  rows.forEach(([t, v], i) => {
    const y = 2.65 + i * 0.58;
    // col 1: bars around zero
    const zx = 2.15;
    text(s, t, { x: 0.75, y: y + 0.04, w: 0.9, h: 0.3, fontSize: 11, bold: true, color: C.ink, objectName: A(1, "fade", i * 150) });
    const w1 = Math.abs(v) * 0.42;
    rect(s, v >= 0 ? zx : zx - w1, y + 0.06, w1, 0.26, { fill: v >= 0 ? C.att : "C4B5FD", anim: A(1, "wipe", i * 150 + 50) });
    text(s, (v > 0 ? "" : "") + v.toFixed(1), { x: v >= 0 ? zx + w1 + 0.06 : zx + 0.06, y: y + 0.04, w: 0.5, h: 0.3, fontSize: 10.5, bold: true, color: C.att, objectName: A(1, "fade", i * 150 + 100) });
    // col 2
    text(s, t, { x: 4.8, y: y + 0.04, w: 0.9, h: 0.3, fontSize: 11, bold: true, color: C.ink, objectName: A(2, "fade", i * 150) });
    const w2 = Math.max(0.03, ex[i] * 0.105);
    rect(s, 5.75, y + 0.06, w2, 0.26, { fill: C.tok, anim: A(2, "wipe", i * 150 + 50) });
    text(s, ex[i].toFixed(ex[i] < 1 ? 2 : 1), { x: 5.81 + w2, y: y + 0.04, w: 0.6, h: 0.3, fontSize: 10.5, bold: true, color: C.tok, objectName: A(2, "fade", i * 150 + 100) });
    // col 3
    const p = ex[i] / tot;
    text(s, t, { x: 8.85, y: y + 0.04, w: 0.9, h: 0.3, fontSize: 11, bold: true, color: C.ink, objectName: A(3, "fade", i * 150) });
    const w3 = Math.max(0.03, p * 3.4);
    rect(s, 9.8, y + 0.06, w3, 0.26, { fill: i === 0 ? C.out : "FDA4AF", anim: A(3, "wipe", i * 150 + 50) });
    text(s, `${Math.round(p * 100)}%`, { x: 9.86 + w3, y: y + 0.04, w: 0.5, h: 0.3, fontSize: 10.5, bold: true, color: C.out, objectName: A(3, "fade", i * 150 + 100) });
  });
  line(s, 2.15, 2.6, 2.15, 4.95, { color: C.line, w: 1, head: false });
  text(s, "0", { x: 2.05, y: 4.9, w: 0.2, h: 0.2, fontSize: 8, color: C.muted, align: "center" });
  text(s, "sum = 100%", { x: 8.85, y: 4.85, w: 3.7, h: 0.22, fontSize: 9.5, bold: true, color: C.out, align: "right", objectName: A(3, "fade", 700) });

  [
    ["Gaps get amplified", "A score just 1 point higher becomes about 2.7× more likely (e¹ ≈ 2.7). mat vs floor: 62% vs 23%.", C.tokL, C.tok],
    ["Temperature", "Divide scores by T first. T < 1 makes the winner win bigger; T > 1 flattens the odds.", C.outL, C.out],
    ["Masking trick", "Set a score to −∞ and e^(−∞) = 0, so it gets exactly 0%. This is how attention hides the future.", C.attL, C.att],
  ].forEach(([t, d, f, c], k) => card(s, 0.6 + k * 4.11, 5.4, 3.9, 1.3, t, d, { fill: f, tc: c, ts: 12, bs: 10.5, anim: A(4, "rise", k * 200) }));

  s.addNotes(`Last warm-up: softmax. The model produces scores; we want probabilities. Softmax is the bridge.

[CLICK] Raw scores, sometimes called logits, can be any number — even negative. Here: mat 3.0, floor 2.0, sofa 1.5, banana −1.0. You can't say "banana has a −1 chance".

[CLICK] Step one: raise e (about 2.718) to the power of each score. Two things happen. Everything becomes positive — banana's −1 becomes 0.37. And big scores grow much bigger: mat's 3 becomes 20.1.

[CLICK] Step two: divide each by the total, 32.3. Now we have shares that add up to 100%: mat 62%, floor 23%, sofa 14%, banana 1%. That's softmax.

[CLICK] Three things to remember, because they come back later:
- Gaps get amplified: one point more in score means roughly 2.7 times more likely.
- Temperature: divide the scores by a number T before softmax. Below 1, the favourite wins bigger; above 1, the odds flatten out. This is the "temperature" setting in LLM APIs.
- Masking: if you set a score to minus infinity, e to the minus infinity is zero, so that option gets exactly 0%. Attention uses this to hide future tokens.

That's the four warm-ups. Now, the decoder.`);
}

// =====================================================================
// 2. The decoder's job
// =====================================================================
if (FULL) pres.addSection({ title: "The big picture" });
if (FULL) {
  const s = contentSlide("The big picture", "07 · THE JOB", C.out, "The decoder’s job: guess the next token, again and again",
    "It reads everything written so far, predicts one token, adds it to the text — and repeats.");
  const rows = [
    { y: 2.15, toks: SENT, pred: "mat", label: "Step 1" },
    { y: 3.2, toks: [...SENT, "*mat"], pred: ".", label: "Step 2" },
    { y: 4.25, toks: [...SENT, "*mat", "*."], pred: "<end>", label: "Step 3" },
  ];
  rows.forEach((r, i) => {
    text(s, r.label, { x: 0.6, y: r.y + 0.12, w: 0.8, h: 0.25, fontSize: 10, bold: true, color: C.muted, objectName: A(i + 1, "fade") });
    let d = 0;
    seqRow(s, 1.45, r.y, r.toks, r.pred, { anim: () => A(i + 1, "fade", (d += 60)), animPred: () => A(i + 1, "zoom", 500) });
  });
  // "feed it back" arrows
  line(s, 5.95, 2.66, 5.1, 3.15, { color: C.out, dash: "dash", w: 1.25, anim: A(2, "wipe", 0) });
  text(s, "feed it back in", { x: 6.15, y: 2.72, w: 1.6, h: 0.25, fontSize: 9.5, italic: true, color: C.out, objectName: A(2, "fade", 0) });
  line(s, 6.35, 3.71, 5.62, 4.2, { color: C.out, dash: "dash", w: 1.25, anim: A(3, "wipe", 0) });

  // legend
  chip(s, "", 1.45, 5.3, { w: 0.32, h: 0.24, fill: C.white, line: C.line });
  text(s, "words we started with", { x: 1.85, y: 5.31, w: 2.0, h: 0.24, fontSize: 9.5, color: C.muted });
  chip(s, "", 3.85, 5.3, { w: 0.32, h: 0.24, fill: C.outL, line: C.out });
  text(s, "words the model wrote earlier", { x: 4.25, y: 5.31, w: 2.4, h: 0.24, fontSize: 9.5, color: C.muted });
  chip(s, "", 1.45, 5.65, { w: 0.32, h: 0.24, fill: C.out, line: C.out });
  text(s, "the new prediction at this step", { x: 1.85, y: 5.66, w: 3.0, h: 0.24, fontSize: 9.5, color: C.muted });

  card(s, 8.3, 2.1, 4.4, 1.45, "Autoregressive", [
    "“auto” = self,  “regressive” = predicting from earlier values.",
    "The model’s own outputs become its next inputs.",
  ], { fill: C.attL, tc: C.att, anim: A(4, "rise") });
  card(s, 8.3, 3.75, 4.4, 1.45, "Everyday analogy", [
    "Your phone keyboard suggests a word. Tap it, and it suggests another.",
    "An LLM is that loop — with a far deeper sense of context.",
  ], { fill: C.tokL, tc: C.tok, anim: A(4, "rise", 200) });
  card(s, 8.3, 5.4, 4.4, 1.3, "What’s a token?", [
    "A word or word-piece from a fixed vocabulary.",
    "“unbelievable” → “un” + “believ” + “able”",
  ], { fill: C.bg2, tc: C.ink, anim: A(4, "rise", 400) });

  s.addNotes(`The decoder has exactly one job: look at the text so far and guess the next token.

[CLICK] Step 1: it sees “The cat sat on the” and predicts “mat”.
[CLICK] Step 2: “mat” is glued onto the end — notice it's now pink, meaning the model wrote it — and the whole thing goes back in. Now it predicts a full stop.
[CLICK] Step 3: same again, and this time it predicts a special end-of-text token, so we stop.

[CLICK] This pattern has a name: autoregressive. Auto means self; regressive means predicting from earlier values. The model feeds on its own output.

The phone keyboard analogy works well: tap the middle suggestion over and over and you get a (bad) sentence. An LLM is the same loop, just with a vastly better model of language.

Quick vocabulary: a token is a word or a piece of a word. Common words are one token; rare words get split. For our sentence, every word happens to be one token.`);
}

// =====================================================================
// 3. From text to vectors
// =====================================================================
if (FULL) pres.addSection({ title: "Inputs" });
if (FULL) {
  const s = contentSlide("Inputs", "08 · FROM TEXT TO VECTORS", C.tok, "From text to vectors",
    "Neural networks only do math on numbers, so each token becomes a list of numbers (a vector).");
  const ids = [464, 3797, 3332, 319, 262];
  const colX = (i) => 2.7 + i * 2.0;
  const labels = [
    ["Token", 2.0], ["Token ID", 2.6], ["Token embedding", 3.1], ["Position vector", 3.85], ["Input vector", 4.6],
  ];
  labels.forEach(([t, y], i) => text(s, t, { x: 0.6, y: y + 0.05, w: 1.9, h: 0.3, fontSize: 11, bold: true, color: [C.tok, C.muted, C.tok, C.pos, C.att][i], objectName: i === 0 || i === 1 ? A(1, "fade") : A(i, "fade") }));
  SENT.forEach((t, i) => {
    const x = colX(i);
    const r = rng(ids[i] * 7 + 3);
    const emb = Array.from({ length: 8 }, () => r());
    const posv = Array.from({ length: 8 }, (_, d) => Math.sin(i / Math.pow(2.2, d / 2) + (d % 2 ? Math.PI / 2 : 0)));
    chip(s, t, x + 0.15, 2.0, { w: 1.6, h: 0.44, size: 14, fill: C.tokL, line: C.tok, anim: A(1, "rise", i * 120) });
    text(s, String(ids[i]), { x: x + 0.15, y: 2.62, w: 1.6, h: 0.28, fontSize: 11, color: C.muted, align: "center", objectName: A(1, "fade", 400 + i * 120) });
    vec(s, x, 3.12, emb, diverge(C.tok, "6366F1"), { anim: () => A(2, "fade", i * 120) });
    text(s, "+", { x: x + 0.75, y: 3.47, w: 0.4, h: 0.32, fontSize: 14, bold: true, color: C.muted, align: "center", objectName: A(3, "fade") });
    vec(s, x, 3.87, posv, diverge(C.pos, "93C5FD"), { anim: () => A(3, "fade", i * 120) });
    text(s, "=", { x: x + 0.75, y: 4.22, w: 0.4, h: 0.32, fontSize: 14, bold: true, color: C.muted, align: "center", objectName: A(4, "fade") });
    vec(s, x, 4.62, emb.map((v, d) => [v, posv[d]]), ([a, b]) => mix(diverge(C.tok, "6366F1")(a), diverge(C.pos, "93C5FD")(b), 0.5), { anim: () => A(4, "fade", i * 120) });
    text(s, `pos ${i}`, { x: x + 0.15, y: 4.25, w: 0.6, h: 0.22, fontSize: 8.5, color: C.pos, objectName: A(3, "fade", i * 120) });
  });
  text(s, "8 numbers shown; GPT-2 uses 768", { x: 10.6, y: 5.02, w: 2.1, h: 0.22, fontSize: 8.5, italic: true, color: C.faint, align: "right" });

  card(s, 0.6, 5.45, 3.9, 1.15, "① Tokenize", [
    "Split text into pieces from a fixed vocabulary (50,257 in GPT-2). Each piece has an ID.",
  ], { fill: C.tokL, tc: C.tok, anim: A(1, "rise", 600) });
  card(s, 4.71, 5.45, 3.9, 1.15, "② Look up the embedding", [
    "A giant learned table: one row per token. Similar words end up with similar rows (cat ≈ kitten).",
  ], { fill: C.tokL, tc: C.tok, anim: A(2, "rise", 600) });
  card(s, 8.82, 5.45, 3.9, 1.15, "③ Add position", [
    "Attention alone ignores order. Without positions, “cat sat on mat” = “mat sat on cat”.",
  ], { fill: C.posL, tc: C.pos, anim: A(3, "rise", 600) });

  s.addNotes(`Neural networks can't read letters. They multiply and add numbers. So step one is turning text into numbers.

[CLICK] Tokenize: split the text into known pieces and swap each for its ID in the vocabulary. These are GPT-2's real IDs — “The” is 464, “ cat” is 3797. (Fun detail: GPT-2 tokens usually include the leading space.)

[CLICK] Embedding: an ID is just a label — 3797 isn't "bigger" than 464 in any meaningful way. So we use the ID to look up a row in a big learned table. That row, the embedding, is a list of numbers that captures what the token tends to mean. Each coloured cell here is one number; GPT-2 uses 768 per token. Words used in similar ways — cat, kitten, dog — end up with similar rows. Nobody writes these by hand; they're learned during training.

[CLICK] Position: here's a surprise — the attention mechanism we'll meet next has no built-in sense of order. Without help, “cat sat on mat” and “mat sat on cat” look identical. So we add a position vector that encodes "I'm word 0, word 1, word 2…".

[CLICK] Adding them gives the input vector for each token: what it is, plus where it is. These five vectors are what enter the decoder.`);
}

// =====================================================================
// V1. Tokens: what the model reads and what you pay for
// =====================================================================
if (FULL) {
  const s = contentSlide("Inputs", "09 · TOKENS AND COST", C.tok, "Tokens: what the model reads — and what you pay for",
    "Before anything else, text is sliced into tokens. Tokens are also how usage is measured and billed.");
  text(s, "One sentence, sliced by a GPT-4-style tokenizer", { x: 0.6, y: 1.8, w: 7, h: 0.26, fontSize: 11, bold: true, color: C.ink });
  const toks = ["I", "can", "’t", "wait", "to", "ship", "my", "first", "AI", "feature", "."];
  let x = 0.6;
  const tx = [];
  toks.forEach((t, i) => {
    tx.push(x);
    x += chip(s, t, x, 2.2, { size: 11, h: 0.42, fill: t === "’t" ? C.tok : C.tokL, line: C.tok, color: t === "’t" ? C.white : C.ink, anim: A(1, "rise", i * 70) }) + 0.06;
  });
  box(s, "11 tokens · 41 characters", 0.6, 2.8, 2.3, 0.34, { fill: C.ink, color: C.white, size: 10, bold: true, margin: 0, anim: A(1, "zoom", 900) });
  // splits
  s.addText([
    { text: "“can’t” → “can” + “’t”  ", options: { bold: true, color: C.tok } },
    { text: "the apostrophe piece is its own token, reused in don’t, won’t, isn’t…", options: { color: C.body } },
  ], { x: 0.6, y: 3.3, w: 7.0, h: 0.3, fontFace: F, fontSize: 10.5, margin: 0, isTextBox: true, objectName: A(2, "fade") });
  let x2 = 0.6;
  [["tokenization", C.white, C.ink], ["→", null, null], ["token", C.tokL, C.ink], ["ization", C.tokL, C.ink]].forEach(([t, f, c], k) => {
    if (!f) { text(s, t, { x: x2, y: 3.72, w: 0.3, h: 0.36, fontSize: 12, color: C.muted, align: "center", valign: "middle", objectName: A(2, "fade", 200) }); x2 += 0.35; return; }
    x2 += chip(s, t, x2, 3.72, { size: 11, h: 0.36, fill: f, line: C.tok, color: c, anim: A(2, "fade", 150 + k * 120) }) + 0.06;
  });
  text(s, "fragments are reused across many words", { x: x2 + 0.15, y: 3.79, w: 3.6, h: 0.24, fontSize: 9.5, italic: true, color: C.muted, objectName: A(2, "fade", 500) });

  [["≈ 4", "characters per token (English)"], ["100 → 75", "tokens ≈ words, roughly"], ["100k–200k+", "tokens in a modern vocabulary (GPT-2 had 50,257)"]].forEach(([big, small], k) => {
    s.addText([
      { text: big, options: { fontSize: 22, bold: true, color: C.tok, breakLine: true } },
      { text: small, options: { fontSize: 10, color: C.body } },
    ], { shape: S.ROUNDED_RECTANGLE, x: 0.6 + k * 2.37, y: 4.35, w: 2.22, h: 1.15, rectRadius: 0.1, fill: { color: C.tokL }, fontFace: F, valign: "middle", margin: [12, 10, 4, 4], objectName: A(3, "rise", k * 200) });
  });
  card(s, 0.6, 5.65, 6.96, 1.05, "Same text, different count", "Each model family has its own tokenizer, so the same prompt can be a different number of tokens — and a different bill — on different models.", { fill: C.bg2, ts: 11.5, bs: 10.5, anim: A(4, "rise") });

  // invoice
  rect(s, 7.85, 1.8, 4.85, 4.9, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line, anim: A(5, "fade") });
  text(s, "Tokens are the invoice", { x: 8.05, y: 1.95, w: 4.4, h: 0.3, fontSize: 13, bold: true, color: C.out, objectName: A(5, "fade") });
  text(s, "You pay per token: everything you send in, plus everything the model writes back.", { x: 8.05, y: 2.28, w: 4.45, h: 0.45, fontSize: 10, color: C.body, objectName: A(5, "fade") });
  [["input", "prompt, chat history, documents", C.ffn, 2.6, "cheaper per token"], ["output", "the reply it generates", C.out, 1.2, "usually several × pricier per token"]].forEach(([t, d, c, w, note], k) => {
    const y = 2.9 + k * 0.72;
    text(s, t, { x: 8.05, y, w: 0.75, h: 0.3, fontSize: 11, bold: true, color: c, valign: "middle", objectName: A(5, "fade", 200 + k * 250) });
    rect(s, 8.85, y + 0.04, w, 0.22, { fill: c, anim: A(5, "wipe", 250 + k * 250) });
    text(s, `${d} · ${note}`, { x: 8.85, y: y + 0.3, w: 3.8, h: 0.22, fontSize: 8.5, color: C.muted, objectName: A(5, "fade", 350 + k * 250) });
  });
  text(s, "Example: a model writes a 120,000-token novel", { x: 8.05, y: 4.45, w: 4.5, h: 0.26, fontSize: 10.5, bold: true, color: C.ink, objectName: A(6, "fade") });
  [["cheaper model", "~$5 per million output tokens", 0.6, "$0.60"], ["flagship model", "~$25 per million output tokens", 3.0, "$3.00"]].forEach(([t, d, w, cost], k) => {
    const y = 4.82 + k * 0.62;
    text(s, `${t} · ${d}`, { x: 8.05, y, w: 4.5, h: 0.22, fontSize: 9, color: C.muted, objectName: A(6, "fade", 150 + k * 300) });
    rect(s, 8.05, y + 0.25, w * 0.95, 0.24, { fill: k ? C.out : "FDA4AF", anim: A(6, "wipe", 200 + k * 300) });
    text(s, cost, { x: 8.05 + w * 0.95 + 0.08, y: y + 0.22, w: 0.8, h: 0.3, fontSize: 12, bold: true, color: C.out, valign: "middle", objectName: A(6, "fade", 450 + k * 300) });
  });
  text(s, "Same words, 5× the bill. Prices change often — the ratios are the lesson.", { x: 8.05, y: 6.1, w: 4.5, h: 0.45, fontSize: 9, italic: true, color: C.muted, objectName: A(6, "fade", 900) });

  s.addNotes(`We saw that text becomes tokens. Two practical things are worth knowing about them.

[CLICK] Here's a real sentence through a GPT-4-style tokenizer: “I can't wait to ship my first AI feature.” Eleven tokens for 41 characters. Most words are one token each.

[CLICK] But “can't” splits into “can” and “'t” — the apostrophe piece is its own token, reused in don't, won't, isn't. Longer words split into reusable fragments: “tokenization” becomes “token” + “ization”. A vocabulary of reusable pieces can spell any text, the way 26 letters spell any English word.

[CLICK] Rules of thumb for English: about 4 characters per token, so 100 tokens is roughly 75 words. GPT-2's vocabulary had 50,257 tokens; modern models use 100,000 to 200,000 or more.

[CLICK] Each model family has its own tokenizer, so the same prompt can come out as a different number of tokens on different models.

[CLICK] Why care? Because tokens are the unit of money. You don't pay per question or per minute — you pay per token, both the tokens you send in and the tokens the model writes back. Output is usually priced several times higher than input.

[CLICK] An example from the source video: a model writes a 120,000-token novel. At about $5 per million output tokens that's 60 cents; on a flagship model at about $25 per million, it's $3. Same words, five times the bill. Prices move all the time, so treat these as illustrative — the ratios are what matter.`);
}

// =====================================================================
// 4. Inside one decoder block
// =====================================================================
if (FULL) pres.addSection({ title: "The decoder block" });
if (FULL) {
  const s = contentSlide("The decoder block", "10 · INSIDE ONE BLOCK", C.att, "Inside one decoder block",
    "A block is a small pipeline. Every token’s vector flows through it and comes out richer.");
  const gap = 0.34, cy = 2.95, h = 0.95;
  const els = [
    { t: "Token vectors\nin", w: 1.25, fill: C.bg2, color: C.ink, step: 1 },
    { t: "LayerNorm", w: 1.1, fill: C.normL, color: C.norm, step: 1 },
    { t: "Masked\nSelf-Attention", w: 2.0, fill: C.att, color: C.white, step: 1, bold: true },
    { t: "+", w: 0.5, plus: true, step: 2 },
    { t: "LayerNorm", w: 1.1, fill: C.normL, color: C.norm, step: 3 },
    { t: "Feed-Forward\nNetwork", w: 1.8, fill: C.ffn, color: C.white, step: 3, bold: true },
    { t: "+", w: 0.5, plus: true, step: 4 },
    { t: "Richer vectors\nout", w: 1.25, fill: C.bg2, color: C.ink, step: 4 },
  ];
  const total = els.reduce((a, e) => a + e.w, 0) + gap * (els.length - 1);
  let x = 0.6 + (12.13 - total) / 2;
  const xs = [];
  els.forEach((e, i) => {
    xs.push(x);
    if (e.plus) {
      box(s, "+", x, cy - 0.25, 0.5, 0.5, { shape: S.OVAL, fill: C.white, line: C.norm, lw: 1.5, size: 18, bold: true, color: C.norm, margin: 0, anim: A(e.step, "zoom", 300) });
    } else {
      box(s, e.t, x, cy - h / 2, e.w, h, { fill: e.fill, color: e.color, size: 12, bold: !!e.bold, anim: A(e.step, "rise", i * 120) });
    }
    if (i < els.length - 1) line(s, x + e.w + 0.03, cy, x + e.w + gap - 0.03, cy, { color: C.faint, w: 1.5, anim: A(els[i + 1].step, "wipe", i * 120 + 60) });
    x += e.w + gap;
  });
  // residual connections (skip paths)
  const res = (fromX, plusIdx, step) => {
    const px = xs[plusIdx] + 0.25;
    line(s, fromX, cy, fromX, 2.0, { color: C.norm, w: 1.5, head: false, anim: A(step, "fade") });
    line(s, fromX, 2.0, px, 2.0, { color: C.norm, w: 1.5, head: false, anim: A(step, "wipe", 100) });
    line(s, px, 2.0, px, cy - 0.27, { color: C.norm, w: 1.5, anim: A(step, "fade", 400) });
    rect(s, fromX - 0.05, cy - 0.05, 0.1, 0.1, { shape: S.OVAL, fill: C.norm, anim: A(step, "fade") });
    box(s, "residual (skip) path: add the input back", (fromX + px) / 2 - 1.45, 1.86, 2.9, 0.28, { fill: C.white, color: C.norm, size: 9.5, margin: 0, anim: A(step, "fade", 300) });
  };
  res(xs[1] - gap / 2, 3, 2);
  res(xs[4] - gap / 2, 6, 4);

  card(s, 0.6, 3.95, 3.9, 2.35, "Attention: tokens talk to each other", [
    "Each token gathers information from earlier tokens.",
    { text: "“sat” pulls in information from “cat” — now it knows who is sitting.", options: { italic: true, color: C.att } },
  ], { fill: C.attL, tc: C.att, bs: 12, anim: A(1, "rise", 900) });
  card(s, 4.71, 3.95, 3.9, 2.35, "Residual + LayerNorm: keep it stable", [
    "Residual: add the block’s input back to its output, so the original meaning is never lost — each step only adds an update.",
    "LayerNorm: rescales each vector so numbers stay in a healthy range through dozens of blocks.",
  ], { fill: C.normL, tc: C.norm, bs: 12, anim: A(2, "rise", 600) });
  card(s, 8.82, 3.95, 3.9, 2.35, "Feed-forward: each token thinks alone", [
    "A small neural network transforms every token’s vector on its own.",
    { text: "After hearing “The cat sat on”, the vector for “the” lights up features like “a surface is coming next”.", options: { italic: true, color: C.ffn } },
  ], { fill: C.ffnL, tc: C.ffn, bs: 12, anim: A(3, "rise", 900) });
  text(s, "Shown in the “pre-norm” order used by GPT-2 and most modern LLMs.", { x: 0.6, y: 6.45, w: 8, h: 0.22, fontSize: 8.5, italic: true, color: C.faint });

  s.addNotes(`Now let's open one decoder block. It's a small pipeline that every token's vector flows through.

[CLICK] First: LayerNorm then masked self-attention. Attention is where tokens talk to each other — “sat” can pull in information from “cat”.

[CLICK] Then a residual, or skip, connection. We add the block's input back to the attention output. Think of it as: "keep what you had, plus the update". This makes deep networks much easier to train — the original signal always has a clean highway through the model.

[CLICK] Second half: another LayerNorm, then the feed-forward network. Where attention mixes information BETWEEN tokens, the feed-forward network transforms each token's vector on its own.

[CLICK] And another residual add. Out come vectors with the same shape as what went in — just richer. Because input and output shapes match, we can stack these blocks as many times as we like. Hold that thought.

LayerNorm just rescales each vector so the numbers don't drift to huge or tiny values as they pass through dozens of blocks.

Remember the slogan: attention mixes, feed-forward transforms.`);
}

// =====================================================================
// V2. Why attention was invented
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "11 · WHY ATTENTION?", C.att, "Why attention was invented: the bottleneck",
    "Older translation models squeezed a whole sentence into one fixed-size summary. The longer the sentence, the more detail was lost.");
  const words = ["The", "house", "with", "the", "blue", "door", "near", "the", "old", "station", "was", "sold"];
  const row = (y, step, keep) => {
    let x = 0.85;
    const xs = [];
    words.forEach((w, i) => {
      const cw = chipW(w, 10.5);
      xs.push(x + cw / 2);
      chip(s, w, x, y, { size: 10.5, h: 0.36, w: cw, fill: C.white, line: C.line, anim: keep ? undefined : A(step, "fade", i * 60) });
      x += cw + 0.05;
    });
    return xs;
  };
  // BEFORE panel
  rect(s, 0.6, 1.8, 12.1, 2.55, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line });
  text(s, "BEFORE (2014) · sequence-to-sequence: one sticky note", { x: 0.85, y: 1.9, w: 7, h: 0.26, fontSize: 10, bold: true, color: C.muted, charSpacing: 1 });
  row(2.3, 1);
  text(s, "the encoder reads one word at a time, updates its note, and can never look back", { x: 0.85, y: 2.72, w: 7.2, h: 0.24, fontSize: 9.5, italic: true, color: C.muted, objectName: A(1, "fade", 800) });
  line(s, 9.25, 2.48, 10.5, 2.48, { color: C.tok, w: 2, anim: A(2, "wipe") });
  s.addText([
    { text: "one fixed-size note", options: { bold: true, fontSize: 10.5, color: C.ink, breakLine: true } },
    { text: "same size for 5 words or 50", options: { fontSize: 9, color: C.body } },
  ], { shape: S.RECTANGLE, x: 10.6, y: 2.05, w: 1.85, h: 0.95, fill: { color: "FDE68A" }, fontFace: F, align: "center", valign: "middle", margin: 4, rotate: -3, shadow: { type: "outer", color: "94A3B8", opacity: 0.35, blur: 4, offset: 2, angle: 90 }, objectName: A(2, "zoom", 200) });
  line(s, 11.52, 3.08, 11.52, 3.4, { color: C.tok, w: 2, anim: A(3, "fade") });
  text(s, "decoder writes only from the note:", { x: 0.85, y: 3.5, w: 2.8, h: 0.36, fontSize: 10, color: C.body, valign: "middle", objectName: A(3, "fade") });
  let ox = 3.7;
  [["the house", true], ["was sold", true], ["blue … ?", false], ["near … ?", false], ["old … ?", false]].forEach(([t, ok], k) => {
    ox += chip(s, t, ox, 3.5, { size: 10.5, h: 0.36, fill: ok ? C.tokL : C.bg2, line: ok ? C.tok : C.line, color: ok ? C.ink : C.faint, anim: A(3, "fade", 150 + k * 150) }) + 0.08;
  });
  text(s, "details blur — worse for longer sentences", { x: ox + 0.15, y: 3.56, w: 3.5, h: 0.26, fontSize: 10, bold: true, color: C.out, objectName: A(3, "fade", 900) });

  // AFTER panel
  rect(s, 0.6, 4.5, 12.1, 2.25, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.attL, anim: A(4, "fade") });
  text(s, "THE FIX · attention: glance back at every word while writing", { x: 0.85, y: 4.6, w: 8, h: 0.26, fontSize: 10, bold: true, color: C.att, charSpacing: 1, objectName: A(4, "fade") });
  const xs = row(4.98, 4);
  // writer chip and attention lines (relevance = thickness)
  const wx = 10.0, wy = 6.05;
  const rel = [0.05, 0.1, 0.05, 0.05, 0.6, 1.0, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05];
  xs.forEach((cx, i) => line(s, wx + 0.55, wy, cx, 5.36, { color: C.att, w: 0.5 + rel[i] * 4.5, head: false, anim: A(5, "fade", 100 + i * 60) }));
  chip(s, "writing: “door”", wx, wy, { w: 1.4, h: 0.4, size: 10.5, fill: C.att, line: C.att, color: C.white, anim: A(5, "zoom") });
  text(s, "line thickness = how much each source word is used right now", { x: 0.85, y: 6.2, w: 5.5, h: 0.24, fontSize: 9.5, italic: true, color: C.att, objectName: A(5, "fade", 900) });
  text(s, "Born in machine translation (2014). Transformers (2017) kept only this idea: in a decoder, every token glances back at all earlier tokens.", { x: 0.85, y: 6.42, w: 9.0, h: 0.3, fontSize: 9.5, color: C.body, objectName: A(5, "fade", 1100) });

  s.addNotes(`Why does attention exist at all? Because of a problem it solved.

Before attention, the best translation systems were "sequence-to-sequence" models with two halves.
[CLICK] The encoder reads your sentence one word at a time, in order, and keeps a single running summary — think of one sticky note. Read a word, update the note. It can never go back.
[CLICK] Everything gets squeezed into that one fixed-size note — the same size whether the sentence has 5 words or 50.
[CLICK] The decoder never sees your sentence. It writes the whole translation from the note alone. "The house… was sold" survives. But the blue door? The old station? They were crammed into the same tiny note and they blur. Researchers called this the bottleneck, and it got worse with longer sentences. It's like answering detailed questions about a book using only its summary.

A human translator doesn't work that way: they glance back at the source as they write.
[CLICK] That's exactly what attention added, in 2014, for machine translation: while writing each word, look back at every source word directly.
[CLICK] When writing "door", the model pulls mostly from "door" and "blue" — the thick lines — and only a trace from the rest. No squeeze, so no lost detail.

The transformer, in 2017, threw away the step-by-step note entirely and kept only attention. In a decoder like GPT, every token glances back at all the tokens before it — which is the masked self-attention we're about to see.`);
}

// =====================================================================
// 5. Masked self-attention
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "12 · MASKED SELF-ATTENTION", C.att, "Masked self-attention: no peeking at the future",
    "Each token may look at itself and the tokens before it — never at tokens that come later.");
  const W = [[1], [0.35, 0.65], [0.04, 0.86, 0.1], [0.05, 0.2, 0.55, 0.2], [0.1, 0.08, 0.12, 0.5, 0.2]];
  const gx = 1.85, gy = 2.4, cs = 0.62, g = 0.05;
  text(s, "looks at →", { x: gx, y: 1.68, w: 3.3, h: 0.24, fontSize: 9.5, italic: true, color: C.muted, align: "center" });
  text(s, "looking ↓", { x: 0.6, y: 2.05, w: 1.15, h: 0.24, fontSize: 9.5, italic: true, color: C.muted, align: "right" });
  SENT.forEach((t, i) => {
    text(s, t, { x: gx + i * (cs + g), y: 2.05, w: cs, h: 0.26, fontSize: 11, bold: true, color: C.ink, align: "center" });
    text(s, t, { x: 0.6, y: gy + i * (cs + g) + 0.18, w: 1.15, h: 0.26, fontSize: 11, bold: true, color: C.ink, align: "right" });
    for (let j = 0; j < 5; j++) {
      const x = gx + j * (cs + g), y = gy + i * (cs + g);
      rect(s, x, y, cs, cs, { fill: C.bg2 });
      if (j > i) {
        box(s, "✕", x, y, cs, cs, { shape: S.RECTANGLE, fill: "E2E8F0", color: C.faint, size: 12, margin: 0, anim: A(1, "fade", (i + j) * 60) });
      } else {
        const w = W[i][j];
        box(s, `${Math.round(w * 100)}%`, x, y, cs, cs, { shape: S.RECTANGLE, fill: mix("F5F3FF", C.att, Math.min(1, 0.12 + w)), color: w > 0.45 ? C.white : C.att, size: 10, bold: true, margin: 0, anim: A(2, "fade", i * 220) });
      }
    }
  });
  // highlight row "sat"
  rect(s, 0.65, gy + 2 * (cs + g) - 0.06, 4.6, cs + 0.12, { shape: S.ROUNDED_RECTANGLE, r: 0.08, line: C.out, lw: 2.25, anim: A(3, "zoom") });

  rect(s, 0.6, 5.95, 0.24, 0.24, { fill: C.att });
  text(s, "allowed: % of attention", { x: 0.92, y: 5.96, w: 2.0, h: 0.24, fontSize: 9.5, color: C.muted });
  rect(s, 2.95, 5.95, 0.24, 0.24, { fill: "E2E8F0" });
  text(s, "masked: future token → 0%", { x: 3.27, y: 5.96, w: 2.2, h: 0.24, fontSize: 9.5, color: C.muted });
  text(s, "Each row adds up to 100%.", { x: 0.6, y: 6.3, w: 4.6, h: 0.24, fontSize: 9.5, italic: true, color: C.faint });

  card(s, 5.85, 2.05, 6.85, 1.35, "How to read the grid", [
    "Each row is one token looking back over the sentence; darker = more attention.",
    "Everything above the diagonal is the future, so it’s blocked (✕).",
  ], { fill: C.attL, tc: C.att, anim: A(1, "rise", 300) });
  card(s, 5.85, 3.6, 6.85, 1.45, "Zoom in on “sat”", [
    "It can see “The”, “cat” and itself. Most of its attention (86%) goes to “cat” — the one doing the sitting.",
    "“on” and “the” don’t exist yet from its point of view.",
  ], { fill: C.outL, tc: C.out, anim: A(3, "rise", 300) });
  card(s, 5.85, 5.25, 6.85, 1.45, "How the mask works", [
    "Before softmax, every future score is set to −∞. Since e^(−∞) = 0, future tokens get exactly 0% attention.",
    { text: "Like reading a mystery with a card covering the rest of the page.", options: { italic: true } },
  ], { fill: C.bg2, tc: C.ink, anim: A(4, "rise") });

  s.addNotes(`This grid is the heart of the decoder. Rows are the token doing the looking; columns are what it's allowed to look at.

[CLICK] First, the mask. Everything above the diagonal is the future. “The” can't see “cat”; “cat” can't see “sat”. Those cells are blocked.

[CLICK] Now the attention weights fill in, row by row. Each row is a budget of 100% that the token spreads over itself and earlier words. “The” has nothing before it, so it spends 100% on itself.

[CLICK] Look at “sat”. It puts 86% of its attention on “cat”. Intuitively: a verb wants to know its subject — who sat? The cat.

[CLICK] How is the blocking enforced? Before turning scores into percentages with softmax, we set future scores to minus infinity. e to the minus infinity is zero, so those tokens get exactly zero attention.

Why bother? When the model generates text, the future literally doesn't exist yet. We'll see on the training slide that the mask also stops the model from cheating while it learns.

Analogy: reading a mystery novel with a card sliding down the page. You can use everything above the card, never what's below.`);
}

// =====================================================================
// 6. Q, K, V
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "13 · HOW ATTENTION COMPUTES CONTEXT", C.att, "Queries, keys and values",
    "While processing “sat”, the model effectively asks: who is doing the sitting?");
  // Query
  s.addText([
    { text: "QUERY", options: { fontSize: 10, bold: true, color: C.att, charSpacing: 2, breakLine: true } },
    { text: "from “sat”", options: { fontSize: 13, bold: true, color: C.ink, breakLine: true } },
    { text: "What am I looking for?", options: { fontSize: 11, color: C.body, paraSpaceBefore: 8, breakLine: true } },
    { text: "“Who performed this action?”", options: { fontSize: 12, italic: true, color: C.att, paraSpaceBefore: 6, breakLine: true } },
    { text: "Q = x(sat) · W_Q", options: { fontSize: 10, color: C.muted, paraSpaceBefore: 10 } },
  ], { shape: S.ROUNDED_RECTANGLE, x: 0.6, y: 1.9, w: 2.45, h: 2.85, rectRadius: 0.1, fill: { color: C.attL }, fontFace: F, valign: "top", margin: [12, 12, 12, 12], objectName: A(1, "rise") });

  text(s, "KEYS · what each token offers", { x: 3.35, y: 1.9, w: 3.0, h: 0.26, fontSize: 10, bold: true, color: C.att, charSpacing: 1, objectName: A(2, "fade") });
  text(s, "Q · K score", { x: 6.15, y: 1.9, w: 1.2, h: 0.26, fontSize: 10, bold: true, color: C.att, objectName: A(2, "fade") });
  text(s, "softmax → weight", { x: 7.55, y: 1.9, w: 1.9, h: 0.26, fontSize: 10, bold: true, color: C.out, objectName: A(3, "fade") });
  const keys = [
    ["The", "“I’m a determiner”", 1.0, 0.04],
    ["cat", "“I’m a noun — an animal, a likely subject”", 4.2, 0.86],
    ["sat", "“I’m a verb”", 2.1, 0.1],
  ];
  keys.forEach(([t, desc, sc, w], i) => {
    const y = 2.3 + i * 0.82;
    chip(s, t, 3.35, y, { w: 0.7, h: 0.6, fill: C.white, line: C.att, anim: A(2, "rise", i * 200) });
    text(s, desc, { x: 4.15, y: y + 0.04, w: 1.95, h: 0.55, fontSize: 10.5, color: C.body, valign: "middle", objectName: A(2, "fade", i * 200 + 100) });
    rect(s, 6.15, y + 0.17, (sc / 4.2) * 0.95, 0.26, { fill: C.attM, anim: A(2, "wipe", i * 200 + 200) });
    text(s, sc.toFixed(1), { x: 6.15 + (sc / 4.2) * 0.95 + 0.05, y: y + 0.17, w: 0.4, h: 0.26, fontSize: 10, bold: true, color: C.att, valign: "middle", objectName: A(2, "fade", i * 200 + 300) });
    rect(s, 7.55, y + 0.13, Math.max(0.04, w * 1.6), 0.34, { fill: C.out, anim: A(3, "wipe", i * 150) });
    text(s, `${Math.round(w * 100)}%`, { x: 7.55 + Math.max(0.04, w * 1.6) + 0.06, y: y + 0.13, w: 0.5, h: 0.34, fontSize: 11, bold: true, color: C.out, valign: "middle", objectName: A(3, "fade", i * 150 + 200) });
  });

  s.addText([
    { text: "NEW VECTOR FOR “sat”", options: { fontSize: 10, bold: true, color: "E9E5FF", charSpacing: 2, breakLine: true } },
    { text: "0.04 × V(The)\n+ 0.86 × V(cat)\n+ 0.10 × V(sat)", options: { fontSize: 13, bold: true, color: C.white, paraSpaceBefore: 8, breakLine: true } },
    { text: "“sat” now carries the information: my subject is the cat.", options: { fontSize: 11, color: "E9E5FF", paraSpaceBefore: 10 } },
  ], { shape: S.ROUNDED_RECTANGLE, x: 9.95, y: 1.9, w: 2.75, h: 2.85, rectRadius: 0.1, fill: { color: C.att }, fontFace: F, valign: "top", margin: [12, 12, 12, 12], objectName: A(4, "rise") });
  line(s, 9.45, 3.3, 9.88, 3.3, { color: C.att, w: 2, anim: A(4, "wipe") });

  // library analogy
  text(s, "ANALOGY: SEARCHING A LIBRARY", { x: 0.6, y: 5.0, w: 6, h: 0.24, fontSize: 10, bold: true, color: C.muted, charSpacing: 2, objectName: A(5, "fade") });
  [
    ["Query (Q)", "your search request: “books about who sat”", C.attL, C.att],
    ["Key (K)", "the label on each book’s spine, used for matching", C.tokL, C.tok],
    ["Value (V)", "the book’s contents — what you actually take away", C.ffnL, C.ffn],
  ].forEach(([t, d, f, tc], i) => card(s, 0.6 + i * 2.95, 5.32, 2.8, 1.4, t, d, { fill: f, tc, anim: A(5, "rise", i * 150) }));
  card(s, 9.5, 5.32, 3.2, 1.4, "The formula", [
    { text: "softmax( Q·Kᵀ / √d ) · V", options: { bold: true, color: C.att, fontSize: 12 } },
    "Q, K, V are the token vector times three learned matrices.",
  ], { fill: C.bg2, anim: A(5, "rise", 450) });

  s.addNotes(`Let's see how attention actually decides who to listen to. We'll follow the token “sat”.

[CLICK] Every token produces a Query: "what am I looking for?" It's just the token's vector multiplied by a learned matrix W_Q. For “sat”, intuitively the query is "who performed this action?"

[CLICK] Every token also produces a Key: "what do I offer?" We compare the query with each key using a dot product — a similarity score. “cat”'s key, roughly "I'm a noun, a likely subject", matches best: score 4.2.

[CLICK] Softmax turns those scores into percentages that add up to 100: 4%, 86%, 10%. Small differences in score become big differences in weight.

[CLICK] Finally, every token also has a Value — the information it actually hands over. The new vector for “sat” is the weighted mix: mostly cat's value. So “sat” now knows its subject.

[CLICK] The library analogy: the query is your search, keys are the labels on book spines, values are the books' contents. You match on labels, then read the contents of the best matches.

The formula in the corner is the whole thing. The √d just keeps scores from getting too large. Important caveat: the descriptions in quotes are our interpretation — the real Q, K, V are vectors of learned numbers, not words.`);
}

// =====================================================================
// V3. Context decides: what does "it" mean?
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "14 · CONTEXT DECIDES", C.att, "Context decides what a word means",
    "What does “it” refer to? Attention works it out fresh, every time, from the words around it.");
  const sentence = (y, last, step, target, other, wT, wO, resultText) => {
    const ws = ["The", "animal", "didn’t", "cross", "the", "street", "because", "it", "was", "too", last, "."];
    let x = 0.6;
    const cx = [];
    ws.forEach((w, i) => {
      const hl = w === last ? C.tok : w === "it" ? C.att : null;
      const cw = chip(s, w, x, y, { size: 12, h: 0.44, fill: hl === C.att ? C.att : hl ? C.tokL : C.white, line: hl || C.line, color: hl === C.att ? C.white : C.ink, anim: A(step, "fade", i * 50) });
      cx.push(x + cw / 2);
      x += cw + 0.07;
    });
    const it = cx[7];
    const arc = (to, top, w, anim0, label) => {
      line(s, it, y - 0.02, it, top, { color: C.att, w, head: false, anim: A(step + 1, "fade", anim0) });
      line(s, it, top, cx[to], top, { color: C.att, w, head: false, anim: A(step + 1, "wiper", anim0 + 100) });
      line(s, cx[to], top, cx[to], y - 0.04, { color: C.att, w, anim: A(step + 1, "fade", anim0 + 450) });
      text(s, label, { x: cx[to] - 0.62, y: top + 0.03, w: 0.55, h: 0.22, fontSize: 10, bold: true, color: C.att, align: "right", objectName: A(step + 1, "fade", anim0 + 500) });
    };
    // the farther word ("animal") gets the higher arc so the two never cross
    arc(target, target === 1 ? y - 0.62 : y - 0.3, 5, 0, `${wT}%`);
    arc(other, other === 1 ? y - 0.62 : y - 0.3, 1.5, 600, `${wO}%`);
    box(s, resultText, x + 0.2, y - 0.02, 2.3, 0.48, { fill: C.attL, color: C.att, size: 11.5, bold: true, anim: A(step + 1, "zoom", 1200) });
  };
  sentence(2.65, "tired", 1, 1, 5, 70, 20, "“it” = the animal");
  sentence(4.4, "wide", 3, 5, 1, 70, 20, "“it” = the street");
  text(s, "Change one word and the weights flip. Remaining ~10% is spread over the other words; numbers are illustrative.", { x: 0.6, y: 5.0, w: 10, h: 0.24, fontSize: 9.5, italic: true, color: C.muted, objectName: A(4, "fade", 1500) });

  [
    ["Nothing memorised", "No rule says “streets don’t get tired”. The weights are computed fresh from the context, every time.", C.attL, C.att],
    ["A soft lookup", "Like a dictionary where every key matches a little: you get a blend of all the values — not just the top hit, as a search engine would return.", C.posL, C.pos],
    ["Same trick, longer reach", "“What should I teach him?” finds “Max, my new puppy” 40 messages back — if it’s still in the window.", C.tokL, C.tok],
  ].forEach(([t, d, f, c], k) => card(s, 0.6 + k * 4.11, 5.4, 3.9, 1.35, t, d, { fill: f, tc: c, ts: 12, bs: 10.5, anim: A(5, "rise", k * 200) }));

  s.addNotes(`Here's the most famous sentence in attention research, and it shows something the cat sentence can't.

[CLICK] “The animal didn't cross the street because it was too tired.” What does “it” refer to? You didn't hesitate: the animal. Streets don't get tired.
[CLICK] Nobody taught the model that rule. But the query from “it” is scored against every earlier key, and “animal” matches strongly: roughly 70% of the attention, 20% on “street”, the rest scattered. So from here on, the vector for “it” is mostly carrying “animal”.

[CLICK] Now change ONE word: “…because it was too wide.”
[CLICK] Same sentence, same word “it” — and the weights flip. “Wide” describes a street, so now “street” gets the strong match. Don't hold me to exact numbers; the point is where most of the attention lands.

[CLICK] Three things to take from this:
- Nothing was memorised and no rule was written. Attention weights are computed fresh from the context every single time.
- It's a soft lookup. In code terms: a dictionary lookup where every key matches a little, and you get back a weighted blend of all the values. A search engine shows the top results and throws the rest away; attention throws nothing away.
- The same mechanism reaches far: in a chat, “What tricks should I teach him?” can find “Max, my new golden retriever puppy” 40 messages earlier — as long as that message is still inside the context window. We'll come back to that.`);
}

// =====================================================================
// 7. Multi-head attention
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "15 · MULTI-HEAD ATTENTION", C.att, "Multi-head attention: many perspectives at once",
    "Several heads run in parallel, each with its own Q, K, V matrices — so each learns to look for something different.");
  const heads = [
    { t: "Head 1 · Subject", c: "7C3AED", d: "Every word checks who the sentence is about: the “cat” column lights up.",
      W: [[1], [0.4, 0.6], [0.1, 0.8, 0.1], [0.05, 0.7, 0.15, 0.1], [0.05, 0.6, 0.15, 0.1, 0.1]] },
    { t: "Head 2 · Previous word", c: "2563EB", d: "Each word looks one step back — useful for phrases like “on the”.",
      W: [[1], [0.9, 0.1], [0.05, 0.9, 0.05], [0.03, 0.05, 0.87, 0.05], [0.02, 0.03, 0.05, 0.85, 0.05]] },
    { t: "Head 3 · Big picture", c: "0D9488", d: "Spreads attention evenly to capture the general gist of the sentence.",
      W: [[1], [0.5, 0.5], [0.33, 0.33, 0.34], [0.25, 0.25, 0.25, 0.25], [0.2, 0.2, 0.2, 0.2, 0.2]] },
    { t: "Head 4 · Long-range", c: "D97706", d: "The second “the” finds the first “The” — matching repeated words far apart.",
      W: [[1], [0.2, 0.8], [0.2, 0.1, 0.7], [0.2, 0.1, 0.1, 0.6], [0.8, 0.05, 0.05, 0.05, 0.05]] },
  ];
  heads.forEach((h, k) => {
    const x = 0.6 + k * 3.1, y = 1.85;
    rect(s, x, y, 2.85, 3.3, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line, anim: A(k + 1, "rise") });
    text(s, h.t, { x: x + 0.18, y: y + 0.14, w: 2.5, h: 0.28, fontSize: 12, bold: true, color: h.c, objectName: A(k + 1, "rise") });
    const cs = 0.3, g = 0.03, gx = x + 0.75, gy = y + 0.58;
    SENT.forEach((t, i) => {
      text(s, t, { x: x + 0.12, y: gy + i * (cs + g) + 0.04, w: 0.55, h: 0.22, fontSize: 9, color: C.muted, align: "right", objectName: A(k + 1, "fade", 100) });
      for (let j = 0; j < 5; j++) {
        const fill = j > i ? "EEF2F6" : mix("FFFFFF", h.c, 0.1 + 0.9 * h.W[i][j]);
        rect(s, gx + j * (cs + g), gy + i * (cs + g), cs, cs, { fill, anim: A(k + 1, "fade", 150 + i * 80) });
      }
    });
    text(s, h.d, { x: x + 0.18, y: y + 2.3, w: 2.5, h: 0.9, fontSize: 10.5, color: C.body, objectName: A(k + 1, "fade", 300) });
    // head output strip
    vec(s, x + 0.97, 5.38, [0.9, 0.5, 0.7, 0.35], (v) => mix("FFFFFF", h.c, v), { cw: 0.2, ch: 0.24, anim: () => A(5, "fade", k * 100) });
    line(s, x + 1.42, 5.66, 5.75 + k * 0.3, 6.03, { color: h.c, w: 1.25, anim: A(5, "fade", 300 + k * 100) });
  });
  box(s, "Concatenate  →  × W_O (mix)", 4.95, 6.05, 2.9, 0.48, { fill: C.att, color: C.white, size: 11, bold: true, anim: A(5, "zoom", 700) });
  line(s, 7.9, 6.29, 8.35, 6.29, { color: C.att, w: 1.75, anim: A(5, "wipe", 900) });
  vec(s, 8.45, 6.16, [0.8, 0.4, 0.9, 0.6, 0.3, 0.7, 0.5, 0.85], (v) => mix(mix("7C3AED", "0D9488", v), "FFFFFF", 0.25), { cw: 0.2, ch: 0.26, anim: () => A(5, "fade", 1000) });
  text(s, "one combined vector per token", { x: 10.35, y: 6.18, w: 2.4, h: 0.24, fontSize: 10, italic: true, color: C.muted, objectName: A(5, "fade", 1100) });
  text(s, "Head roles are learned, not programmed. These labels are illustrative; GPT-2 small has 12 heads per block.", { x: 0.6, y: 6.75, w: 9, h: 0.22, fontSize: 8.5, italic: true, color: C.faint });

  s.addNotes(`One attention pattern can only capture one kind of relationship at a time. So the decoder runs several attention "heads" side by side, each with its own Q, K and V matrices.

Think of a team of specialists reading the same sentence, each with a different highlighter.

[CLICK] Head 1 tracks the subject: almost every word looks at “cat”. You can see a bright column.
[CLICK] Head 2 looks at the previous word: a bright line just below the diagonal. Simple, but very useful for phrases.
[CLICK] Head 3 spreads attention evenly — a rough summary of everything so far.
[CLICK] Head 4 is long-range: the second “the” finds the first “The”. Heads like this help models copy and repeat patterns, which matters a lot in long documents.

[CLICK] Each head produces its own small output vector. We glue them side by side (concatenate) and multiply by one more learned matrix, W_O, which blends the perspectives into one vector per token.

Important honesty point: nobody assigns these roles. They emerge from training, and real heads are often messier than these clean examples. Researchers do find heads very much like these in real models.`);
}

// =====================================================================
// 8. Feed-forward network
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "16 · THE FEED-FORWARD NETWORK", C.ffn, "The feed-forward network: each token thinks on its own",
    "Attention mixes information between tokens. The feed-forward network then transforms each token’s vector by itself.");
  chip(s, "the", 0.95, 1.85, { w: 0.85, h: 0.4, size: 12, fill: C.tokL, line: C.tok });
  text(s, "vector for the last “the”, after attention", { x: 1.9, y: 1.92, w: 4.2, h: 0.26, fontSize: 10, italic: true, color: C.muted });
  const r = rng(99);
  const inV = Array.from({ length: 8 }, () => r());
  vec(s, 1.2, 2.5, inV, diverge(C.att, C.tok), { vertical: true, cw: 0.32, ch: 0.3, gap: 0.04, anim: () => A(1, "fade") });
  // fan out
  const ex = 3.55, top = 2.3, n = 16, sp = 0.19, d = 0.15;
  line(s, 1.55, 2.5, ex - 0.02, top, { color: C.ffnM, w: 1, head: false, anim: A(2, "wipe") });
  line(s, 1.55, 5.18, ex - 0.02, top + (n - 1) * sp + d, { color: C.ffnM, w: 1, head: false, anim: A(2, "wipe") });
  const lit = [2, 5, 9, 13];
  for (let i = 0; i < n; i++) {
    rect(s, ex, top + i * sp, d, d, { shape: S.OVAL, fill: C.white, line: C.faint, lw: 0.75, anim: A(2, "fade", 200 + i * 30) });
    if (lit.includes(i)) rect(s, ex, top + i * sp, d, d, { shape: S.OVAL, fill: C.ffn, line: C.ffn, anim: A(3, "zoom", lit.indexOf(i) * 150) });
  }
  const ox = 5.65;
  line(s, ex + d + 0.02, top, ox, 2.5, { color: C.ffnM, w: 1, head: false, anim: A(4, "wipe") });
  line(s, ex + d + 0.02, top + (n - 1) * sp + d, ox, 5.18, { color: C.ffnM, w: 1, head: false, anim: A(4, "wipe") });
  vec(s, ox, 2.5, inV.map((v, i) => (lit.includes(i * 2) ? 0.9 : v * 0.5)), diverge(C.ffn, C.tok), { vertical: true, cw: 0.32, ch: 0.3, gap: 0.04, anim: (i) => A(4, "fade", 300 + i * 40) });
  [
    ["In", 0.95, 0.85, 1], ["① expand ×4\n768 → 3,072", 1.7, 1.3, 2], ["② GELU\nswitch on/off", 3.03, 1.2, 3], ["③ compress\n3,072 → 768", 4.3, 1.3, 4], ["Out", 5.38, 0.85, 4],
  ].forEach(([t, x, w, st]) => text(s, t, { x, y: 5.5, w, h: 0.45, fontSize: 9.5, color: C.ffn, bold: true, align: "center", objectName: A(st, "fade", 200) }));

  // same FFN for every token
  let x = 0.6;
  SENT.forEach((t, i) => {
    x += chip(s, t, x, 6.2, { w: 0.5, h: 0.34, size: 10, fill: C.white, line: C.line, anim: A(5, "fade", i * 100) });
    line(s, x + 0.02, 6.37, x + 0.16, 6.37, { color: C.ffn, w: 1, anim: A(5, "fade", i * 100) });
    box(s, "FFN", x + 0.18, 6.2, 0.42, 0.34, { fill: C.ffnL, color: C.ffn, size: 9, bold: true, margin: 0, anim: A(5, "fade", i * 100 + 50) });
    x += 0.8;
  });
  text(s, "same weights, every token, in parallel", { x: 0.6, y: 6.62, w: 6.5, h: 0.22, fontSize: 9, italic: true, color: C.muted, objectName: A(5, "fade", 500) });

  card(s, 7.7, 1.85, 5.0, 1.15, "Attention = a group meeting", "Tokens exchange information. “the” hears that a cat is sitting on something.", { fill: C.attL, tc: C.att });
  card(s, 7.7, 3.15, 5.0, 1.15, "Feed-forward = desk work", "Each token goes back to its own desk and processes what it heard — alone.", { fill: C.ffnL, tc: C.ffn });
  card(s, 7.7, 4.45, 5.0, 1.5, "What lit neurons might encode for “the”", [
    "●  a surface or location comes next",
    "●  household-object words are likely",
    "●  the noun phrase is about to end",
  ], { fill: C.white, line: C.ffnM, tc: C.ffn, anim: A(3, "rise", 300) });
  text(s, "About two-thirds of the weights inside the blocks live in these layers; researchers believe much of its factual knowledge is stored here.", { x: 7.7, y: 6.12, w: 5.0, h: 0.6, fontSize: 10, color: C.muted, objectName: A(5, "fade", 600) });

  s.addNotes(`The second half of every block is the feed-forward network, also called the MLP.

The key contrast: attention is a group meeting — tokens exchange information. The feed-forward network is desk work — each token goes back to its own desk and processes what it heard, on its own.

[CLICK] Here's the vector for the last “the”, after attention has told it about the cat and the sitting.
[CLICK] Step one: expand it into a much bigger layer — four times wider. In GPT-2, 768 numbers become 3,072.
[CLICK] Step two: a non-linear function, GELU, acts like a set of switches. Most neurons stay quiet; a few light up. Those lit neurons are features — loosely, things like "a surface comes next" or "household objects are likely". (Illustrative labels — real features are messier.)
[CLICK] Step three: compress back down to 768 numbers. Same shape as before, but refined.

[CLICK] The exact same network, with the same weights, is applied to every token separately — in parallel.

Fun fact: about two-thirds of the weights inside the blocks live in these layers, and interpretability research suggests a lot of factual knowledge — "Paris is the capital of France" — is stored here.

Slogan to remember: attention mixes, feed-forward transforms. Next slide: a worked example of what the MLP actually does.`);
}

// =====================================================================
// 9. The MLP up close: a worked example
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "17 · THE MLP UP CLOSE", C.ffn, "The MLP up close: what it does in every block",
    "Every block has its own MLP: thousands of “if I see this pattern → add that meaning” rules, applied to each token.");

  // ---- left: worked example ----
  chip(s, "the", 0.6, 1.8, { w: 0.6, h: 0.34, size: 11, fill: C.tokL, line: C.tok, anim: A(1, "fade") });
  text(s, "Worked example: the vector for the last “the” in “The cat sat on the”", { x: 1.3, y: 1.84, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: C.ffn, objectName: A(1, "fade") });
  [["DETECTOR · row of W₁ · looks for…", 0.6, 2.45], ["SCORE → GELU", 3.3, 1.35], ["WRITER · column of W₂ · adds", 4.9, 2.3]].forEach(([t, x, w]) =>
    text(s, t, { x, y: 2.28, w, h: 0.22, fontSize: 8.5, bold: true, color: C.muted, charSpacing: 1, objectName: A(1, "fade", 150) }));

  const neurons = [
    { det: "a sitting verb right before it (“sat on”)", score: "2.6 → 2.6", state: "FIRES", out: "“a surface or piece of furniture comes next”", on: true },
    { det: "an animal or pet is the subject (“cat”)", score: "1.4 → 1.3", state: "FIRES", out: "“cosy pet spots: mat, rug, sofa, bed”", on: true },
    { det: "the text is about money or banking", score: "−1.8 → 0.0", state: "SILENT", out: "“bank, price, dollars” — not added", on: false },
  ];
  neurons.forEach((n, i) => {
    const y = 2.58 + i * 0.86, st = i + 2;
    box(s, n.det, 0.6, y, 2.45, 0.72, { fill: n.on ? C.ffnL : C.bg2, color: n.on ? C.ink : C.faint, size: 10.5, align: "left", margin: [10, 8, 0, 0], anim: A(st, "rise") });
    line(s, 3.08, y + 0.36, 3.27, y + 0.36, { color: n.on ? C.ffn : C.faint, w: 1.5, anim: A(st, "wipe", 200) });
    box(s, [
      { text: n.score, options: { fontSize: 10, color: n.on ? C.white : C.muted, breakLine: true } },
      { text: n.state, options: { fontSize: 11, bold: true, color: n.on ? C.white : C.muted } },
    ], 3.3, y, 1.35, 0.72, { fill: n.on ? C.ffn : "E2E8F0", margin: 0, anim: A(st, "zoom", 350) });
    line(s, 4.68, y + 0.36, 4.87, y + 0.36, { color: n.on ? C.ffn : C.faint, w: 1.5, dash: n.on ? undefined : "dash", anim: A(st, "wipe", 600) });
    box(s, n.out, 4.9, y, 2.2, 0.72, { fill: n.on ? C.white : C.bg2, line: n.on ? C.ffn : C.line, color: n.on ? C.ffn : C.faint, size: 10.5, bold: n.on, align: "left", margin: [10, 8, 0, 0], anim: A(st, "rise", 750) });
  });

  // result: x + MLP(x)
  s.addText([
    { text: "Result:  x + MLP(x)", options: { bold: true, color: C.ink } },
    { text: "   the update is added back through the residual path", options: { color: C.muted, fontSize: 10 } },
  ], { x: 0.6, y: 5.25, w: 6.5, h: 0.28, fontFace: F, fontSize: 11.5, margin: 0, isTextBox: true, objectName: A(5, "fade") });
  text(s, "the vector now leans toward:", { x: 0.6, y: 5.7, w: 2.1, h: 0.34, fontSize: 10, color: C.muted, valign: "middle", objectName: A(5, "fade", 100) });
  let cx = 2.7;
  [["mat ↑", true], ["rug ↑", true], ["sofa ↑", true], ["floor ↑", true], ["bank ↓", false]].forEach(([t, up], k) => {
    cx += chip(s, t, cx, 5.7, { size: 10.5, h: 0.34, fill: up ? C.ffnL : C.bg2, line: up ? C.ffn : C.line, color: up ? C.ffn : C.faint, anim: A(5, "zoom", 250 + k * 120) }) + 0.1;
  });
  text(s, "Illustrative: real neurons are messier, and many fire a little at once.", { x: 0.6, y: 6.2, w: 6.5, h: 0.24, fontSize: 9.5, italic: true, color: C.faint, objectName: A(5, "fade", 900) });

  // ---- right: the MLP's job at different depths ----
  text(s, "Same design, a different job at each depth", { x: 7.5, y: 1.84, w: 5.2, h: 0.28, fontSize: 11, bold: true, color: C.ink, objectName: A(6, "fade") });
  [
    { t: "Early blocks · tidy up the token", d: "“ the” + position 4 → “a determiner; a noun phrase starts here”.", f: C.tokL, c: C.tok },
    { t: "Middle blocks · combine context", d: "“sat” + “on” + “the” → “we are describing a location”.", f: C.attL, c: C.att },
    { t: "Late blocks · recall and prepare the answer", d: "“cat” + “sits on” → boost mat, sofa, floor; push down unrelated words.", f: C.outL, c: C.out },
  ].forEach((r, k) => card(s, 7.5, 2.25 + k * 1.05, 5.2, 0.92, r.t, r.d, { fill: r.f, tc: r.c, ts: 12, bs: 10.5, margin: [8, 12, 8, 12], anim: A(6, "rise", k * 250) }));
  s.addText([
    { text: "MLP(x) = W₂ · GELU(W₁ · x + b₁) + b₂", options: { bold: true, color: C.ffn, fontSize: 12.5, breakLine: true } },
    { text: "W₁ holds the detectors, W₂ holds what each one writes. GPT-2 small has 3,072 of them in every block, and each of its 12 blocks learns its own set.", options: { color: C.body, fontSize: 10.5, paraSpaceBefore: 4 } },
  ], { shape: S.ROUNDED_RECTANGLE, x: 7.5, y: 5.45, w: 5.2, h: 1.25, rectRadius: 0.1, fill: { color: C.bg2 }, fontFace: F, valign: "middle", margin: [8, 12, 8, 12], objectName: A(7, "rise") });

  s.addNotes(`The last slide said what the MLP is. This one shows what it does, with our sentence. The MLP, multi-layer perceptron, is the same thing as the feed-forward network.

A useful mental model: the MLP is a huge set of rules, each saying "if I see this pattern, add that meaning". Each hidden neuron is one rule. Its row of the first weight matrix, W1, is the detector: the pattern it looks for. Its column of the second matrix, W2, is the writer: what it adds to the vector when it fires.

[CLICK] Take the vector for the last “the” in “The cat sat on the”. Attention has already mixed in information about the cat and the sitting.

[CLICK] Neuron 1's detector looks for "a sitting verb just before". It matches strongly, score 2.6. GELU lets it through: it fires. Its writer adds "a surface or piece of furniture comes next".

[CLICK] Neuron 2 looks for "an animal or pet is the subject". It also fires and adds "cosy pet spots: mat, rug, sofa, bed".

[CLICK] Neuron 3 looks for "talk about money". The score is negative, so GELU squashes it to about zero. It stays silent and adds nothing. That is the job of the non-linearity: rules switch ON only when their pattern is present.

[CLICK] The MLP's output is added back to the original vector through the residual path. The vector now leans toward mat, rug, sofa and floor, and away from bank. The final prediction still happens at the very top, but this block nudged it in the right direction.

[CLICK] Every block has its own MLP with its own rules, and their jobs shift with depth. Early blocks tidy up the token itself. Middle blocks combine context into ideas like "this is a location". Late blocks recall facts and push up the likely answers.

[CLICK] The formula: W1 holds the detectors, GELU is the on/off switch, W2 holds what each detector writes. GPT-2 small has 3,072 detectors in each of its 12 blocks.

Honesty point: these neat labels are illustrative. Real neurons often respond to several unrelated things, and meaning is usually spread across many neurons at once. The "detector and writer" picture is still the most useful way to think about it.`);
}

// =====================================================================
// 10. Stacking blocks
// =====================================================================
if (FULL) {
  const s = contentSlide("The decoder block", "18 · STACKING BLOCKS", C.att, "Stacking blocks: from spelling to meaning",
    "The same block design repeats many times — 12 in GPT-2 small, 96 in GPT-3. Each layer refines the vectors further.");
  const sx = 4.35, sw = 3.6, bh = 0.6, bg = 0.12;
  const by = (i) => 5.55 - i * (bh + bg);
  ["Block 1", "Block 2", "Block 3", "⋮", "Block N"].forEach((t, i) => {
    const y = by(i);
    rect(s, sx, y, sw, bh, { shape: S.ROUNDED_RECTANGLE, r: 0.08, fill: C.card, line: C.line, anim: A(2, "rise", i * 180) });
    if (t === "⋮") {
      text(s, "⋮  many more identical blocks", { x: sx, y: y + 0.17, w: sw, h: 0.26, fontSize: 10, color: C.muted, align: "center", objectName: A(2, "rise", i * 180) });
    } else {
      text(s, t, { x: sx + 0.15, y: y + 0.18, w: 0.9, h: 0.24, fontSize: 10, bold: true, color: C.muted, objectName: A(2, "rise", i * 180) });
      box(s, "Attention", sx + 1.15, y + 0.11, 1.15, 0.38, { fill: C.attL, color: C.att, size: 10, bold: true, margin: 0, anim: A(2, "rise", i * 180) });
      box(s, "FFN", sx + 2.4, y + 0.11, 1.0, 0.38, { fill: C.ffnL, color: C.ffn, size: 10, bold: true, margin: 0, anim: A(2, "rise", i * 180) });
    }
  });
  let cx = sx + 0.18;
  SENT.forEach((t, i) => { cx += chip(s, t, cx, 6.32, { w: 0.6, h: 0.36, size: 10.5, fill: C.tokL, line: C.tok, anim: A(1, "rise", i * 80) }) + 0.08; });
  line(s, sx + sw / 2, 6.3, sx + sw / 2, 6.18, { color: C.faint, w: 1.5, anim: A(1, "fade") });
  line(s, sx + sw / 2, by(4) - 0.02, sx + sw / 2, 1.95, { color: C.out, w: 2, anim: A(5, "wipe") });
  text(s, "to the output layer", { x: sx + sw / 2 + 0.12, y: 2.0, w: 2.0, h: 0.24, fontSize: 10, italic: true, color: C.out, objectName: A(5, "fade") });

  const groups = [
    { y: 4.85, h: 1.3, t: "Lower layers · surface patterns", d: "Word pieces and nearby words. “the” is a determiner, so a noun usually follows.", c: C.tok, f: C.tokL, st: 3, v: 0.35 },
    { y: 4.03, h: 0.74, t: "Middle · structure", d: "Who did what: “cat” is the one sitting; “on the” opens a place.", c: C.att, f: C.attL, st: 4, v: 0.65 },
    { y: 2.6, h: 1.35, t: "Higher layers · meaning", d: "“A cat sat on the ___” → something a cat sits on: mat, sofa, floor…", c: C.out, f: C.outL, st: 5, v: 1 },
  ];
  groups.forEach((g) => {
    line(s, 8.25, g.y + 0.05, 8.25, g.y + g.h - 0.05, { color: g.c, w: 2, head: false, anim: A(g.st, "fade") });
    s.addText([
      { text: g.t + "  ", options: { bold: true, color: g.c } },
      { text: g.d, options: { color: C.body } },
    ], { x: 8.45, y: g.y, w: 4.25, h: g.h, fontFace: F, fontSize: 10.5, valign: "middle", margin: 0, isTextBox: true, objectName: A(g.st, "rise") });
  });
  // evolving vector for "the"
  text(s, "The vector for the last “the”, layer by layer", { x: 0.6, y: 1.9, w: 3.5, h: 0.26, fontSize: 10, bold: true, color: C.muted });
  const r = rng(7);
  const base = Array.from({ length: 8 }, () => r());
  [[5.25, 0.35, C.tok, "a determiner; a noun is coming", 3], [4.2, 0.65, C.att, "…the place where the cat sat", 4], [3.0, 1, C.out, "…a surface a cat sits on: mat?", 5]].forEach(([y, k, c, lab, st], i) => {
    vec(s, 0.6, y, base.map((v, d) => Math.abs(Math.sin(v * 3 + d * k + i))), (v) => mix("FFFFFF", c, 0.15 + 0.85 * v * k), { cw: 0.24, ch: 0.28, anim: () => A(st, "fade") });
    text(s, lab, { x: 0.6, y: y + 0.34, w: 3.4, h: 0.24, fontSize: 9.5, italic: true, color: c, objectName: A(st, "fade", 100) });
  });

  s.addNotes(`Because a block's output has the same shape as its input, we can stack them. GPT-2 small has 12 blocks; GPT-3 has 96. Each block has its own weights, but the same design.

[CLICK] Our five token vectors enter at the bottom.
[CLICK] And flow up through the stack, block after block.

What happens along the way? Researchers who probe these models find a rough division of labour:
[CLICK] Lower layers handle surface patterns — word pieces, nearby words, basic grammar. For “the”: "I'm a determiner; a noun is probably next."
[CLICK] Middle layers capture structure — who did what to whom. “cat” is the one sitting; “on the” is opening a location.
[CLICK] Higher layers build meaning that's directly useful for prediction: "something a cat sits on". The vector at the top is what goes to the output layer.

On the left, you can see the vector for the last “the” getting richer as it rises. Same token, same position — but by the top it "knows" a lot about the whole sentence.

This is a tendency, not a strict rule. Layers overlap a lot.`);
}

// =====================================================================
// 10. Hidden state -> probabilities
// =====================================================================
if (FULL) pres.addSection({ title: "Output and generation" });
if (FULL) {
  const s = contentSlide("Output and generation", "19 · FROM HIDDEN STATE TO PROBABILITIES", C.out, "From hidden state to probabilities",
    "Only the last token’s final vector is used to predict what comes next.");
  let x = 0.6;
  SENT.forEach((t, i) => {
    const last = i === 4;
    x += chip(s, t, x, 1.85, { w: 0.62, h: 0.38, size: 11, fill: last ? C.outL : C.white, line: last ? C.out : C.line, anim: A(1, "fade", i * 60) }) + 0.07;
  });
  const vx = 3.07;
  line(s, vx + 0.17, 2.26, vx + 0.17, 2.6, { color: C.out, w: 1.5, anim: A(1, "fade", 300) });
  const r = rng(42);
  vec(s, vx, 2.65, Array.from({ length: 8 }, () => r()), diverge(C.out, C.att), { vertical: true, cw: 0.34, ch: 0.3, gap: 0.04, anim: (i) => A(1, "fade", 400 + i * 40) });
  text(s, "final vector of the last token (768 numbers)", { x: 0.6, y: 3.45, w: 2.3, h: 0.5, fontSize: 10, bold: true, color: C.ink, align: "right", objectName: A(1, "fade", 600) });
  text(s, "Earlier positions also have outputs, but they aren’t used to pick this next token.", { x: 0.6, y: 4.05, w: 2.3, h: 0.7, fontSize: 9, italic: true, color: C.muted, align: "right", objectName: A(1, "fade", 700) });

  line(s, 3.5, 4.0, 3.95, 4.0, { color: C.out, w: 1.75, anim: A(2, "wipe") });
  s.addText([
    { text: "Linear layer", options: { bold: true, fontSize: 13, color: C.out, breakLine: true } },
    { text: "“LM head”", options: { fontSize: 10.5, color: C.out, breakLine: true } },
    { text: "768 → 50,257", options: { bold: true, fontSize: 12, color: C.ink, paraSpaceBefore: 8, breakLine: true } },
    { text: "one score for every token in the vocabulary", options: { fontSize: 9.5, color: C.muted, paraSpaceBefore: 4 } },
  ], { shape: S.ROUNDED_RECTANGLE, x: 4.0, y: 3.0, w: 1.9, h: 2.0, rectRadius: 0.1, fill: { color: C.outL }, fontFace: F, align: "center", valign: "middle", margin: 6, objectName: A(2, "zoom") });
  line(s, 5.95, 4.0, 6.35, 4.0, { color: C.out, w: 1.75, anim: A(3, "wipe") });

  const rows = [["mat", 7.1, 0.41], ["floor", 6.0, 0.14], ["sofa", 5.8, 0.11], ["bed", 5.5, 0.08], ["chair", 5.1, 0.06], ["windowsill", 4.8, 0.04], ["…", null, 0.16], ["banana", -3.2, 0.000001]];
  text(s, "Logits (raw scores)", { x: 6.4, y: 2.15, w: 2.0, h: 0.26, fontSize: 10, bold: true, color: C.muted, objectName: A(3, "fade") });
  text(s, "Probabilities", { x: 9.75, y: 2.15, w: 2.0, h: 0.26, fontSize: 10, bold: true, color: C.muted, objectName: A(4, "fade") });
  rows.forEach(([t, lg, p], i) => {
    const y = 2.5 + i * 0.42;
    const isDots = t === "…";
    text(s, isDots ? "⋮  50,000+ more" : t, { x: 6.4, y, w: 1.25, h: 0.34, fontSize: isDots ? 9 : 11, bold: !isDots, color: isDots ? C.faint : C.ink, valign: "middle", objectName: A(3, "fade", i * 80) });
    if (lg !== null) text(s, lg.toFixed(1), { x: 7.65, y, w: 0.65, h: 0.34, fontSize: 11, color: C.body, align: "right", valign: "middle", objectName: A(3, "fade", i * 80) });
    const label = isDots ? "everything else" : t;
    text(s, label, { x: 9.75, y, w: 1.05, h: 0.34, fontSize: isDots ? 9 : 11, bold: !isDots, color: isDots ? C.faint : C.ink, valign: "middle", objectName: A(4, "fade", 300 + i * 90) });
    const bw = Math.max(0.03, p * 3.4);
    rect(s, 10.85, y + 0.06, bw, 0.22, { fill: i === 0 ? C.out : isDots ? C.line : "FDA4AF", anim: A(4, "wipe", 300 + i * 90) });
    text(s, p < 0.001 ? "≈0%" : `${Math.round(p * 100)}%`, { x: 10.85 + bw + 0.06, y, w: 0.5, h: 0.34, fontSize: 10, bold: i === 0, color: i === 0 ? C.out : C.muted, valign: "middle", objectName: A(4, "fade", 400 + i * 90) });
  });
  box(s, "softmax", 8.45, 3.79, 0.95, 0.42, { fill: C.out, color: C.white, size: 11, bold: true, margin: 0, anim: A(4, "zoom") });
  line(s, 9.42, 4.0, 9.7, 4.0, { color: C.out, w: 1.5, anim: A(4, "wipe", 150) });

  box(s, [
    { text: "Softmax  ", options: { bold: true, color: C.out } },
    { text: "pᵢ = eᶻⁱ / Σⱼ eᶻʲ  —  exponentiate every score (all become positive), then divide by the total so they add up to 100%.", options: { color: C.body } },
  ], 0.6, 6.12, 12.1, 0.55, { fill: C.bg2, size: 11, align: "left", margin: [0, 14, 0, 14], anim: A(5, "rise") });

  s.addNotes(`We've reached the top of the stack. Now: how do we turn a vector into a word?

[CLICK] Key detail many people miss: to predict the NEXT token, we only use the final vector of the LAST token — here the last “the”. Thanks to attention, that vector already contains information from the whole sentence. The other positions also have outputs; during training they're used to predict their own next tokens, but for this prediction we ignore them.

[CLICK] That vector goes through one more linear layer, called the LM head. It maps 768 numbers to 50,257 numbers — one score for every token in GPT-2's vocabulary.

[CLICK] These raw scores are called logits. Higher means "more likely". “mat” scores 7.1, “floor” 6.0, “banana” −3.2. They aren't probabilities yet — they can be negative and don't add up to anything in particular.

[CLICK] Softmax fixes that: raise e to the power of each score, so everything becomes positive, then divide by the total. Now we have a probability distribution: mat 41%, floor 14%, sofa 11%… and a long tail of tens of thousands of unlikely tokens.

[CLICK] That's the formula. Notice how the exponential stretches differences: a score gap of about 1.1 between mat and floor becomes a 3× difference in probability.

These numbers are illustrative but realistic in shape.`);
}

// =====================================================================
// 11. Choosing the next token
// =====================================================================
if (FULL) {
  const s = contentSlide("Output and generation", "20 · CHOOSING THE NEXT TOKEN", C.out, "Choosing the next token: decoding strategies",
    "The model gives probabilities. A decoding strategy turns them into one actual token.");
  const toks = ["mat", "floor", "sofa", "bed", "chair", "windowsill"];
  function bars(x, y, ps, o = {}) {
    const rh = o.rh || 0.17, g = 0.03, lw = o.lw || 0.85, scale = o.scale || 2.6;
    ps.forEach((p, i) => {
      const yy = y + i * (rh + g);
      const kept = !o.kept || o.kept.includes(i);
      const name = o.names ? o.names[i] : toks[i];
      text(s, name, { x, y: yy, w: lw, h: rh, fontSize: 8.5, color: kept ? C.ink : C.faint, align: "right", valign: "middle", objectName: o.anim && o.anim(i) });
      const bw = Math.max(0.02, p * scale);
      rect(s, x + lw + 0.08, yy + 0.02, bw, rh - 0.04, { fill: !kept ? "E2E8F0" : i === (o.hi ?? -1) ? C.out : o.color || "FDA4AF", anim: o.anim && o.anim(i) });
      text(s, kept || o.showDropped ? `${Math.round(p * 100)}%` : "✕", { x: x + lw + 0.12 + bw, y: yy, w: 0.45, h: rh, fontSize: 8.5, color: kept ? C.muted : C.faint, valign: "middle", objectName: o.anim && o.anim(i) });
    });
  }
  text(s, "Temperature: sharpen or flatten the odds", { x: 0.6, y: 1.8, w: 5.6, h: 0.3, fontSize: 13, bold: true, color: C.ink });
  const temps = [
    { T: "T = 0.3", sub: "focused", out: "→ “mat.” almost every time", ps: [0.96, 0.03, 0.01, 0, 0, 0, 0], st: 2 },
    { T: "T = 1.0", sub: "as trained", out: "→ mostly “mat”, sometimes “sofa”", ps: [0.41, 0.14, 0.11, 0.08, 0.06, 0.04, 0.16], st: 1 },
    { T: "T = 1.8", sub: "wild", out: "→ “…on the keyboard and refused to move”", ps: [0.18, 0.1, 0.09, 0.07, 0.06, 0.05, 0.45], st: 3 },
  ];
  temps.forEach((t, i) => {
    const y = 2.25 + i * 1.53;
    rect(s, 0.6, y, 5.7, 1.43, { shape: S.ROUNDED_RECTANGLE, r: 0.08, fill: C.card, anim: A(t.st, "rise") });
    s.addText([
      { text: t.T, options: { bold: true, fontSize: 13, color: C.out, breakLine: true } },
      { text: t.sub, options: { fontSize: 10, color: C.muted, breakLine: true } },
      { text: t.out, options: { fontSize: 9.5, italic: true, color: C.body, paraSpaceBefore: 6 } },
    ], { x: 0.75, y: y + 0.1, w: 1.95, h: 1.25, fontFace: F, valign: "top", margin: 0, isTextBox: true, objectName: A(t.st, "rise") });
    bars(2.75, y + 0.06, t.ps, { names: [...toks, "others"], scale: 2.5, hi: 0, rh: 0.165, lw: 0.75, anim: (k) => A(t.st, "wipe", 200 + k * 60) });
  });

  const cards = [
    { t: "Greedy", rule: "Always take the single most likely token.", out: "“The cat sat on the mat.”", note: "Predictable — but can get repetitive.", ps: [0.41, 0.14, 0.11, 0.08, 0.06, 0.04], kept: [0], st: 4 },
    { t: "Top-k  (k = 3)", rule: "Keep the 3 most likely, renormalise, roll the dice.", out: "“…on the floor.”", note: "Cuts off the weird tail.", ps: [0.62, 0.21, 0.17, 0.08, 0.06, 0.04], kept: [0, 1, 2], st: 5 },
    { t: "Top-p  (p = 0.8)", rule: "Keep the smallest set that covers 80% of probability.", out: "“…on the sofa.”", note: "Adapts: few options when confident, more when unsure.", ps: [0.51, 0.18, 0.14, 0.1, 0.07, 0.04], kept: [0, 1, 2, 3, 4], st: 6 },
  ];
  cards.forEach((c, i) => {
    const y = 1.8 + i * 1.65, x = 6.6;
    rect(s, x, y, 6.1, 1.52, { shape: S.ROUNDED_RECTANGLE, r: 0.08, fill: C.outL, anim: A(c.st, "rise") });
    s.addText([
      { text: c.t, options: { bold: true, fontSize: 13, color: C.out, breakLine: true } },
      { text: c.rule, options: { fontSize: 10, color: C.body, paraSpaceBefore: 3, breakLine: true } },
      { text: c.out, options: { fontSize: 10.5, bold: true, color: C.ink, paraSpaceBefore: 5, breakLine: true } },
      { text: c.note, options: { fontSize: 9, italic: true, color: C.muted, paraSpaceBefore: 3 } },
    ], { x: x + 0.15, y: y + 0.1, w: 2.95, h: 1.35, fontFace: F, valign: "top", margin: 0, isTextBox: true, objectName: A(c.st, "rise") });
    bars(x + 3.1, y + 0.18, c.ps, { kept: c.kept, scale: 2.4, hi: 0, rh: 0.17, lw: 0.85, color: "FDA4AF", anim: (k) => A(c.st, "wipe", 200 + k * 60) });
  });
  text(s, "Sampling = rolling a weighted die. Real systems usually combine temperature with top-p. Outputs shown are illustrative.", { x: 0.6, y: 6.8, w: 11, h: 0.2, fontSize: 8.5, italic: true, color: C.faint });

  s.addNotes(`The model hands us probabilities. Something still has to pick ONE token. That's the decoding strategy, and it has a huge effect on how the model "feels".

Start on the left with temperature. Temperature reshapes the distribution before we sample.
[CLICK] T = 1 is the distribution as trained: mat 41%, a long tail of others. Sampling from this — rolling a weighted die — usually gives “mat”, sometimes “sofa”.
[CLICK] Low temperature, like 0.3, sharpens it: mat jumps to 96%. Very focused, very predictable.
[CLICK] High temperature, like 1.8, flattens it: now the weird tail gets 45% of the probability — and you get “the cat sat on the keyboard and refused to move”. Creative, sometimes nonsense.

On the right, ways to choose:
[CLICK] Greedy: always take the top token. Deterministic — same answer every time — but it can fall into loops like "the the the".
[CLICK] Top-k: keep only the k most likely tokens — here 3 — rescale them to 100%, then sample. Cuts off the bizarre tail.
[CLICK] Top-p, or nucleus sampling: keep the smallest set whose probabilities add up to p, here 80%. That's five tokens here. When the model is confident the set is tiny; when unsure it grows. That adaptiveness is why top-p is so popular.

In practice, chat models typically combine a temperature with top-p. When you set "temperature" in an API, this is exactly the knob you're turning.`);
}

// =====================================================================
// 12. Generation loop
// =====================================================================
if (FULL) {
  const s = contentSlide("Output and generation", "21 · THE AUTOREGRESSIVE LOOP", C.out, "The generation loop",
    "Predict, append, repeat — until the model emits an end token or hits a length limit.");
  const cx = 3.65, cy = 4.4, R = 1.8, RX = 2.15;
  rect(s, cx - RX, cy - R, 2 * RX, 2 * R, { shape: S.OVAL, line: C.line, lw: 2, dash: "dash" });
  const nodes = [
    { t: "① Run the decoder", ang: 90, fill: C.att },
    { t: "② Get probabilities", ang: 0, fill: C.out },
    { t: "③ Pick a token", ang: 270, fill: C.tok },
    { t: "④ Append it", ang: 180, fill: C.ffn },
  ];
  nodes.forEach((n, i) => {
    const a = (n.ang * Math.PI) / 180;
    const x = cx + RX * Math.cos(a), y = cy - R * Math.sin(a);
    box(s, n.t, x - 0.9, y - 0.3, 1.8, 0.6, { fill: n.fill, color: C.white, size: 11.5, bold: true, anim: A(1, "zoom", i * 350) });
    // arrowhead on ring, clockwise, after this node
    const a2 = ((n.ang - 45) * Math.PI) / 180;
    const ax = cx + RX * Math.cos(a2), ay = cy - R * Math.sin(a2);
    s.addShape(S.ISOSCELES_TRIANGLE, { x: ax - 0.13, y: ay - 0.13, w: 0.26, h: 0.26, fill: { color: C.norm }, line: { type: "none" }, rotate: (225 - n.ang + 360) % 360, objectName: A(1, "fade", i * 350 + 200) });
  });
  text(s, "the sequence grows by one token each lap", { x: cx - 0.8, y: cy - 0.35, w: 1.6, h: 0.7, fontSize: 10, italic: true, color: C.muted, align: "center", valign: "middle" });

  const laps = [
    { y: 2.15, toks: SENT, pred: "mat", p: "41%" },
    { y: 3.15, toks: [...SENT, "*mat"], pred: ".", p: "63%" },
    { y: 4.15, toks: [...SENT, "*mat", "*."], pred: "<end>", p: "58%" },
  ];
  laps.forEach((l, i) => {
    text(s, `Lap ${i + 1}`, { x: 6.9, y: l.y - 0.3, w: 1, h: 0.24, fontSize: 9.5, bold: true, color: C.muted, objectName: A(i + 2, "fade") });
    let d = 0;
    const end = seqRow(s, 6.9, l.y, l.toks, l.pred, { size: 11, h: 0.4, gap: 0.06, anim: () => A(i + 2, "fade", (d += 50)), animPred: () => A(i + 2, "zoom", 450) });
    text(s, l.p, { x: end + 0.08, y: l.y + 0.08, w: 0.5, h: 0.24, fontSize: 9.5, color: C.out, objectName: A(i + 2, "fade", 550) });
  });
  box(s, "STOP", 11.75, 4.62, 0.95, 0.36, { fill: C.ink, color: C.white, size: 10, bold: true, anim: A(4, "zoom", 800) });

  card(s, 6.9, 5.15, 2.85, 1.55, "When does it stop?", [
    "• it emits an end-of-text token, or",
    "• it reaches a length limit (e.g. max_tokens = 256)",
  ], { fill: C.bg2, anim: A(5, "rise") });
  card(s, 9.9, 5.15, 2.8, 1.55, "Speed trick: KV cache", "Keys and values of earlier tokens are saved, so each lap only computes the newest token.", { fill: C.attL, tc: C.att, anim: A(5, "rise", 200) });

  s.addNotes(`Now we can put the output side into a loop. This is what's happening every time you watch a chatbot "type".

[CLICK] Four steps: run the decoder on the whole sequence; get probabilities for the next token; pick one with your decoding strategy; append it to the sequence. Then go round again.

[CLICK] Lap 1: “The cat sat on the” → “mat”, 41%.
[CLICK] Lap 2: the input now includes “mat” — pink, because the model wrote it — and it predicts a full stop.
[CLICK] Lap 3: it predicts the special end-of-text token. We stop.

[CLICK] Two ways to stop: the model produces an end token, or we hit a length limit you set — that's the max_tokens parameter in an API.

And a practical note: naively, each lap re-processes the whole sequence. Real systems cache each token's keys and values — the KV cache — so each lap only computes the newest token. That's why generation is fast, and also why long conversations use a lot of GPU memory.

This loop is also why LLMs can't "go back and edit": each token is final once it's picked.`);
}

// =====================================================================
// V4. The context window
// =====================================================================
if (FULL) {
  const s = contentSlide("Output and generation", "22 · THE CONTEXT WINDOW", C.out, "The context window: the model’s only memory",
    "Everything the model can see in one request — instructions, conversation, documents and its own reply so far — counted in tokens.");
  rect(s, 0.6, 1.8, 5.75, 3.65, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.out, dash: "dash" });
  text(s, "CONTEXT WINDOW · fixed size, in tokens", { x: 0.8, y: 1.9, w: 5.3, h: 0.24, fontSize: 9.5, bold: true, color: C.out, charSpacing: 1 });
  const roles = [
    ["SYSTEM", "You are a support assistant for an online store. Keep answers short.", C.ink, C.white, 1],
    ["USER", "Where’s my order #1138?", C.posL, C.ink, 2],
    ["ASSISTANT", "It shipped yesterday and arrives Friday.", C.attL, C.ink, 2],
    ["USER", "Can I change the delivery address?", C.posL, C.ink, 2],
    ["ASSISTANT", "Yes — …  (being generated now)", C.white, C.muted, 2],
  ];
  roles.forEach(([r, t, f, c, st], k) => {
    const y = 2.25 + k * 0.6;
    s.addText([
      { text: r + "   ", options: { bold: true, fontSize: 8.5, color: f === C.ink ? C.tokM : C.muted, charSpacing: 1 } },
      { text: t, options: { color: c } },
    ], { shape: S.ROUNDED_RECTANGLE, x: 0.8, y, w: 5.35, h: 0.5, rectRadius: 0.06, fill: { color: f }, line: k === 4 ? { color: C.line, width: 1, dashType: "dash" } : { type: "none" }, fontFace: F, fontSize: 10.5, valign: "middle", margin: [10, 8, 0, 0], objectName: A(st, "rise", k * 200) });
  });
  text(s, "What the model actually receives: one flat stream of tokens with special role markers", { x: 0.6, y: 5.58, w: 5.8, h: 0.22, fontSize: 9.5, bold: true, color: C.ink, objectName: A(3, "fade") });
  box(s, "<|system|> You are a support assistant… <|user|> Where’s my order #1138? <|assistant|> It shipped yesterday… <|user|> Can I change the delivery address? <|assistant|>", 0.6, 5.85, 5.75, 0.62, { fill: C.bg2, color: C.body, size: 9, align: "left", valign: "middle", margin: [8, 8, 2, 2], font: F, anim: A(3, "fade", 200) });
  text(s, "Marker tokens differ by model. The system message on top shapes every prediction below it.", { x: 0.6, y: 6.5, w: 5.8, h: 0.22, fontSize: 8.5, italic: true, color: C.muted, objectName: A(3, "fade", 400) });

  // stateless: re-sent every turn
  text(s, "Stateless: the whole chat is re-sent on every turn", { x: 6.8, y: 1.8, w: 5.9, h: 0.28, fontSize: 12, bold: true, color: C.ink, objectName: A(4, "fade") });
  const seg = { S: [0.55, C.ink], U: [0.38, C.pos], A: [0.55, C.att] };
  const bx = 7.55, limit = 4.6;
  const turns = [["Turn 1", "SU", "≈ 150 tokens billed"], ["Turn 2", "SUAU", "≈ 320"], ["Turn 3", "SUAUAU", "≈ 520"]];
  turns.forEach(([lab, segs, bill], k) => {
    const y = 2.25 + k * 0.58;
    text(s, lab, { x: 6.8, y, w: 0.7, h: 0.3, fontSize: 9.5, bold: true, color: C.muted, valign: "middle", objectName: A(4, "fade", k * 350) });
    let x = bx;
    [...segs].forEach((r) => { rect(s, x, y + 0.03, seg[r][0] - 0.03, 0.24, { fill: seg[r][1], anim: A(4, "wipe", k * 350 + 100) }); x += seg[r][0]; });
    text(s, bill, { x: x + 0.08, y, w: 1.6, h: 0.3, fontSize: 9.5, color: C.out, valign: "middle", objectName: A(4, "fade", k * 350 + 250) });
  });
  // turn 40: window full, oldest falls off
  const y40 = 4.15;
  line(s, bx + limit, 2.15, bx + limit, y40 + 0.5, { color: C.out, w: 1.5, dash: "dash", head: false, anim: A(5, "fade") });
  text(s, "window limit", { x: bx + limit - 1.1, y: 2.0, w: 1.05, h: 0.2, fontSize: 8.5, bold: true, color: C.out, align: "right", objectName: A(5, "fade") });
  text(s, "Turn 40", { x: 6.8, y: y40, w: 0.7, h: 0.3, fontSize: 9.5, bold: true, color: C.muted, valign: "middle", objectName: A(5, "fade") });
  let x40 = bx;
  ["S", ..."AUAUAUAUA"].forEach((r, k) => { const w = k === 0 ? 0.55 : 0.45; rect(s, x40, y40 + 0.03, w - 0.03, 0.24, { fill: seg[r][1], anim: A(5, "wipe", 100 + k * 40) }); x40 += w; });
  rect(s, bx + 0.55, y40 + 0.38, 0.8, 0.22, { fill: C.line, anim: A(5, "fade", 700) });
  text(s, "← “Max, my puppy” (turn 3) fell out: gone", { x: bx + 1.4, y: y40 + 0.37, w: 3.5, h: 0.24, fontSize: 9, bold: true, color: C.out, objectName: A(5, "fade", 800) });

  card(s, 6.8, 5.05, 2.88, 1.68, "How big?", [
    "Early models: ~2k–4k tokens.",
    "Frontier today: ~1M (≈ 7 thick novels); some advertise 10M.",
  ], { fill: C.outL, tc: C.out, ts: 11.5, bs: 10, anim: A(6, "rise") });
  card(s, 9.82, 5.05, 2.88, 1.68, "The control lever", [
    "You don’t retrain the model to change its behaviour.",
    "You change what’s in the window.",
  ], { fill: C.attL, tc: C.att, ts: 11.5, bs: 10, anim: A(6, "rise", 200) });

  s.addNotes(`The model predicts from "the text in front of it". What exactly counts as in front of it? The context window — maybe the most important number you're not thinking about.

The context window is everything the model can see in a single request: instructions, the conversation so far, any documents, and the reply it's generating. All measured in tokens, and the size is fixed.

[CLICK] It's organised into roles. At the top, the system message: standing instructions about who the model is and how to behave.
[CLICK] Below it, user messages — the human — and assistant messages — the model's own earlier replies — turn by turn, ending with the reply being written right now.
[CLICK] Underneath, all of this is flattened into ONE long stream of tokens, joined by special marker tokens the model was trained to recognise. The exact markers differ by model. The system message sits on top and quietly shapes every prediction below it.

[CLICK] Here's what surprises most developers: between requests, the model remembers nothing. It is stateless. So how does a chatbot "remember"? On every turn, the app re-sends the entire conversation from the beginning. Turn 1, turn 2, turn 3 — the bar keeps growing, and you pay for all of it every time. The window IS the memory; there's nothing else underneath.

[CLICK] And the window fills up. By turn 40, the oldest messages get dropped to fit. "Max, my puppy" from turn 3 isn't blurry — it's gone. As far as the model knows, Max never existed. (Many apps keep the system message and drop or summarise old turns; providers also offer prompt caching to make re-sent prefixes cheaper, but the tokens are still in the window.)

[CLICK] Sizes: early models saw a couple of thousand tokens; frontier models now hold around a million — roughly seven thick novels — and some advertise ten million. And the control lever: you don't retrain a model to change its behaviour. You change what's sitting in the window.`);
}

// =====================================================================
// V5. Long context has costs
// =====================================================================
if (FULL) {
  const s = contentSlide("Output and generation", "23 · LONG CONTEXT HAS COSTS", C.out, "Why long chats get slow, expensive — and confused",
    "Attention over a growing window has three side effects. The fix is unglamorous, and every serious AI product uses it.");
  const P = [0.6, 4.71, 8.82], pw = 3.9, py = 1.8, ph = 3.85;
  P.forEach((x, k) => rect(s, x, py, pw, ph, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line, anim: A(k + 1, "fade") }));
  // 1. quadratic
  text(s, "① Work grows with the square", { x: 0.8, y: 1.92, w: 3.5, h: 0.28, fontSize: 12, bold: true, color: C.ink, objectName: A(1, "fade") });
  const tri = (x, y, n, cs, step, d0) => {
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) rect(s, x + j * (cs + 0.02), y + i * (cs + 0.02), cs, cs, { fill: C.attM, anim: A(step, "fade", d0 + i * 60) });
  };
  tri(0.85, 2.45, 4, 0.2, 1, 100);
  text(s, "4 tokens\n10 comparisons", { x: 0.75, y: 3.4, w: 1.1, h: 0.45, fontSize: 9, bold: true, color: C.att, align: "center", objectName: A(1, "fade", 400) });
  tri(2.15, 2.45, 8, 0.15, 1, 600);
  text(s, "8 tokens\n36 comparisons", { x: 2.3, y: 3.85, w: 1.1, h: 0.45, fontSize: 9, bold: true, color: C.att, align: "center", objectName: A(1, "fade", 1100) });
  text(s, "Every token is scored against every earlier token. Double the chat → about 4× the attention work. That’s why long chats slow down and giant windows are hard to build.", { x: 0.8, y: 4.45, w: 3.5, h: 1.1, fontSize: 10, color: C.body, objectName: A(1, "fade", 1200) });
  // 2. spread thin
  text(s, "② Focus spreads thin", { x: 4.91, y: 1.92, w: 3.5, h: 0.28, fontSize: 12, bold: true, color: C.ink, objectName: A(2, "fade") });
  text(s, "softmax always splits exactly 100%", { x: 4.91, y: 2.25, w: 3.5, h: 0.22, fontSize: 9.5, italic: true, color: C.muted, objectName: A(2, "fade") });
  text(s, "100 tokens in the window", { x: 4.91, y: 2.62, w: 3.5, h: 0.22, fontSize: 9.5, bold: true, color: C.ink, objectName: A(2, "fade", 100) });
  rect(s, 4.91, 2.88, 0.85, 0.34, { fill: C.att, anim: A(2, "wipe", 200) });
  [0.4, 0.3, 0.55, 0.25, 0.35, 0.45, 0.2].reduce((x, w, k) => { rect(s, x, 2.88, w - 0.02, 0.34, { fill: mix("FFFFFF", C.attM, 0.3 + (k % 3) * 0.15), anim: A(2, "wipe", 200) }); return x + w; }, 5.78);
  text(s, "“Max” ≈ 25%", { x: 4.91, y: 3.25, w: 2, h: 0.22, fontSize: 9, bold: true, color: C.att, objectName: A(2, "fade", 500) });
  text(s, "100,000 tokens in the window", { x: 4.91, y: 3.62, w: 3.5, h: 0.22, fontSize: 9.5, bold: true, color: C.ink, objectName: A(2, "fade", 700) });
  rect(s, 4.91, 3.88, 3.5, 0.34, { fill: "EDE9FE", anim: A(2, "wipe", 800) });
  for (let k = 0; k < 34; k++) rect(s, 4.95 + k * 0.102, 3.88, 0.012, 0.34, { fill: C.white, anim: A(2, "wipe", 800) });
  rect(s, 5.4, 3.88, 0.025, 0.34, { fill: C.att, anim: A(2, "fade", 1100) });
  text(s, "“Max” ≈ a sliver", { x: 4.91, y: 4.25, w: 2, h: 0.22, fontSize: 9, bold: true, color: C.att, objectName: A(2, "fade", 1100) });
  text(s, "A detail from message 3 competes with a huge crowd for a tiny share of attention. Distant details fade.", { x: 4.91, y: 4.65, w: 3.5, h: 0.9, fontSize: 10, color: C.body, objectName: A(2, "fade", 1200) });
  // 3. stale & gone
  text(s, "③ Stale context, then gone", { x: 9.02, y: 1.92, w: 3.5, h: 0.28, fontSize: 12, bold: true, color: C.ink, objectName: A(3, "fade") });
  const msgs = ["Max", "work", "dinner", "trip", "aside", "plans", "…", "ask"];
  msgs.forEach((m, k) => {
    const x = 9.02 + k * 0.43, gone = k < 1;
    box(s, m, x, 2.55, 0.39, 0.5, { fill: gone ? C.bg2 : m === "ask" ? C.out : m === "aside" ? C.tokL : C.white, line: gone ? C.line : C.line, color: gone ? C.faint : m === "ask" ? C.white : C.ink, size: 7.5, bold: true, margin: 0, anim: A(3, "fade", k * 70) });
  });
  rect(s, 9.42, 2.45, 3.06, 0.7, { shape: S.ROUNDED_RECTANGLE, r: 0.08, line: C.out, lw: 1.5, dash: "dash", anim: A(3, "fade", 600) });
  text(s, "window", { x: 11.58, y: 2.22, w: 0.9, h: 0.2, fontSize: 8.5, bold: true, color: C.out, align: "right", objectName: A(3, "fade", 600) });
  line(s, 12.24, 3.07, 12.24, 3.55, { color: C.tok, w: 1.5, head: false, anim: A(3, "fade", 900) });
  line(s, 12.24, 3.55, 10.94, 3.55, { color: C.tok, w: 1.5, head: false, anim: A(3, "wiper", 1000) });
  line(s, 10.94, 3.55, 10.94, 3.08, { color: C.tok, w: 1.5, anim: A(3, "fade", 1300) });
  text(s, "drift: locks onto an old tangent", { x: 9.02, y: 3.62, w: 3.5, h: 0.22, fontSize: 9, bold: true, color: C.tok, objectName: A(3, "fade", 1300) });
  text(s, "Attention matches relevance, not freshness, so stale context can win. Past the limit, “Max” isn’t forgotten — it no longer exists.", { x: 9.02, y: 4.1, w: 3.5, h: 1.2, fontSize: 10, color: C.body, objectName: A(3, "fade", 1400) });

  text(s, "THE ENGINEERING MOVES", { x: 0.6, y: 5.85, w: 4, h: 0.24, fontSize: 9.5, bold: true, color: C.out, charSpacing: 1, objectName: A(4, "fade") });
  ["Start a fresh session", "Summarise, then restart", "Send only what’s relevant", "Restate key facts near your question"].forEach((t, k) => {
    box(s, t, 0.6 + k * 3.07, 6.15, 2.92, 0.5, { fill: C.outL, color: C.out, size: 11, bold: true, anim: A(4, "rise", k * 150) });
  });

  s.addNotes(`Attention is powerful, but you pay for it. Three side effects, all of which you'll see in real products.

[CLICK] One: the work grows with the square of the length. Every token is scored against every earlier token. 4 tokens means 10 comparisons; 8 tokens means 36. Double the conversation and you roughly quadruple the attention work. That's why long chats get slow, and why giant context windows are an engineering achievement.

[CLICK] Two: focus spreads thin. Softmax always splits exactly 100% of attention across everything in the window. With 100 tokens, "Max" can easily get a big share. With 100,000 tokens, that same detail from message 3 is competing with an enormous crowd for a sliver. Distant details fade. (Research on long contexts also finds models use information in the middle of a long prompt less reliably than information at the start or end.)

[CLICK] Three: stale context and the edge. Attention has no idea what's stale — it just matches relevance. So a new question can latch onto an old tangent and get answered with yesterday's context: drift. And past the window limit, old messages aren't blurry; they're gone.

So when a long chat starts acting strangely — ignoring instructions, answering the wrong question — it's usually one of these: attention spread too thin, locked onto something stale, or the message you care about has fallen out of the window.

[CLICK] The fix is wonderfully unglamorous: start fresh sessions; summarise long conversations and restart from the summary; send only what's relevant; and restate the key facts close to your question. Serious AI products do this quietly under the hood.`);
}

// =====================================================================
// 13. Training vs inference
// =====================================================================
if (FULL) {
  const s = contentSlide("Output and generation", "24 · TRAINING VS. INFERENCE", C.att, "Training vs. inference",
    "Same model, same mask — but training checks every position at once, while generation must go one step at a time.");
  // training panel
  rect(s, 0.6, 1.85, 6.0, 3.55, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line });
  text(s, "Training · all positions in parallel", { x: 0.85, y: 2.0, w: 5.5, h: 0.3, fontSize: 13, bold: true, color: C.att });
  text(s, "“teacher forcing”: always feed the real text", { x: 0.85, y: 2.3, w: 5.5, h: 0.26, fontSize: 10, color: C.muted });
  const inp = ["The", "cat", "sat", "on", "the", "mat"], tgt = ["cat", "sat", "on", "the", "mat", "."];
  const tx = (i) => 0.9 + i * 0.92;
  text(s, "targets (the true next token)", { x: 0.9, y: 2.64, w: 4, h: 0.2, fontSize: 9, bold: true, color: C.out, objectName: A(2, "fade") });
  inp.forEach((t, i) => {
    chip(s, tgt[i], tx(i), 2.88, { w: 0.78, h: 0.42, size: 12, fill: C.outL, line: C.out, anim: A(2, "zoom", 200) });
    line(s, tx(i) + 0.39, 3.62, tx(i) + 0.39, 3.33, { color: C.out, w: 1.5, anim: A(2, "fade") });
    chip(s, t, tx(i), 3.65, { w: 0.78, h: 0.42, size: 12, anim: A(1, "rise", i * 80) });
  });
  text(s, "input (the true text)", { x: 0.9, y: 4.12, w: 4, h: 0.2, fontSize: 9, bold: true, color: C.muted, objectName: A(1, "fade") });
  text(s, "One forward pass → 6 predictions → 6 errors averaged into one loss. Even if the model guesses “floor”, the next position still gets the true “mat”.", { x: 0.85, y: 4.45, w: 5.5, h: 0.8, fontSize: 10.5, color: C.body, objectName: A(2, "fade", 400) });

  // inference panel
  rect(s, 6.85, 1.85, 5.85, 3.55, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: C.card, line: C.line });
  text(s, "Inference · one token per pass", { x: 7.1, y: 2.0, w: 5.4, h: 0.3, fontSize: 13, bold: true, color: C.out });
  text(s, "the model feeds on its own predictions", { x: 7.1, y: 2.3, w: 5.4, h: 0.26, fontSize: 10, color: C.muted });
  const rows = [[SENT, "mat"], [[...SENT, "*mat"], "."], [[...SENT, "*mat", "*."], "<end>"]];
  rows.forEach(([toks, pred], i) => {
    let d = i * 700;
    seqRow(s, 7.1, 2.75 + i * 0.55, toks, pred, { size: 10, h: 0.38, gap: 0.05, anim: () => A(3, "fade", (d += 40)), animPred: () => A(3, "zoom", i * 700 + 450) });
  });
  text(s, "Each new token needs another pass. The future can’t be computed in parallel — it doesn’t exist yet.", { x: 7.1, y: 4.45, w: 5.4, h: 0.8, fontSize: 10.5, color: C.body, objectName: A(3, "fade", 2200) });

  s.addText([
    { text: "Why the mask matters during training  ", options: { bold: true, color: C.out, fontSize: 13, breakLine: true } },
    { text: "In training, the answer is sitting right there in the input: when predicting the token after “on the”, “mat” is one position to the right. Without the causal mask the model would simply copy it — like a test with the answer key stapled on — and learn nothing useful for real generation.", options: { color: C.body, fontSize: 11, paraSpaceBefore: 4 } },
  ], { shape: S.ROUNDED_RECTANGLE, x: 0.6, y: 5.6, w: 12.1, h: 1.15, rectRadius: 0.1, fill: { color: C.outL }, fontFace: F, valign: "middle", margin: [8, 16, 8, 16], objectName: A(4, "rise") });

  s.addNotes(`One model, two modes.

Training first. We take real text from the internet and ask the model to predict every next token.
[CLICK] The input is the true sentence: “The cat sat on the mat”.
[CLICK] The targets are the same sentence shifted one to the left. Position 1 should predict “cat”, position 2 “sat”, and so on. All six predictions happen in ONE forward pass, in parallel — which is why transformers train so efficiently on GPUs. The errors are averaged into one loss, and gradient descent nudges every weight to reduce it.

This is called teacher forcing: even if the model would have guessed “floor”, the next position still receives the true word “mat”.

[CLICK] Inference is different: we don't have the future text, so we must generate one token per pass, feeding each prediction back in. Inherently sequential.

[CLICK] And here's why the mask is essential in training: the answer is literally in the input. When predicting what follows “on the”, “mat” is one position to the right. Without the mask, attention would just look at it and copy — perfect training score, useless model. The mask forces honest prediction and makes training match what happens at generation time.`);
}

// =====================================================================
// 14. Putting it all together
// =====================================================================
if (FULL) pres.addSection({ title: "Summary" });
if (FULL) {
  const s = contentSlide("Summary", "25 · PUTTING IT ALL TOGETHER", C.out, "Putting it all together",
    "Tokens → embeddings → decoder blocks → probabilities → next token, then repeat.");
  const nodes = [
    { t: "Text", d: "“The cat sat on the”", sh: "a string", w: 1.4, f: C.bg2, c: C.ink },
    { t: "Tokenizer", d: "split into pieces, look up IDs", sh: "5 IDs", w: 1.4, f: C.tokL, c: C.tok },
    { t: "Embed + position", d: "lookup table + word order", sh: "5 × 768", w: 1.5, f: C.tokL, c: C.tok },
    { t: "Decoder blocks × N", d: "", sh: "5 × 768", w: 2.3, f: C.attL, c: C.att, inner: true },
    { t: "Final norm + linear", d: "last vector → vocab scores", sh: "50,257 logits", w: 1.55, f: C.outL, c: C.out },
    { t: "Softmax", d: "scores → probabilities", sh: "mat 41% · floor 14%…", w: 1.55, f: C.outL, c: C.out },
    { t: "Pick", d: "", sh: "", w: 0.95, f: C.out, c: C.white, pick: true },
  ];
  const gap = (12.13 - nodes.reduce((a, n) => a + n.w, 0)) / (nodes.length - 1);
  let x = 0.6;
  const y = 2.1, h = 1.7;
  const centers = [];
  nodes.forEach((n, i) => {
    centers.push(x + n.w / 2);
    if (n.pick) {
      box(s, [{ text: "Pick", options: { fontSize: 10, color: "FFE4E6", breakLine: true } }, { text: "mat", options: { fontSize: 18, bold: true } }], x, y, n.w, h, { fill: C.out, color: C.white, anim: A(1, "zoom", i * 300) });
    } else {
      rect(s, x, y, n.w, h, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: n.f, anim: A(1, "rise", i * 300) });
      text(s, n.t, { x: x + 0.1, y: y + 0.12, w: n.w - 0.2, h: 0.45, fontSize: 11.5, bold: true, color: n.c, align: "center", objectName: A(1, "rise", i * 300) });
      if (n.inner) {
        box(s, "masked attention", x + 0.2, y + 0.6, n.w - 0.4, 0.34, { fill: C.att, color: C.white, size: 9.5, bold: true, margin: 0, anim: A(1, "rise", i * 300) });
        box(s, "feed-forward", x + 0.2, y + 1.0, n.w - 0.4, 0.34, { fill: C.ffn, color: C.white, size: 9.5, bold: true, margin: 0, anim: A(1, "rise", i * 300) });
      } else {
        text(s, n.d, { x: x + 0.1, y: y + 0.6, w: n.w - 0.2, h: 0.6, fontSize: 9.5, color: C.body, align: "center", objectName: A(1, "rise", i * 300) });
      }
      text(s, n.sh, { x: x + 0.05, y: y + h - 0.32, w: n.w - 0.1, h: 0.24, fontSize: 8.5, color: C.muted, align: "center", objectName: A(1, "rise", i * 300) });
    }
    if (i < nodes.length - 1) line(s, x + n.w + 0.03, y + h / 2, x + n.w + gap - 0.03, y + h / 2, { color: C.faint, w: 1.5, anim: A(1, "wipe", i * 300 + 200) });
    x += n.w + gap;
  });
  const ly = 4.35;
  line(s, centers[6], y + h + 0.02, centers[6], ly, { color: C.out, w: 1.75, head: false, dash: "dash", anim: A(2, "fade") });
  line(s, centers[6], ly, centers[0], ly, { color: C.out, w: 1.75, head: false, dash: "dash", anim: A(2, "wipe", 200) });
  line(s, centers[0], ly, centers[0], y + h + 0.04, { color: C.out, w: 1.75, dash: "dash", anim: A(2, "fade", 700) });
  box(s, "append “mat” to the text and run again", 4.9, ly - 0.16, 3.5, 0.32, { fill: C.white, color: C.out, size: 10.5, bold: true, margin: 0, anim: A(2, "fade", 400) });

  s.addText([
    { text: "The whole idea: ", options: { color: C.muted } },
    { text: "context-aware next-token prediction, repeated.", options: { color: C.ink, bold: true } },
  ], { x: 0.6, y: 5.05, w: 12.1, h: 0.6, fontFace: F, fontSize: 22, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: A(3, "rise") });
  text(s, "Attention gathers context from earlier tokens · feed-forward layers refine it · depth builds meaning · softmax and sampling pick the word", { x: 0.6, y: 5.75, w: 12.1, h: 0.3, fontSize: 11, color: C.muted, align: "center", objectName: A(3, "fade", 300) });

  s.addNotes(`Here's the whole machine on one slide. Let's walk it once more, end to end.

[CLICK]
- Text: “The cat sat on the”.
- Tokenizer: split into pieces and look up five IDs.
- Embedding plus position: five vectors of 768 numbers — what each token is and where it sits.
- Decoder blocks, N times: masked attention lets each token gather context from earlier tokens; feed-forward refines each token. Same shape in, same shape out.
- Final norm and linear layer: take the last token's vector and score every word in the vocabulary — 50,257 logits.
- Softmax: turn scores into probabilities.
- Pick: choose one token with greedy or sampling. We get “mat”.

[CLICK] Then append “mat” and run the whole thing again. That loop is how every chatbot answer is written.

[CLICK] If you remember one sentence from today, make it this: an LLM is context-aware next-token prediction, repeated. Every component we saw exists to make that one prediction better.`);
}

// =====================================================================
// V6. What the mechanism explains in practice
// =====================================================================
if (FULL) {
  const s = contentSlide("Summary", "26 · WHAT THIS EXPLAINS", C.out, "What the mechanism explains in practice",
    "“A next-token predictor reading a fixed window of tokens.” Most everyday LLM behaviour follows from that one sentence.");
  const rows = [
    ["It runs on tokens", "You pay per token", "input plus output; output is usually priced higher.", C.tok],
    ["The window is its only memory", "It forgets between requests", "apps re-send the whole chat each turn, so long chats cost more and run slower.", C.pos],
    ["Every token attends to every earlier token", "Long context is costly and fuzzy", "work grows with the square; focus spreads thin. Start fresh, summarise, trim.", C.att],
    ["It continues the text it is given", "Wording steers the answer", "the system message, examples and phrasing shape a prediction; it is not a database query.", C.ffn],
    ["Attention finds what is relevant, not what is true", "It can be fluent, confident and wrong", "nothing in the formula checks facts (hallucination). Ground it in sources; verify what matters.", C.out],
  ];
  rows.forEach(([cause, head, detail, c], k) => {
    const y = 1.85 + k * 0.97;
    box(s, cause, 0.6, y, 4.4, 0.8, { fill: mix("FFFFFF", c, 0.14), color: c, size: 12, bold: true, align: "left", margin: [14, 10, 0, 0], anim: A(k + 1, "rise") });
    line(s, 5.08, y + 0.4, 5.6, y + 0.4, { color: c, w: 2, anim: A(k + 1, "wipe", 250) });
    s.addText([
      { text: head + ": ", options: { bold: true, color: C.ink } },
      { text: detail, options: { color: C.body } },
    ], { shape: S.ROUNDED_RECTANGLE, x: 5.7, y, w: 7.0, h: 0.8, rectRadius: 0.08, fill: { color: k === 4 ? C.outL : C.card }, line: { color: k === 4 ? C.out : C.line, width: 1 }, fontFace: F, fontSize: 11.5, valign: "middle", margin: [14, 10, 0, 0], objectName: A(k + 1, "rise", 400) });
  });

  s.addNotes(`Before the takeaways, let's turn the mechanism into practical intuition. One sentence: a language model is a next-token predictor reading a fixed window of tokens. Almost every quirk you'll meet falls out of it.

[CLICK] It runs on tokens — so you pay per token, for what you send and what it writes, and output usually costs more.
[CLICK] The window is its only memory — so it forgets between requests, and chat apps re-send the whole history every turn, which is why long chats cost more and get slower.
[CLICK] Every token attends to every earlier token — so long context is expensive and focus spreads thin. Start fresh sessions, summarise, trim what you send.
[CLICK] It continues the text it's given — so your wording, examples and system message steer the answer. You're shaping a prediction, not querying a database.
[CLICK] And the big one. Attention finds what's RELEVANT, not what's TRUE. Nothing in softmax(QKᵀ/√d)·V checks facts. The model predicts plausible continuations, so it can produce a fluent, confident, perfectly worded answer that is completely wrong — a hallucination — and nothing inside it knows. The practical answers: ground it in real sources (put the facts in the window), and verify anything that matters.`);
}

// =====================================================================
// 15. Key takeaways
// =====================================================================
if (FULL) {
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Summary" });
  text(s, "27 · KEY TAKEAWAYS", { x: 0.8, y: 0.55, w: 8, h: 0.26, fontSize: 10, bold: true, color: C.tokM, charSpacing: 2 });
  s.addText("Five things to remember", { x: 0.8, y: 0.85, w: 11, h: 0.6, fontFace: F, fontSize: 28, bold: true, color: C.white, margin: 0, isTextBox: true });
  const items = [
    ["The decoder is causal", "Each token sees only the past. The mask enforces this in training and in generation.", "64748B"],
    ["Self-attention builds context", "Q·K decides who to listen to; V carries what gets passed along. “sat” learns about “cat”.", C.att],
    ["Feed-forward layers refine", "Attention mixes information across tokens; the feed-forward network transforms each token on its own.", C.ffn],
    ["Repeated blocks build power", "Stack the same block dozens of times: from spelling, to grammar, to meaning.", C.tok],
    ["Generation is one token at a time", "Predict → pick → append → repeat. “The cat sat on the” → “mat”.", C.out],
  ];
  items.forEach(([t, d, c], i) => {
    const y = 1.85 + i * 0.9;
    box(s, String(i + 1), 0.8, y + 0.08, 0.56, 0.56, { shape: S.OVAL, fill: c, color: C.white, size: 15, bold: true, margin: 0, anim: A(i + 1, "zoom") });
    text(s, t, { x: 1.6, y: y + 0.1, w: 4.3, h: 0.5, fontSize: 15, bold: true, color: C.white, valign: "middle", objectName: A(i + 1, "rise", 100) });
    text(s, d, { x: 6.0, y: y + 0.06, w: 6.5, h: 0.6, fontSize: 12, color: C.darkText, valign: "middle", objectName: A(i + 1, "rise", 200) });
  });
  text(s, "The cat sat on the mat — one token at a time.", { x: 0.8, y: 6.55, w: 11, h: 0.32, fontSize: 12, italic: true, color: C.tokM, objectName: A(6, "fade") });

  s.addNotes(`Five things to take away.

[CLICK] One: the decoder is causal. Each token can only see the past. The mask enforces it — in training to stop cheating, and in generation because the future doesn't exist yet.
[CLICK] Two: self-attention builds context. Queries and keys decide who listens to whom; values carry the information. “sat” learns about “cat”.
[CLICK] Three: feed-forward layers refine. Attention mixes across tokens; the feed-forward network transforms each token on its own.
[CLICK] Four: repeated blocks build power. The same simple block, stacked dozens of times, goes from spelling to grammar to meaning.
[CLICK] Five: generation is one token at a time. Predict, pick, append, repeat.

[CLICK] The cat sat on the mat — one token at a time.

Suggested discussion questions: Why can't an LLM "take back" a word it already wrote? What would happen if we removed the mask during training? Why might a high temperature help for brainstorming but hurt for code?`);
}

// =====================================================================
// ESSENTIALS 1. The whole decoder on one slide
// =====================================================================
if (ESSENTIALS) {
  const s = contentSlide(undefined, "THE BIG PICTURE", C.att, "The transformer decoder, end to end",
    "Running example: “The cat sat on the” → “mat”. Each click adds one stage of the journey.");
  const cols = [
    { t: "① Tokenize", f: C.tok, d: "Split the text into tokens and look up each one’s ID." },
    { t: "② Embed + position", f: C.tok, d: "Each ID becomes a learned vector, plus where it sits in the sentence." },
    { t: "③ Masked attention", f: C.att, d: "Each token gathers context from itself and earlier tokens only." },
    { t: "④ Feed-forward (MLP)", f: C.ffn, d: "Each token’s vector is refined on its own: expand, switch on features, shrink." },
    { t: "⑤ Output layer", f: C.out, d: "The last token’s vector → a score for every word → softmax." },
    { t: "⑥ Pick & repeat", f: C.out, d: "Choose one token, append it to the text, run again." },
  ];
  const gap = 0.24, cw = (12.13 - gap * 5) / 6, hy = 2.3, vy = 3.0, ty = 5.12;
  const cx = (i) => 0.6 + i * (cw + gap);
  // the decoder block wraps stages 3 and 4
  rect(s, cx(2) - 0.1, 1.86, cw * 2 + gap + 0.2, 4.0, { shape: S.ROUNDED_RECTANGLE, r: 0.1, fill: "FAF8FF", line: C.attM, dash: "dash", anim: A(3, "fade") });
  text(s, "one decoder block · repeated N× (12 in GPT-2, 96 in GPT-3)", { x: cx(2), y: 1.93, w: cw * 2 + gap, h: 0.24, fontSize: 9, bold: true, color: C.att, align: "center", objectName: A(3, "fade") });
  cols.forEach((c, i) => {
    box(s, c.t, cx(i), hy, cw, 0.5, { fill: c.f, color: C.white, size: 11, bold: true, margin: 0, anim: A(i + 1, "rise") });
    if (i < cols.length - 1) line(s, cx(i) + cw + 0.03, hy + 0.25, cx(i + 1) - 0.03, hy + 0.25, { color: C.faint, w: 1.5, anim: A(i + 2, "wipe") });
    text(s, c.d, { x: cx(i) + 0.04, y: ty, w: cw - 0.08, h: 0.7, fontSize: 9.5, color: C.body, objectName: A(i + 1, "fade", 700) });
  });
  const ids = [464, 3797, 3332, 319, 262];
  // ① tokens + IDs
  SENT.forEach((t, k) => {
    const y = vy + k * 0.4;
    chip(s, t, cx(0) + 0.12, y, { w: 0.68, h: 0.32, size: 10, fill: C.tokL, line: C.tok, anim: A(1, "fade", 150 + k * 90) });
    text(s, `→ ${ids[k]}`, { x: cx(0) + 0.88, y: y + 0.05, w: 0.85, h: 0.22, fontSize: 9.5, color: C.muted, objectName: A(1, "fade", 250 + k * 90) });
  });
  // ② vectors
  SENT.forEach((t, k) => {
    const y = vy + k * 0.4, r = rng(ids[k] * 7 + 3);
    text(s, t, { x: cx(1) + 0.05, y: y + 0.05, w: 0.42, h: 0.22, fontSize: 8.5, color: C.muted, align: "right", objectName: A(2, "fade", 100 + k * 90) });
    vec(s, cx(1) + 0.55, y + 0.03, Array.from({ length: 7 }, () => r()), (v) => mix(diverge(C.tok, "6366F1")(v), diverge(C.pos, "93C5FD")(Math.sin(k + v)), 0.4), { cw: 0.15, ch: 0.26, gap: 0.02, anim: () => A(2, "fade", 150 + k * 90) });
  });
  // ③ masked attention grid
  const W = [[1], [0.35, 0.65], [0.04, 0.86, 0.1], [0.05, 0.2, 0.55, 0.2], [0.1, 0.08, 0.12, 0.5, 0.2]];
  SENT.forEach((t, i) => {
    text(s, t, { x: cx(2) + 0.02, y: vy + i * 0.33 + 0.05, w: 0.4, h: 0.2, fontSize: 8, color: C.muted, align: "right", objectName: A(3, "fade", 200) });
    for (let j = 0; j < 5; j++) {
      const fill = j > i ? "E2E8F0" : mix("F5F3FF", C.att, Math.min(1, 0.12 + W[i][j]));
      rect(s, cx(2) + 0.5 + j * 0.27, vy + i * 0.33, 0.25, 0.3, { fill, anim: A(3, "fade", 250 + i * 120) });
    }
  });
  text(s, "grey = future, blocked", { x: cx(2), y: vy + 1.7, w: cw, h: 0.2, fontSize: 8.5, italic: true, color: C.muted, align: "center", objectName: A(3, "fade", 900) });
  // ④ feed-forward: narrow → wide → narrow
  const fx = cx(3) + 0.2, fy = vy + 0.05;
  vec(s, fx, fy + 0.25, [0.6, -0.3, 0.8, 0.2, -0.6], diverge(C.att, C.tok), { vertical: true, cw: 0.18, ch: 0.22, gap: 0.02, anim: () => A(4, "fade", 100) });
  line(s, fx + 0.2, fy + 0.25, fx + 0.7, fy, { color: C.ffnM, w: 1, head: false, anim: A(4, "fade", 200) });
  line(s, fx + 0.2, fy + 1.43, fx + 0.7, fy + 1.68, { color: C.ffnM, w: 1, head: false, anim: A(4, "fade", 200) });
  for (let k = 0; k < 10; k++) rect(s, fx + 0.72, fy + k * 0.17, 0.13, 0.13, { shape: S.OVAL, fill: [1, 4, 7].includes(k) ? C.ffn : C.white, line: C.faint, lw: 0.75, anim: A(4, "fade", 300 + k * 40) });
  line(s, fx + 0.87, fy, fx + 1.37, fy + 0.25, { color: C.ffnM, w: 1, head: false, anim: A(4, "fade", 700) });
  line(s, fx + 0.87, fy + 1.68, fx + 1.37, fy + 1.43, { color: C.ffnM, w: 1, head: false, anim: A(4, "fade", 700) });
  vec(s, fx + 1.39, fy + 0.25, [0.7, 0.1, 0.9, -0.2, 0.5], diverge(C.ffn, C.tok), { vertical: true, cw: 0.18, ch: 0.22, gap: 0.02, anim: () => A(4, "fade", 800) });
  text(s, "same MLP for every token", { x: cx(3), y: vy + 1.7, w: cw, h: 0.2, fontSize: 8.5, italic: true, color: C.muted, align: "center", objectName: A(4, "fade", 900) });
  // ⑤ output probabilities
  text(s, "last token “the” →", { x: cx(4) + 0.05, y: vy - 0.02, w: cw - 0.1, h: 0.22, fontSize: 9, bold: true, color: C.out, objectName: A(5, "fade") });
  [["mat", 0.41], ["floor", 0.14], ["sofa", 0.11], ["bed", 0.08], ["…", 0.26]].forEach(([t, p], k) => {
    const y = vy + 0.3 + k * 0.3;
    text(s, t, { x: cx(4) + 0.05, y, w: 0.5, h: 0.24, fontSize: 9.5, bold: t !== "…", color: C.ink, align: "right", valign: "middle", objectName: A(5, "fade", 150 + k * 100) });
    const bw = Math.max(0.03, p * 2.0);
    rect(s, cx(4) + 0.62, y + 0.04, bw, 0.16, { fill: k === 0 ? C.out : t === "…" ? C.line : "FDA4AF", anim: A(5, "wipe", 200 + k * 100) });
    text(s, `${Math.round(p * 100)}%`, { x: cx(4) + 0.66 + bw, y, w: 0.42, h: 0.24, fontSize: 8.5, color: C.muted, valign: "middle", objectName: A(5, "fade", 300 + k * 100) });
  });
  // ⑥ pick
  chip(s, "mat", cx(5) + (cw - 1.1) / 2, vy + 0.25, { w: 1.1, h: 0.62, size: 18, fill: C.out, line: C.out, color: C.white, anim: A(6, "zoom", 200) });
  text(s, "greedy, or sampled with temperature / top-p", { x: cx(5) + 0.05, y: vy + 1.0, w: cw - 0.1, h: 0.45, fontSize: 9, italic: true, color: C.muted, align: "center", objectName: A(6, "fade", 500) });
  // loop back
  const ly = 6.1, l0 = cx(0) + cw / 2, l1 = cx(5) + cw / 2;
  line(s, l1, ty + 0.72, l1, ly, { color: C.out, w: 1.75, dash: "dash", head: false, anim: A(7, "fade") });
  line(s, l1, ly, l0, ly, { color: C.out, w: 1.75, dash: "dash", head: false, anim: A(7, "wiper", 150) });
  line(s, l0, ly, l0, ty + 0.72, { color: C.out, w: 1.75, dash: "dash", anim: A(7, "fade", 600) });
  box(s, "append “mat” → “The cat sat on the mat” → run the whole thing again for the next token", 2.7, ly - 0.17, 7.9, 0.34, { fill: C.white, color: C.out, size: 10.5, bold: true, margin: 0, anim: A(7, "fade", 400) });
  text(s, "The whole idea: context-aware next-token prediction, repeated.", { x: 0.6, y: 6.55, w: 12.1, h: 0.3, fontSize: 12, bold: true, color: C.ink, align: "center", objectName: A(8, "rise") });

  s.addNotes(`This one slide is the whole transformer decoder — the engine inside GPT-style models. We'll follow one sentence: “The cat sat on the”, and watch the model produce “mat”.

[CLICK] ① Tokenize. The text is split into tokens — words or pieces of words — and each is swapped for its ID in a fixed vocabulary. These are GPT-2's real IDs.

[CLICK] ② Embed and add position. Each ID looks up a row in a big learned table: a vector, a list of numbers capturing what the token tends to mean. We add a position vector so the model knows word order. (GPT-2 uses 768 numbers per token; we show 7.)

[CLICK] ③ Masked self-attention. Every token looks back at itself and the tokens before it and pulls in what's relevant. “sat” pays most attention to “cat” — who is sitting? The grey cells are the future: blocked, so the model can never peek ahead.

[CLICK] ④ Feed-forward network, or MLP. Each token's vector is processed on its own: expanded into a wide layer, a few feature-neurons switch on, then compressed back. Attention MIXES information between tokens; the MLP TRANSFORMS each one.
Steps 3 and 4 together form one decoder block, and the block is stacked many times — 12 in GPT-2, 96 in GPT-3. Each pass makes the vectors richer.

[CLICK] ⑤ Output layer. Only the LAST token's final vector is used. A linear layer turns it into a score for every one of ~50,000 vocabulary words, and softmax turns scores into probabilities: mat 41%, floor 14%, sofa 11%…

[CLICK] ⑥ Pick a token — the top one, or a weighted random draw controlled by temperature and top-p.

[CLICK] Then append “mat” to the text and run the whole thing again for the next token. That loop is how every chatbot answer is written, one token at a time.

[CLICK] If you remember one sentence: context-aware next-token prediction, repeated.`);
}

// =====================================================================
// ESSENTIALS 2. Deep learning: a neural network that trains, then answers
// =====================================================================
if (ESSENTIALS) {
  const s = contentSlide(undefined, "DEEP LEARNING BASICS", C.pos, "Deep learning: a neural network learns, then answers",
    "A neural network is layers of simple units joined by weights. Training tunes the weights; inference uses them.");
  // example banner (training example, later covered by the inference example)
  box(s, [
    { text: "TRAINING EXAMPLE  ", options: { bold: true, color: C.pos, fontSize: 9.5 } },
    { text: "A mat: soft ✓  warm ✓  wet ✗   →   the cat sat on it", options: { color: C.ink } },
  ], 0.6, 1.78, 7.1, 0.44, { fill: C.posL, size: 11, align: "left", margin: [12, 8, 0, 0], anim: A(1, "rise") });
  box(s, [
    { text: "NEW INPUT  ", options: { bold: true, color: C.out, fontSize: 9.5 } },
    { text: "A sofa: soft ✓  warm ✓  wet ✗   →   will the cat sit?", options: { color: C.ink } },
  ], 0.6, 1.78, 7.1, 0.44, { fill: C.outL, size: 11, align: "left", margin: [12, 8, 0, 0], anim: A(6, "fade") });

  const inX = 2.05, hX = 4.05, oX = 6.05, nd = 0.5;
  const inY = [3.1, 3.8, 4.5], hY = [2.75, 3.45, 4.15, 4.85], oY = [3.45, 4.15];
  [["INPUTS", inX], ["HIDDEN LAYER", hX], ["OUTPUTS", oX]].forEach(([t, x]) => text(s, t, { x: x - 0.9, y: 2.33, w: 1.8, h: 0.22, fontSize: 8.5, bold: true, color: C.muted, align: "center", charSpacing: 1 }));
  // untrained weights: thin grey lines
  const r = rng(11);
  const edges = [];
  inY.forEach((a, i) => hY.forEach((b, j) => edges.push([inX, a, hX, b, i, j])));
  hY.forEach((a, i) => oY.forEach((b, j) => edges.push([hX, a, oX, b, i, j])));
  edges.forEach(([x1, y1, x2, y2]) => line(s, x1, y1, x2, y2, { color: C.line, w: 0.75 + Math.abs(r()) * 1.25, head: false }));
  // trained weights: coloured, thickness = strength (appear after training)
  const tw = (k) => { const v = Math.sin(k * 2.3 + 0.7) * 1.2; return v; };
  edges.forEach(([x1, y1, x2, y2], k) => {
    const v = tw(k);
    line(s, x1, y1, x2, y2, { color: v >= 0 ? C.ffn : C.out, w: 0.5 + Math.abs(v) * 2.6, head: false, anim: A(5, "fade", k * 40) });
  });
  const node = (x, y, fill, t) => box(s, t || "", x - nd / 2, y - nd / 2, nd, nd, { shape: S.OVAL, fill, line: C.white, lw: 1.5, color: C.white, size: 10, bold: true, margin: 0 });
  inY.forEach((y) => node(inX, y, C.pos));
  hY.forEach((y) => node(hX, y, C.att));
  oY.forEach((y) => node(oX, y, C.out));
  [["soft?", "1"], ["warm?", "1"], ["wet?", "0"]].forEach(([t, v], i) => {
    text(s, t, { x: 0.6, y: inY[i] - 0.13, w: 1.0, h: 0.26, fontSize: 11, bold: true, color: C.ink, align: "right" });
    text(s, v, { x: inX - 0.25, y: inY[i] - 0.13, w: 0.5, h: 0.26, fontSize: 11, bold: true, color: C.white, align: "center", objectName: A(1, "zoom", 300 + i * 120) });
  });
  text(s, "each line is a weight: a dial that can be turned", { x: 2.4, y: 5.18, w: 3.4, h: 0.22, fontSize: 9, italic: true, color: C.muted, align: "center" });
  // outputs: training guess, then trained answer
  const outLab = (lines, fill, anim) => s.addText(lines, { x: 6.38, y: 3.2, w: 1.35, h: 1.2, fontFace: F, fontSize: 11, valign: "middle", margin: 0, isTextBox: true, fill: fill ? { color: fill } : undefined, objectName: anim });
  outLab([
    { text: "sit  30%", options: { bold: true, color: C.out, breakLine: true } },
    { text: " ", options: { fontSize: 14, breakLine: true } },
    { text: "leave  70%", options: { color: C.muted } },
  ], null, A(2, "fade", 700));
  outLab([
    { text: "sit  92%", options: { bold: true, color: C.out, breakLine: true } },
    { text: " ", options: { fontSize: 14, breakLine: true } },
    { text: "leave  8%", options: { color: C.muted } },
  ], C.white, A(6, "zoom", 900));

  // forward / backward arrows
  line(s, 1.8, 5.6, 6.6, 5.6, { color: C.ffn, w: 2.5, anim: A(2, "wipe") });
  box(s, "① forward pass: inputs → weights → a guess", 2.45, 5.47, 3.5, 0.26, { fill: C.white, color: C.ffn, size: 9.5, bold: true, margin: 0, anim: A(2, "fade", 300) });
  box(s, [
    { text: "② compare: should be sit 100%", options: { bold: true, color: C.out, breakLine: true } },
    { text: "error (loss) = 1.2", options: { color: C.ink } },
  ], 5.55, 4.55, 2.15, 0.62, { fill: C.outL, size: 9.5, anim: A(3, "zoom") });
  line(s, 6.6, 5.98, 1.8, 5.98, { color: C.out, w: 2.5, anim: A(4, "wiper") });
  box(s, "③ backward pass: work out how to turn every weight", 2.4, 5.85, 3.6, 0.26, { fill: C.white, color: C.out, size: 9.5, bold: true, margin: 0, anim: A(4, "fade", 300) });
  box(s, [{ text: "④ repeat over thousands of examples → the weights settle.  ", options: { bold: true } }, { text: "Green pushes toward “sit”, red toward “leave”, thick = strong.", options: { color: C.body } }], 0.6, 6.28, 7.1, 0.42, { fill: C.bg2, color: C.ink, size: 9.5, align: "left", margin: [12, 8, 0, 0], anim: A(5, "rise", 600) });
  box(s, "WEIGHTS FROZEN", 6.15, 1.85, 1.4, 0.3, { fill: C.ink, color: C.white, size: 8.5, bold: true, margin: 0, anim: A(6, "zoom", 300) });

  // right: the two phases
  card(s, 8.05, 1.78, 4.65, 2.4, "Training · learn the weights", [
    { text: "① Forward: run an example through the network to get a guess.", options: { breakLine: true } },
    "② Compare the guess with the right answer → error (loss).",
    "③ Backward: backpropagation works out how each weight contributed.",
    "④ Nudge every weight a little to shrink the error. Repeat, many times.",
  ], { fill: C.posL, tc: C.pos, ts: 12.5, bs: 10.5, anim: A(1, "rise", 400) });
  card(s, 8.05, 4.33, 4.65, 1.35, "Inference · use the weights", [
    "Weights are frozen. A new input goes forward once → an answer.",
    "No right answer needed, no error, no learning.",
  ], { fill: C.outL, tc: C.out, ts: 12.5, bs: 10.5, anim: A(6, "rise", 600) });
  box(s, [
    { text: "An LLM is the same recipe at huge scale: ", options: { bold: true, color: C.att } },
    { text: "inputs are token vectors, the output is a probability for every possible next token, and there are billions of weights.", options: { color: C.body } },
  ], 8.05, 5.83, 4.65, 0.87, { fill: C.attL, size: 10.5, align: "left", margin: [12, 10, 4, 4], anim: A(7, "rise") });

  s.addNotes(`Before transformers, the basic idea of deep learning: a neural network that learns from examples, then gets used.

The network is layers of simple units — the circles — connected by weights — the lines. Each weight is a dial: how strongly one unit influences the next. Our toy network answers "will the cat sit here?" from three facts: is the spot soft, warm, wet.

[CLICK] Training starts with an example where we KNOW the answer: a mat — soft, warm, dry — and the cat sat on it. The inputs become numbers: 1, 1, 0.

[CLICK] ① Forward pass: the numbers flow left to right. Each unit multiplies its inputs by the weights, adds them up, applies a bend (a non-linearity), and passes the result on. The weights start random, so the guess is poor: sit 30%.

[CLICK] ② Compare with the right answer — the cat did sit, so it should be 100%. The gap is measured as one number: the error, or loss.

[CLICK] ③ Backward pass, called backpropagation: going right to left, calculus works out how much each weight contributed to the error and which way to turn it. Every weight gets a tiny nudge.

[CLICK] ④ Repeat over thousands of examples — mats, puddles, sofas, rocks. The weights settle into a useful pattern. Green lines push toward "sit", red toward "leave", thickness is strength. Nobody programmed "cats like warm soft places" — it's stored in the weights.

[CLICK] Inference. Now the weights are frozen. A brand-new spot — a sofa — goes forward once: sit 92%. No right answer needed, no error, no learning. This is what runs every time you use a trained model.

[CLICK] An LLM is exactly this recipe at enormous scale: inputs are token vectors instead of three facts, the output is a probability for every possible next token, and there are billions of weights instead of twenty.`);
}

// ---------- native animations ----------
function effectXml(ids, spid, eff, delay, nodeType) {
  const tgt = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
  // "spp45" / "spn117": turn the shape clockwise / anticlockwise by that many degrees (spin emphasis)
  if (eff.startsWith("sp")) {
    const deg = (eff[2] === "n" ? -1 : 1) * Number(eff.slice(3));
    const outer = ids();
    return `<p:par><p:cTn id="${outer}" presetID="8" presetClass="emph" presetSubtype="0" accel="30000" decel="30000" fill="hold" grpId="0" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst><p:animRot by="${deg * 60000}"><p:cBhvr><p:cTn id="${ids()}" dur="1000" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot></p:childTnLst></p:cTn></p:par>`;
  }
  // "mvp35" / "mvn28": slide the shape right/left by 0.35 / 0.28 inches (motion path)
  if (eff.startsWith("mv")) {
    const dx = ((eff[2] === "n" ? -1 : 1) * Number(eff.slice(3))) / 100 / 13.333;
    const outer = ids();
    return `<p:par><p:cTn id="${outer}" presetID="0" presetClass="path" presetSubtype="0" accel="50000" decel="50000" fill="hold" grpId="0" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst><p:animMotion origin="layout" path="M 0 0 L ${dx.toFixed(5)} 0 E" pathEditMode="relative" ptsTypes="AA"><p:cBhvr><p:cTn id="${ids()}" dur="900" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:animMotion></p:childTnLst></p:cTn></p:par>`;
  }
  const presets = { fade: [10, 0], wipe: [22, 8], wiper: [22, 2], rise: [42, 0], zoom: [53, 16] };
  const [pid, sub] = presets[eff] || presets.fade;
  const dur = eff.startsWith("wipe") ? 450 : 500;
  const set = `<p:set><p:cBhvr><p:cTn id="${ids()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
  const fade = (d) => `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${ids()}" dur="${d}"/>${tgt}</p:cBhvr></p:animEffect>`;
  const anim = (attr, from, to, d, fromFlt) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids()}" dur="${d}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val>${fromFlt ? `<p:fltVal val="${from}"/>` : `<p:strVal val="${from}"/>`}</p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
  const outerId = ids();
  let body = set;
  if (eff === "wipe") body += `<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="${ids()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`;
  else if (eff === "wiper") body += `<p:animEffect transition="in" filter="wipe(right)"><p:cBhvr><p:cTn id="${ids()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`;
  else if (eff === "rise") body += fade(dur) + anim("ppt_x", "#ppt_x", "#ppt_x", dur) + anim("ppt_y", "#ppt_y+0.06", "#ppt_y", dur);
  else if (eff === "zoom") body += anim("ppt_w", "0", "#ppt_w", dur, true) + anim("ppt_h", "0", "#ppt_h", dur, true) + fade(dur);
  else body += fade(dur);
  return `<p:par><p:cTn id="${outerId}" presetID="${pid}" presetClass="entr" presetSubtype="${sub}" fill="hold" grpId="0" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`;
}

function timingXml(items) {
  let n = 2;
  const ids = () => ++n;
  const steps = [...new Set(items.map((i) => i.step))].sort((a, b) => a - b);
  const clicks = steps.map((st) => {
    const outer = ids(), inner = ids();
    const effs = items.filter((i) => i.step === st).sort((a, b) => a.delay - b.delay)
      .map((it, k) => effectXml(ids, it.spid, it.eff, it.delay, k === 0 ? "clickEffect" : "withEffect")).join("");
    return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effs}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }).join("");
  const bld = [...new Set(items.map((i) => i.spid))].map((id) => `<p:bldP spid="${id}" grpId="0" animBg="1"/>`).join("");
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clicks}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${bld}</p:bldLst></p:timing>`;
}

async function addAnimations(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  let total = 0;
  for (const f of slides) {
    let xml = await zip.file(f).async("string");
    const items = [];
    for (const m of xml.matchAll(/<p:cNvPr\b([^>]*)>/g)) {
      const id = /\bid="(\d+)"/.exec(m[1]);
      const name = /\bname="([^"]*)"/.exec(m[1]);
      if (!id || !name) continue;
      for (const t of name[1].matchAll(/anim-(\d+)-(\w+)-(\d+)-\d+/g)) items.push({ spid: id[1], step: +t[1], eff: t[2], delay: +t[3] });
    }
    let extra = `<p:transition spd="med"><p:fade/></p:transition>`;
    if (items.length) { extra += timingXml(items); total += items.length; }
    xml = xml.replace(/<\/p:sld>\s*$/, `${extra}</p:sld>`);
    zip.file(f, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return total;
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  const skill = process.env.PPTX_SKILL_DIR;
  if (skill) {
    const { applyTheme } = require(path.join(skill, "scripts/apply_theme.js"));
    await applyTheme(OUT, {
      name: "Decoder Explained",
      colors: { dk1: C.ink, lt1: "FFFFFF", dk2: C.dark2, lt2: C.bg2, accent1: C.att, accent2: C.ffn, accent3: C.tok, accent4: C.out, accent5: C.pos, accent6: C.norm, hlink: C.pos, folHlink: C.att },
    });
  }
  const n = await addAnimations(OUT);
  console.log(`wrote ${OUT} (${n} animated shapes)`);
})();
