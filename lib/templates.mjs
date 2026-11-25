// The starter apps. Each is one index.html in templates/<id>/ that runs on the kit's vendor folder.
import fs from 'node:fs';
import path from 'node:path';
import {KIT} from './name.mjs';

export const TEMPLATES = [
  {id: 'xr-room', title: 'XR Room', mode: 'VR first, AR keeps the furniture', what: 'A warm wooden room with a floating glass panel: day, dusk, night and soft music.', ko: '나무 방 하나랑 떠 있는 유리 패널. 낮, 노을, 밤으로 조명이 바뀌어요.'},
  {id: 'orrery', title: 'Orrery', mode: 'VR first, AR keeps the table', what: 'A brass orrery with six planets on a wooden table. Pinch a planet to hear it.', ko: '나무 테이블 위에 도는 행성 모형. 행성을 집으면 소리가 나요.'},
  {id: 'product-showroom', title: 'Product Showroom', mode: 'VR first, AR puts the pedestal in your room', what: 'Your product on a pedestal under a spotlight. Walk around it. Slot for your own GLB model or photo.', ko: '내 상품을 받침대 위에 올려 두고 걸어서 한 바퀴 돌아보는 쇼룸. 내 3D 모델이나 사진을 넣는 자리가 있어요.'},
  {id: 'ar-desk', title: 'AR Desk', mode: 'AR first (Quest 3/3S passthrough), VR and desktop get a virtual desk', what: 'Put a monitor, a plant, a clock and a mug on your real desk with a pinch.', ko: '진짜 내 책상 위에 모니터, 화분, 시계, 머그컵을 손가락으로 집어서 올려요.'},
  {id: 'gallery', title: 'Gallery', mode: 'VR first, teleport by pointing at the floor', what: 'A walk-through gallery hall. Put your own photos in, or keep the code-made art.', ko: '걸어서 둘러보는 갤러리. 내 사진을 걸거나, 코드로 그린 그림을 그대로 써요.'},
];

export const templateDir = (id) => path.join(KIT, 'templates', id);
export const findTemplate = (id) => TEMPLATES.find((t) => t.id === id || t.id.replace(/-/g, '') === String(id).toLowerCase().replace(/[-_ ]/g, ''));

function copyDir(src, dst) {
  fs.mkdirSync(dst, {recursive: true});
  for (const e of fs.readdirSync(src, {withFileTypes: true})) {
    if (e.name === '.DS_Store') continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

// a new project: the template page + its own copy of three.js and connect-xr (so the folder works anywhere, offline)
export function newProject(id, dest, {force = false} = {}) {
  const t = findTemplate(id);
  if (!t) throw new Error(`No template "${id}". Pick one: ${TEMPLATES.map((x) => x.id).join(', ')}`);
  const out = path.resolve(dest);
  if (fs.existsSync(out) && fs.readdirSync(out).filter((f) => f !== '.DS_Store').length && !force) throw new Error(`${out} is not empty. Pick a new name, or add --force to write into it.`);
  copyDir(templateDir(t.id), out);
  copyDir(path.join(KIT, 'vendor'), path.join(out, 'vendor'));
  fs.writeFileSync(path.join(out, 'xr.json'), JSON.stringify({template: t.id, kit: 'connect-ai-xr', made: new Date().toISOString().slice(0, 10)}, null, 2) + '\n');
  return {template: t, dir: out};
}

// the page `demo` shows at / : every template as a card, in our look
export function demoIndex({lan = []} = {}) {
  const cards = TEMPLATES.map((t) => `<a class="card" href="./${t.id}/"><span class="k">${t.mode}</span><b>${t.title}</b><span>${t.what}</span><i>Open →</i></a>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>CONNECT AI XR · demo</title>
<style>
:root{--gold:#D6892A;--hi:#F2B45A;--ivory:#EBE2D2;--bg:#0b0906}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ivory);font:400 16px/1.5 ui-sans-serif,-apple-system,"Helvetica Neue",Arial,sans-serif;padding:56px 7vw}
.top{letter-spacing:.32em;font-size:12px;text-transform:uppercase}.rule{width:56px;height:1px;background:var(--gold);margin:14px 0 26px}
h1{font:400 clamp(40px,6vw,76px)/1.05 "Didot","Bodoni 72","Cormorant Garamond",Georgia,serif;margin:0 0 14px}
p{color:rgba(235,226,210,.7);max-width:720px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin-top:40px}
.card{display:flex;flex-direction:column;gap:10px;padding:26px;border:1px solid rgba(214,137,42,.35);border-radius:18px;color:inherit;text-decoration:none;background:linear-gradient(160deg,rgba(214,137,42,.08),rgba(0,0,0,0));transition:border-color .2s,transform .2s;min-height:220px}
.card:hover,.card:focus{border-color:var(--hi);transform:translateY(-2px)}
.card b{font:400 34px/1.1 "Didot","Bodoni 72",Georgia,serif}.card .k{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--hi)}
.card span{color:rgba(235,226,210,.75)}.card i{margin-top:auto;font-style:normal;color:var(--gold);letter-spacing:.12em;font-size:13px;text-transform:uppercase}
code{color:var(--hi)}
</style></head><body>
<div class="top">CONNECT AI LAB · XR</div><div class="rule"></div>
<h1>Pick a world.</h1>
<p>On a Meta Quest: open this page in the Meta Quest Browser, pick a card, press <b>Enter VR</b> or <b>Enter AR</b>. On a computer or phone you get the same scene in 3D, with mouse or touch.</p>
${lan.length ? `<p>Headset address: <code>${lan[0]}</code></p>` : ''}
<div class="grid">${cards}</div>
</body></html>`;
}
