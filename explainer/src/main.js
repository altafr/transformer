import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, lerp, seg, ease, eout, back, smooth, win, pulse, hash, track } from './util.js';
import { clay, dissolveDepth, setDissolve, glowMat, PAL, PASTELS } from './materials.js';
import { Overlay, SANS } from './overlay.js';

const W = 1920, H = 1080;
export const DURATION = 45;

// ---------------------------------------------------------------- layout constants
const X = (i) => -2.8 + 1.4 * i;                  // sequence positions along x
const SLAB_Y = [2.2, 3.7, 5.2, 6.7];              // decoder block slabs (centres)
const TOP = SLAB_Y.map((y) => y + 0.14);          // slab top surfaces
const ON = TOP.map((y) => y + 0.01);              // vector base resting on a block
const NB = 6, PITCH = 0.18;                       // bars per vector
const COL_H = (NB - 1) * PITCH + 0.13;
const MLP_FLOOR = 4.3, MLPB = MLP_FLOOR + 0.06;   // MLP sub-layer floor inside the expanded block
const NORM_Y = 8.12, HEAD = 8.3;                  // final norm plate, vectors above it
const MAT_CX = 8.05, MAT_TOP = 10.0, ROW_DY = 0.36, MAT_X0 = 7.2, LOGIT_X0 = 9.55;
const matRowY = (r) => MAT_TOP - r * ROW_DY;
const VOCAB = [' mat', ' floor', ' sofa', '.', ' and', '…'];
const LOGIT1 = [2.9, 2.1, 1.4, -0.4, -1.1, 0.5], PROB1 = [0.55, 0.25, 0.12, 0.02, 0.01, 0.05];
const LOGIT2 = [-0.6, -1.2, -1.3, 3.0, 1.7, 1.5], PROB2 = [0.02, 0.01, 0.01, 0.64, 0.18, 0.14];
const logitLen = (l) => Math.max(0.12, 0.3 + (l + 1.5) * 0.42);
const probLen = (p) => 0.1 + p * 3.4;
const WORDS = ['The', 'cat', 'sat', 'on', 'the', 'mat', '.'];
const SPACED = [false, true, true, true, true, true, false];
const TILE_Z = 1.4, TILE_Y = 0.6;
const KX = (p) => -7.55 + p * 0.3;
const HEAD_COLORS = [PAL.indigo, PAL.coral, PAL.teal];
const ATT_W = [[0.10, 0.30, 0.08, 0.12, 0.40], [0.05, 0.15, 0.45, 0.10, 0.25], [0.35, 0.10, 0.10, 0.25, 0.20]];

// ---------------------------------------------------------------- renderer + post
const glCanvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 400);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.45, 1.45);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSeed; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = vUv - 0.5; q.x *= 1.7778;
      float v = smoothstep(1.2, 0.3, length(q));
      c *= mix(0.88, 1.0, v);
      c += (rnd(floor(vUv * vec2(1920.0, 1080.0))) - 0.5) * 0.024;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
});
composer.addPass(finish);

// ---------------------------------------------------------------- studio
const HORIZON = new THREE.Color(0xe9e5df), TOPC = new THREE.Color(0xf6f5f2);
const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uTop: { value: TOPC }, uHorizon: { value: HORIZON }, uWarm: { value: new THREE.Color(0xf1e6da) } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform vec3 uTop, uHorizon, uWarm; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir + vec3(1e-5));
      float h = clamp(d.y, -1.0, 1.0);
      vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.6, h));
      float glow = (1.0 - smoothstep(0.0, 0.45, abs(h))) * clamp(0.5 + 0.5 * d.x, 0.0, 1.0);
      c = mix(c, uWarm, 0.18 * glow);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
dome.position.set(1.5, 0, 0);
dome.renderOrder = -10;
scene.add(dome);

const floor = new THREE.Mesh(new THREE.CircleGeometry(119, 96), new THREE.ShaderMaterial({
  uniforms: { uBase: { value: HORIZON }, uDot: { value: new THREE.Color(0xb9b3ab) } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */ `
    uniform vec3 uBase, uDot; varying vec3 vW;
    void main(){
      vec2 f = fract(vW.xz / 0.5) - 0.5;
      float d = length(f);
      float aa = max(fwidth(d), 1e-4) * 1.2;
      float dotm = 1.0 - smoothstep(0.05 - aa, 0.05 + aa, d);
      float dist = length(vW.xz - vec2(1.5, 0.5));
      float fade = 1.0 - smoothstep(4.0, 22.0, dist);
      // dots far away shrink below a pixel; fade them with their own derivative too
      fade *= 1.0 - smoothstep(0.08, 0.25, aa);
      vec3 c = mix(uBase, uDot, dotm * fade * 0.42);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShadowMaterial({ color: 0x3b3328, opacity: 0.17, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.position.y = 0.002;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);

scene.add(new THREE.HemisphereLight(0xffffff, 0xe6ddd1, 0.95));
const key = new THREE.DirectionalLight(0xfff2e4, 1.75);
key.position.set(7, 15, 10);
key.target.position.set(1.5, 3, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -10, near: 1, far: 60 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xcfdcff, 0.55);
fill.position.set(-10, 6, 7);
scene.add(fill);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.75);
rimLight.position.set(-3, 9, -12);
scene.add(rimLight);

// ---------------------------------------------------------------- helpers
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  if (mat.userData.u) m.customDepthMaterial = dissolveDepth(mat);
  scene.add(m);
  return m;
}
function inst(geo, mat, count, { cast = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.castShadow = cast; m.receiveShadow = true;
  m.frustumCulled = false;
  for (let i = 0; i < count; i++) m.setColorAt(i, tmpC.set(0xffffff));
  if (mat.userData.u) m.customDepthMaterial = dissolveDepth(mat);
  scene.add(m);
  return m;
}
function setInst(m, i, x, y, z, sx, sy = sx, sz = sx, q = null) {
  tmpP.set(x, y, z); tmpS.set(Math.max(sx, 1e-4), Math.max(sy, 1e-4), Math.max(sz, 1e-4));
  tmpM.compose(tmpP, q ?? tmpQ.identity(), tmpS);
  m.setMatrixAt(i, tmpM);
}
function bez(a, b, c, d) { return new THREE.CubicBezierCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c), new THREE.Vector3(...d)); }
function tube(curve, radius, mat, segs = 72) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 10, false), mat);
  m.userData.curve = curve; m.userData.segs = segs; m.userData.radial = 10;
  m.castShadow = false; m.receiveShadow = false;
  scene.add(m);
  return m;
}
// Grow a tube along its curve by limiting the index range.
function drawTube(m, p, alpha) {
  const n = Math.floor(clamp(p) * m.userData.segs) * m.userData.radial * 6;
  m.geometry.setDrawRange(0, n);
  m.visible = n > 0 && alpha > 0.002;
  if (m.material.opacity !== undefined) m.material.opacity = alpha;
}
const col = (hex) => new THREE.Color(hex);
const mix = (a, b, k) => tmpC.copy(col(a)).lerp(col(b), clamp(k));

// ---------------------------------------------------------------- geometry
const G = {
  tile: new RoundedBoxGeometry(1.18, 0.62, 0.24, 4, 0.1),
  bar: new RoundedBoxGeometry(0.5, 0.13, 0.5, 2, 0.045),
  cube: new RoundedBoxGeometry(0.26, 0.26, 0.26, 2, 0.06),
  slab: new RoundedBoxGeometry(10.4, 0.28, 2.1, 4, 0.12),
  ring: new THREE.TorusGeometry(0.4, 0.035, 12, 56),
  halo: new THREE.TorusGeometry(0.47, 0.03, 12, 64),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  bar1: new RoundedBoxGeometry(1, 0.22, 0.22, 2, 0.06),
  chip: new RoundedBoxGeometry(0.24, 0.2, 0.24, 2, 0.05),
};

// ---------------------------------------------------------------- word textures
function wordTexture(word, spaced) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.font = `600 132px ${SANS}`; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
  if (word === '.') x.font = `700 200px ${SANS}`;
  const w = x.measureText(word).width, sp = spaced ? 52 : 0;
  const x0 = 256 - (w + sp) / 2, base = 176;
  if (spaced) { // visible-space glyph, drawn rather than relying on font coverage
    x.globalAlpha = 0.42; x.lineWidth = 9; x.strokeStyle = '#fff'; x.lineCap = 'round';
    x.beginPath(); x.moveTo(x0 + 4, base - 26); x.lineTo(x0 + 4, base - 4); x.lineTo(x0 + 36, base - 4); x.lineTo(x0 + 36, base - 26); x.stroke();
    x.globalAlpha = 1;
  }
  x.fillText(word, x0 + sp, base);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, w: w / 465 };
}

// ---------------------------------------------------------------- objects (built after fonts load)
const O = {};
let cardWordX = [];

function build() {
  // Card
  const plain = WORDS.map((w) => wordTexture(w, false));
  const space = 0.15;
  const total = plain.slice(0, 5).reduce((s, p) => s + p.w, 0) + space * 4;
  let cx = -total / 2;
  cardWordX = plain.slice(0, 5).map((p) => { const c = cx + p.w / 2; cx += p.w + space; return c; });
  O.card = mesh(new RoundedBoxGeometry(total + 1.0, 1.15, 0.3, 4, 0.14), clay(0xf4efe8, { noiseScale: 1.6 }));

  // Token tiles: rounded body + two text decals (plain for the card, visible-space for tiles)
  O.tiles = WORDS.map((w, i) => {
    const g = new THREE.Group(); scene.add(g);
    const bodyMat = clay(PAL.clay, { noiseScale: 3.5 });
    const body = new THREE.Mesh(G.tile, bodyMat); body.castShadow = body.receiveShadow = true;
    body.customDepthMaterial = dissolveDepth(bodyMat);
    g.add(body);
    const mk = (tex) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: PAL.ink }));
      m.position.z = 0.126; g.add(m); return m;
    };
    const dPlain = mk(plain[i].tex), dSpaced = mk(wordTexture(w, SPACED[i]).tex);
    return { g, body, dPlain, dSpaced };
  });

  // Embedding vectors (6 positions max x 6 bars)
  O.bars = inst(G.bar, clay(0xffffff, { rim: 0.12 }), 6 * NB);
  O.rings = Array.from({ length: 7 }, () => { const m = mesh(G.ring, clay(PAL.mint, { rim: 0.1 })); m.rotation.x = Math.PI / 2; return m; });
  O.halo = mesh(G.halo, glowMat(PAL.indigo, 1.4), { cast: false }); O.halo.rotation.x = Math.PI / 2;
  O.posChips = inst(G.sphere, new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.mint).multiplyScalar(1.1) }), 5, { cast: false });

  // Decoder stack
  O.slabs = SLAB_Y.map((y) => { const m = mesh(G.slab, clay(PAL.slab, { noiseScale: 1.2, rim: 0.12 })); m.position.set(1.4, y, 0); return m; });
  // Every block carries both sub-layers: an attention inlay and an MLP inlay on its front face
  O.inlays = O.slabs.map((slab) => [[PAL.sky, 3.65], [PAL.butter, 4.55]].map(([c, x]) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.13, 0.06, 2, 0.03), clay(c, { noiseScale: 4 }));
    m.position.set(x, 0, 1.06); slab.add(m); return m;
  }));
  O.norm = mesh(new RoundedBoxGeometry(10.4, 0.13, 2.1, 2, 0.06), clay(0xc6ead8, { noiseScale: 1.2 }));
  O.norm.position.set(1.4, NORM_Y, 0);

  // Expanded block internals
  O.panel = mesh(new RoundedBoxGeometry(10.8, 4.05, 0.14, 4, 0.12), clay(0xf6f3ef, { noiseScale: 1.2 }));
  O.panel.position.set(1.4, 4.15, -1.25);
  O.bandA = mesh(new RoundedBoxGeometry(10.4, 1.78, 0.05, 2, 0.02), clay(0xdcebf8, { noiseScale: 1.4 }), { cast: false });
  O.bandA.position.set(1.4, 3.32, -1.15);
  O.bandM = mesh(new RoundedBoxGeometry(10.4, 1.6, 0.05, 2, 0.02), clay(0xfaf0cf, { noiseScale: 1.4 }), { cast: false });
  O.bandM.position.set(1.4, 5.27, -1.15);
  O.mlpFloor = mesh(new RoundedBoxGeometry(10.4, 0.1, 2.0, 2, 0.04), clay(0xf3e7bd, { noiseScale: 1.4 }));
  O.mlpFloor.position.set(1.4, MLP_FLOOR, 0);
  O.normPills = [2.55, 4.55].map((y) => { const m = mesh(new RoundedBoxGeometry(0.72, 0.16, 0.36, 2, 0.07), clay(PAL.mint)); m.position.set(-3.45, y, 0.75); return m; });
  const resMat = () => glowMat(PAL.slate, 0.25);
  O.res = [
    tube(bez([3.12, 2.5, 0.3], [4.05, 2.5, 0.3], [4.05, 4.12, 0.3], [3.55, 4.12, 0.3]), 0.03, resMat()),
    tube(bez([3.12, 4.45, 0.3], [5.1, 4.45, 0.3], [5.1, 6.08, 0.3], [3.55, 6.08, 0.3]), 0.03, resMat()),
  ];
  O.plus = [[3.45, 4.12], [3.45, 6.08]].map(([x, y]) => { const m = mesh(new THREE.SphereGeometry(0.1, 20, 14), clay(0xdfe5f4)); m.position.set(x, y, 0.3); return m; });

  // Attention arcs: from the final position (4) back to itself and earlier positions, three heads
  const arcY = ON[0] + COL_H + 0.07;
  O.att = [];
  for (let h = 0; h < 3; h++) for (let j = 0; j < 5; j++) {
    const z = (h - 1) * 0.3, x4 = X(4), xj = X(j), d = Math.abs(x4 - xj), w = ATT_W[h][j];
    const lift = 0.06 * h;
    const c = j === 4
      ? bez([x4 - 0.1, arcY, z], [x4 - 0.55, arcY + 0.62 + lift, z], [x4 + 0.55, arcY + 0.62 + lift, z], [x4 + 0.1, arcY, z])
      : bez([x4 - 0.08, arcY, z], [x4 - 0.2 * d, arcY + 0.28 + 0.1 * d + lift, z], [xj + 0.2 * d, arcY + 0.28 + 0.1 * d + lift, z], [xj + 0.08, arcY, z]);
    const m = tube(c, 0.012 + 0.06 * w, glowMat(HEAD_COLORS[h], 0.3 + 1.2 * w));
    m.userData.h = h; m.userData.j = j; m.userData.w = w;
    O.att.push(m);
  }
  // Causal demo: position 2 attends to 0..2 only
  O.causal = [0, 1, 2].map((j) => {
    const x2 = X(2), xj = X(j), d = Math.abs(x2 - xj);
    const c = j === 2
      ? bez([x2 - 0.1, arcY, 0.45], [x2 - 0.5, arcY + 0.55, 0.45], [x2 + 0.5, arcY + 0.55, 0.45], [x2 + 0.1, arcY, 0.45])
      : bez([x2 - 0.08, arcY, 0.45], [x2 - 0.2 * d, arcY + 0.3 + 0.1 * d, 0.45], [xj + 0.2 * d, arcY + 0.3 + 0.1 * d, 0.45], [xj + 0.08, arcY, 0.45]);
    return tube(c, 0.03, glowMat(0xd4a017, 0.6));
  });
  O.flow = inst(G.sphere, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8b84ff).multiplyScalar(4) }), 30, { cast: false });
  O.flow.material.toneMapped = true;

  // Causal mask grid
  O.mask = inst(G.cube, clay(0xffffff, { rim: 0.1 }), 25);

  // MLP detail for the final position
  O.wide = inst(G.cube, clay(0xffffff), 16);
  const fan = (y0, y1, from, to) => {
    const pts = [];
    for (const a of from) for (const b of to) pts.push(a, y0, 1.0, b, y1, 1.0);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7c74ef, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(l); return l;
  };
  const inX = [...Array(NB)].map((_, j) => 2.8 + (j - 2.5) * 0.3);
  const wX = [...Array(16)].map((_, k) => 2.8 + (k - 7.5) * 0.21);
  O.fanUp = fan(4.78 + 0.13, 5.38 - 0.1, inX, wX);
  O.fanDown = fan(5.38 + 0.1, 5.98 - 0.13, wX, inX);
  O.wideX = wX;

  // Output: vocabulary projection matrix (fixed weights), logits/probability bars, sampling strip
  O.matPlate = mesh(new RoundedBoxGeometry(2.55, 2.5, 0.16, 4, 0.08), clay(0xf4f0ea, { noiseScale: 1.5 }));
  O.matPlate.position.set(MAT_CX, MAT_TOP - 0.9, -0.22);
  O.matrix = inst(G.cube, clay(0xffffff, { noiseScale: 2 }), 36);
  O.logits = inst(G.bar1, clay(0xffffff), 6);
  O.strip = inst(new RoundedBoxGeometry(1, 0.18, 0.3, 2, 0.06), clay(0xffffff), 4);
  O.marker = mesh(new THREE.ConeGeometry(0.11, 0.28, 24), glowMat(PAL.indigo, 0.9));
  O.marker.rotation.x = Math.PI;
  O.softmax = mesh(new RoundedBoxGeometry(1.25, 0.3, 0.3, 2, 0.12), clay(0xdedcfb));
  O.softmax.position.set(LOGIT_X0 + 0.9, MAT_TOP + 0.55, 0);

  // Ghost attention paths at the top of the stack (context the final position already absorbed)
  O.ghost = [0, 1, 2, 3].map((j) => {
    const y = HEAD + COL_H + 0.05, x4 = X(4), xj = X(j), d = x4 - xj;
    return tube(bez([x4 - 0.08, y, 0], [x4 - 0.2 * d, y + 0.3 + 0.1 * d, 0], [xj + 0.2 * d, y + 0.3 + 0.1 * d, 0], [xj + 0.08, y, 0]), 0.022, glowMat(PAL.indigo, 0.5));
  });

  // KV cache shelf (4 layers x 7 positions x {K,V})
  O.kvPlates = TOP.map((y) => { const m = mesh(new RoundedBoxGeometry(2.45, 0.8, 0.12, 2, 0.06), clay(0xf5f1eb, { noiseScale: 2 })); m.position.set(-6.6, y + 0.42, -0.2); return m; });
  O.kv = inst(G.chip, clay(0xffffff), 4 * 7 * 2);
  O.kvArcs = TOP.map((y) => tube(bez([X(5) - 0.3, y + 0.75, 0.25], [X(5) - 3.5, y + 1.55, 0.25], [-3.6, y + 1.35, 0.25], [-5.25, y + 0.5, 0.1]), 0.035, glowMat(PAL.indigo, 0.9)));

  // Generation loop arrow: appended token back into the decoder entrance
  O.loopCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(X(5), 0.98, TILE_Z + 0.05), new THREE.Vector3(X(5) + 0.35, 1.5, 1.95), new THREE.Vector3(X(5) + 2.4, 1.72, 2.5),
    new THREE.Vector3(X(5) + 4.0, 1.7, 1.3), new THREE.Vector3(X(5) + 3.2, 1.72, 0.05), new THREE.Vector3(X(5) + 0.9, 1.68, -0.1),
  ], false, 'catmullrom', 0.5);
  O.loop = tube(O.loopCurve, 0.07, new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC1: { value: new THREE.Color(0xcfcbfb) }, uC2: { value: new THREE.Color(PAL.indigo) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uT, uA; uniform vec3 uC1, uC2; varying vec2 vUv; varying vec3 vN;
      void main(){
        float s = fract(vUv.x * 16.0 - uT * 1.1);
        float dash = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.45, 0.6, s));
        vec3 c = mix(uC1, uC2 * 1.5, dash);
        float l = 0.72 + 0.28 * clamp(dot(normalize(vN + vec3(1e-5)), normalize(vec3(0.3, 0.9, 0.5))), 0.0, 1.0);
        gl_FragColor = vec4(c * l, uA);
      }`,
  }), 160);
  O.loopHead = mesh(new THREE.ConeGeometry(0.17, 0.42, 28), glowMat(PAL.indigo, 0.8));
}

// ---------------------------------------------------------------- per-frame state
const pal = (i, j, s) => PASTELS[Math.floor(hash(i * 31 + j * 7 + s * 113) * 4) % 4];
function barColor(i, j, stage, activeK, dimK) {
  const s0 = Math.floor(stage), f = stage - s0;
  const c = col(pal(i, j, s0)).lerp(col(pal(i, j, s0 + 1)), smooth(0, 1, f));
  c.lerp(col(PAL.indigo), 0.2 * activeK);
  c.lerp(col(0xe7e3de), 0.72 * dimK);
  return c;
}

function columnBase(i, t) {
  if (i === 5) return track([[35.6, 0.02], [36.1, ON[0]], [36.2, ON[0]], [36.7, ON[1]], [36.8, ON[1]], [37.3, ON[2]], [37.4, ON[2]], [37.9, ON[3]], [38.0, ON[3]], [38.4, HEAD]], t);
  const d = 0.06 * i, e = 0.03 * i;
  return track([[8.2 + d, 0.02], [9.4 + d, ON[0]], [18.0 + e, ON[0]], [18.8 + e, MLPB], [22.0, MLPB], [22.8, ON[0]],
    [22.9 + e, ON[0]], [23.5 + e, ON[1]], [23.6 + e, ON[1]], [24.2 + e, ON[2]], [24.3 + e, ON[2]], [24.9 + e, ON[3]], [25.2, ON[3]], [25.9, HEAD]], t);
}
function columnStage(i, t) {
  if (i === 5) return smooth(36.0, 36.3, t) + smooth(36.6, 36.9, t) + smooth(37.2, 37.5, t) + smooth(37.8, 38.1, t);
  const att = i === 4 ? smooth(15.9, 16.4, t) : smooth(16.3, 16.8, t);
  return att + smooth(21.1, 21.5, t) + smooth(23.1, 23.4, t) + smooth(23.8, 24.1, t) + smooth(24.5, 24.8, t);
}

function updateColumns(t) {
  const m = O.bars;
  for (let i = 0; i < 6; i++) {
    const base = columnBase(i, t), x = X(i), stage = columnStage(i, t);
    const appearT = i === 5 ? 35.2 : 5.25 + 0.12 * i;
    const activeK = i === 4 ? smooth(5.2, 5.6, t) * (1 - smooth(26.2, 26.6, t)) : i === 5 ? 1 : 0;
    const dimK = i < 4 ? smooth(25.9, 26.6, t) : 0;
    const vanish = i < 4 ? 1 - ease(seg(t, 33.0 + 0.1 * i, 33.6 + 0.1 * i))
      : i === 4 ? 1 - ease(seg(t, 28.6, 29.0)) : 1 - ease(seg(t, 39.45, 39.7));
    // Row layouts the final vector morphs into (MLP detail and the vocabulary comparison)
    let row = null, mk = 0, rowVis = 1;
    if (i === 4 && t > 18.8 && t < 22.8) {
      const second = t >= 21.2;
      row = { cx: 2.8, cy: second ? 5.98 : 4.78, cz: 1.0, pitch: 0.3, size: 0.24 };
      mk = second ? 1 - ease(seg(t, 22.0, 22.8)) : ease(seg(t, 18.85, 19.35));
      rowVis = second ? back(seg(t, 21.2, 21.55)) : 1 - ease(seg(t, 20.85, 21.1));
    }
    if (i === 4 && t > 26.2) {
      const f = clamp((t - 27.0) / 1.5) * 5;
      row = { cx: MAT_CX, cy: MAT_TOP - f * ROW_DY, cz: 0.48, pitch: 0.34, size: 0.24 };
      mk = ease(seg(t, 26.2, 27.0));
    }
    if (i === 5 && t > 38.4) {
      const f = clamp((t - 38.95) / 0.5) * 5;
      row = { cx: MAT_CX, cy: MAT_TOP - f * ROW_DY, cz: 0.48, pitch: 0.34, size: 0.24 };
      mk = ease(seg(t, 38.45, 38.95));
    }
    const mlpPulse = i < 4 ? 1 + 0.08 * pulse(t, 19.9 + 0.3 * i, 0.22) : 1;
    for (let j = 0; j < NB; j++) {
      const k = i * NB + j;
      const pop = back(seg(t, appearT + 0.05 * j, appearT + 0.05 * j + 0.38)) * vanish;
      let px = x, py = base + 0.065 + j * PITCH, pz = 0, sx = 1, sy = 1, sz = 1;
      if (row) {
        const rx = row.cx + (j - 2.5) * row.pitch, s = row.size;
        px = lerp(px, rx, mk); py = lerp(py, row.cy, mk); pz = lerp(pz, row.cz, mk);
        sx = lerp(1, s / 0.5, mk); sy = lerp(1, s / 0.13, mk); sz = sx;
        const v = lerp(1, rowVis, mk > 0.5 ? 1 : mk * 2);
        sx *= v; sy *= v; sz *= v;
      }
      const s = pop * mlpPulse;
      setInst(m, k, px, py, pz, sx * s, sy * s, sz * s);
      m.setColorAt(k, barColor(i, j, stage, activeK, dimK));
    }
  }
  m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
}

function update(t) {
  // ---- card + tiles (scene 1, reappearing in scene 6)
  const cardIn = 1 - ease(seg(t, 0.0, 0.9)), cardOut = ease(seg(t, 2.7, 3.4));
  O.card.position.set(0, 1.55 + 0.05 * Math.sin(t * 1.7), 0.9);
  O.card.rotation.set(0.02 * Math.sin(t * 1.3), 0, 0);
  setDissolve(O.card, Math.max(cardIn, cardOut));

  O.tiles.forEach((T, i) => {
    const row = [X(i), TILE_Y, TILE_Z];
    let p = row, bodyS = 1, dis = 0, plainA = 0, spacedA = 1, rotY = 0;
    if (i < 5) {
      const cardP = [cardWordX[i], O.card.position.y, 0.94];
      const k = ease(seg(t, 2.7 + 0.06 * i, 3.6 + 0.06 * i));
      p = [lerp(cardP[0], row[0], k), lerp(cardP[1], row[1], k) + 0.45 * Math.sin(Math.PI * k), lerp(cardP[2], row[2], k)];
      bodyS = back(seg(t, 2.75 + 0.06 * i, 3.4 + 0.06 * i));
      plainA = smooth(0.3, 0.9, t) * (1 - smooth(0.3, 0.6, k));
      spacedA = smooth(0.4, 0.8, k);
      rotY = 0.25 * Math.sin(Math.PI * k) * (i - 2) * 0.3;
      const gone = ease(seg(t, 5.2 + 0.1 * i, 6.0 + 0.1 * i)), back2 = 1 - ease(seg(t, 33.0 + 0.08 * i, 33.8 + 0.08 * i));
      dis = t < 20 ? gone : back2;
      if (t < 2.7) p = cardP;
    } else if (i === 5) { // " mat" flies from the output bars down into the sequence
      const k = ease(seg(t, 33.0, 34.4));
      const from = [LOGIT_X0 + 0.5, matRowY(0), 0.4];
      p = [lerp(from[0], row[0], k), lerp(from[1], row[1], k) + 1.6 * Math.sin(Math.PI * k), lerp(from[2], row[2], k)];
      bodyS = lerp(0.5, 1, k) * back(seg(t, 32.9, 33.3));
      dis = t < 32.9 ? 1 : 0;
    } else {
      const k = ease(seg(t, 40.3, 41.1));
      const from = [LOGIT_X0 + 0.5, matRowY(3), 0.4];
      p = [lerp(from[0], row[0], k), lerp(from[1], row[1], k) + 1.4 * Math.sin(Math.PI * k), lerp(from[2], row[2], k)];
      bodyS = lerp(0.5, 1, k) * back(seg(t, 40.2, 40.6));
      dis = t < 40.2 ? 1 : 0;
    }
    T.g.position.set(...p); T.g.rotation.y = rotY;
    T.body.scale.setScalar(Math.max(bodyS, 1e-4));
    setDissolve(T.body, dis);
    T.body.visible = T.body.visible && bodyS > 0.01;
    const act = i === 4 ? smooth(3.7, 4.1, t) * (t < 20 ? 1 : 0)
      : i === 5 ? smooth(33.0, 33.4, t) * (1 - smooth(40.4, 40.8, t)) : i === 6 ? smooth(40.3, 40.7, t) : 0;
    T.body.material.color.copy(mix(PAL.clay, PAL.indigo, act));
    const textC = mix(PAL.ink, 0xffffff, act).clone();
    const vis = 1 - dis;
    T.dPlain.material.opacity = plainA; T.dPlain.material.color.copy(textC); T.dPlain.visible = plainA > 0.01;
    T.dSpaced.material.opacity = spacedA * vis * clamp(bodyS); T.dSpaced.material.color.copy(textC); T.dSpaced.visible = T.dSpaced.material.opacity > 0.01;
  });

  // ---- vectors, position rings, halo
  updateColumns(t);
  O.rings.forEach((r, i) => {
    const tIn = i < 5 ? 6.3 + 0.1 * i : i === 5 ? 35.2 : 40.9;
    const s = back(seg(t, tIn, tIn + 0.4));
    r.scale.setScalar(Math.max(s, 1e-4)); r.visible = s > 0.01;
    r.position.set(X(i), 0.04, 0);
    r.material.userData.u.uGlow.value = 0.25 * pulse(t, tIn + 0.6, 0.3);
  });
  for (let i = 0; i < 5; i++) { // position information joining each vector
    const k = seg(t, 6.6 + 0.08 * i, 7.4 + 0.08 * i);
    const s = k > 0 && k < 1 ? 0.07 * Math.sin(Math.PI * k) + 0.02 : 0;
    setInst(O.posChips, i, X(i), lerp(0.08, 0.55, ease(k)), lerp(0.45, 0.2, k), s);
  }
  O.posChips.instanceMatrix.needsUpdate = true;
  {
    const isMat = t > 34.8;
    const i = isMat ? 5 : 4;
    const a = isMat ? smooth(35.4, 35.8, t) * (1 - smooth(38.3, 38.6, t)) : smooth(5.6, 6.0, t) * (1 - smooth(26.0, 26.4, t)) * (1 - smooth(18.8, 19.1, t) + smooth(22.4, 22.8, t));
    O.halo.position.set(X(i), columnBase(i, t) + 0.02, 0);
    O.halo.visible = a > 0.01; O.halo.scale.setScalar(Math.max(a, 1e-3));
    O.halo.material.emissiveIntensity = 1.2 + 1.5 * pulse(t, 16.1, 0.3);
  }

  // ---- decoder stack
  const pIn = (d) => 1 - ease(seg(t, 11.0 + d, 11.8 + d));
  const pOut = (d) => ease(seg(t, 21.9 + d, 22.5 + d));
  const pd = (d) => Math.max(pIn(d), pOut(d));
  O.slabs.forEach((s, k) => {
    const inn = 1 - ease(seg(t, 8.0 + 0.15 * k, 8.8 + 0.15 * k));
    let off = 0, out = 0;
    if (k > 0) { // blocks 2-4 lift away while block 1 is expanded, then return
      off = 2.6 * (ease(seg(t, 10.9 + 0.08 * k, 11.7 + 0.08 * k)) - ease(seg(t, 22.0 + 0.08 * k, 22.8 + 0.08 * k)));
      out = Math.max(seg(t, 10.9 + 0.08 * k, 11.5 + 0.08 * k) - seg(t, 22.1 + 0.08 * k, 22.7 + 0.08 * k), 0);
    }
    s.position.y = SLAB_Y[k] + off;
    setDissolve(s, Math.max(inn, out));
    O.inlays[k].forEach((m) => setDissolve(m, Math.max(inn, out, 1 - pd(0))));
    const passT = [9.0, 23.2, 23.9, 24.6][k];
    const matPass = [36.0, 36.6, 37.2, 37.8][k];
    s.material.userData.u.uGlow.value = 0.35 * pulse(t, passT, 0.22) + 0.35 * pulse(t, matPass, 0.18);
  });
  setDissolve(O.norm, 1 - ease(seg(t, 24.9, 25.5)));
  O.norm.material.userData.u.uGlow.value = 0.3 * pulse(t, 25.6, 0.2) + 0.3 * pulse(t, 38.3, 0.15);

  // ---- expanded block internals
  setDissolve(O.panel, pd(0)); setDissolve(O.bandA, pd(0.1)); setDissolve(O.bandM, pd(0.15)); setDissolve(O.mlpFloor, pd(0.2));
  O.normPills.forEach((m, k) => setDissolve(m, pd(0.25 + 0.05 * k)));
  O.plus.forEach((m, k) => setDissolve(m, pd(0.3 + 0.05 * k)));
  const resA = win(t, 11.5, 22.3, 0.4, 0.4);
  O.res.forEach((m, k) => drawTube(m, ease(seg(t, 11.5 + 0.2 * k, 12.3 + 0.2 * k)), resA * 0.9));

  // ---- attention
  const demo = win(t, 13.4, 14.9, 0.3, 0.3);
  O.att.forEach((m) => {
    const { h, w } = m.userData;
    const grow = ease(seg(t, 11.9 + 0.25 * h, 12.9 + 0.25 * h));
    const a = win(t, 11.9, 18.0, 0.2, 0.5) * (0.35 + 0.65 * w / 0.45) * (1 - 0.8 * demo);
    drawTube(m, grow, a);
    m.material.emissiveIntensity = (0.3 + 1.3 * w) * (1 + 0.6 * pulse(t, 16.0, 0.4));
  });
  O.causal.forEach((m, j) => drawTube(m, ease(seg(t, 13.5 + 0.1 * j, 14.0 + 0.1 * j)), demo));
  {
    let n = 0;
    const fa = win(t, 14.9, 17.6, 0.3, 0.4);
    O.att.forEach((m) => {
      const { h, j, w } = m.userData;
      for (let q = 0; q < 2; q++) {
        const u = ((t - 14.9) * 0.55 + q * 0.5 + hash(h * 5 + j)) % 1;
        const p = m.userData.curve.getPoint(1 - u);
        const s = fa > 0 ? (0.03 + 0.07 * Math.sqrt(w)) * fa * Math.sin(Math.PI * u) : 0;
        setInst(O.flow, n++, p.x, p.y, p.z, s);
      }
    });
    O.flow.instanceMatrix.needsUpdate = true;
  }
  // mask grid
  {
    const a = ease(seg(t, 13.0, 13.6)) * (1 - ease(seg(t, 17.5, 18.0)));
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const k = r * 5 + c, ok = c <= r;
      const s = a * back(seg(t, 13.0 + 0.03 * k, 13.4 + 0.03 * k));
      setInst(O.mask, k, -6.55 + c * 0.32, 4.25 - r * 0.32, ok ? 0.2 : 0.05, s * 1.1, s * 1.1, s * (ok ? 1.1 : 0.4));
      const rowSel = demo > 0.5 ? 2 : 4;
      O.mask.setColorAt(k, ok ? (r === rowSel ? (rowSel === 2 ? col(0xf2cf63) : col(0x8f89f0)) : col(PAL.mint)) : col(0xdcd7d0));
    }
    O.mask.instanceMatrix.needsUpdate = true; O.mask.instanceColor.needsUpdate = true;
  }

  // ---- MLP detail
  {
    const appear = (k) => back(seg(t, 19.45 + 0.03 * k, 19.85 + 0.03 * k));
    const act = ease(seg(t, 20.25, 20.75));
    const gone = 1 - ease(seg(t, 21.9, 22.3));
    for (let k = 0; k < 16; k++) {
      const on = hash(k * 3.7 + 1) > 0.45;
      const s = appear(k) * gone * (on ? 1 + 0.15 * act : 1 - 0.45 * act) * 0.65;
      setInst(O.wide, k, O.wideX[k], 5.38, 1.0, s);
      O.wide.setColorAt(k, on ? mix(PAL.sky, 0xf5c84a, act).clone() : mix(PAL.sky, 0xd8d4ce, act).clone());
    }
    O.wide.material.userData.u.uGlow.value = 0.0;
    O.wide.instanceMatrix.needsUpdate = true; O.wide.instanceColor.needsUpdate = true;
    O.fanUp.material.opacity = 0.55 * smooth(19.4, 19.9, t) * (1 - 0.6 * smooth(20.4, 21.0, t)) * gone;
    O.fanUp.visible = O.fanUp.material.opacity > 0.005;
    O.fanDown.material.opacity = 0.55 * smooth(20.85, 21.3, t) * (1 - 0.5 * smooth(21.6, 21.9, t)) * gone;
    O.fanDown.visible = O.fanDown.material.opacity > 0.005;
  }

  // ---- output head
  setDissolve(O.matPlate, 1 - ease(seg(t, 25.6, 26.3)));
  {
    const a = ease(seg(t, 25.7, 26.5));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const k = r * 6 + c;
      const s = a * back(seg(t, 25.7 + 0.015 * k, 26.1 + 0.015 * k));
      setInst(O.matrix, k, MAT_X0 + c * 0.34, matRowY(r), 0, s * 0.92);
      const hl = clamp(1 - Math.abs(((t - 27.0) / 1.5) * 5 - r) * 1.2) * win(t, 27.0, 28.6, 0.1, 0.2)
        + clamp(1 - Math.abs(((t - 38.95) / 0.5) * 5 - r) * 1.2) * win(t, 38.95, 39.5, 0.05, 0.1);
      O.matrix.setColorAt(k, mix(mix(0xf3eee8, PASTELS[(r + c) % 4], 0.35).getHex(), 0xb7b2f6, hl).clone());
    }
    O.matrix.instanceMatrix.needsUpdate = true; O.matrix.instanceColor.needsUpdate = true;
  }
  {
    const smx1 = ease(seg(t, 28.9, 29.7)), redo = ease(seg(t, 38.95, 39.45)), smx2 = ease(seg(t, 39.5, 39.9));
    for (let r = 0; r < 6; r++) {
      const grow = eout(seg(t, 27.0 + r * 0.3, 27.35 + r * 0.3));
      let L = lerp(logitLen(LOGIT1[r]) * grow, probLen(PROB1[r]), smx1);
      L = lerp(L, logitLen(LOGIT2[r]), redo);
      L = lerp(L, probLen(PROB2[r]), smx2);
      setInst(O.logits, r, LOGIT_X0 + L / 2, matRowY(r), 0, L, grow > 0.001 ? 1 : 0, grow > 0.001 ? 1 : 0);
      const sel1 = r === 0 ? smooth(31.7, 32.1, t) * (1 - smooth(38.9, 39.2, t)) : 0;
      const sel2 = r === 3 ? smooth(40.1, 40.4, t) : 0;
      const base = mix(0xc4cbe0, [PAL.peach, PAL.sky, PAL.butter, PAL.mint, PAL.peach, PAL.mint][r], Math.max(smx1 * (1 - redo), smx2)).getHex();
      O.logits.setColorAt(r, mix(base, PAL.indigo, Math.max(sel1, sel2)).clone());
    }
    O.logits.instanceMatrix.needsUpdate = true; O.logits.instanceColor.needsUpdate = true;
    setDissolve(O.softmax, 1 - win(t, 28.7, 30.2, 0.3, 0.4) - win(t, 39.4, 40.0, 0.15, 0.2));
    O.softmax.material.userData.u.uGlow.value = 0.25 * pulse(t, 29.3, 0.3);
  }
  {
    const pass2 = t > 35;
    const segs = pass2 ? [[0.64, 0x9a94f2], [0.18, PAL.peach], [0.18, PAL.mint]] : [[0.55, PAL.peach], [0.25, PAL.sky], [0.12, PAL.butter], [0.08, PAL.mint]];
    const a = pass2 ? win(t, 39.7, 41.2, 0.25, 0.4) : win(t, 30.1, 33.0, 0.3, 0.4);
    const len = 3.0, y = matRowY(5) - 0.62;
    let x0 = LOGIT_X0;
    for (let k = 0; k < 4; k++) {
      const sgm = segs[k];
      if (!sgm) { setInst(O.strip, k, 0, -5, 0, 0); continue; }
      const L = sgm[0] * len;
      setInst(O.strip, k, x0 + L / 2, y, 0, Math.max(L - 0.04, 0.01) * a, a, a);
      O.strip.setColorAt(k, col(sgm[1]));
      x0 += L;
    }
    O.strip.instanceMatrix.needsUpdate = true; O.strip.instanceColor.needsUpdate = true;
    const t0 = pass2 ? 39.75 : 30.4, target = pass2 ? 0.4 : 0.31, damp = pass2 ? 4.5 : 2.4, wob = pass2 ? 11 : 7;
    const u = clamp(target + (0.92 - target) * Math.exp(-Math.max(t - t0, 0) * damp) * Math.cos(Math.max(t - t0, 0) * wob), 0.02, 0.98);
    O.marker.position.set(LOGIT_X0 + u * len, y + 0.32, 0);
    O.marker.visible = a > 0.02; O.marker.scale.setScalar(Math.max(a, 1e-3));
  }
  O.ghost.forEach((m, j) => drawTube(m, ease(seg(t, 25.9, 26.5)), win(t, 25.9, 28.4, 0.4, 0.6) * (0.25 + 0.25 * ATT_W[0][j] / 0.4)));

  // ---- KV cache
  {
    const plateA = (k) => 1 - ease(seg(t, 33.2 + 0.08 * k, 33.9 + 0.08 * k));
    O.kvPlates.forEach((m, k) => setDissolve(m, plateA(k)));
    const reuse = [36.1, 36.7, 37.3, 37.9];
    for (let k = 0; k < 4; k++) for (let p = 0; p < 7; p++) for (let s = 0; s < 2; s++) {
      const n = (k * 7 + p) * 2 + s;
      const tIn = p < 5 ? 33.5 + 0.05 * (k * 5 + p) : p === 5 ? reuse[k] + 0.25 : 99;
      const sc = back(seg(t, tIn, tIn + 0.35));
      const glow = p < 5 ? pulse(t, reuse[k] + 0.1, 0.18) : 0;
      setInst(O.kv, n, KX(p), TOP[k] + (s ? 0.25 : 0.58), 0, sc * (1 + 0.12 * glow));
      O.kv.setColorAt(n, mix(s ? PAL.sky : PAL.peach, 0x9a94f2, glow).clone());
    }
    O.kv.instanceMatrix.needsUpdate = true; O.kv.instanceColor.needsUpdate = true;
    O.kvArcs.forEach((m, k) => drawTube(m, ease(seg(t, reuse[k] - 0.1, reuse[k] + 0.25)), win(t, reuse[k] - 0.1, reuse[k] + 0.75, 0.05, 0.3)));
  }

  // ---- generation loop
  {
    const g = ease(seg(t, 34.4, 35.4));
    O.loop.material.uniforms.uT.value = t;
    O.loop.material.uniforms.uA.value = 0.95;
    drawTube(O.loop, g, g > 0 ? 0.95 : 0);
    O.loop.material.uniforms.uA.value = 0.95;
    const end = O.loopCurve.getPoint(1), tan = O.loopCurve.getTangent(1);
    const hs = back(seg(t, 35.2, 35.55));
    O.loopHead.position.copy(end).addScaledVector(tan, 0.12);
    O.loopHead.quaternion.setFromUnitVectors(UP, tan);
    O.loopHead.scale.setScalar(Math.max(hs, 1e-3)); O.loopHead.visible = hs > 0.01;
    O.loopHead.material.emissiveIntensity = 0.7 + 0.8 * pulse(t, 35.6, 0.3);
  }
}

// ---------------------------------------------------------------- camera
// [t, px, py, pz, lx, ly, lz, fov]
const CAM = [
  [0.0, 0.0, 2.1, 8.4, 0.0, 1.55, 0.6, 40],
  [2.4, 0.1, 2.0, 8.9, 0.0, 1.4, 0.6, 40],
  [3.7, 0.2, 2.5, 10.6, 0.0, 0.95, 0.8, 40],
  [5.0, 0.3, 2.6, 10.8, 0.0, 0.9, 0.6, 40],
  [7.3, 0.5, 2.5, 9.2, 0.2, 0.75, 0.2, 40],
  [9.6, 0.8, 5.6, 16.5, 0.7, 3.4, 0.0, 40],
  [10.9, 1.0, 6.4, 17.8, 1.1, 4.3, 0.0, 40],
  [12.0, 0.6, 4.5, 11.2, 0.6, 3.75, 0.0, 40],
  [13.2, -1.0, 4.5, 12.6, -0.8, 3.65, 0.0, 40],
  [15.0, -0.8, 4.4, 12.3, -0.5, 3.6, 0.0, 40],
  [17.8, -0.4, 4.5, 12.0, -0.2, 3.65, 0.0, 40],
  [19.0, 2.5, 5.7, 7.6, 2.7, 5.25, 0.6, 40],
  [21.8, 2.3, 5.6, 7.3, 2.6, 5.3, 0.6, 40],
  [23.0, 1.2, 6.0, 15.0, 1.2, 4.4, 0.0, 40],
  [25.0, 1.4, 7.6, 17.0, 1.6, 6.0, 0.0, 40],
  [26.3, 3.0, 9.2, 15.0, 3.6, 8.2, 0.0, 40],
  [27.6, 7.0, 9.9, 10.6, 8.4, 9.05, 0.0, 40],
  [30.0, 8.2, 9.6, 10.2, 9.1, 8.9, 0.0, 40],
  [32.6, 8.4, 9.6, 10.0, 9.2, 8.9, 0.0, 40],
  [34.4, 2.3, 7.0, 27.0, 2.3, 5.9, 0.0, 40],
  [35.6, -0.9, 4.9, 17.5, -0.9, 4.3, 0.0, 40],
  [38.0, -0.6, 5.1, 17.8, -0.6, 4.5, 0.0, 40],
  [39.2, 2.3, 7.4, 27.0, 2.3, 6.2, 0.0, 40],
  [41.2, 2.3, 8.0, 24.8, 2.3, 6.75, 0.0, 40],
  [45.0, 2.3, 8.2, 26.8, 2.3, 6.6, 0.0, 40],
];
function updateCamera(t) {
  let a = CAM[0], b = CAM[CAM.length - 1];
  for (let i = 0; i < CAM.length - 1; i++) if (t >= CAM[i][0] && t <= CAM[i + 1][0]) { a = CAM[i]; b = CAM[i + 1]; break; }
  const k = ease(seg(t, a[0], b[0]));
  const v = a.map((x, i) => lerp(x, b[i], k));
  const drift = [0.18 * Math.sin(t * 0.37), 0.1 * Math.sin(t * 0.29 + 1.3), 0.12 * Math.sin(t * 0.23 + 0.4)];
  camera.position.set(v[1] + drift[0], v[2] + drift[1], v[3] + drift[2]);
  camera.fov = v[7]; camera.updateProjectionMatrix();
  camera.lookAt(v[4], v[5], v[6]);
}

// ---------------------------------------------------------------- overlay
const ui = new Overlay(document.getElementById('ui'), camera);
const CHAPTERS = [[0, 'The prompt becomes tokens'], [5, 'Vectors + position'], [10, 'Causal self-attention'], [18, 'MLP + repeated blocks'],
  [25, 'Scoring the vocabulary'], [33, 'Append and repeat'], [41, 'One token at a time']];

function drawOverlay(t) {
  ui.clear();
  const ch = CHAPTERS.findLastIndex((c) => t >= c[0]);
  const chEnd = ch < 6 ? CHAPTERS[ch + 1][0] : DURATION;
  ui.chapter(ch + 1, CHAPTERS[ch][1], smooth(0.6, 1.2, t), seg(t, CHAPTERS[ch][0], chEnd));

  // Scene 1
  ui.title('How a Decoder Transformer Predicts the Next Token', win(t, 0.15, 2.55, 0.5, 0.35), 'A 45-SECOND EXPLAINER');
  ui.headline('Start with the tokens you already have.', win(t, 2.55, 5.1, 0.35, 0.3));
  ui.caption('Tokens can be words, word pieces, or punctuation.', win(t, 3.6, 5.2, 0.35, 0.3));
  ui.tag([X(4), TILE_Y + 0.32, TILE_Z], 'final position', win(t, 4.0, 5.3, 0.3, 0.3), { dy: -62, accent: '#4f46e5', color: '#4f46e5' });
  ui.tag([X(0) - 0.6, TILE_Y, TILE_Z], ['one tile per word', '(simplified example)'], win(t, 4.0, 5.3, 0.3, 0.3), { dx: -40, dy: 0, align: 'right', size: 17 });

  // Scene 2
  ui.headline('Represent each token as numbers, with its position.', win(t, 5.25, 10.1, 0.35, 0.3));
  for (let i = 0; i < 5; i++) {
    const base = columnBase(i, t);
    const a = smooth(5.7 + 0.1 * i, 6.1 + 0.1 * i, t) * (1 - smooth(25.6, 26.0, t)) * (t > 18.6 && t < 22.6 && i === 4 ? 0.0 : 1);
    ui.text([X(i), base - 0.02, 0.5], (SPACED[i] ? '␣' : '') + WORDS[i], a, { dy: 16, size: 20, color: i === 4 ? '#4f46e5' : '#1d2133' });
    ui.text([X(i), 0.02, 0.62], `pos ${i}`, smooth(6.5 + 0.1 * i, 6.9, t) * (1 - smooth(9.4, 9.8, t)), { dy: 58, size: 16, color: '#3f8f6c', halo: true });
  }
  ui.tag([X(0) - 0.35, 0.6, 0], ['Token embeddings', '+ position information'], win(t, 6.8, 9.6, 0.35, 0.35), { dx: -70, dy: -10, align: 'right', accent: '#3fb68a' });
  ui.tag([X(4) + 0.4, 0.5, 0], ['how position is represented', 'varies by architecture'], win(t, 7.2, 9.6, 0.35, 0.35), { dx: 80, dy: 0, align: 'left', size: 16, color: '#5b6178' });
  ui.tag([6.6, SLAB_Y[3], 1.0], 'Decoder stack', win(t, 8.9, 11.0, 0.3, 0.3), { dx: 40, dy: 0, align: 'left', accent: '#4f46e5' });

  // Scene 3
  ui.headline('Attention mixes information from the available context.', win(t, 10.25, 18.1, 0.35, 0.3), 'Each position can use only itself and earlier tokens.', win(t, 13.3, 18.1, 0.35, 0.3));
  for (let k = 0; k < 4; k++) ui.text([6.65, SLAB_Y[k], 1.05], `block ${k + 1} · attn + MLP`, win(t, 9.6 + 0.1 * k, 11.1, 0.3, 0.3) + win(t, 22.9 + 0.1 * k, 25.6, 0.3, 0.3), { align: 'left', dx: 12, size: 17, color: '#5b6178' });
  ui.tag([6.6, SLAB_Y[3] + 0.1, 1.0], '× N blocks (4 shown)', win(t, 9.9, 11.0, 0.3, 0.3), { dx: 40, dy: -50, align: 'left', size: 17 });
  ui.text([-3.7, 4.0, -1.1], 'Causal self-attention', win(t, 11.7, 18.3, 0.4, 0.4), { align: 'left', sans: true, size: 22, weight: 700, color: '#2c5f8a' });
  ui.text([-3.7, 5.9, -1.1], 'MLP', win(t, 11.8, 22.2, 0.4, 0.4), { align: 'left', sans: true, size: 22, weight: 700, color: '#8a6a12' });
  ui.text([-3.45, 2.55, 0.95], 'Norm', win(t, 11.9, 17.8, 0.4, 0.3), { dx: -46, align: 'right', size: 15, color: '#3f8f6c' });
  ui.text([-3.45, 4.55, 0.95], 'Norm', win(t, 11.95, 22.0, 0.4, 0.3), { dx: -46, align: 'right', size: 15, color: '#3f8f6c' });
  ui.text([3.85, 3.3, 0.3], '+ residual', win(t, 12.0, 17.6, 0.4, 0.3), { align: 'left', dx: 14, size: 15, color: '#5f6f99' });
  ui.text([5.15, 4.85, 0.3], '+ residual', win(t, 18.6, 21.9, 0.3, 0.3), { align: 'left', dx: 14, size: 15, color: '#5f6f99' });
  ui.caption('Expanded block is illustrative — exact layouts vary between models.', win(t, 11.7, 13.3, 0.3, 0.3), H - 92, { size: 22 });
  ui.tag([X(1), ON[0] + COL_H + 0.75, -0.3], 'attention heads · thicker = stronger', win(t, 12.4, 13.4, 0.3, 0.25) + win(t, 14.9, 15.8, 0.25, 0.3), { dy: -60, size: 17 });
  ui.tag([-5.9, 4.42, 0.2], 'Causal mask', win(t, 13.3, 17.7, 0.3, 0.4), { dy: -48, accent: '#4f46e5' });
  ui.text([-5.9, 2.75, 0.2], 'rows: position · cols: can see', win(t, 13.5, 17.7, 0.3, 0.4), { size: 14, color: '#5b6178' });
  ui.text([X(3), ON[0] + COL_H + 0.3, 0.4], '✕', demo3(t), { size: 30, color: '#c2410c', sans: true });
  ui.text([X(4), ON[0] + COL_H + 0.3, 0.4], '✕', demo3(t), { size: 30, color: '#c2410c', sans: true });
  ui.tag([X(3) + 0.7, ON[0] + COL_H + 0.3, 0.4], ['"sat" cannot see', 'future positions'], demo3(t), { dx: 70, dy: -44, align: 'left', size: 16, accent: '#c2410c' });
  ui.tag([X(4) + 0.3, ON[0] + 0.5, 0.3], 'updated vector', win(t, 16.2, 17.9, 0.3, 0.3), { dx: 100, dy: 40, align: 'left', accent: '#4f46e5', color: '#4f46e5' });

  // Scene 4
  ui.headline('The MLP transforms each position on its own.', win(t, 18.2, 22.4, 0.35, 0.3));
  ui.headline('Repeated blocks build richer representations.', win(t, 22.5, 25.2, 0.35, 0.3));
  ui.tag([1.95, 4.78, 1.0], 'expand', win(t, 19.4, 22.0, 0.3, 0.3), { dx: -14, dy: 0, align: 'right', size: 16, leader: false });
  ui.tag([4.55, 5.38, 1.0], 'nonlinear', win(t, 20.2, 22.0, 0.3, 0.3), { dx: 14, dy: 0, align: 'left', size: 16, leader: false, color: '#8a6a12' });
  ui.tag([1.95, 5.98, 1.0], 'project back', win(t, 21.1, 22.0, 0.3, 0.3), { dx: -14, dy: 0, align: 'right', size: 16, leader: false });
  ui.caption('Expand → nonlinear transform → project back', win(t, 19.4, 22.3, 0.3, 0.3), H - 160, { mono: true, size: 24, color: '#1d2133', weight: 600 });
  ui.caption('Attention mixes across positions · the MLP transforms each position separately', win(t, 19.6, 22.3, 0.3, 0.3), H - 92, { size: 22 });
  ui.tag([X(4) + 1.75, 5.5, 1.0], ['Refine features useful for', 'predicting what comes next'], win(t, 21.3, 22.4, 0.25, 0.3), { dx: 60, dy: -30, align: 'left', sans: true, size: 19 });
  ui.tag([X(1), MLPB + COL_H, 0], 'same MLP, applied at every position', win(t, 19.8, 21.6, 0.3, 0.3), { dy: -48, size: 16 });
  ui.caption('Each block updates every position’s representation.', win(t, 23.0, 25.1, 0.3, 0.3), H - 92, { size: 22 });

  // Scene 5
  ui.headline('Use the final position to score possible next tokens.', win(t, 25.3, 33.1, 0.35, 0.3));
  ui.tag([-3.4, NORM_Y + 0.07, 1.0], 'Final norm', win(t, 25.2, 26.6, 0.3, 0.3), { dy: -44, size: 17 });
  {
    const b = columnBase(4, t);
    ui.tag([X(4) + 0.3, b + COL_H * 0.5, 0], ["Final position's", 'hidden state'], win(t, 25.9, 26.9, 0.3, 0.3), { dx: 70, dy: -50, align: 'left', accent: '#4f46e5', color: '#4f46e5' });
  }
  ui.tag([MAT_CX, MAT_TOP + 0.3, 0], ['Learned output weights —', 'vocabulary projection'], win(t, 26.2, 33.1, 0.35, 0.3), { dy: -62, sans: true, size: 19, weight: 600 });
  for (let r = 0; r < 6; r++) ui.text([MAT_X0 - 0.25, matRowY(r), 0], `"${VOCAB[r]}"`, win(t, 26.4, 33.4, 0.4, 0.3) + win(t, 38.3, 45, 0.3, 0.01), { align: 'right', size: 17, color: '#3d4357' });
  ui.text([MAT_X0 - 0.25, matRowY(5) - 0.4, 0], 'one weight vector per token', win(t, 26.6, 28.8, 0.3, 0.3), { align: 'right', size: 14, color: '#7b8199' });
  ui.tag([LOGIT_X0 + 1.6, matRowY(0) + 0.1, 0], 'logits (scores)', win(t, 27.3, 29.0, 0.3, 0.25), { dx: 60, dy: -40, align: 'left' });
  ui.tag([LOGIT_X0 + 0.9, MAT_TOP + 0.6, 0], 'softmax', win(t, 28.8, 30.1, 0.25, 0.3), { dy: -36, accent: '#4f46e5' });
  const sel1 = smooth(31.7, 32.1, t);
  ui.candidates(1470, 250, [[' mat', 0.55, '#f7c2a4'], [' floor', 0.25, '#a9d3f3'], [' sofa', 0.12, '#f6e19c'], ['…', 0.08, '#b3e5cc']], win(t, 29.5, 33.1, 0.35, 0.35), { selected: 0, selA: sel1 });
  ui.caption('A token is selected using a decoding rule, such as sampling.', win(t, 30.5, 33.1, 0.35, 0.3), H - 92, { size: 23 });
  ui.text([LOGIT_X0 + 1.5, matRowY(5) - 0.98, 0], 'sampling', win(t, 30.2, 32.9, 0.3, 0.3) + win(t, 39.8, 41.0, 0.2, 0.3), { size: 16, color: '#4f46e5' });

  // Scene 6
  ui.headline('Append the token. Predict again.', win(t, 33.3, 41.1, 0.35, 0.3));
  ui.tag([X(5), TILE_Y + 0.32, TILE_Z], 'appended → new final position', win(t, 34.4, 36.4, 0.3, 0.3), { dy: -60, accent: '#4f46e5', color: '#4f46e5' });
  ui.tag([-6.6, TOP[3] + 0.9, 0], 'KV cache', win(t, 33.8, 40.6, 0.35, 0.35), { dy: -40, accent: '#4f46e5', weight: 600 });
  ui.text([-7.95, TOP[3] + 0.58, 0], 'K', win(t, 34.0, 40.6, 0.3, 0.3), { size: 15, color: '#b06a45' });
  ui.text([-7.95, TOP[3] + 0.25, 0], 'V', win(t, 34.0, 40.6, 0.3, 0.3), { size: 15, color: '#3c7fb3' });
  ui.caption('Stored keys and values from earlier positions are reused instead of recomputing the whole prefix.', win(t, 36.0, 39.4, 0.3, 0.3), H - 92, { size: 21 });
  ui.text([MAT_CX, matRowY(5) - 0.45, 0], 'weights fixed · inference only', win(t, 34.0, 38.0, 0.3, 0.3), { size: 14, color: '#7b8199' });
  ui.candidates(1530, 500, [['.', 0.64, '#9a94f2'], [' and', 0.18, '#f7c2a4'], ['…', 0.18, '#b3e5cc']], win(t, 39.5, 41.3, 0.25, 0.3), { selected: 0, selA: smooth(40.1, 40.4, t), title: 'Next step' });
  ui.cycle(['Context', 'decoder', 'next-token probabilities', 'select', 'append', 'repeat'], win(t, 37.4, 45.5, 0.4, 0.01), cycleK(t), 236);

  // Scene 7
  ui.headline('One token at a time. Each new token becomes context.', win(t, 41.3, 45.5, 0.45, 0.01), 'Repeat until an end token, a stopping rule, or a generation limit.', win(t, 41.8, 45.5, 0.45, 0.01));
}
function demo3(t) { return win(t, 13.6, 14.9, 0.25, 0.3); }
function cycleK(t) {
  // Step chips follow the action on screen: decoder pass, scoring, select, append, then rest on "repeat".
  return track([[37.4, 1], [38.4, 1], [38.9, 2], [39.9, 2], [40.2, 3], [40.6, 3], [40.9, 4], [41.6, 4], [42.4, 5], [43.6, 5], [44.4, 0], [45, 0]], t);
}

// ---------------------------------------------------------------- entry points
export function renderAt(t) {
  t = clamp(t, 0, DURATION);
  update(t);
  updateCamera(t);
  finish.uniforms.uSeed.value = (Math.floor(t * 60) % 97) * 1.37;
  composer.render();
  drawOverlay(t);
}

async function init() {
  const faces = ['500', '600', '700'].flatMap((w) => [`${w} 40px InterW`, `${w} 40px Inter`]).concat(['500', '600'].flatMap((w) => [`${w} 20px MonoW`, `${w} 20px "JetBrains Mono"`]));
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
  build();
  renderAt(0); // compile shaders
  window.renderAt = renderAt;
  window.DURATION = DURATION;
  const q = new URLSearchParams(location.search);
  const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); document.getElementById('stage').style.transform = `scale(${s})`; };
  if (window.__externalPlayer) { window.__ready = true; dispatchEvent(new Event('explainer-ready')); return; }
  if (!q.has('capture')) { fit(); addEventListener('resize', fit); }
  if (q.has('t')) renderAt(parseFloat(q.get('t')));
  else if (!q.has('capture')) {
    const t0 = performance.now();
    const loop = () => { renderAt(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
    loop();
  }
  window.__ready = true;
}
init();
