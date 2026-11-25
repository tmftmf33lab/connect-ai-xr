// `connect-ai-xr check <dir>`: does this XR app open on a headset and on a normal computer?
// Static checks (fast, no browser) + one headless Chrome visit per page (console errors, first frame, screenshot).
import fs from 'node:fs';
import path from 'node:path';
import {KIT} from './name.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', '.xr-check']);
const isVendorThree = (rel) => /(^|\/)vendor\/three\//.test(rel.split(path.sep).join('/'));
const MB = 1024 * 1024;

// Limits for a standalone headset (Quest 2/3/3S). Numbers from Meta's guidance for web apps, rounded to be safe.
export const BUDGET = {
  calls: {warn: 150, fail: 400},          // draw calls per frame
  triangles: {warn: 500_000, fail: 1_500_000},
  file: {warn: 8 * MB, fail: 25 * MB},    // any single file
  total: {warn: 40 * MB, fail: 120 * MB}, // the whole app
  texture: {warn: 2048, fail: 4096},      // longest side of an image, pixels
};

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, base, out);
    else if (e.isFile()) out.push({file: f, rel: path.relative(base, f), size: fs.statSync(f).size});
  }
  return out;
}

// width/height of PNG, JPEG, WebP without any library
export function imageSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, b, 0, b.length, 0);
    if (b.readUInt32BE(0) === 0x89504e47) return {w: b.readUInt32BE(16), h: b.readUInt32BE(20)};
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const kind = b.toString('ascii', 12, 16);
      if (kind === 'VP8X') return {w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3)};
      if (kind === 'VP8 ') return {w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff};
      if (kind === 'VP8L') { const v = b.readUInt32LE(21); return {w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff)}; }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < n - 9) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return {w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5)};
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch {} finally { fs.closeSync(fd); }
  return null;
}

// Links that leave the computer. Namespaces (w3.org) and comments are not requests.
const URL_RE = /https?:\/\/[^\s'"`)<>]+/g;
function externalRefs(text) {
  const out = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
    for (const m of line.matchAll(URL_RE)) {
      const url = m[0];
      if (/^https?:\/\/www\.w3\.org\//.test(url)) continue;
      // only count it when it is loaded: src/href/import/fetch/load/url(), or a string handed to a loader
      const before = line.slice(Math.max(0, m.index - 60), m.index);
      const loads = /(src|href|import|from|fetch|load|loadAsync|url|Loader|setPath|":)\s*\(?\s*=?\s*["'`]?\s*$/i.test(before) || /["'`]$/.test(before.trim());
      if (loads) out.push({url, line: i + 1});
    }
  });
  return out;
}

export function staticCheck(target, {allow = []} = {}) {
  const findings = [];
  const add = (level, message, fix = '') => findings.push({level, message, fix});
  const stat = fs.statSync(target);
  const root = stat.isDirectory() ? target : path.dirname(target);
  const files = stat.isDirectory() ? walk(root) : [{file: target, rel: path.basename(target), size: stat.size}];
  const pages = files.filter((f) => /\.html?$/i.test(f.rel) && !isVendorThree(f.rel));
  if (!pages.length) { add('fail', `No .html page in ${root}`, 'An XR app is a web page: index.html'); return {root, pages: [], findings}; }

  // sizes
  const all = stat.isDirectory() ? files : walk(root);
  const total = all.reduce((a, f) => a + f.size, 0);
  for (const f of all) {
    if (f.size > BUDGET.file.fail) add('fail', `${f.rel} is ${(f.size / MB).toFixed(1)} MB, too big for a headset to load quickly`, 'Compress it (GLB: gltf-transform optimize; images: 2048 px WebP/JPEG)');
    else if (f.size > BUDGET.file.warn) add('warn', `${f.rel} is ${(f.size / MB).toFixed(1)} MB`, 'Smaller files open faster on Quest Wi-Fi');
    if (/\.(png|jpe?g|webp)$/i.test(f.rel) && !isVendorThree(f.rel)) {
      const s = imageSize(f.file);
      if (s && Math.max(s.w, s.h) > BUDGET.texture.fail) add('fail', `${f.rel} is ${s.w}x${s.h} px`, `Keep textures at ${BUDGET.texture.warn} px or less on Quest`);
      else if (s && Math.max(s.w, s.h) > BUDGET.texture.warn) add('warn', `${f.rel} is ${s.w}x${s.h} px`, `${BUDGET.texture.warn} px is plenty in a headset`);
    }
  }
  if (total > BUDGET.total.fail) add('fail', `The whole app is ${(total / MB).toFixed(0)} MB`, 'Under 40 MB opens fast on a headset');
  else if (total > BUDGET.total.warn) add('warn', `The whole app is ${(total / MB).toFixed(0)} MB`, 'Under 40 MB opens fast on a headset');

  // every page and our own scripts
  const scripts = all.filter((f) => /\.(m?js)$/i.test(f.rel) && !isVendorThree(f.rel));
  for (const f of [...pages, ...scripts]) {
    const text = fs.readFileSync(f.file, 'utf8');
    for (const r of externalRefs(text)) {
      let host = '';
      try { host = new URL(r.url).host; } catch {}
      if (allow.some((a) => host === a || host.endsWith('.' + a))) continue;
      add('fail', `${f.rel}:${r.line} loads from the internet: ${r.url}`, 'Copy the file into the app folder (a headset on your Wi-Fi may be offline, and outside files can change). Allow a host with --allow host');
    }
  }
  for (const p of pages) {
    const html = fs.readFileSync(p.file, 'utf8');
    const name = p.rel;
    const xrEntry = /createXRApp\s*\(|VRButton|ARButton|XRButton|requestSession\s*\(/.test(html);
    if (!xrEntry) add('fail', `${name}: no way to enter XR (no Enter VR / Enter AR button)`, 'Use createXRApp from connect-xr, or three.js VRButton / ARButton');
    const fallback = /createXRApp\s*\(/.test(html) || (/OrbitControls|PointerLockControls|isSessionSupported/.test(html));
    if (!fallback) add('warn', `${name}: no desktop / phone fallback found`, 'Without a headset the page should still show the scene (OrbitControls) so people can try it');
    if (/immersive-ar/.test(html) && !/immersive-vr/.test(html) && !/createXRApp/.test(html)) add('warn', `${name}: AR only`, 'Quest 2 has no passthrough AR: offer immersive-vr as well');
    if (!/<meta[^>]+name=["']viewport/i.test(html)) add('warn', `${name}: no viewport meta`, 'Phones show a tiny page without <meta name="viewport" ...>');
    if (/<(audio|video)[^>]*\bautoplay\b/i.test(html) && !/muted/i.test(html)) add('warn', `${name}: autoplay with sound`, 'Sound only starts after a click or pinch. Start it in a select / click handler');
    if (/new\s+(window\.)?AudioContext/.test(html) && !/(click|pointerdown|select|keydown|onAudio)/.test(html)) add('warn', `${name}: AudioContext without a user gesture`, 'Create or resume it in a click / select handler');
    if (/setReferenceSpaceType\(\s*['"]bounded-floor/.test(html)) add('warn', `${name}: bounded-floor as the main space`, 'Not every headset gives it; use local-floor');
    // importmap and local files must exist
    const im = html.match(/<script[^>]+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
    if (im) {
      try {
        const map = JSON.parse(im[1]).imports || {};
        for (const [k, v] of Object.entries(map)) {
          if (/^https?:/.test(v)) continue; // reported above
          const local = path.resolve(path.dirname(p.file), v);
          // the kit's own templates run on the kit's vendor folder (serve and demo hand it out)
          const inKit = p.file.startsWith(path.join(KIT, 'templates') + path.sep) && v.includes('vendor/');
          const there = (f) => (v.endsWith('/') ? fs.existsSync(f) && fs.statSync(f).isDirectory() : fs.existsSync(f));
          const ok = there(local) || (inKit && there(path.join(KIT, 'vendor', v.slice(v.indexOf('vendor/') + 7))));
          if (!ok) add('fail', `${name}: importmap "${k}" points to ${v}, which is not there`, 'Run `connect-ai-xr new` again, or copy the vendor folder next to the page');
        }
      } catch (e) { add('fail', `${name}: the importmap is not valid JSON (${e.message})`); }
    }
    for (const m of html.matchAll(/(?:src|href)=["'](\.{0,2}\/?[^"':#?]+\.(?:js|mjs|css|png|jpe?g|webp|glb|gltf|hdr|mp3|ogg|wav))["']/gi)) {
      const f = path.resolve(path.dirname(p.file), m[1]);
      if (!fs.existsSync(f)) add('warn', `${name}: ${m[1]} is not in the folder`);
    }
  }
  return {root, pages, findings, total};
}

export async function browserCheck(root, pages, {shots, log = () => {}, width = 1280, height = 720} = {}) {
  const {start} = await import('./serve.mjs');
  const {visit} = await import('./browser.mjs');
  const findings = [];
  const add = (level, message, fix = '') => findings.push({level, message, fix});
  const server = await start(root, {port: 9400, https: false, host: '127.0.0.1'});
  const results = [];
  try {
    for (const p of pages) {
      const url = server.local + p.rel.split(path.sep).map(encodeURIComponent).join('/');
      const shot = shots ? path.join(shots, p.rel.replace(/[\\/]/g, '_').replace(/\.html?$/i, '') + '.png') : null;
      log(`  opening ${p.rel} in headless Chrome...`);
      const r = await visit(url, {shot, width, height});
      const errors = r.errors.filter((e) => !/favicon\.ico/.test(e));
      for (const e of errors.slice(0, 8)) add('fail', `${p.rel}: console error: ${String(e).split('\n')[0].slice(0, 220)}`);
      if (!r.loaded) add('fail', `${p.rel}: the page did not finish loading`);
      const s = r.state;
      if (s) {
        if (!s.ready) add('fail', `${p.rel}: no frame was drawn`, 'Look at the console errors above');
        if (s.calls > BUDGET.calls.fail) add('fail', `${p.rel}: ${s.calls} draw calls per frame`, 'Merge meshes, use InstancedMesh, share materials (Quest: under 150)');
        else if (s.calls > BUDGET.calls.warn) add('warn', `${p.rel}: ${s.calls} draw calls per frame`, 'Quest stays smooth under about 150');
        if (s.triangles > BUDGET.triangles.fail) add('fail', `${p.rel}: ${s.triangles.toLocaleString()} triangles`, 'Simplify the models (Quest: under 500K)');
        else if (s.triangles > BUDGET.triangles.warn) add('warn', `${p.rel}: ${s.triangles.toLocaleString()} triangles`, 'Quest stays smooth under about 500K');
      } else add('look', `${p.rel}: does not use connect-xr, so draw calls and the first frame were not measured`);
      results.push({page: p.rel, errors, state: s, screenshot: r.screenshot});
    }
  } finally { server.close(); }
  return {findings, results};
}
