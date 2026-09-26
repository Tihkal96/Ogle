'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AdminChannel } = require('../src/main/admin-channel.cjs');
const token = '3a'.repeat(32);
function connect() {
  const client = new AdminChannel('client', token), server = new AdminChannel('server', token);
  const hello = client.start(), challenge = server.handshake(hello), proof = client.handshake(challenge);
  server.handshake(proof); return { client, server, hello, challenge, proof };
}
test('mutual authentication exchanges no lasting secret and protects both directions', () => {
  const { client, server, hello, challenge, proof } = connect();
  assert.ok(!JSON.stringify({ hello, challenge, proof }).includes(token));
  const command = { event: 'write', id: 'shell', data: 'secret command' }, frame = client.seal(command);
  assert.ok(!JSON.stringify(frame).includes('secret command'));
  assert.deepEqual(server.open(frame), command);
  const response = { event: 'data', data: 'secret response' };
  assert.deepEqual(client.open(server.seal(response)), response);
});
test('squatting server with a different secret cannot authenticate', () => {
  const client = new AdminChannel('client', token), impostor = new AdminChannel('server', '4b'.repeat(32));
  const hello = client.start();
  assert.throws(() => client.handshake(impostor.handshake(hello)), /authentication failed/);
  assert.equal(client.established, false);
});
test('server proof cannot be reflected as client proof', () => {
  const client = new AdminChannel('client', token), server = new AdminChannel('server', token);
  const challenge = server.handshake(client.start());
  assert.throws(() => server.handshake({ proof: challenge.proof }), /authentication failed/);
});
test('relayed connection cannot inject, reflect, modify, reorder or replay commands', () => {
  const { client, server } = connect();
  const one = client.seal({ event: 'start', id: 'one' });
  const two = client.seal({ event: 'start', id: 'two' });
  assert.throws(() => server.open(two), /Invalid administrator/);
  assert.throws(() => server.open({ ...one, tag: '0'.repeat(32) }));
  assert.throws(() => server.open({ ...one, data: Buffer.from('injected command').toString('base64') }));
  assert.throws(() => client.open(one));
  assert.equal(server.open(one).id, 'one');
  assert.throws(() => server.open(one), /Invalid administrator/);
  assert.equal(server.open(two).id, 'two');
});
test('captured handshake cannot authenticate another connection', () => {
  const old = connect(), server = new AdminChannel('server', token);
  server.handshake(old.hello);
  assert.throws(() => server.handshake(old.proof), /authentication failed/);
});
