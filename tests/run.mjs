// node tests/run.mjs   (SKIP_BROWSER=1 to leave out the headless Chrome part)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `caixr-${n}-`));
const {TEMPLATES, newProject, templateDir, demoIndex} = await import('../lib/templates.mjs');
const {staticCheck, imageSize, BUDGET} = await import('../lib/check.mjs');
const serve = await import('../lib/serve.mjs');
const {installSkill, removeSkill, pinSkill} = await import('../lib/install.mjs');
const {findChrome} = await import('../lib/browser.mjs');
const cli = (...a) => spawnSync(process.execPath, [path.join(KIT, 'bin', 'cli.mjs'), ...a], {encoding: 'utf8', env: {...process.env, NO_COLOR: '1'}});
const get = (url) => new Promise((res, rej) => http.get(url, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({status: r.statusCode, body: b, type: r.headers['content-type']})); }).on('error', rej));

test('five templates, each one page on connect-xr with a CONFIG block and no internet files', () => {
  assert.equal(TEMPLATES.length, 5);
  for (const t of TEMPLATES) {
    const f = path.join(templateDir(t.id), 'index.html');
    assert.ok(fs.existsSync(f), t.id);
    const html = fs.readFileSync(f, 'utf8');
    assert.match(html, /createXRApp\(/, t.id);
    assert.match(html, /type="importmap"/, t.id);
    assert.match(html, /name="viewport"/, t.id);
    assert.match(html, /CONFIG/, `${t.id} has a CONFIG block`);
    const r = staticCheck(templateDir(t.id));
    assert.deepEqual(r.findings.filter((x) => x.level === 'fail'), [], t.id);
  }
});

test('vendor: three.js with its licence, and the helper', () => {
  for (const f of ['three/three.module.js', 'three/three.core.js', 'three/LICENSE', 'connect-xr.js', 'three/addons/controls/OrbitControls.js', 'three/addons/webxr/XRHandModelFactory.js', 'three/addons/loaders/GLTFLoader.js']) assert.ok(fs.existsSync(path.join(KIT, 'vendor', f)), f);
  assert.match(fs.readFileSync(path.join(KIT, 'vendor/three/LICENSE'), 'utf8'), /MIT License/);
  const helper = fs.readFileSync(path.join(KIT, 'vendor/connect-xr.js'), 'utf8');
  for (const w of ['immersive-ar', 'immersive-vr', 'hit-test', 'depth-sensing', 'hand-tracking', 'local-floor', 'isSessionSupported', 'OrbitControls', 'setFoveation']) assert.ok(helper.includes(w), w);
  assert.doesNotMatch(helper, /https?:\/\/(?!www\.w3\.org)[a-z0-9]/i, 'helper loads nothing from the internet');
});

test('check catches a page that cannot work on a headset', () => {
  const d = tmp('bad');
  fs.writeFileSync(path.join(d, 'index.html'), `<!doctype html><html><head>
<script type="importmap">{"imports":{"three":"./vendor/three/three.module.js"}}</script>
<script type="module">import * as THREE from 'https://cdn.example.com/three.module.js'; const a = new AudioContext();</script>
</head><body></body></html>`);
  const r = staticCheck(d);
  const msg = r.findings.map((f) => f.level + ' ' + f.message).join('\n');
  assert.match(msg, /fail .*loads from the internet: https:\/\/cdn\.example\.com/);
  assert.match(msg, /fail .*no way to enter XR/);
  assert.match(msg, /fail .*importmap "three" points to/);
  assert.match(msg, /warn .*no desktop \/ phone fallback/);
  assert.match(msg, /warn .*no viewport meta/);
  assert.match(msg, /warn .*AudioContext without a user gesture/);
  // --allow lets one trusted host through
  const r2 = staticCheck(d, {allow: ['example.com']});
  assert.ok(!r2.findings.some((f) => /loads from the internet/.test(f.message)));
});

test('check flags big textures', () => {
  const d = tmp('tex');
  fs.copyFileSync(path.join(templateDir('gallery'), 'index.html'), path.join(d, 'index.html'));
  fs.cpSync(path.join(KIT, 'vendor'), path.join(d, 'vendor'), {recursive: true});
  // a PNG header that says 5000 x 300
  const png = Buffer.alloc(64); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(0x0d0a1a0a, 4); png.write('IHDR', 12); png.writeUInt32BE(5000, 16); png.writeUInt32BE(300, 20);
  fs.writeFileSync(path.join(d, 'huge.png'), png);
  assert.deepEqual(imageSize(path.join(d, 'huge.png')), {w: 5000, h: 300});
  const r = staticCheck(d);
  assert.ok(r.findings.some((f) => f.level === 'fail' && /huge\.png is 5000x300/.test(f.message)));
  assert.ok(BUDGET.calls.warn <= 150);
});

test('new: a project folder that runs on its own copy of three.js', () => {
  const d = tmp('new');
  const r = newProject('orrery', path.join(d, 'my-orrery'));
  for (const f of ['index.html', 'xr.json', 'vendor/connect-xr.js', 'vendor/three/three.module.js', 'vendor/three/LICENSE']) assert.ok(fs.existsSync(path.join(r.dir, f)), f);
  assert.deepEqual(staticCheck(r.dir).findings.filter((x) => x.level === 'fail'), []);
  assert.throws(() => newProject('orrery', path.join(d, 'my-orrery')), /not empty/);
  assert.throws(() => newProject('spaceship', path.join(d, 'x')), /No template/);
  assert.equal(newProject('ProductShowroom', path.join(d, 'shop')).template.id, 'product-showroom');
});

test('serve: pages, the kit vendor fallback, 404 and no way out of the folder', async () => {
  const s = await serve.start(path.join(KIT, 'templates'), {port: 9610, https: false, host: '127.0.0.1', index: () => demoIndex({lan: ['https://10.0.0.2:8443/']})});
  try {
    const home = await get(s.local);
    assert.equal(home.status, 200); assert.match(home.body, /Pick a world/); assert.match(home.body, /10\.0\.0\.2/);
    for (const t of TEMPLATES) assert.match(home.body, new RegExp(`href="./${t.id}/"`));
    const page = await get(s.local + 'orrery/');
    assert.equal(page.status, 200); assert.match(page.type, /text\/html/);
    const three = await get(s.local + 'orrery/vendor/three/three.core.js');
    assert.equal(three.status, 200); assert.match(three.type, /javascript/);
    assert.equal((await get(s.local + 'nope.js')).status, 404);
    assert.notEqual((await get(s.local + '..%2F..%2Fpackage.json')).status, 200);
    assert.equal((await get(s.local + 'orrery')).status, 301);
  } finally { s.close(); }
});

test('serve: https certificate for this computer (openssl)', {skip: !serve.haveOpenssl() && 'no openssl'}, () => {
  const home = tmp('cert');
  const old = process.env.CONNECT_AI_HOME;
  process.env.CONNECT_AI_HOME = home;
  try {
    const c = serve.ensureCert(['10.1.2.3']);
    assert.ok(c && fs.existsSync(c.cert) && c.made);
    const text = spawnSync('openssl', ['x509', '-in', c.cert, '-noout', '-text'], {encoding: 'utf8'}).stdout;
    assert.match(text, /IP Address:10\.1\.2\.3/);
    assert.equal(serve.ensureCert(['10.1.2.3']).made, false, 'kept when the address is the same');
    assert.equal(serve.ensureCert(['10.9.9.9']).made, true, 'made again for a new address');
    assert.equal(fs.statSync(c.key).mode & 0o077, 0, 'key is private');
  } finally { if (old === undefined) delete process.env.CONNECT_AI_HOME; else process.env.CONNECT_AI_HOME = old; }
});

test('install-skill: copies the skill, pins this computer\'s kit path, removes only its own folder', () => {
  const home = tmp('home');
  const env = {CONNECT_AI_HOME: path.join(home, '.connect-ai')};
  const logs = [];
  const list = installSkill({agent: 'claude,codex,cursor,antigravity', home, env, log: (m) => logs.push(m)});
  assert.equal(list.filter((t) => t.done).length, 4);
  const skill = fs.readFileSync(path.join(home, '.claude/skills/connect-ai-xr/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: connect-ai-xr/);
  assert.match(skill, /On this computer the kit runs as: `node ".*\.connect-ai\/connect-ai-xr\/0\.1\.0\/bin\/cli\.mjs"`/);
  for (const f of ['references/recipes.md', 'references/quest.md', 'NOTICE.md', '.connect-ai-xr.json']) assert.ok(fs.existsSync(path.join(home, '.claude/skills/connect-ai-xr', f)), f);
  for (const d of ['.agents/skills', '.cursor/skills', '.gemini/config/skills']) assert.ok(fs.existsSync(path.join(home, d, 'connect-ai-xr/SKILL.md')), d);
  const rt = path.join(home, '.connect-ai/connect-ai-xr/0.1.0');
  for (const f of ['bin/cli.mjs', 'vendor/three/three.module.js', 'templates/orrery/index.html']) assert.ok(fs.existsSync(path.join(rt, f)), f);
  // someone else's folder with the same name is left alone
  const other = path.join(home, '.cursor/skills/connect-ai-xr');
  fs.rmSync(other, {recursive: true}); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'SKILL.md'), 'mine');
  removeSkill({agent: 'claude,cursor', home, env, log: () => {}});
  assert.ok(!fs.existsSync(path.join(home, '.claude/skills/connect-ai-xr')));
  assert.equal(fs.readFileSync(path.join(other, 'SKILL.md'), 'utf8'), 'mine');
  assert.match(pinSkill('<!-- connect-ai-xr:runtime -->x<!-- /connect-ai-xr:runtime -->', {bin: '/a b/cli.mjs', fallback: 'npx y'}), /node "\/a b\/cli\.mjs"/);
});

test('cli: help, version, templates', () => {
  const h = cli('help'); assert.equal(h.status, 0); assert.match(h.stdout, /install-skill/); assert.match(h.stdout, /check \[folder\]/);
  assert.equal(cli('--version').stdout.trim(), JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8')).version);
  const t = cli('templates'); assert.equal(t.status, 0); for (const x of TEMPLATES) assert.match(t.stdout, new RegExp(x.id));
  assert.equal(cli('nonsense').status, 1);
});

test('package: files list, Node 18, no runtime dependencies, MIT + Commons Clause', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, '>=18');
  assert.deepEqual(Object.keys(pkg.dependencies || {}), []);
  for (const f of ['bin/', 'lib/', 'skill/', 'templates/', 'vendor/', 'LICENSE', 'NOTICE.md']) assert.ok(pkg.files.includes(f), f);
  const lic = fs.readFileSync(path.join(KIT, 'LICENSE'), 'utf8');
  assert.match(lic, /MIT License/); assert.match(lic, /Commons Clause/); assert.match(lic, /Software: connect-ai-xr/);
});

test('headless Chrome: every template draws a frame with no console errors', {skip: (process.env.SKIP_BROWSER || !findChrome()) && 'no Chrome (or SKIP_BROWSER)', timeout: 240000}, async () => {
  const {browserCheck} = await import('../lib/check.mjs');
  const shots = tmp('shots');
  const pages = TEMPLATES.map((t) => ({rel: `${t.id}/index.html`, file: path.join(templateDir(t.id), 'index.html')}));
  const r = await browserCheck(path.join(KIT, 'templates'), pages, {shots});
  assert.deepEqual(r.findings.filter((f) => f.level === 'fail'), []);
  for (const x of r.results) {
    assert.ok(x.state?.ready, x.page);
    assert.ok(x.state.calls > 5 && x.state.calls < BUDGET.calls.warn, `${x.page}: ${x.state.calls} calls`);
    assert.ok(fs.statSync(x.screenshot).size > 20000, `${x.page}: screenshot has content`);
  }
});
