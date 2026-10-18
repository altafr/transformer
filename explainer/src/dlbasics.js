import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, seg, ease, back, smooth, win, pulse, hash } from './util.js';
import { clay, setDissolve, glowMat, PAL } from './materials.js';
import { Overlay } from './overlay.js';
import { createStage, H } from './stage.js';
import { labelTexture, makeDial } from './parts.js';

// "Deep Learning Basics": the film version of the site's Deep learning basics tab. A 13-dial network
// learns whether a fruit is good to eat. The training scene replays a real run: the network is trained
// in the browser at load time (fixed seeds, full-batch gradient descent) and every epoch is recorded.
export const DURATION = 50;

// ---------------------------------------------------------------- the fruit network, trained for real
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sig = (z) => 1 / (1 + Math.exp(-clamp(z, -30, 30)));
const isGood = (s, f) => s > 0.55 && f > 0.25 && f < 0.75;   // the hidden rule: sweet, a little soft, not mushy
const FRUITS = (() => { const r = rng(4), d = []; while (d.length < 60) { const s = r(), f = r(); d.push([s, f, isGood(s, f) ? 1 : 0]); } return d; })();
// Weights as a flat array of 13 dials: [w1 A s, w1 A f, w1 B s, w1 B f, w1 C s, w1 C f, bA, bB, bC, w2 A, w2 B, w2 C, b out]
function forward(W, s, f) {
  const h = [0, 1, 2].map((j) => sig(W[2 * j] * s + W[2 * j + 1] * f + W[6 + j]));
  return { h, p: sig(W[9] * h[0] + W[10] * h[1] + W[11] * h[2] + W[12]) };
}
function gradient(W, batch) {
  const g = new Array(13).fill(0);
  let loss = 0;
  for (const [s, f, y] of batch) {
    const { h, p } = forward(W, s, f);
    loss += -Math.log(y ? p : 1 - p);
    const dz = p - y;
    for (let j = 0; j < 3; j++) {
      g[9 + j] += dz * h[j];
      const dh = dz * W[9 + j] * h[j] * (1 - h[j]);
      g[2 * j] += dh * s; g[2 * j + 1] += dh * f; g[6 + j] += dh;
    }
    g[12] += dz;
  }
  return { g: g.map((v) => v / batch.length), loss: loss / batch.length };
}
const EPOCHS = 2500, LR = 2.0;
const RUN = (() => {
  const r = rng(22), u = () => (r() * 2 - 1) * 2;
  const w1 = [[u(), u()], [u(), u()], [u(), u()]], b1 = [u(), u(), u()], w2 = [u(), u(), u()], b2 = u();
  let W = [w1[0][0], w1[0][1], w1[1][0], w1[1][1], w1[2][0], w1[2][1], ...b1, ...w2, b2];
  const weights = [W.slice()], losses = [];
  for (let e = 0; e < EPOCHS; e++) {
    const { g, loss } = gradient(W, FRUITS);
    losses.push(loss);
    W = W.map((w, i) => w - LR * g[i]);
    weights.push(W.slice());
  }
  losses.push(gradient(W, FRUITS).loss);
  return { weights, losses };
})();
const W0 = RUN.weights[0], WEND = RUN.weights[EPOCHS];
const STAR = [0.7, 0.55];
// One-step example: the good fruit the untrained network is most wrong about.
const EX = FRUITS.filter((d) => d[2] === 1).reduce((best, d) => (forward(W0, d[0], d[1]).p < forward(W0, best[0], best[1]).p ? d : best));
const EX_GRAD = gradient(W0, [EX]).g;
// Neuron A "sweet detector" preset from the tab: dials 6, 0 and bias −3.
const PRESET = { 0: 6, 1: 0, 6: -3 };

// ---------------------------------------------------------------- T vs L (machine learning on pixels)
const T_PIX = [...[1, 2, 3, 4, 5, 6].map((c) => [1, c]), ...[2, 3, 4, 5, 6].map((r) => [r, 3])];
const L_PIX = [...[1, 2, 3, 4, 5, 6].map((r) => [r, 1]), ...[2, 3, 4, 5].map((c) => [6, c])];
const key = (r, c) => r * 8 + c;
const WMAP = new Array(64).fill(0);
T_PIX.forEach(([r, c]) => (WMAP[key(r, c)] += 1));
L_PIX.forEach(([r, c]) => (WMAP[key(r, c)] -= 1));
const pT = (dr, dc) => sig(0.8 * T_PIX.reduce((s, [r, c]) => s + (r + dr < 8 && c + dc < 8 ? WMAP[key(r + dr, c + dc)] : 0), 0) - 4);
const P_SAME = pT(0, 0), P_SHIFT = pT(1, 1);

// ---------------------------------------------------------------- layout
const IN_X = -4.6, HID_X = -1.0, OUT_X = 2.4, NODE_R = 0.3;
const Y_IN = [3.0, 1.8], Y_H = [3.6, 2.4, 1.2], Y_OUT = 2.4;
const F1 = [0.3, 0.45, 0.6];
const MAP_C = [6.7, 2.5], MAP_S = 3.4;
const mapXY = (s, f) => [MAP_C[0] - MAP_S / 2 + s * MAP_S, MAP_C[1] - MAP_S / 2 + f * MAP_S];
const GRAPH = [-1.0, 5.15];          // sigmoid graph origin (z = 0, σ = 0)
const angleOf = (w) => 2.2 * Math.tanh(w / 5);

// ---------------------------------------------------------------- timeline
const T_STEP = 22.4;                 // explain one training step
const T_FAST0 = 25.2, T_FAST1 = 31.4; // fast training
const epochAt = (t) => EPOCHS * (Math.pow(10, 3 * ease(seg(t, T_FAST0, T_FAST1))) - 1) / 999;
function weightsAt(t) {
  const e = epochAt(t), i = Math.floor(e), k = e - i;
  const a = RUN.weights[i], b = RUN.weights[Math.min(EPOCHS, i + 1)];
  let W = a.map((v, n) => lerp(v, b[n], k));
  // Chapter 3 borrows neuron A for the "sweet detector" preset, then scrambles back to the random start.
  const pre = ease(seg(t, 15.0, 15.8)) * (1 - ease(seg(t, 20.8, 21.6)));
  if (pre > 0) W = W.map((v, n) => (n in PRESET ? lerp(v, PRESET[n], pre) : v));
  return W;
}

const stage = createStage(document.getElementById('gl'), { center: [1.0, 1.0] });
const { scene, camera, mesh, inst, setInst, tube, drawTube } = stage;
const tmpC = new THREE.Color();
const col = (hex) => new THREE.Color(hex);
const mix = (a, b, k) => tmpC.copy(col(a)).lerp(col(b), clamp(k)).clone();

// ---------------------------------------------------------------- build
const O = {};
function build() {
  // 1. Pixel board: 64 base tiles (tinted by the learned weight map) + ink cubes for the letter
  O.pixBase = inst(new RoundedBoxGeometry(0.34, 0.34, 0.1, 2, 0.04), clay(0xffffff, { noiseScale: 5 }), 64);
  O.pixInk = inst(new RoundedBoxGeometry(0.34, 0.34, 0.26, 2, 0.06), clay(0xffffff), T_PIX.length);

  // 2. Network: inputs, hidden A/B/C, output, 9 wire dials + 4 bias dials
  O.inputs = ['sweetness', 'softness'].map((f, i) => {
    const g = new THREE.Group(); scene.add(g);
    const body = mesh(new RoundedBoxGeometry(1.55, 0.56, 0.24, 4, 0.1), clay(PAL.clay, { noiseScale: 3 }), { parent: g });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: labelTexture(f), transparent: true, depthWrite: false, color: PAL.ink }));
    decal.position.z = 0.126; g.add(decal);
    g.position.set(IN_X - 0.8, Y_IN[i], 0);
    return { g, body, decal };
  });
  const sphere = new THREE.SphereGeometry(NODE_R, 40, 28);
  O.hidden = Y_H.map((y) => { const m = mesh(sphere, clay(0xd9f0e4, { rim: 0.2 })); m.position.set(HID_X, y, 0); return m; });
  O.out = mesh(new THREE.SphereGeometry(0.36, 40, 28), clay(0xffffff, { rim: 0.2 }));
  O.out.position.set(OUT_X, Y_OUT, 0);
  const wireMat = () => glowMat(0x9aa3c0, 0.15);
  const line = (a, b) => tube(new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b)), 0.022, wireMat(), 24);
  O.wires = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
    const a = [IN_X, Y_IN[i], 0], b = [HID_X - NODE_R, Y_H[j], 0], f = F1[j];
    const pos = [lerp(a[0], b[0], f), lerp(a[1], b[1], f), 0.08];
    O.wires.push({ layer: 1, src: i, tgt: j, a, b, f, idx: 2 * j + i, tube: line(a, b), dial: makeDial(stage, pos, { scale: 0.85 }), pos });
  }
  for (let j = 0; j < 3; j++) {
    const a = [HID_X + NODE_R, Y_H[j], 0], b = [OUT_X - 0.36, Y_OUT, 0], f = 0.5;
    const pos = [lerp(a[0], b[0], f), lerp(a[1], b[1], f), 0.08];
    O.wires.push({ layer: 2, src: j, tgt: 0, a, b, f, idx: 9 + j, tube: line(a, b), dial: makeDial(stage, pos, { scale: 0.85 }), pos });
  }
  O.biases = [[HID_X, Y_H[0] + 0.62, 6], [HID_X + 0.62, Y_H[1] + 0.42, 7], [HID_X + 0.62, Y_H[2] + 0.42, 8], [OUT_X, Y_OUT + 0.68, 12]]
    .map(([x, y, idx]) => ({ idx, pos: [x, y, 0.08], dial: makeDial(stage, [x, y, 0.08], { scale: 0.62 }) }));
  O.allDials = [...O.wires.map((w) => ({ idx: w.idx, dial: w.dial, pos: w.pos })), ...O.biases];
  O.beads = inst(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }), O.wires.length, { cast: false });

  // 3. Sigmoid graph above neuron A
  O.graph = mesh(new RoundedBoxGeometry(3.6, 1.95, 0.12, 4, 0.1), clay(0xf6f3ef, { noiseScale: 1.6 }));
  O.graph.position.set(GRAPH[0], GRAPH[1] + 0.62, -0.15);
  O.axes = [[3.2, 0.025, 0, 0], [0.025, 1.45, 0, 0.62]].map(([w, h, x, y]) => {
    const m = mesh(new THREE.BoxGeometry(w, h, 0.03), clay(0x9aa0b4), { cast: false }); m.position.set(GRAPH[0] + x, GRAPH[1] + y, 0.0); return m;
  });
  const pts = [...Array(61)].map((_, i) => { const z = -6 + i * 0.2; return new THREE.Vector3(GRAPH[0] + z * 0.25, GRAPH[1] + sig(z) * 1.2, 0.05); });
  O.sigmoid = tube(new THREE.CatmullRomCurve3(pts), 0.04, glowMat(PAL.indigo, 0.6), 120);
  O.marker = mesh(new THREE.SphereGeometry(0.1, 20, 14), clay(PAL.coral), { cast: false });

  // 4. Opinion map with the 60 training fruits
  O.board = mesh(new RoundedBoxGeometry(MAP_S + 0.5, MAP_S + 0.5, 0.14, 4, 0.12), clay(0xf6f3ef, { noiseScale: 1.4 }));
  O.board.position.set(MAP_C[0], MAP_C[1], -0.12);
  O.mapCanvas = document.createElement('canvas'); O.mapCanvas.width = O.mapCanvas.height = 72;
  O.mapTex = new THREE.CanvasTexture(O.mapCanvas); O.mapTex.colorSpace = THREE.SRGBColorSpace;
  O.mapTex.magFilter = THREE.LinearFilter;
  O.map = new THREE.Mesh(new THREE.PlaneGeometry(MAP_S, MAP_S), new THREE.MeshBasicMaterial({ map: O.mapTex, transparent: true }));
  O.map.position.set(MAP_C[0], MAP_C[1], -0.04); scene.add(O.map);
  O.fruit = inst(new THREE.SphereGeometry(0.075, 18, 12), clay(0xffffff, { rim: 0.1 }), 60, { cast: false });
  O.wrong = inst(new THREE.TorusGeometry(0.12, 0.018, 8, 28), new THREE.MeshBasicMaterial({ color: 0x3a2f2a }), 60, { cast: false });
  O.focus = mesh(new THREE.TorusGeometry(0.17, 0.025, 10, 40), glowMat(PAL.indigo, 1.2), { cast: false });
  O.star = mesh(new THREE.OctahedronGeometry(0.16), glowMat(PAL.indigo, 1.0), { cast: false });

  // 6. Wall of dials for the scale-up
  const WALL_C = 46, WALL_R = 22;
  O.wall = inst(new THREE.CylinderGeometry(0.15, 0.16, 0.1, 20), clay(0xffffff, { rim: 0.12 }), WALL_C * WALL_R, { cast: false });
  O.wallPos = [];
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), qz = new THREE.Quaternion();
  for (let r = 0; r < WALL_R; r++) for (let c = 0; c < WALL_C; c++) {
    const n = r * WALL_C + c, x = 1.0 + (c - (WALL_C - 1) / 2) * 0.48, y = 0.6 + r * 0.48;
    qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), hash(n * 3.1) * 6.28);
    O.wallPos.push({ x, y, z: -3.2 - 0.02 * Math.abs(c - WALL_C / 2), d: Math.hypot(x - 1.0, (y - 3.0) * 1.6), q: q.copy(qz).multiply(qa).clone() });
    O.wall.setColorAt(n, col(hash(n * 7.7) > 0.5 ? PAL.peach : PAL.sky));
  }

  // 7. Architecture vignettes on plinths
  O.plinths = [-4.8, -1.6, 1.6, 4.8].map((x) => { const m = mesh(new RoundedBoxGeometry(2.6, 0.3, 1.5, 3, 0.1), clay(0xf2eee8, { noiseScale: 2 })); m.position.set(x, 0.85, 0); return m; });
  O.archNodes = inst(new THREE.SphereGeometry(0.1, 18, 12), clay(0xffffff), 9, { cast: true });
  const mlpEdges = [];
  const L0 = [[-0.7, 1.35], [-0.7, 1.75], [-0.7, 2.15]], L1 = [[0, 1.15], [0, 1.55], [0, 1.95], [0, 2.35]], L2 = [[0.7, 1.55], [0.7, 1.95]];
  for (const a of L0) for (const b of L1) mlpEdges.push(-4.8 + a[0], a[1], 0, -4.8 + b[0], b[1], 0);
  for (const a of L1) for (const b of L2) mlpEdges.push(-4.8 + a[0], a[1], 0, -4.8 + b[0], b[1], 0);
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(mlpEdges, 3));
  O.mlpEdges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x7c74ef, transparent: true, opacity: 0 })); scene.add(O.mlpEdges);
  O.mlpNodes = [...L0, ...L1, ...L2];
  O.cnn = inst(new RoundedBoxGeometry(0.2, 0.2, 0.08, 2, 0.03), clay(0xffffff), 36);
  O.cnnWin = mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 4), glowMat(PAL.indigo, 1.0), { cast: false }); O.cnnWin.rotation.z = Math.PI / 4;
  O.seqCubes = inst(new RoundedBoxGeometry(0.34, 0.34, 0.34, 2, 0.07), clay(0xffffff), 8);
  O.rnnLoops = [0, 1, 2].map((i) => tube(new THREE.CubicBezierCurve3(new THREE.Vector3(1.6 - 0.84 + i * 0.56, 1.9, 0), new THREE.Vector3(1.6 - 0.84 + i * 0.56 + 0.1, 2.4, 0), new THREE.Vector3(1.6 - 0.84 + (i + 1) * 0.56 - 0.1, 2.4, 0), new THREE.Vector3(1.6 - 0.84 + (i + 1) * 0.56, 1.9, 0)), 0.025, glowMat(PAL.coral, 0.7), 30));
  O.attn = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const xi = 4.8 - 0.84 + i * 0.56, xj = 4.8 - 0.84 + j * 0.56, h = 0.3 + 0.22 * (j - i);
    O.attn.push(tube(new THREE.CubicBezierCurve3(new THREE.Vector3(xi, 1.9, 0), new THREE.Vector3(xi, 1.9 + h, 0), new THREE.Vector3(xj, 1.9 + h, 0), new THREE.Vector3(xj, 1.9, 0)), 0.02, glowMat([PAL.indigo, PAL.coral, PAL.teal][(i + j) % 3], 0.7), 30));
  }
}

// ---------------------------------------------------------------- per-frame state
function bead(w, t, W) {
  const along = (t0, t1, dir) => { const k = seg(t, t0, t1); return k > 0 && k < 1 ? (dir > 0 ? ease(k) : 1 - ease(k)) : null; };
  const passes = [];
  const fwd = (t0, c) => passes.push(w.layer === 1 ? [t0, t0 + 0.45, 1, c] : [t0 + 0.4, t0 + 0.85, 1, c]);
  const bwd = (t0, c) => passes.push(w.layer === 2 ? [t0, t0 + 0.45, -1, c] : [t0 + 0.4, t0 + 0.85, -1, c]);
  fwd(10.2, PAL.mint);                                                    // first look: a random guess
  if (w.layer === 1 && w.tgt === 0) passes.push([16.0 + 0.6 * w.src, 16.5 + 0.6 * w.src, 1, PAL.indigo]); // neuron A, one input at a time
  fwd(T_STEP + 0.1, PAL.mint); bwd(T_STEP + 1.3, PAL.coral);              // explain one step
  fwd(34.6, PAL.indigo);                                                  // inference on the new fruit
  for (const [t0, t1, dir, c] of passes) {
    const u = along(t0, t1, dir);
    if (u !== null) return { u, size: 0.07, color: col(c).multiplyScalar(c === PAL.indigo ? 1.6 : 1.2) };
  }
  // during fast training a light stream runs both ways
  if (t > T_FAST0 && t < T_FAST1 - 0.3) {
    const ph = ((t - T_FAST0) * 1.6 + w.idx * 0.13) % 1;
    return { u: ph, size: 0.045, color: col(PAL.coral).multiplyScalar(1.1) };
  }
  return null;
}

function drawMap(W) {
  const c = O.mapCanvas.getContext('2d'), n = O.mapCanvas.width, img = c.createImageData(n, n);
  const good = [179, 229, 204], bad = [247, 194, 164];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const { p } = forward(W, (x + 0.5) / n, 1 - (y + 0.5) / n);
    const k = 4 * (y * n + x);
    for (let ch = 0; ch < 3; ch++) img.data[k + ch] = bad[ch] + (good[ch] - bad[ch]) * p;
    img.data[k + 3] = 235;
  }
  c.putImageData(img, 0, 0);
  O.mapTex.needsUpdate = true;
}

function update(t) {
  const W = weightsAt(t);
  const frozen = smooth(32.3, 32.9, t);
  const netIn = (d) => back(seg(t, 8.6 + d, 9.1 + d));
  const netOut = ease(seg(t, 43.6, 44.4));
  const netVis = (d) => Math.max(1e-4, netIn(d) * (1 - netOut));

  // 1. Pixel board
  const boardIn = ease(seg(t, 2.5, 3.2)), boardOut = ease(seg(t, 8.0, 8.7));
  const tint = smooth(4.0, 4.8, t);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const n = key(r, c), s = back(seg(t, 2.5 + 0.008 * n, 2.9 + 0.008 * n)) * (1 - boardOut);
    setInst(O.pixBase, n, (c - 3.5) * 0.38, 2.7 + (3.5 - r) * 0.38, 0, s);
    const wv = WMAP[n];
    O.pixBase.setColorAt(n, mix(0xf3eee8, wv > 0 ? 0xf3b48e : wv < 0 ? 0x8fd6c7 : 0xf3eee8, tint * Math.abs(wv)));
  }
  const shift = ease(seg(t, 6.0, 6.7));
  T_PIX.forEach(([r, c], i) => {
    const s = back(seg(t, 3.3 + 0.04 * i, 3.7 + 0.04 * i)) * (1 - boardOut);
    setInst(O.pixInk, i, (c + shift - 3.5) * 0.38, 2.7 + (3.5 - r - shift) * 0.38, 0.12, s);
    O.pixInk.setColorAt(i, col(0x3b3f5c));
  });
  [O.pixBase, O.pixInk].forEach((m) => { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });

  // 2. Network
  O.inputs.forEach((n, i) => { const k = netVis(0.1 * i); n.g.scale.setScalar(k); n.g.visible = k > 0.01; });
  O.hidden.forEach((m, j) => {
    const k = netVis(0.2 + 0.08 * j); m.scale.setScalar(k); m.visible = k > 0.01;
    const focusA = win(t, 14.6, 21.4, 0.3, 0.3);
    m.material.userData.u.uGlow.value = 0.4 * pulse(t, 17.6, 0.25) * (j === 0 ? 1 : 0) + 0.25 * focusA * (j === 0 ? 1 : 0);
  });
  {
    const inV = t > 33.8 ? STAR : [0.8, 0.5];
    const p = t < T_STEP ? forward(W, 0.8, 0.5).p : t < T_FAST0 ? forward(W0, EX[0], EX[1]).p : forward(W, ...inV).p;
    const k = netVis(0.4); O.out.scale.setScalar(k); O.out.visible = k > 0.01;
    O.out.material.color.copy(mix(PAL.peach, PAL.mint, p));
    O.out.material.userData.u.uGlow.value = 0.35 * (pulse(t, 11.1, 0.25) + pulse(t, T_STEP + 1.0, 0.25) + pulse(t, 35.5, 0.3));
  }
  const focusA = win(t, 14.6, 21.4, 0.3, 0.3);
  for (const w of O.wires) {
    const wa = ease(seg(t, 9.0 + 0.05 * w.idx, 9.8 + 0.05 * w.idx)) * (1 - netOut);
    const isA = w.layer === 1 && w.tgt === 0;
    drawTube(w.tube, wa, 0.85 * (1 - 0.7 * focusA * (isA ? 0 : 1)));
    w.tube.material.color.copy(mix(0x9aa3c0, PAL.indigo, focusA * (isA ? 1 : 0)));
    w.tube.material.emissive.copy(w.tube.material.color);
    const b = bead(w, t, W);
    if (b && wa > 0.99) {
      setInst(O.beads, O.wires.indexOf(w), lerp(w.a[0], w.b[0], b.u), lerp(w.a[1], w.b[1], b.u), 0.12, b.size);
      O.beads.setColorAt(O.wires.indexOf(w), b.color);
    } else setInst(O.beads, O.wires.indexOf(w), 0, -10, 0, 0);
  }
  O.beads.instanceMatrix.needsUpdate = true; O.beads.instanceColor.needsUpdate = true;
  const hintA = win(t, T_STEP + 1.7, T_STEP + 2.9, 0.2, 0.25);
  O.allDials.forEach(({ idx, dial }, n) => {
    const k = Math.max(1e-4, back(seg(t, 9.4 + 0.04 * n, 9.85 + 0.04 * n)) * (1 - netOut));
    dial.g.scale.setScalar(k * (O.biases.some((b) => b.dial === dial) ? 0.62 : 0.85)); dial.g.visible = k > 0.01;
    dial.set(W[idx], angleOf(W[idx]));
    dial.hint(hintA, -Math.sign(EX_GRAD[idx]) || 1);
    const inA = idx === 0 || idx === 1 || idx === 6;
    dial.knob.material.userData.u.uGlow.value = 0.5 * win(t, 15.0, 15.9, 0.2, 0.3) * (inA ? 1 : 0);
    dial.gauge.material.color.copy(mix(0xb9b4ad, 0x6b7088, frozen * (1 - smooth(37.6, 38.2, t))));
    dial.gauge.material.emissive.copy(dial.gauge.material.color);
  });

  // 3. Sigmoid graph
  const gIn = 1 - ease(seg(t, 15.2, 15.9)), gOut = ease(seg(t, 21.0, 21.6));
  setDissolve(O.graph, Math.max(gIn, gOut));
  O.axes.forEach((m) => setDissolve(m, Math.max(1 - ease(seg(t, 15.5, 15.9)), gOut)));
  drawTube(O.sigmoid, ease(seg(t, 15.9, 16.7)), t > 15.8 ? 1 - gOut : 0);
  {
    const z = 0.8 * 6 + 0.5 * 0 - 3;                   // 1.8
    const slide = ease(seg(t, 17.6, 18.3)), rise = ease(seg(t, 18.4, 19.0));
    O.marker.position.set(GRAPH[0] + z * 0.25 * slide, GRAPH[1] + sig(z) * 1.2 * rise, 0.14);
    const a = slide > 0 ? 1 - gOut : 0; O.marker.scale.setScalar(Math.max(a, 1e-3)); O.marker.visible = a > 0.01;
  }

  // 4. Opinion map + fruits
  const mapIn = 1 - ease(seg(t, 21.6, 22.3)), mapOut = ease(seg(t, 37.7, 38.4));
  setDissolve(O.board, Math.max(mapIn, mapOut));
  O.map.visible = t > 21.8 && mapOut < 0.99; O.map.material.opacity = smooth(21.8, 22.4, t) * (1 - mapOut);
  if (O.map.visible) drawMap(W);
  const exIdx = FRUITS.indexOf(EX);
  FRUITS.forEach(([s, f, y], n) => {
    const [x, yy] = mapXY(s, f);
    const k = back(seg(t, 22.0 + 0.01 * n, 22.35 + 0.01 * n)) * (1 - mapOut);
    const isEx = n === exIdx ? win(t, T_STEP, T_FAST0 + 0.2, 0.2, 0.3) : 0;
    setInst(O.fruit, n, x, yy, 0.06, k * (1 + 0.6 * isEx));
    O.fruit.setColorAt(n, col(y ? 0x45b98c : PAL.coral));
    const wrong = (forward(W, s, f).p > 0.5) !== !!y;
    setInst(O.wrong, n, x, yy, 0.07, wrong && t > 22.4 ? k : 0);
  });
  [O.fruit, O.wrong].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  {
    const [x, y] = mapXY(EX[0], EX[1]);
    const a = win(t, T_STEP, T_FAST0 + 0.2, 0.2, 0.3);
    O.focus.position.set(x, y, 0.08); O.focus.scale.setScalar(Math.max(a, 1e-3)); O.focus.visible = a > 0.01;
    const [sx, sy] = mapXY(...STAR);
    const sa = back(seg(t, 33.2, 33.7)) * (1 - mapOut);
    O.star.position.set(sx, sy, 0.16); O.star.scale.setScalar(Math.max(sa, 1e-3)); O.star.visible = sa > 0.01;
    O.star.rotation.set(0, t * 1.2, 0);
  }

  // 6. Wall of dials
  const wallR = seg(t, 38.6, 41.8) * 16, wallOut = ease(seg(t, 43.4, 44.2));
  O.wallPos.forEach((p, n) => {
    const s = clamp((wallR - p.d) / 1.2) * (1 - wallOut);
    setInst(O.wall, n, p.x, p.y, p.z, s, s, s, p.q);
  });
  O.wall.instanceMatrix.needsUpdate = true;

  // 7. Architectures
  const archIn = (i) => back(seg(t, 44.2 + 0.2 * i, 44.7 + 0.2 * i));
  O.plinths.forEach((m, i) => { const k = archIn(i); m.scale.setScalar(Math.max(k, 1e-4)); m.visible = k > 0.01; });
  const a0 = archIn(0);
  O.mlpNodes.forEach(([x, y], i) => setInst(O.archNodes, i, -4.8 + x, y, 0, a0));
  O.archNodes.instanceMatrix.needsUpdate = true;
  O.mlpEdges.material.opacity = 0.6 * smooth(44.5, 45.0, t);
  const a1 = archIn(1), wx = Math.floor(((t - 44.6) * 2.2) % 4), wy = Math.floor(((t - 44.6) * 2.2) / 4) % 4;
  for (let n = 0; n < 36; n++) {
    const r = Math.floor(n / 6), c = n % 6;
    const inWin = r >= wy && r < wy + 3 && c >= wx && c < wx + 3 && t > 44.6;
    setInst(O.cnn, n, -1.6 + (c - 2.5) * 0.24, 1.75 + (2.5 - r) * 0.24, 0, a1);
    O.cnn.setColorAt(n, col(inWin ? 0xc9c5fb : 0xf3eee8));
  }
  O.cnn.instanceMatrix.needsUpdate = true; O.cnn.instanceColor.needsUpdate = true;
  O.cnnWin.position.set(-1.6 + (wx + 1 - 2.5) * 0.24, 1.75 + (2.5 - wy - 1) * 0.24, 0.07);
  O.cnnWin.scale.setScalar(Math.max(a1 * 0.82, 1e-3)); O.cnnWin.visible = a1 > 0.01 && t > 44.6;
  const a2 = archIn(2), a3 = archIn(3);
  for (let i = 0; i < 4; i++) {
    setInst(O.seqCubes, i, 1.6 - 0.84 + i * 0.56, 1.7, 0, a2);
    setInst(O.seqCubes, 4 + i, 4.8 - 0.84 + i * 0.56, 1.7, 0, a3);
    const step = ((t - 45.0) * 1.5) % 4;
    O.seqCubes.setColorAt(i, mix(0xf3eee8, PAL.peach, t > 45 ? clamp(1 - Math.abs(step - i)) : 0));
    O.seqCubes.setColorAt(4 + i, col(PAL.sky));
  }
  O.seqCubes.instanceMatrix.needsUpdate = true; O.seqCubes.instanceColor.needsUpdate = true;
  O.rnnLoops.forEach((m, i) => drawTube(m, ease(seg(t, 44.9 + 0.2 * i, 45.4 + 0.2 * i)), 0.9));
  O.attn.forEach((m, i) => drawTube(m, ease(seg(t, 45.2 + 0.08 * i, 45.8 + 0.08 * i)), 0.9));

  return { W };
}

// ---------------------------------------------------------------- camera  [t, px, py, pz, lx, ly, lz]
const CAM = [
  [0.0, 0.0, 2.9, 8.6, 0.0, 2.6, 0],
  [2.4, 0.0, 2.9, 9.2, 0.0, 2.6, 0],
  [8.0, 0.0, 2.9, 9.6, 0.0, 2.6, 0],
  [9.4, -0.4, 2.8, 12.2, -0.4, 2.45, 0],
  [14.2, -0.4, 2.8, 12.0, -0.4, 2.45, 0],
  [15.4, -1.5, 4.5, 11.8, -1.4, 3.85, 0],
  [20.8, -1.4, 4.5, 11.5, -1.3, 3.85, 0],
  [22.2, 1.3, 3.0, 15.4, 1.3, 2.5, 0],
  [31.6, 1.4, 3.0, 15.0, 1.4, 2.5, 0],
  [33.0, 1.3, 2.9, 14.6, 1.3, 2.45, 0],
  [37.6, 1.3, 2.9, 14.4, 1.3, 2.45, 0],
  [40.4, 1.0, 4.4, 24.0, 1.0, 3.6, 0],
  [43.6, 1.0, 4.6, 25.0, 1.0, 3.7, 0],
  [44.6, 0.0, 3.1, 11.8, 0.0, 1.95, 0],
  [50.0, 0.0, 3.2, 11.2, 0.0, 1.95, 0],
];

// ---------------------------------------------------------------- overlay
const ui = new Overlay(document.getElementById('ui'), camera);
const CHAPTERS = [[0, 'What is a model?'], [8.5, 'A box of dials'], [14.5, 'One neuron'], [21.5, 'Training'], [32, 'Inference'], [38, '13 dials to 175 billion'], [44, 'Architectures']];
const pct = (p) => `${Math.round(p * 100)}%`;
const fmt = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
// Loss sampled on the same log-time axis the animation uses, so the curve matches what the dials do.
const LOSS_SAMPLES = [...Array(41)].map((_, i) => { const e = EPOCHS * (Math.pow(10, 3 * (i / 40)) - 1) / 999; return RUN.losses[Math.round(e)]; });

function drawOverlay(t, st) {
  ui.clear();
  const ch = CHAPTERS.findLastIndex((c) => t >= c[0]);
  const chEnd = ch < CHAPTERS.length - 1 ? CHAPTERS[ch + 1][0] : DURATION;
  ui.chapter(ch + 1, CHAPTERS[ch][1], smooth(0.6, 1.2, t), seg(t, CHAPTERS[ch][0], chEnd), CHAPTERS.length);
  ui.credit('Design · Altaf Rehmani', smooth(0.6, 1.2, t));
  const W = st.W;

  // 1. What is a model?
  ui.title('Deep Learning Basics', win(t, 0.15, 2.4, 0.5, 0.35), 'FROM A SIMPLE RULE TO 175 BILLION DIALS');
  ui.headline('A model is a rule learned from examples.', win(t, 2.4, 8.6, 0.35, 0.3), 'Machine learning works well on tables of facts. Pictures are harder.', win(t, 2.9, 8.6, 0.35, 0.3));
  ui.tag([1.6, 3.5, 0.1], ['each pixel is one column', 'orange = T-ish · teal = L-ish'], win(t, 4.3, 8.4, 0.3, 0.3), { dx: 70, dy: -10, align: 'left', size: 16 });
  ui.tag([-1.55, 2.7, 0.2], [`T, same place: ${pct(P_SAME)} T`], win(t, 4.9, 6.0, 0.25, 0.2), { dx: -60, dy: 0, align: 'right', accent: '#3fb68a' });
  ui.tag([-1.55, 2.7, 0.2], [`shifted a little: ${pct(P_SHIFT)} T`, 'it answers “L”. Wrong.'], win(t, 6.7, 8.4, 0.25, 0.3), { dx: -60, dy: 0, align: 'right', accent: '#c2410c' });
  ui.caption('It learned where the ink is, not what the shape is. Deep learning learns the features itself.', win(t, 6.9, 8.6, 0.3, 0.3), H - 92, { size: 22 });

  // 2. Box of dials
  ui.headline('A neural network is a machine full of dials.', win(t, 8.8, 14.6, 0.35, 0.3), 'Is this fruit good to eat? 2 inputs, 3 hidden neurons, 1 output: 13 dials.', win(t, 9.3, 14.6, 0.35, 0.3));
  const inVals = t > 33.8 ? STAR : [0.8, 0.5];
  inVals.forEach((v, i) => ui.text([IN_X - 1.6, Y_IN[i], 0.1], v.toFixed(2).replace(/0$/, ''), smooth(9.0, 9.6, t) * (1 - smooth(43.4, 44, t)), { align: 'right', dx: -10, size: 20, color: '#4f46e5' }));
  ['A', 'B', 'C'].forEach((n, j) => ui.text([HID_X - NODE_R, Y_H[j], 0.1], n, smooth(9.2, 9.8, t) * (1 - smooth(43.4, 44, t)), { align: 'right', dx: -6, size: 16, color: '#3f8f6c', sans: true, weight: 700 }));
  {
    const p = t < T_STEP ? forward(W, 0.8, 0.5).p : t < T_FAST0 ? forward(W0, EX[0], EX[1]).p : forward(W, ...inVals).p;
    const shown = t < 11.0 ? 0 : t > T_STEP && t < T_STEP + 0.95 ? 0 : t > 34.0 && t < 35.4 ? 0 : 1;
    ui.text([OUT_X + 0.4, Y_OUT, 0.1], `good to eat? ${pct(p)}`, smooth(9.6, 10.2, t) * (1 - smooth(37.5, 38.1, t)) * (shown ? 1 : 0.35), { align: 'left', dx: 12, size: 20, sans: true, weight: 700 });
  }
  ui.caption('Every dial starts random, so the first guess is random too.', win(t, 11.2, 14.6, 0.3, 0.3), H - 92, { size: 22 });
  ui.tag([OUT_X, Y_OUT + 0.68, 0.1], 'bias dials sit on the neurons', win(t, 10.0, 14.4, 0.3, 0.3), { dy: -46, size: 15 });

  // 3. One neuron
  ui.headline('One neuron: multiply, add, squash.', win(t, 14.7, 21.6, 0.35, 0.3));
  const terms = ['0.8 × 6', '0.5 × 0', '− 3'];
  let eq = '';
  terms.forEach((s, i) => { if (t > 16.4 + 0.6 * i) eq += (i ? '  +  ' : '') + s; });
  eq = eq.replace('+  − 3', '−  3');
  if (t > 17.6) eq += '  =  1.8';
  if (t > 19.0) eq += `   →   σ(1.8) = ${sig(1.8).toFixed(2)}`;
  ui.caption(eq || ' ', win(t, 16.3, 21.6, 0.3, 0.3) * (eq ? 1 : 0), H - 100, { mono: true, size: 28, weight: 600, color: '#161a2b' });
  ui.tag([HID_X, Y_H[0] + NODE_R, 0.1], ['neuron A', '“sweet detector” preset'], win(t, 15.0, 17.4, 0.3, 0.3), { dx: 120, dy: -10, align: 'left', size: 15, accent: '#4f46e5' });
  ui.text([GRAPH[0] + 1.5, GRAPH[1] + 1.3, 0.1], 'σ squash', win(t, 16.4, 21.2, 0.3, 0.3), { size: 18, color: '#4f46e5', sans: true, weight: 700, align: 'right' });
  ui.text([GRAPH[0] + 1.62, GRAPH[1], 0.1], '0', win(t, 16.4, 21.2, 0.3, 0.3), { size: 14, color: '#7b8199', align: 'left', dx: 6 });
  ui.text([GRAPH[0], GRAPH[1] + 1.2, 0.1], '1', win(t, 16.4, 21.2, 0.3, 0.3), { size: 14, color: '#7b8199', align: 'right', dx: -8 });
  ui.caption('Training starts from random dials.', win(t, 21.2, 22.3, 0.2, 0.25), H - 92, { size: 22 });

  // 4. Training
  ui.headline('Training: let the examples turn the dials.', win(t, 21.7, 32.2, 0.35, 0.3), 'Guess, measure the error, nudge every dial a little, repeat.', win(t, 22.2, 32.2, 0.35, 0.3));
  {
    const [x, y] = mapXY(EX[0], EX[1]);
    const p0 = forward(W0, EX[0], EX[1]).p;
    ui.tag([x, y, 0.1], ['good to eat (answer 1)', `network says ${pct(p0)}: a big error`], win(t, T_STEP + 0.9, T_FAST0, 0.25, 0.3), { dx: -40, dy: -150, align: 'right', size: 15, accent: '#4f46e5' });
  }
  ui.caption('Backpropagation works out which way each dial should turn; every dial moves a little.', win(t, T_STEP + 1.4, T_FAST0 + 0.2, 0.3, 0.3), H - 92, { size: 21 });
  const e = Math.round(epochAt(t));
  const wrongN = FRUITS.filter(([s, f, y]) => (forward(W, s, f).p > 0.5) !== !!y).length;
  ui.tag([MAP_C[0], MAP_C[1] + MAP_S / 2 + 0.25, 0], [`60 training fruits · pass ${e.toLocaleString('en-US')}`, `currently wrong: ${wrongN}`], win(t, 22.3, 32.1, 0.3, 0.3) + win(t, 32.1, 37.8, 0.01, 0.3) * 0, { dy: -40, size: 15 });
  ui.text([MAP_C[0], MAP_C[1] - MAP_S / 2 - 0.12, 0.1], 'sweetness →', win(t, 22.3, 37.8, 0.3, 0.3), { size: 14, color: '#5b6178', dy: 10 });
  ui.text([MAP_C[0] + MAP_S / 2 + 0.15, MAP_C[1], 0.1], 'softness ↑', win(t, 22.3, 37.8, 0.3, 0.3), { size: 14, color: '#5b6178', align: 'left' });
  ui.lossChart(60, 722, LOSS_SAMPLES, seg(t, T_FAST0, T_FAST1) * 40, win(t, T_FAST0 - 0.2, 32.2, 0.3, 0.3), { vmax: 1.2, ticks: [[0, '0'], [40, `${EPOCHS}`]], xLabel: 'passes over the 60 fruits', dots: false });
  ui.caption('The shaded map is the network’s opinion. It settles into “sweet, but not mushy”.', win(t, 27.4, 32.1, 0.3, 0.3), H - 92, { size: 22 });

  // 5. Inference
  ui.headline('Inference: freeze the dials, ask a new question.', win(t, 32.2, 38.2, 0.35, 0.3), 'One pass forward. Nothing inside changes, and no answer is needed.', win(t, 32.7, 38.2, 0.35, 0.3));
  {
    const [sx, sy] = mapXY(...STAR);
    ui.tag([sx, sy, 0.2], ['new fruit, never seen', 'sweetness 0.7 · softness 0.55'], win(t, 33.5, 37.8, 0.3, 0.3), { dx: -90, dy: -80, align: 'right', size: 15, accent: '#4f46e5' });
  }
  ui.tag([HID_X, Y_H[0] + 0.9, 0], 'dials frozen (read only)', win(t, 32.6, 37.6, 0.3, 0.3), { dy: -30, size: 15, accent: '#6b7088' });

  // 6. Scale
  ui.headline('From 13 dials to 175 billion.', win(t, 38.3, 44.2, 0.35, 0.3), 'Same parts, far more dials, and the task becomes “what comes next?”.', win(t, 38.8, 44.2, 0.35, 0.3));
  ui.panel(W_PANEL_X, 742, 'Same loop, different scale', [['Our fruit network', '13 dials', '60 fruits · good to eat?'], ['GPT-2 small (2019)', '124 million', '~40 GB of web text · next word'], ['GPT-3 (2020)', '175 billion', '~300 billion tokens · next word']],
    seg(t, 39.0, 42.0) * 3 + 0.01, win(t, 39.0, 44.2, 0.3, 0.3), Math.min(2, Math.floor(seg(t, 39.0, 42.0) * 3)));

  // 7. Architectures
  ui.headline('The shape of the network is a design choice.', win(t, 44.3, 50.5, 0.4, 0.01), 'Same parts everywhere: dials, weighted sums, squashes, gradient descent. Only the wiring changes.', win(t, 44.8, 50.5, 0.4, 0.01));
  [['MLP', 'tables · no order assumed'], ['CNN', 'images · nearby pixels matter'], ['RNN', 'speech · read in order'], ['Transformer', 'text · any word to any word']].forEach(([n, d], i) => {
    const x = [-4.8, -1.6, 1.6, 4.8][i], a = smooth(44.5 + 0.2 * i, 45.0 + 0.2 * i, t);
    ui.text([x, 0.7, 0.8], n, a, { size: 22, sans: true, weight: 700, dy: 30 });
    ui.text([x, 0.7, 0.8], d, a, { size: 15, color: '#5b6178', dy: 58 });
  });
}
const W_PANEL_X = 650;  // scale panel sits below the network

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
