import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { selectDoorbell, webhookUrl, forwardMotion } from '../motion.mjs';

test('select exactly one T8210 and refuse an absent or ambiguous doorbell', () => {
  assert.equal(selectDoorbell([{ sn: 'T8210SYNTHETIC' }, { sn: 'T8410OTHER' }]), 'T8210SYNTHETIC');
  assert.throws(() => selectDoorbell([]));
  assert.throws(() => selectDoorbell([{ sn: 'T8210A' }, { sn: 'T8210B' }]));
  assert.throws(() => webhookUrl('../other-service'));
});

test('only this doorbell motion reaches the fixed HA webhook; duplicate classifications do not flood it', async () => {
  const client = new EventEmitter();
  const calls = [];
  const logs = [];
  let time = 0;
  const url = webhookUrl('a'.repeat(64));
  const relay = forwardMotion(client, 'T8210SYNTHETIC', url, {
    now: () => time, log: value => logs.push(value),
    fetchImpl: async (...args) => { calls.push(args); return { ok: true }; },
  });
  client.emit('motion', { deviceSn: 'OTHER', thumbnailUrl: 'https://example.invalid/private' });
  client.emit('doorbellPress', { deviceSn: 'T8210SYNTHETIC' });
  assert.equal(calls.length, 0);
  client.emit('motion', { deviceSn: 'T8210SYNTHETIC', token: 'SYNTHETIC-SECRET' });
  client.emit('personDetected', { deviceSn: 'T8210SYNTHETIC' });
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], url);
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].body, '{"motion":true}');
  assert.ok(!JSON.stringify(calls).includes('SYNTHETIC-SECRET'));
  assert.ok(!JSON.stringify(logs).includes('SYNTHETIC-SECRET'));
  time += 3000;
  client.emit('strangerDetected', { deviceSn: 'T8210SYNTHETIC' });
  await Promise.resolve();
  assert.equal(relay.count(), 2);
  relay.stop();
  client.emit('motion', { deviceSn: 'T8210SYNTHETIC' });
  assert.equal(calls.length, 2);
});

test('failed delivery does not expose the webhook or error details', async () => {
  const client = new EventEmitter();
  const logs = [];
  forwardMotion(client, 'T8210SYNTHETIC', webhookUrl('b'.repeat(64)), {
    log: value => logs.push(value), fetchImpl: async () => { throw new Error('SYNTHETIC-SECRET'); },
  });
  client.emit('motion', { deviceSn: 'T8210SYNTHETIC' });
  await Promise.resolve();
  assert.deepEqual(logs, ['Could not deliver doorbell motion to Home Assistant']);
});
