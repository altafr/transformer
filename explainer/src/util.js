// Pure timing helpers. Everything in the film is a function of a single time value `t`.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const eout = (x) => 1 - Math.pow(1 - x, 3);
export const ein = (x) => x * x * x;
export const back = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
export const smooth = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
// Visibility window: fades in over [a, a+fi], out over [b-fo, b].
export const win = (t, a, b, fi = 0.4, fo = 0.4) => smooth(a, a + fi, t) * (1 - smooth(b - fo, b, t));
export const pulse = (t, c, w) => Math.exp(-Math.pow((t - c) / w, 2));
export function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// Piecewise track: [[t, value], ...] eased between keys, held outside.
export function track(keys, t, fn = ease) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) {
      const k = t1 === t0 ? 1 : fn((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return keys[keys.length - 1][1];
}
