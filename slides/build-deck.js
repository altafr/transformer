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

const OUT = path.join(__dirname, "transformer-decoder-explained.pptx");
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
pres.addSection({ title: "Introduction" });
{
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
[CLICK] And that's the core question for the next 30 minutes: given the words so far, how does the model decide what comes next?

Spoiler: everything an LLM does — chatting, coding, summarising — is this one trick repeated: predict the next token.`);
}

// =====================================================================
// 2. The decoder's job
// =====================================================================
{
  const s = contentSlide("Introduction", "02 · THE JOB", C.out, "The decoder’s job: guess the next token, again and again",
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
pres.addSection({ title: "Inputs" });
{
  const s = contentSlide("Inputs", "03 · FROM TEXT TO VECTORS", C.tok, "From text to vectors",
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
// 4. Inside one decoder block
// =====================================================================
pres.addSection({ title: "The decoder block" });
{
  const s = contentSlide("The decoder block", "04 · INSIDE ONE BLOCK", C.att, "Inside one decoder block",
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
// 5. Masked self-attention
// =====================================================================
{
  const s = contentSlide("The decoder block", "05 · MASKED SELF-ATTENTION", C.att, "Masked self-attention: no peeking at the future",
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
{
  const s = contentSlide("The decoder block", "06 · HOW ATTENTION COMPUTES CONTEXT", C.att, "Queries, keys and values",
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
// 7. Multi-head attention
// =====================================================================
{
  const s = contentSlide("The decoder block", "07 · MULTI-HEAD ATTENTION", C.att, "Multi-head attention: many perspectives at once",
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
{
  const s = contentSlide("The decoder block", "08 · THE FEED-FORWARD NETWORK", C.ffn, "The feed-forward network: each token thinks on its own",
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
  text(s, "About two-thirds of a model’s weights live in these layers; researchers believe much of its factual knowledge is stored here.", { x: 7.7, y: 6.12, w: 5.0, h: 0.6, fontSize: 10, color: C.muted, objectName: A(5, "fade", 600) });

  s.addNotes(`The second half of every block is the feed-forward network, also called the MLP.

The key contrast: attention is a group meeting — tokens exchange information. The feed-forward network is desk work — each token goes back to its own desk and processes what it heard, on its own.

[CLICK] Here's the vector for the last “the”, after attention has told it about the cat and the sitting.
[CLICK] Step one: expand it into a much bigger layer — four times wider. In GPT-2, 768 numbers become 3,072.
[CLICK] Step two: a non-linear function, GELU, acts like a set of switches. Most neurons stay quiet; a few light up. Those lit neurons are features — loosely, things like "a surface comes next" or "household objects are likely". (Illustrative labels — real features are messier.)
[CLICK] Step three: compress back down to 768 numbers. Same shape as before, but refined.

[CLICK] The exact same network, with the same weights, is applied to every token separately — in parallel.

Fun fact: about two-thirds of the parameters in a model live in these layers, and interpretability research suggests a lot of factual knowledge — "Paris is the capital of France" — is stored here.

Slogan to remember: attention mixes, feed-forward transforms.`);
}

// =====================================================================
// 9. Stacking blocks
// =====================================================================
{
  const s = contentSlide("The decoder block", "09 · STACKING BLOCKS", C.att, "Stacking blocks: from spelling to meaning",
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
pres.addSection({ title: "Output and generation" });
{
  const s = contentSlide("Output and generation", "10 · FROM HIDDEN STATE TO PROBABILITIES", C.out, "From hidden state to probabilities",
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
{
  const s = contentSlide("Output and generation", "11 · CHOOSING THE NEXT TOKEN", C.out, "Choosing the next token: decoding strategies",
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
{
  const s = contentSlide("Output and generation", "12 · THE AUTOREGRESSIVE LOOP", C.out, "The generation loop",
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
// 13. Training vs inference
// =====================================================================
{
  const s = contentSlide("Output and generation", "13 · TRAINING VS. INFERENCE", C.att, "Training vs. inference",
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
pres.addSection({ title: "Summary" });
{
  const s = contentSlide("Summary", "14 · PUTTING IT ALL TOGETHER", C.out, "Putting it all together",
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
// 15. Key takeaways
// =====================================================================
{
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Summary" });
  text(s, "15 · KEY TAKEAWAYS", { x: 0.8, y: 0.55, w: 8, h: 0.26, fontSize: 10, bold: true, color: C.tokM, charSpacing: 2 });
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

// ---------- native animations ----------
function effectXml(ids, spid, eff, delay, nodeType) {
  const tgt = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
  const presets = { fade: [10, 0], wipe: [22, 8], rise: [42, 0], zoom: [53, 16] };
  const [pid, sub] = presets[eff] || presets.fade;
  const dur = eff === "wipe" ? 450 : 500;
  const set = `<p:set><p:cBhvr><p:cTn id="${ids()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
  const fade = (d) => `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${ids()}" dur="${d}"/>${tgt}</p:cBhvr></p:animEffect>`;
  const anim = (attr, from, to, d, fromFlt) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids()}" dur="${d}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val>${fromFlt ? `<p:fltVal val="${from}"/>` : `<p:strVal val="${from}"/>`}</p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
  const outerId = ids();
  let body = set;
  if (eff === "wipe") body += `<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="${ids()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`;
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
  const bld = items.map((i) => `<p:bldP spid="${i.spid}" grpId="0" animBg="1"/>`).join("");
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
      const name = /\bname="anim-(\d+)-(\w+)-(\d+)-\d+"/.exec(m[1]);
      if (id && name) items.push({ spid: id[1], step: +name[1], eff: name[2], delay: +name[3] });
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
