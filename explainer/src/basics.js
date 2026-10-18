import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, seg, ease, eout, back, smooth, win, pulse } from './util.js';
import { clay, setDissolve, glowMat, PAL } from './materials.js';
import { Overlay } from './overlay.js';
import { createStage, H } from './stage.js';
import { labelTexture, makeDial } from './parts.js';

// "How a Neural Network Learns": a 45-second companion film. A tiny network decides cat / dog / bird
// from three features; every wire carries a clay dial whose angle is its weight. Every frame is a
// pure function of t.
export const DURATION = 45;

// ---------------------------------------------------------------- the example (illustrative numbers)
const FEATURES = ['whiskers', 'barks', 'pointy ears'];
const X_IN = [0.9, 0.1, 0.8];
const CLASSES = ['cat', 'dog', 'bird'];
const CLASS_COL = [PAL.peach, PAL.sky, PAL.butter];
// W1[j][i]: input i -> hidden j.  W2[k][j]: hidden j -> output k.  Start = untrained, end = after training.
const W1S = [[0.8, -0.6, 0.5], [-0.5, 0.9, -0.4], [0.2, 0.7, 0.3]];
const W1E = [[0.85, -0.65, 0.55], [-0.5, 0.85, -0.45], [0.25, 0.65, 0.3]];
const W2S = [[0.5, 0.3, 0.55], [1.2, -0.2, 0.67], [-0.3, 0.6, 0.24]];
const W2E = [[1.4, 0.4, 1.25], [0.75, -0.1, 0.42], [-0.45, 0.5, -0.05]];
const PRE = W1S.map((row) => row.reduce((s, w, i) => s + w * X_IN[i], 0)); // 1.06, -0.68, 0.49
const ACT = PRE.map((v) => Math.max(0, v));                                // ReLU
const S_START = [0.8, 1.6, -0.2], S_END = [2.1, 1.0, -0.5];
const softmax = (s) => { const e = s.map(Math.exp), z = e.reduce((a, b) => a + b, 0); return e.map((v) => v / z); };
const STEPS = 4;
const scoresAt = (p) => S_START.map((s, k) => lerp(s, S_END[k], p));
const LOSSES = [...Array(STEPS + 1)].map((_, k) => -Math.log(softmax(scoresAt(k / STEPS))[0]));

// ---------------------------------------------------------------- layout
const IN_X = -4.6, HID_X = 0, OUT_X = 4.6, NODE_R = 0.3;
const Y = [3.6, 2.4, 1.2];
const DIAL_F = [0.22, 0.36, 0.5];         // where along a wire its dial sits (by target row), spaced so dials never overlap
const BAR_X0 = OUT_X + 1.3;
const G0 = [0, 5.0, 0.2];                 // ReLU graph origin (x = 0, y = 0)

// ---------------------------------------------------------------- timeline
const T_TRAIN = 29.0, DT = 2.6;
const stepT = (s) => T_TRAIN + s * DT;
const turnProg = (t) => [...Array(STEPS)].reduce((a, _, s) => a + ease(seg(t, stepT(s) + 0.85, stepT(s) + 1.6)), 0) / STEPS;
const predProg = (t) => [...Array(STEPS)].reduce((a, _, s) => a + ease(seg(t, stepT(s) + 2.0, stepT(s) + 2.45)), 0) / STEPS;

const stage = createStage(document.getElementById('gl'), { center: [1.5, 1.0] });
const { scene, camera, mesh, inst, setInst, tube, drawTube } = stage;
const tmpC = new THREE.Color();
const col = (hex) => new THREE.Color(hex);
const mix = (a, b, k) => tmpC.copy(col(a)).lerp(col(b), clamp(k)).clone();

// ---------------------------------------------------------------- build
const O = {};
function build() {
  // Input tiles
  O.inputs = FEATURES.map((f, i) => {
    const g = new THREE.Group(); scene.add(g);
    const body = mesh(new RoundedBoxGeometry(1.55, 0.56, 0.24, 4, 0.1), clay(PAL.clay, { noiseScale: 3 }), { parent: g });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: labelTexture(f), transparent: true, depthWrite: false, color: PAL.ink }));
    decal.position.z = 0.126; g.add(decal);
    g.position.set(IN_X - 0.8, Y[i], 0);
    return { g, body, decal };
  });
  const sphere = new THREE.SphereGeometry(NODE_R, 40, 28);
  O.hidden = Y.map((y) => { const m = mesh(sphere, clay(0xd9f0e4, { rim: 0.2 })); m.position.set(HID_X, y, 0); return m; });
  O.outputs = Y.map((y, k) => { const m = mesh(sphere, clay(CLASS_COL[k], { rim: 0.2 })); m.position.set(OUT_X, y, 0); return m; });

  // Wires with a dial on each
  const wire = (a, b) => tube(new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b)), 0.022, glowMat(0x9aa3c0, 0.15), 24);
  O.wires = [];
  for (let layer = 1; layer <= 2; layer++) for (let tgt = 0; tgt < 3; tgt++) for (let src = 0; src < 3; src++) {
    const a = layer === 1 ? [IN_X, Y[src], 0] : [HID_X + NODE_R, Y[src], 0];
    const b = layer === 1 ? [HID_X - NODE_R, Y[tgt], 0] : [OUT_X - NODE_R, Y[tgt], 0];
    const f = DIAL_F[tgt];
    const pos = [lerp(a[0], b[0], f), lerp(a[1], b[1], f), 0.08];
    const dial = makeDial(stage, pos);
    const ws = layer === 1 ? W1S[tgt][src] : W2S[tgt][src], we = layer === 1 ? W1E[tgt][src] : W2E[tgt][src];
    O.wires.push({ layer, src, tgt, a, b, f, pos, tube: wire(a, b), dial, ws, we, n: O.wires.length });
  }
  O.beads = inst(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }), O.wires.length, { cast: false });

  // ReLU graph
  O.graph = mesh(new RoundedBoxGeometry(3.9, 2.75, 0.12, 4, 0.1), clay(0xf6f3ef, { noiseScale: 1.6 }));
  O.graph.position.set(G0[0], G0[1] + 0.68, -0.15);
  O.axes = [[3.3, 0.025, 0, 0], [0.025, 2.25, 0, 0.55]].map(([w, h, x, y]) => {
    const m = mesh(new THREE.BoxGeometry(w, h, 0.03), clay(0x9aa0b4), { cast: false }); m.position.set(G0[0] + x, G0[1] + y, 0.0); return m;
  });
  const relu = new THREE.CurvePath();
  relu.add(new THREE.LineCurve3(new THREE.Vector3(G0[0] - 1.6, G0[1], 0.05), new THREE.Vector3(G0[0], G0[1], 0.05)));
  relu.add(new THREE.LineCurve3(new THREE.Vector3(G0[0], G0[1], 0.05), new THREE.Vector3(G0[0] + 1.35, G0[1] + 1.35, 0.05)));
  O.relu = tube(relu, 0.045, glowMat(PAL.indigo, 0.6), 80);
  O.linear = tube(new THREE.LineCurve3(new THREE.Vector3(G0[0] - 0.6, G0[1] - 0.6, 0.02), new THREE.Vector3(G0[0] + 1.35, G0[1] + 1.35, 0.02)), 0.02, glowMat(0xb9b4ad, 0.1), 40);
  O.markers = inst(new THREE.SphereGeometry(0.1, 20, 14), clay(0xffffff), 3, { cast: false });

  // Output bars, softmax pill, halos
  O.bars = inst(new RoundedBoxGeometry(1, 0.3, 0.3, 2, 0.08), clay(0xffffff), 3);
  O.softmax = mesh(new RoundedBoxGeometry(1.4, 0.32, 0.3, 2, 0.13), clay(0xdedcfb));
  O.softmax.position.set(BAR_X0 + 1.4, Y[0] + 0.75, 0);
  O.truth = mesh(new THREE.TorusGeometry(0.44, 0.035, 12, 56), glowMat(0x3fb68a, 1.0), { cast: false });
  O.pred = mesh(new THREE.TorusGeometry(0.52, 0.03, 12, 56), glowMat(PAL.indigo, 1.2), { cast: false });
}

// ---------------------------------------------------------------- per-frame state
function weightAt(w, t) { return lerp(w.ws, w.we, turnProg(t)); }

// Which pass (if any) moves a bead along this wire at time t. Returns { u, size, color }.
function bead(w, t) {
  const along = (t0, t1, dir) => { const k = seg(t, t0, t1); return k > 0 && k < 1 ? (dir > 0 ? ease(k) : 1 - ease(k)) : null; };
  // Dot-product walkthrough: the three inputs into hidden neuron 1, one at a time
  if (w.layer === 1 && w.tgt === 0 && t > 6.9 && t < 12.3) {
    const t0 = 7.0 + 1.6 * w.src;
    const k1 = seg(t, t0, t0 + 0.7), k2 = seg(t, t0 + 1.0, t0 + 1.6);
    if (k1 <= 0 || k2 >= 1) return null;
    const prod = X_IN[w.src] * w.ws;
    if (k2 <= 0) return { u: w.f * ease(k1), size: 0.05 + 0.09 * X_IN[w.src], color: mix(PAL.mint, PAL.mint, 0) };
    return { u: lerp(w.f, 1, ease(k2)), size: 0.05 + 0.13 * Math.abs(prod), color: mix(PAL.sky, PAL.peach, prod > 0 ? 1 : 0) };
  }
  const passes = [];
  if (w.layer === 1) passes.push([12.5, 13.3, 1, PAL.mint]);
  if (w.layer === 2) passes.push([21.5, 22.4, 1, PAL.indigo]);
  for (let s = 0; s < STEPS; s++) {
    const T = stepT(s);
    passes.push(w.layer === 2 ? [T + 0.05, T + 0.5, -1, PAL.coral] : [T + 0.45, T + 0.85, -1, PAL.coral]);
    passes.push(w.layer === 1 ? [T + 1.6, T + 1.95, 1, PAL.indigo] : [T + 1.9, T + 2.3, 1, PAL.indigo]);
  }
  passes.push(w.layer === 1 ? [41.2, 41.9, 1, PAL.indigo] : [41.8, 42.5, 1, PAL.indigo]);
  for (const [t0, t1, dir, c] of passes) {
    const u = along(t0, t1, dir);
    if (u === null) continue;
    const dead = w.layer === 2 && w.src === 1 && dir > 0; // hidden neuron 2 outputs 0 after ReLU
    return { u, size: dead ? 0 : 0.07, color: col(c).multiplyScalar(c === PAL.indigo ? 1.6 : 1.2) };
  }
  return null;
}

function update(t) {
  // Appear
  O.inputs.forEach((n, i) => {
    const k = back(seg(t, 0.5 + 0.12 * i, 1.0 + 0.12 * i));
    n.g.scale.setScalar(Math.max(k, 1e-4)); n.g.visible = k > 0.01;
    n.body.material.userData.u.uGlow.value = 0.3 * pulse(t, 7.0 + 1.6 * i, 0.25);
  });
  const reluDone = smooth(18.4, 18.9, t);
  O.hidden.forEach((m, j) => {
    const k = back(seg(t, 0.9 + 0.1 * j, 1.4 + 0.1 * j));
    m.scale.setScalar(Math.max(k, 1e-4)); m.visible = k > 0.01;
    const arrive = j === 0 ? pulse(t, 8.7, 0.2) + pulse(t, 10.3, 0.2) + pulse(t, 11.9, 0.25) : 0;
    m.material.userData.u.uGlow.value = 0.45 * arrive + 0.35 * pulse(t, 13.3, 0.25);
    m.material.color.copy(j === 1 ? mix(0xd9f0e4, 0xdedad4, reluDone) : col(0xd9f0e4));
  });
  const probs = softmax(scoresAt(predProg(t)));
  const predK = probs.indexOf(Math.max(...probs));
  O.outputs.forEach((m, k) => {
    const s = back(seg(t, 1.2 + 0.1 * k, 1.7 + 0.1 * k));
    m.scale.setScalar(Math.max(s, 1e-4)); m.visible = s > 0.01;
    m.material.userData.u.uGlow.value = 0.35 * pulse(t, 22.4, 0.25) + [...Array(STEPS)].reduce((a, _, st) => a + 0.3 * pulse(t, stepT(st) + 2.3, 0.2), 0);
  });

  // Wires, dials, beads
  const focusDot = win(t, 6.6, 13.9, 0.4, 0.4);     // highlight the three wires into hidden neuron 1
  const focusL2 = win(t, 21.2, 27.8, 0.3, 0.4);
  for (const w of O.wires) {
    const wa = ease(seg(t, 1.4 + 0.03 * w.n, 2.4 + 0.03 * w.n));
    const isFocus = w.layer === 1 && w.tgt === 0;
    const deadWire = w.layer === 2 && w.src === 1 ? reluDone : 0;
    let alpha = 0.85 * (1 - 0.7 * focusDot * (isFocus ? 0 : 1)) * (1 - 0.6 * deadWire);
    alpha *= 1 - 0.55 * focusL2 * (w.layer === 1 ? 1 : 0);
    drawTube(w.tube, wa, alpha);
    w.tube.material.color.copy(mix(0x9aa3c0, PAL.indigo, focusDot * (isFocus ? 1 : 0)));
    w.tube.material.emissive.copy(w.tube.material.color);

    const ds = back(seg(t, 2.0 + 0.04 * w.n, 2.45 + 0.04 * w.n));
    const wv = weightAt(w, t);
    w.dial.g.scale.setScalar(Math.max(ds, 1e-4)); w.dial.g.visible = ds > 0.01;
    w.dial.set(wv, clamp(wv, -1.45, 1.45) * 1.55);
    const multiply = isFocus ? pulse(t, 7.85 + 1.6 * w.src, 0.18) : 0;
    w.dial.knob.material.userData.u.uGlow.value = 0.6 * multiply;
    const dim = (1 - 0.65 * focusDot * (isFocus ? 0 : 1)) * (1 - 0.5 * focusL2 * (w.layer === 1 ? 1 : 0));
    w.dial.gauge.material.opacity = dim;
    // Turning hint during training: an arrow on the side the dial is about to move to
    const turning = [...Array(STEPS)].reduce((a, _, s) => a + win(t, stepT(s) + 0.7, stepT(s) + 1.7, 0.15, 0.2), 0);
    w.dial.hint(Math.abs(w.we - w.ws) > 0.02 ? turning : 0, Math.sign(w.we - w.ws) || 1);

    const b = bead(w, t);
    if (b && b.size > 0) {
      const p = [lerp(w.a[0], w.b[0], b.u), lerp(w.a[1], w.b[1], b.u), 0.12];
      setInst(O.beads, w.n, ...p, b.size);
      O.beads.setColorAt(w.n, b.color);
    } else setInst(O.beads, w.n, 0, -10, 0, 0);
  }
  O.beads.instanceMatrix.needsUpdate = true; O.beads.instanceColor.needsUpdate = true;

  // ReLU graph
  const gIn = 1 - ease(seg(t, 14.2, 14.9)), gOut = ease(seg(t, 20.5, 21.1));
  setDissolve(O.graph, Math.max(gIn, gOut));
  O.axes.forEach((m) => setDissolve(m, Math.max(1 - ease(seg(t, 14.6, 15.0)), gOut)));
  const ga = 1 - gOut;
  drawTube(O.relu, ease(seg(t, 15.0, 15.8)), t > 14.9 ? ga : 0);
  drawTube(O.linear, ease(seg(t, 15.5, 16.1)), t > 15.4 ? 0.55 * ga : 0);
  for (let j = 0; j < 3; j++) {
    const s = PRE[j];
    const slide = ease(seg(t, 16.0 + 0.5 * j, 16.6 + 0.5 * j)), rise = ease(seg(t, 17.6 + 0.3 * j, 18.2 + 0.3 * j));
    const vis = slide > 0 ? ga : 0;
    setInst(O.markers, j, G0[0] + s * slide, G0[1] + Math.max(0, s) * rise, 0.12, vis);
    O.markers.setColorAt(j, col([PAL.indigo, PAL.coral, PAL.teal][j]));
  }
  O.markers.instanceMatrix.needsUpdate = true; O.markers.instanceColor.needsUpdate = true;

  // Output bars: scores -> exponentiate -> normalise; later they track training
  const grow = eout(seg(t, 22.4, 23.2)), toExp = ease(seg(t, 24.0, 24.8)), toProb = ease(seg(t, 25.2, 26.0));
  const sc = scoresAt(predProg(t));
  for (let k = 0; k < 3; k++) {
    const sL = S_START[k] * 0.9 * grow, eL = Math.exp(S_START[k]) * 0.38, pL = probs[k] * 3.2;
    const L = lerp(lerp(sL, eL, toExp), pL, toProb);
    const x = BAR_X0 + L / 2;
    setInst(O.bars, k, x, Y[k], 0, Math.max(Math.abs(L), 0.02), grow > 0.01 ? 1 : 0, grow > 0.01 ? 1 : 0);
    O.bars.setColorAt(k, mix(0xc4cbe0, CLASS_COL[k], toProb));
  }
  O.bars.instanceMatrix.needsUpdate = true; O.bars.instanceColor.needsUpdate = true;
  setDissolve(O.softmax, 1 - win(t, 23.6, 26.4, 0.35, 0.4));
  O.softmax.material.userData.u.uGlow.value = 0.25 * pulse(t, 24.4, 0.3) + 0.25 * pulse(t, 25.6, 0.3);
  const truthA = back(seg(t, 26.3, 26.8));
  O.truth.position.set(OUT_X, Y[0], 0); O.truth.scale.setScalar(Math.max(truthA, 1e-3)); O.truth.visible = truthA > 0.01;
  const predA = smooth(26.0, 26.4, t);
  O.pred.position.set(OUT_X, Y[predK], 0); O.pred.scale.setScalar(Math.max(predA, 1e-3)); O.pred.visible = predA > 0.01;
  return { probs, sc, predK };
}

// ---------------------------------------------------------------- camera  [t, px, py, pz, lx, ly, lz]
const CAM = [
  [0.0, 0.6, 2.9, 13.0, 0.6, 2.4, 0],
  [2.6, 0.6, 2.9, 14.4, 0.6, 2.4, 0],
  [5.8, 0.6, 2.9, 15.0, 0.6, 2.4, 0],
  [7.0, -2.4, 2.6, 9.6, -2.4, 2.45, 0],
  [13.4, -2.1, 2.6, 9.3, -2.1, 2.45, 0],
  [14.8, 0.0, 4.6, 11.8, 0.0, 4.0, 0],
  [20.4, 0.1, 4.6, 11.5, 0.1, 4.0, 0],
  [21.6, 4.7, 2.75, 10.4, 5.0, 2.45, 0],
  [27.6, 4.9, 2.75, 10.2, 5.1, 2.45, 0],
  [29.0, 1.8, 3.1, 16.2, 1.8, 2.45, 0],
  [39.8, 1.8, 3.1, 15.8, 1.8, 2.45, 0],
  [45.0, 1.8, 3.4, 16.4, 1.8, 2.25, 0],
];

// ---------------------------------------------------------------- overlay
const ui = new Overlay(document.getElementById('ui'), camera);
const CHAPTERS = [[0, 'A box of dials'], [6, 'Dot product'], [14, 'Non-linearity'], [21, 'Softmax'], [28, 'Training turns the dials'], [40, 'Learned dials']];
const fmt = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

function drawOverlay(t, st) {
  ui.clear();
  const ch = CHAPTERS.findLastIndex((c) => t >= c[0]);
  const chEnd = ch < CHAPTERS.length - 1 ? CHAPTERS[ch + 1][0] : DURATION;
  ui.chapter(ch + 1, CHAPTERS[ch][1], smooth(0.6, 1.2, t), seg(t, CHAPTERS[ch][0], chEnd), CHAPTERS.length);
  ui.credit('Design · Altaf Rehmani', smooth(0.6, 1.2, t));

  // 1. A box of dials
  ui.title('How a Neural Network Learns', win(t, 0.15, 2.7, 0.5, 0.35), 'DEEP LEARNING IN 45 SECONDS');
  ui.headline('A neural network is a box of adjustable dials.', win(t, 2.7, 6.2, 0.35, 0.3));
  ui.caption('Each dial is a weight: one number the model can tune.', win(t, 3.3, 6.2, 0.35, 0.3));
  ui.tag([IN_X - 0.8, Y[0] + 0.3, 0], 'inputs: features of a photo', win(t, 3.0, 6.2, 0.3, 0.3), { dy: -50, size: 17 });
  ui.tag([OUT_X, Y[0] + NODE_R, 0], 'outputs: cat · dog · bird', win(t, 3.2, 6.2, 0.3, 0.3), { dy: -50, size: 17 });
  ui.tag([HID_X, Y[0] + NODE_R, 0], 'hidden neurons', win(t, 3.4, 6.2, 0.3, 0.3), { dy: -50, size: 17 });
  const inA = smooth(1.0, 1.6, t);
  X_IN.forEach((v, i) => ui.text([IN_X - 1.6, Y[i], 0.1], v.toFixed(1), inA, { align: 'right', dx: -10, size: 20, color: '#4f46e5' }));
  CLASSES.forEach((c, k) => ui.text([OUT_X + 0.62, Y[k], 0.1], c, smooth(1.4, 2.0, t), { align: 'left', dx: 6, size: 19, sans: true, weight: 700 }));

  // 2. Dot product
  ui.headline('A dot product: multiply each input by its dial, then add.', win(t, 6.3, 13.9, 0.35, 0.3));
  const terms = [0, 1, 2].map((i) => `${X_IN[i].toFixed(1)} × ${W1S[0][i] < 0 ? '(' + fmt(W1S[0][i], 1) + ')' : fmt(W1S[0][i], 1)}`);
  let eq = '';
  terms.forEach((s, i) => { if (t > 7.85 + 1.6 * i) eq += (i ? '  +  ' : '') + s; });
  if (t > 11.95) eq += `  =  ${fmt(PRE[0])}`;
  ui.caption(eq || ' ', win(t, 7.6, 13.9, 0.3, 0.3) * (eq ? 1 : 0), H - 100, { mono: true, size: 30, weight: 600, color: '#161a2b' });
  for (let i = 0; i < 3; i++) {
    const w = O.wires.find((q) => q.layer === 1 && q.tgt === 0 && q.src === i);
    ui.text([w.pos[0], w.pos[1] + 0.32, 0.1], `×${fmt(w.ws, 1)}`, win(t, 7.3 + 0.2 * i, 13.9, 0.3, 0.3), { size: 17, color: w.ws < 0 ? '#2f6e9e' : '#b4562f' });
  }
  ui.text([HID_X, Y[0] + NODE_R, 0.1], fmt(PRE[0]), win(t, 12.0, 14.0, 0.3, 0.2), { dy: -16, size: 22, color: '#4f46e5' });
  ui.tag([IN_X + 1.0, Y[2] - 0.55, 0], ['Same sign and big values', '→ a big score'], win(t, 9.0, 13.9, 0.3, 0.3), { dy: 30, dx: 120, align: 'left', size: 16, leader: false });

  // 3. Non-linearity
  ui.headline('A non-linearity bends the signal.', win(t, 14.1, 21.0, 0.35, 0.3), 'ReLU keeps positive values and turns negatives into 0.', win(t, 15.2, 21.0, 0.35, 0.3));
  for (let j = 0; j < 3; j++) {
    const after = j === 1 ? '0' : fmt(ACT[j]);
    const label = t > 18.3 + 0.3 * j ? `${fmt(PRE[j])} → ${after}` : fmt(PRE[j]);
    ui.text([HID_X, Y[j] + NODE_R, 0.1], label, win(t, 13.6, 21.2, 0.3, 0.3), { dy: -16, size: 19, color: j === 1 && t > 18.6 ? '#8a8fa3' : '#4f46e5' });
    ui.text([G0[0] + PRE[j], G0[1] - 0.2, 0.2], `h${j + 1}`, win(t, 16.0 + 0.5 * j, 20.6, 0.2, 0.3), { size: 15, color: ['#4f46e5', '#c2553a', '#1f8f80'][j] });
  }
  ui.text([G0[0] + 1.35, G0[1] + 1.5, 0.1], 'ReLU', win(t, 15.6, 20.6, 0.3, 0.3), { size: 20, color: '#4f46e5', sans: true, weight: 700 });
  ui.tag([G0[0] - 0.75, G0[1] - 0.75, 0.05], ['without a bend:', 'just a straight line'], win(t, 16.0, 20.6, 0.3, 0.3), { dx: -120, dy: 10, align: 'right', size: 15 });
  ui.caption('Without bends, stacking layers would still only draw straight lines. Transformers use a smooth cousin, GELU.', win(t, 18.8, 21.0, 0.3, 0.3), H - 92, { size: 21 });

  // 4. Softmax
  ui.headline('Softmax turns scores into probabilities.', win(t, 21.2, 28.0, 0.35, 0.3));
  const phase = t < 23.9 ? 'scores' : t < 25.1 ? 'e^score' : 'probability';
  for (let k = 0; k < 3; k++) {
    const L = t < 23.9 ? S_START[k] * 0.9 : t < 25.1 ? Math.exp(S_START[k]) * 0.38 : st.probs[k] * 3.2;
    const v = t < 23.9 ? fmt(S_START[k]) : t < 25.1 ? Math.exp(S_START[k]).toFixed(2) : `${Math.round(st.probs[k] * 100)}%`;
    const a = win(t, 22.8, 28.7, 0.4, 0.2);
    ui.text([BAR_X0 + Math.max(L, 0), Y[k], 0.2], v, a, { align: 'left', dx: 12, size: 19, color: '#161a2b' });
  }
  ui.tag([BAR_X0 + 1.4, Y[0] + 0.75, 0], 'softmax', win(t, 23.6, 26.4, 0.3, 0.3), { dy: -40, accent: '#4f46e5' });
  ui.caption(phase === 'scores' ? 'Raw scores can be any number, even negative.' : phase === 'e^score' ? 'Step 1: exponentiate, so every score becomes positive.' : 'Step 2: divide by the total, so they add up to 100%.',
    win(t, 22.6, 26.3, 0.3, 0.2), H - 92, { size: 23 });
  ui.tag([OUT_X - NODE_R - 0.1, Y[0], 0], ['right answer: cat'], win(t, 26.4, 28.6, 0.3, 0.3), { dx: -110, dy: -70, align: 'right', accent: '#3fb68a', size: 17 });
  ui.caption(`Untrained guess: dog (${Math.round(softmax(S_START)[1] * 100)}%). Wrong. The dials need adjusting.`, win(t, 26.5, 28.7, 0.3, 0.3), H - 92, { size: 23, color: '#b4562f' });

  // 5. Training
  ui.headline('Training turns the dials to shrink the error.', win(t, 28.3, 40.2, 0.35, 0.3));
  const inStep = (t - T_TRAIN) / DT, frac = inStep - Math.floor(inStep);
  const cyc = t < T_TRAIN ? 0 : t > stepT(STEPS) ? 4 : frac < 0.3 ? 1 : frac < 0.62 ? 2 : frac < 0.95 ? 3 : 0;
  ui.cycle(['Predict', 'Measure the error', 'Backpropagate', 'Turn every dial a little', 'Repeat'], win(t, 28.6, 40.2, 0.35, 0.3), [1, 1, 2, 3, 4][cyc] ?? 0, 236);
  ui.lossChart(1505, 690, LOSSES, predProg(t) * STEPS, win(t, 28.8, 40.2, 0.35, 0.3));
  ui.caption('Backpropagation works out which way each dial should turn; gradient descent turns it a small step.', win(t, 30.0, 34.8, 0.3, 0.3), H - 92, { size: 21 });
  ui.caption('Repeat over many examples and the right answer becomes likely.', win(t, 35.0, 40.0, 0.3, 0.3), H - 92, { size: 22 });
  for (const w of O.wires) if (w.layer === 2 && w.tgt === 0) ui.text([w.pos[0], w.pos[1] + 0.33, 0.1], fmt(weightAt(w, t)), win(t, 29.0, 40.0, 0.3, 0.3), { size: 13, color: '#5b6178' });
  for (let k = 0; k < 3; k++) {
    const a = win(t, 28.6, 40.2, 0.3, 0.3);
    ui.text([BAR_X0 + st.probs[k] * 3.2, Y[k], 0.2], `${Math.round(st.probs[k] * 100)}%`, a, { align: 'left', dx: 12, size: 19 });
  }

  // 6. Learned dials
  ui.headline('Learning means finding good dial settings.', win(t, 40.3, 45.5, 0.4, 0.01), 'After training the dials stay fixed. A transformer works the same way, with billions of them.', win(t, 40.8, 45.5, 0.4, 0.01));
  for (let k = 0; k < 3; k++) ui.text([BAR_X0 + st.probs[k] * 3.2, Y[k], 0.2], `${Math.round(st.probs[k] * 100)}%`, win(t, 40.2, 45.5, 0.3, 0.01), { align: 'left', dx: 12, size: 19 });
  ui.caption('Dot products, non-linearities and softmax are the same building blocks inside a transformer.', win(t, 41.6, 45.5, 0.4, 0.01), H - 92, { size: 22 });
  ui.tag([OUT_X - NODE_R - 0.1, Y[0], 0], 'trained guess: cat', win(t, 40.6, 45.5, 0.3, 0.01), { dx: -110, dy: -70, align: 'right', accent: '#3fb68a', size: 17 });
}

// ---------------------------------------------------------------- entry points
export function renderAt(t) {
  t = clamp(t, 0, DURATION);
  const st = update(t);
  stage.cameraAt(CAM, t, ease);
  stage.render(t);
  drawOverlay(t, st);
}

async function init() {
  const faces = ['500', '600', '700'].flatMap((w) => [`${w} 40px InterW`, `${w} 40px Inter`]).concat(['500', '600'].flatMap((w) => [`${w} 20px MonoW`, `${w} 20px "JetBrains Mono"`]));
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
  build();
  renderAt(0);
  window.renderAt = renderAt;
  window.DURATION = DURATION;
  window.__ready = true;
  dispatchEvent(new Event('explainer-ready'));
}
init();
