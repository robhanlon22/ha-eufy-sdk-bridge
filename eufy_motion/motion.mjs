const MOTION_EVENTS = ['motion', 'personDetected', 'strangerDetected', 'vehicleDetected', 'petDetection', 'dogDetected'];

export function selectDoorbell(devices) {
  const matches = devices.filter(device => /^T8210[A-Z0-9]*$/.test(device.sn));
  if (matches.length !== 1) throw new Error('Expected exactly one T8210 doorbell in the account');
  return matches[0].sn;
}

export function webhookUrl(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid webhook ID');
  return `http://homeassistant:80/api/webhook/${id}`;
}

export function forwardMotion(client, serial, url, { fetchImpl = fetch, log = console.log, now = Date.now } = {}) {
  let lastSent = -Infinity;
  let sent = 0;
  const onMotion = async event => {
    if (event?.deviceSn !== serial || now() - lastSent < 2000) return;
    lastSent = now();
    try {
      const response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/json' }, body: '{"motion":true}',
      });
      if (!response.ok) throw new Error('Webhook refused');
      sent++;
      log('Doorbell motion forwarded');
    } catch {
      log('Could not deliver doorbell motion to Home Assistant');
    }
  };
  for (const event of MOTION_EVENTS) client.on(event, onMotion);
  return {
    count: () => sent,
    stop() { for (const event of MOTION_EVENTS) client.off(event, onMotion); },
  };
}
