import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { EufyMega, FileSessionStore, FileFcmStore } from '@mega-yfue/eufy-sdk';
import { selectDoorbell, webhookUrl, forwardMotion } from './motion.mjs';

const options = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
if (!options.email || !options.password || !/^[A-Z]{2}$/.test(options.country)) {
  console.error('Set the Eufy email, password, and two-letter country in Configuration, then restart.');
  process.exit(1);
}
const url = webhookUrl(options.webhook_id);
const identityPath = '/data/identity';
if (!fs.existsSync(identityPath)) fs.writeFileSync(identityPath, crypto.randomBytes(8).toString('hex'), { mode: 0o600 });
const client = new EufyMega({
  email: options.email, password: options.password, countryCode: options.country,
  openudid: fs.readFileSync(identityPath, 'utf8'),
  store: new FileSessionStore('/data/session.json'),
  pushStore: new FileFcmStore('/data/push.json'),
  storedSnapshotCache: false, prewarmEvents: [], pollMs: 0,
});
let challenge;
let relay;
let connected = false;
let disconnectedAt = Date.now();
let busy = false;

client.on('pushConnect', () => { connected = true; console.log('Eufy motion connection established'); });
client.on('pushDisconnect', () => { connected = false; disconnectedAt = Date.now(); console.log('Eufy motion connection lost; reconnecting'); });
client.on('error', () => console.error('Eufy connection error; check account and network.'));
client.on('sessionExpired', () => {
  console.error('Eufy session expired. Restart the app to sign in again.');
  connected = false;
});

async function finishLogin(result) {
  challenge = result;
  if (result.status === '2fa') {
    console.log('Eufy verification code required. Send {"code":"123456"} through app input.');
    return;
  }
  if (result.status === 'captcha') {
    console.log('Eufy captcha required. Send {"status":true} through app input to retrieve the image.');
    return;
  }
  if (result.status !== 'ok') throw new Error('Login incomplete');
  const serial = selectDoorbell(await client.getDevices());
  relay?.stop();
  relay = forwardMotion(client, serial, url);
  const readiness = await client.waitForRealtime({ timeoutMs: 60000 });
  if (!readiness.push.ready) throw new Error('Push connection unavailable');
  challenge = undefined;
  console.log('Ready: listening for doorbell motion.');
}

readline.createInterface({ input: process.stdin }).on('line', async line => {
  if (line.length > 512 || busy) return;
  busy = true;
  try {
    const input = JSON.parse(line);
    if (input?.status === true) {
      console.log(JSON.stringify({ state: challenge?.status ?? 'ready', connected, forwarded: relay?.count() ?? 0,
        ...(challenge?.status === 'captcha' ? { captcha: challenge.image } : {}) }));
    } else if (challenge?.status === '2fa' && /^\d{6}$/.test(input?.code ?? '')) {
      await finishLogin(await client.submitVerifyCode(input.code));
    } else if (challenge?.status === 'captcha' && typeof input?.captcha === 'string' && input.captcha.length <= 100) {
      await finishLogin(await client.solveCaptcha(input.captcha));
    } else console.log('No matching sign-in challenge, or invalid app input.');
  } catch {
    console.error('Sign-in step failed. Check the code or captcha and try again.');
  } finally { busy = false; }
});

// The SDK reconnects dropped sockets. Restart if its push connection stays down for five minutes.
setInterval(() => {
  if (relay && !connected && Date.now() - disconnectedAt > 300000) {
    console.error('Eufy motion connection did not recover; stopping for the Supervisor watchdog.');
    process.exit(1);
  }
}, 60000).unref();

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  relay?.stop();
  await client.disconnect();
  process.exit(0);
});

busy = true;
try { await finishLogin(await client.login()); }
catch { console.error('Eufy sign-in or motion setup failed. Check Configuration and restart.'); }
finally { busy = false; }
