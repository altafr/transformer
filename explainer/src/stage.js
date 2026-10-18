import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp } from './util.js';
import { dissolveDepth } from './materials.js';

// The off-white clay studio shared by the explainer films: renderer, backdrop dome, dotted floor,
// lights and post-processing (restrained bloom, neutral tone mapping, vignette, grain).
export const W = 1920, H = 1080;

export function createStage(canvas, { center = [1.5, 0.5] } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
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

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.45, 1.45));
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
        c *= mix(0.88, 1.0, smoothstep(1.2, 0.3, length(q)));
        c += (rnd(floor(vUv * vec2(1920.0, 1080.0))) - 0.5) * 0.024;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
  composer.addPass(finish);

  const HORIZON = new THREE.Color(0xe9e5df);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color(0xf6f5f2) }, uHorizon: { value: HORIZON }, uWarm: { value: new THREE.Color(0xf1e6da) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uWarm; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir + vec3(1e-5));
        float h = clamp(d.y, -1.0, 1.0);
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.6, h));
        float glow = (1.0 - smoothstep(0.0, 0.45, abs(h))) * clamp(0.5 + 0.5 * d.x, 0.0, 1.0);
        gl_FragColor = vec4(mix(c, uWarm, 0.18 * glow), 1.0);
      }`,
  }));
  dome.position.set(center[0], 0, 0);
  dome.renderOrder = -10;
  scene.add(dome);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(119, 96), new THREE.ShaderMaterial({
    uniforms: { uBase: { value: HORIZON }, uDot: { value: new THREE.Color(0xb9b3ab) }, uCenter: { value: new THREE.Vector2(...center) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uDot; uniform vec2 uCenter; varying vec3 vW;
      void main(){
        vec2 f = fract(vW.xz / 0.5) - 0.5;
        float d = length(f);
        float aa = max(fwidth(d), 1e-4) * 1.2;
        float dotm = 1.0 - smoothstep(0.05 - aa, 0.05 + aa, d);
        float fade = (1.0 - smoothstep(4.0, 22.0, length(vW.xz - uCenter))) * (1.0 - smoothstep(0.08, 0.25, aa));
        gl_FragColor = vec4(mix(uBase, uDot, dotm * fade * 0.42), 1.0);
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
  key.target.position.set(center[0], 3, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -10, near: 1, far: 60 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xcfdcff, 0.55);
  fill.position.set(-10, 6, 7);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.75);
  rim.position.set(-3, 9, -12);
  scene.add(rim);

  // Helpers for building and posing objects
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function mesh(geo, mat, { cast = true, receive = true, parent = scene } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    if (mat.userData.u) m.customDepthMaterial = dissolveDepth(mat);
    parent.add(m);
    return m;
  }
  function inst(geo, mat, count, { cast = true } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < count; i++) m.setColorAt(i, white);
    if (mat.userData.u) m.customDepthMaterial = dissolveDepth(mat);
    scene.add(m);
    return m;
  }
  function setInst(m, i, x, y, z, sx, sy = sx, sz = sx, q = null) {
    tmpP.set(x, y, z); tmpS.set(Math.max(sx, 1e-4), Math.max(sy, 1e-4), Math.max(sz, 1e-4));
    m.setMatrixAt(i, tmpM.compose(tmpP, q ?? tmpQ.identity(), tmpS));
  }
  function tube(curve, radius, mat, segs = 64) {
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 10, false), mat);
    m.userData.curve = curve; m.userData.segs = segs; m.userData.radial = 10;
    scene.add(m);
    return m;
  }
  // Grow a tube along its curve by limiting the index range.
  function drawTube(m, p, alpha) {
    const n = Math.floor(clamp(p) * m.userData.segs) * m.userData.radial * 6;
    m.geometry.setDrawRange(0, n);
    m.visible = n > 0 && alpha > 0.002;
    m.material.opacity = alpha;
  }

  // Camera keyframes: [t, px, py, pz, lx, ly, lz] with eased moves and a gentle drift.
  function cameraAt(keys, t, ease) {
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i][0] && t <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    const k = b[0] === a[0] ? 1 : ease(clamp((t - a[0]) / (b[0] - a[0])));
    const v = a.map((x, i) => x + (b[i] - x) * k);
    camera.position.set(v[1] + 0.18 * Math.sin(t * 0.37), v[2] + 0.1 * Math.sin(t * 0.29 + 1.3), v[3] + 0.12 * Math.sin(t * 0.23 + 0.4));
    camera.lookAt(v[4], v[5], v[6]);
  }

  function render(t) {
    finish.uniforms.uSeed.value = (Math.floor(t * 60) % 97) * 1.37;
    composer.render();
  }

  return { renderer, scene, camera, mesh, inst, setInst, tube, drawTube, cameraAt, render };
}
