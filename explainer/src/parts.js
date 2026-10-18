import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clay, glowMat, PAL } from './materials.js';
import { SANS } from './overlay.js';

// Reusable clay props shared by the explainer films.

// White text on transparent, for decals tinted through the material colour.
export function labelTexture(text, { w = 768, h = 192, size = 92 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.font = `600 ${size}px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.fillText(text, w / 2, h * 0.54);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

let geos = null;
function dialGeos() {
  geos ??= {
    gauge: new THREE.TorusGeometry(0.25, 0.02, 8, 48, Math.PI * 1.5),
    knob: new THREE.CylinderGeometry(0.17, 0.19, 0.14, 36),
    pointer: new RoundedBoxGeometry(0.04, 0.13, 0.03, 1, 0.012),
    arrow: new THREE.ConeGeometry(0.06, 0.15, 16),
  };
  return geos;
}

// A clay dial facing the camera: a 270° gauge, a knob with a pointer, and a hint arrow for training.
// set(value, angle) turns it; the knob is peach for positive values and sky for negative ones.
export function makeDial(stage, pos, { scale = 1 } = {}) {
  const G = dialGeos();
  const g = new THREE.Group(); g.position.set(...pos); g.scale.setScalar(scale); stage.scene.add(g);
  const gauge = stage.mesh(G.gauge, glowMat(0xb9b4ad, 0.1), { cast: false, parent: g });
  gauge.rotation.z = -Math.PI / 4; gauge.material.transparent = true;
  const pivot = new THREE.Group(); g.add(pivot);
  const knob = stage.mesh(G.knob, clay(0xffffff, { rim: 0.15 }), { parent: pivot }); knob.rotation.x = Math.PI / 2;
  const ptr = stage.mesh(G.pointer, clay(PAL.ink), { cast: false, parent: pivot }); ptr.position.set(0, 0.09, 0.08);
  const arrow = stage.mesh(G.arrow, glowMat(PAL.coral, 0.9), { cast: false, parent: g }); arrow.position.set(0, 0.36, 0.05);
  const peach = new THREE.Color(PAL.peach), sky = new THREE.Color(PAL.sky);
  return {
    g, pivot, knob, gauge, arrow,
    set(value, angle) {
      pivot.rotation.z = -angle;
      const k = Math.min(1, Math.max(0, (value + 0.08) / 0.16));
      knob.material.color.copy(sky).lerp(peach, k * k * (3 - 2 * k));
    },
    // Show a turn hint pointing the way the dial is about to move (dir = ±1), sized by a (0..1).
    hint(a, dir) {
      arrow.visible = a > 0.02; arrow.scale.setScalar(Math.max(a, 1e-3));
      arrow.position.set(0.16 * -dir, 0.36, 0.05);
      arrow.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    },
  };
}
