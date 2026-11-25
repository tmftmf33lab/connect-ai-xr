// Open a page in your own Chrome (or Edge / Chromium) without a window, read its console errors and take a screenshot.
// Talks to Chrome over a pipe (the DevTools protocol), so nothing has to be installed and no browser is downloaded.
// Set CHROME_PATH if your browser is somewhere else (any Chromium or chrome-headless-shell works).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

const CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
  win32: [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'],
};

export function findChrome() {
  if (process.env.CHROME_PATH === 'none') return null;
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const c of (CANDIDATES[process.platform] || CANDIDATES.linux).filter(Boolean)) {
    if (c.includes('/') || c.includes('\\')) { if (fs.existsSync(c)) return c; continue; }
    const r = spawnSync('which', [c], {encoding: 'utf8'});
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

// visit(url) -> {errors: [...], warnings: [...], state: window.__xr, screenshot: file or null}
export async function visit(url, {width = 1280, height = 720, wait = 3500, shot = null, timeout = 45000} = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome, Edge or Chromium found. Install Chrome, or set CHROME_PATH.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'caixr-chrome-'));
  const args = ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'];
  const p = spawn(chrome, args, {stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']});
  let stderr = '';
  p.stdio[2].on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
  const send = p.stdio[3], recv = p.stdio[4];
  let id = 0, buf = '';
  const pending = new Map(), listeners = [];
  recv.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) { const {res, rej} = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
      else listeners.forEach((f) => f(msg));
    }
  });
  const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const m = ++id; pending.set(m, {res, rej});
    send.write(JSON.stringify({id: m, method, params, ...(sessionId ? {sessionId} : {})}) + '\0');
  });
  const errors = [], warnings = [];
  const killer = setTimeout(() => { try { p.kill(); } catch {} }, timeout);
  try {
    const {targetId} = await cmd('Target.createTarget', {url: 'about:blank'});
    const {sessionId} = await cmd('Target.attachToTarget', {targetId, flatten: true});
    let loaded = false;
    listeners.push((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (m.params.type === 'error') errors.push(text); else if (m.params.type === 'warning') warnings.push(text);
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text}${m.params.entry.url ? ' (' + m.params.entry.url + ')' : ''}`);
      if (m.method === 'Page.loadEventFired') loaded = true;
    });
    await cmd('Runtime.enable', {}, sessionId);
    await cmd('Log.enable', {}, sessionId);
    await cmd('Page.enable', {}, sessionId);
    await cmd('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
    await cmd('Page.navigate', {url}, sessionId);
    const t0 = Date.now();
    while (!loaded && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
    // wait until the app says it drew a frame, then a little longer for textures
    let state = null;
    while (Date.now() - t0 < wait + 12000) {
      const r = await cmd('Runtime.evaluate', {expression: 'JSON.stringify(window.__xr || null)', returnByValue: true}, sessionId);
      state = JSON.parse(r.result.value || 'null');
      if (state?.ready && Date.now() - t0 > wait) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    let screenshot = null;
    if (shot) {
      const {data} = await cmd('Page.captureScreenshot', {format: shot.endsWith('.jpg') ? 'jpeg' : 'png', quality: shot.endsWith('.jpg') ? 88 : undefined}, sessionId);
      fs.mkdirSync(path.dirname(shot), {recursive: true});
      fs.writeFileSync(shot, Buffer.from(data, 'base64'));
      screenshot = shot;
    }
    await cmd('Browser.close').catch(() => {});
    return {errors, warnings, state, screenshot, loaded};
  } finally {
    clearTimeout(killer);
    try { p.kill(); } catch {}
    setTimeout(() => fs.rmSync(profile, {recursive: true, force: true}), 500).unref?.();
  }
}
