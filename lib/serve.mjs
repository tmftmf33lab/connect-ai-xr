// A tiny local web server for XR pages. HTTP for this computer (localhost counts as secure), HTTPS for the headset.
// The headset needs HTTPS: WebXR only starts on a secure page, and http://192.168.x.x is not one.
// The HTTPS certificate is self-made with openssl (stays on your computer, ~/.connect-ai/connect-ai-xr/cert).
// The Quest browser warns once ("not private"): Advanced -> Proceed to 192.168... (unsafe). That is expected for your own computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {spawnSync} from 'node:child_process';
import {KIT, KIT_NAME} from './name.mjs';

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8'};

export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) out.push({name, address: a.address});
  }
  // Wi-Fi / Ethernet first, VPN and bridges later
  const rank = (n) => (/^(en0|wlan|wi-?fi|eth0|en1)/i.test(n) ? 0 : /^(utun|tun|tap|bridge|vbox|vmnet|docker|zt)/i.test(n) ? 2 : 1);
  return out.sort((a, b) => rank(a.name) - rank(b.name));
}

export const certDir = (env = process.env) => path.join(env.CONNECT_AI_HOME || path.join(os.homedir(), '.connect-ai'), KIT_NAME, 'cert');

export function haveOpenssl() {
  const r = spawnSync('openssl', ['version'], {encoding: 'utf8'});
  return r.status === 0 ? r.stdout.trim() : '';
}

// a certificate that names this computer's addresses; made again when the address changes
export function ensureCert(ips) {
  const dir = certDir();
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem'), meta = path.join(dir, 'names.json');
  const names = ['localhost', '127.0.0.1', ...ips].sort();
  try {
    const old = JSON.parse(fs.readFileSync(meta, 'utf8'));
    if (fs.existsSync(key) && fs.existsSync(cert) && names.every((n) => old.names.includes(n)) && Date.now() < old.until) return {key, cert, made: false};
  } catch {}
  if (!haveOpenssl()) return null;
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  const san = names.map((n) => (/^\d+\.\d+\.\d+\.\d+$/.test(n) ? 'IP:' : 'DNS:') + n).join(',');
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '397', '-subj', '/CN=connect-ai-xr local', '-addext', `subjectAltName=${san}`, '-addext', 'extendedKeyUsage=serverAuth'], {encoding: 'utf8'});
  if (r.status !== 0 || !fs.existsSync(cert)) return null;
  fs.chmodSync(key, 0o600);
  fs.writeFileSync(meta, JSON.stringify({names, until: Date.now() + 390 * 864e5}, null, 2));
  return {key, cert, made: true};
}

// root: the folder to serve. Requests for .../vendor/... that are not in root come from the kit's own vendor folder,
// so the templates run straight from the kit and a project made by `new` runs on its own copy.
export function handler(root, {index = null, log = () => {}} = {}) {
  const base = path.resolve(root);
  const vendor = path.join(KIT, 'vendor');
  return (req, res) => {
    let u;
    try { u = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (u === '/' && index) { res.writeHead(200, {'content-type': TYPES['.html'], 'cache-control': 'no-store'}); res.end(index()); return; }
    let file = path.join(base, u);
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!u.endsWith('/')) { res.writeHead(301, {location: u + '/'}).end(); return; }
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      const i = u.indexOf('/vendor/');
      if (i >= 0) { const v = path.join(vendor, u.slice(i + 8)); if (v.startsWith(vendor) && fs.existsSync(v)) file = v; }
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, {'content-type': 'text/plain'}); res.end('not found'); log(`404 ${u}`); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      // lets the page ask for XR in an iframe-free way and keeps it on our own files
      'permissions-policy': 'xr-spatial-tracking=(self)',
    });
    fs.createReadStream(file).pipe(res);
  };
}

const listen = (server, port, host) => new Promise((res, rej) => {
  server.once('error', rej);
  server.listen(port, host, () => res(server.address().port));
});

// start(root, {port}) -> {httpPort, httpsPort, urls, close()}
export async function start(root, {port = 8080, httpsPort = null, host = '0.0.0.0', index = null, https: wantHttps = true, log = () => {}} = {}) {
  const h = handler(root, {index, log});
  const s1 = http.createServer(h);
  let p1;
  for (let i = 0; i < 20; i++) { try { p1 = await listen(s1, port + i, host); break; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; } }
  if (!p1) throw new Error(`No free port from ${port}`);
  const ips = lanAddresses().map((a) => a.address);
  let s2 = null, p2 = null, cert = null;
  if (wantHttps) {
    cert = ensureCert(ips);
    if (cert) {
      s2 = https.createServer({key: fs.readFileSync(cert.key), cert: fs.readFileSync(cert.cert)}, h);
      const want = httpsPort || p1 + 363; // 8080 -> 8443
      for (let i = 0; i < 20; i++) { try { p2 = await listen(s2, want + i, host); break; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; } }
    }
  }
  return {
    httpPort: p1, httpsPort: p2, ips, cert,
    local: `http://localhost:${p1}/`,
    lan: p2 ? ips.map((ip) => `https://${ip}:${p2}/`) : [],
    lanHttp: ips.map((ip) => `http://${ip}:${p1}/`),
    close: () => { s1.close(); s2?.close(); },
  };
}
