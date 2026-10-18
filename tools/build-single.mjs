// Builds one self-contained HTML file: the site plus the three Three.js films bundled inline.
// Usage (from a folder where `npm i three@0.169.0 esbuild` has been run):
//   node /path/to/repo/tools/build-single.mjs /path/to/repo out.html
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(process.cwd() + '/');
const esbuild = require('esbuild');
const repo = path.resolve(process.argv[2] || '.');
const out = path.resolve(process.argv[3] || 'inside-the-decoder.html');
const films = [
  ['explainer/?embed', 'explainer/index.html', 'src/main.js'],
  ['explainer/basics.html?embed', 'explainer/basics.html', 'src/basics.js'],
  ['explainer/deep-learning-basics.html?embed', 'explainer/deep-learning-basics.html', 'src/dlbasics.js'],
];
const FILM_SRC = {};
for (const [key, page, entry] of films) {
  const dir = path.join(repo, path.dirname(page));
  const js = esbuild.buildSync({
    entryPoints: [path.join(dir, entry)], bundle: true, minify: true, format: 'iife', write: false,
    nodePaths: [path.join(process.cwd(), 'node_modules')], target: 'es2020',
  }).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  let h = fs.readFileSync(path.join(repo, page), 'utf8');
  h = h.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
       .replace(/<script type="module" src="[^"]+"><\/script>\s*/, '')
       .replace("new URLSearchParams(location.search).has('embed')", 'true')
       .replace('</body>', () => `<script>${js}</script>\n</body>`);
  FILM_SRC[key] = h;
}
let site = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const hook = "ff.src=ff.dataset.src";
if (!site.includes(hook)) throw new Error('film loader hook not found');
site = site.replace(hook, "ff.srcdoc=FILM_SRC[ff.dataset.src]")
  .replace(/ <a href="explainer\/[^"]*" target="_blank" rel="noopener">[^<]*<\/a>/g, '')
  .replace('<script>\n', () => `<script>\nconst FILM_SRC=${JSON.stringify(FILM_SRC).replace(/<\/script/gi, '<\\/script').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')};\n`);
fs.writeFileSync(out, site);
console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
