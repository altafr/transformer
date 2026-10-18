import * as THREE from 'three';

export const PAL = {
  peach: 0xf7c2a4,
  sky: 0xa9d3f3,
  butter: 0xf6e19c,
  mint: 0xb3e5cc,
  indigo: 0x4f46e5,
  clay: 0xf2ede7,
  slab: 0xeceaf4,
  ink: 0x1d2133,
  slate: 0x8a98bd,
  coral: 0xf0957a,
  teal: 0x3fb6a6,
};
export const PASTELS = [PAL.peach, PAL.sky, PAL.butter, PAL.mint];

const NOISE = /* glsl */ `
varying vec3 vObjPos;
uniform float uDissolve;
uniform float uNoiseScale;
uniform vec3 uEdge;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float dissolveNoise(){
  float n = 0.55 * vnoise(vObjPos * uNoiseScale) + 0.3 * vnoise(vObjPos * uNoiseScale * 2.13) + 0.15 * vnoise(vObjPos * uNoiseScale * 4.37);
  return clamp((n - 0.18) / 0.64, 0.0, 1.0);
}
`;
// Threshold sits slightly outside [0,1] at the ends so 0 is fully solid and 1 fully gone.
const DISCARD = /* glsl */ `
  float dN = dissolveNoise();
  float dT = clamp(uDissolve, 0.0, 1.0) * 1.1 - 0.05;
  if (uDissolve > 0.0005 && dN < dT) discard;
`;

function patchVertex(s) {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
}

// Soft clay: physical material with sheen, a fresnel rim, a glow term and a noise dissolve with an indigo edge.
export function clay(color, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: o.roughness ?? 0.62, metalness: 0,
    sheen: o.sheen ?? 0.65, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xffffff),
    clearcoat: o.clearcoat ?? 0.06, clearcoatRoughness: 0.55,
    transparent: !!o.transparent, opacity: o.opacity ?? 1,
  });
  const u = {
    uDissolve: { value: 0 }, uNoiseScale: { value: o.noiseScale ?? 3.0 }, uEdge: { value: new THREE.Color(0x6d64ff).multiplyScalar(9) },
    uRim: { value: o.rim ?? 0.16 }, uRimColor: { value: new THREE.Color(0xdfe6ff) },
    uGlow: { value: 0 }, uGlowColor: { value: new THREE.Color(PAL.indigo) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    patchVertex(s);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}\nuniform float uRim; uniform vec3 uRimColor; uniform float uGlow; uniform vec3 uGlowColor;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DISCARD}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float edgeW = (uDissolve > 0.0005 && uDissolve < 0.9995) ? 1.0 - smoothstep(0.0, 0.06, dN - dT) : 0.0;
        totalEmissiveRadiance += uEdge * edgeW;
        vec3 vdir = normalize(vViewPosition + vec3(1e-6));
        float fres = pow(clamp(1.0 - abs(dot(normal, vdir)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uRimColor * fres * uRim + uGlowColor * max(uGlow, 0.0);`);
  };
  m.customProgramCacheKey = () => 'clay';
  return m;
}

// Depth material that honours the same dissolve so shadows disappear with the object.
export function dissolveDepth(mat) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uDissolve: mat.userData.u.uDissolve, uNoiseScale: mat.userData.u.uNoiseScale, uEdge: mat.userData.u.uEdge });
    patchVertex(s);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DISCARD}`);
  };
  d.customProgramCacheKey = () => 'claydepth';
  return d;
}

export function setDissolve(mesh, v) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) if (m.userData.u) m.userData.u.uDissolve.value = v;
  mesh.visible = v < 0.999;
}

// Glowing tube for information paths.
export function glowMat(color, emissive = 0.6) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.45, transparent: true, opacity: 1, depthWrite: true });
}
