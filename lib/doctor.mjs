// `connect-ai-xr doctor`: what this computer has for XR work, and what to do about what is missing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {KIT_NAME, VERSION} from './name.mjs';
import {findChrome} from './browser.mjs';
import {haveOpenssl, lanAddresses, certDir} from './serve.mjs';
import {agentTable} from './install.mjs';
import {gold, dimmed} from './banner.mjs';

export async function doctor({log = console.log} = {}) {
  const ok = (t) => `  ${gold('ok  ')} ${t}`, no = (t, fix) => `  ${'--  '} ${t}${fix ? dimmed('   ' + fix) : ''}`;
  log(ok(`${KIT_NAME} ${VERSION}`));
  const major = Number(process.versions.node.split('.')[0]);
  log(major >= 18 ? ok(`Node.js ${process.versions.node}`) : no(`Node.js ${process.versions.node}`, 'Node 18 or newer: https://nodejs.org'));
  const chrome = findChrome();
  log(chrome ? ok(`Chrome for check: ${chrome}`) : no('No Chrome / Edge / Chromium', 'check still runs its file checks; install Chrome or set CHROME_PATH for the console + screenshot part'));
  const ssl = haveOpenssl();
  log(ssl ? ok(`openssl (${ssl}): https for the headset`) : no('No openssl', 'serve gives only http. For the headset use USB (adb reverse) or deploy the folder to an https host'));
  const lan = lanAddresses();
  log(lan.length ? ok(`Wi-Fi / network address: ${lan.map((a) => `${a.address} (${a.name})`).join(', ')}`) : no('No network address', 'connect to Wi-Fi; the headset must be on the same one'));
  if (fs.existsSync(path.join(certDir(), 'cert.pem'))) log(ok(`certificate: ${certDir()}`));
  const skills = agentTable().map((a) => ({...a, path: path.join(a.skills, KIT_NAME)})).filter((a) => fs.existsSync(path.join(a.path, 'SKILL.md')));
  log(skills.length ? ok(`skill installed for ${skills.map((a) => a.label).join(', ')}`) : no('Skill not installed yet', `npx ${KIT_NAME} install-skill`));
  log('');
  log(dimmed('  Headsets: Quest 3 / 3S = AR with passthrough + VR. Quest 2 / Quest Pro = VR (Pro has color passthrough AR too). Open the https address in the Meta Quest Browser.'));
  log(dimmed('  Phones: Android Chrome = AR. iPhone Safari = 3D view with touch (no WebXR). Computers = 3D view with the mouse.'));
  if (os.platform() === 'darwin' && lan.length) log(dimmed('  macOS: if the headset cannot reach the address, allow incoming connections for node in System Settings > Network > Firewall.'));
}
