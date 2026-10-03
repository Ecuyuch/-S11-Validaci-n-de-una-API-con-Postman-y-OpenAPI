'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');

const ANA = 'token-demo-ana';
const LUIS = 'token-demo-luis';

async function start(opts) {
  const app = createApp(opts);
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  const call = async (method, path, { token, body, raw } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  };
  return { call, close: () => app.server.close() };
}

test('paginación, aislamiento por usuario y parámetros inválidos', async (t) => {
  const { call, close } = await start(); t.after(close);
  const p2 = await call('GET', '/orders?page=2&limit=2', { token: ANA });
  assert.equal(p2.status, 200);
  assert.deepEqual(p2.json.data.map((o) => o.id), ['ord-003', 'ord-004']);
  assert.equal(p2.json.total, 5); assert.equal(p2.json.totalPages, 3);
  const last = await call('GET', '/orders?page=3&limit=2', { token: ANA });
  assert.equal(last.json.data.length, 1);
  const beyond = await call('GET', '/orders?page=4&limit=2', { token: ANA });
  assert.deepEqual(beyond.json.data, []);
  for (const q of ['limit=0', 'limit=51', 'page=abc', 'page=0']) {
    const r = await call('GET', `/orders?${q}`, { token: ANA });
    assert.equal(r.status, 400, q); assert.equal(r.json.error.code, 'INVALID_PAGINATION');
  }
});

test('credenciales, recurso ajeno e inexistente', async (t) => {
  const { call, close } = await start(); t.after(close);
  const none = await call('GET', '/orders');
  assert.equal(none.status, 401); assert.equal(none.json.error.code, 'MISSING_CREDENTIALS');
  assert.equal(none.headers.get('www-authenticate'), 'Bearer');
  const bad = await call('GET', '/orders', { token: 'x' });
  assert.equal(bad.status, 401); assert.equal(bad.json.error.code, 'INVALID_CREDENTIALS');
  const foreign = await call('GET', '/orders/ord-006', { token: ANA });
  assert.equal(foreign.status, 403);
  assert.ok(!JSON.stringify(foreign.json).includes('Libro de cocina'));
  assert.equal((await call('GET', '/orders/ord-999', { token: ANA })).status, 404);
});

test('crear: válido con efecto posterior, inválidos sin efecto', async (t) => {
  const { call, close } = await start(); t.after(close);
  const ok = await call('POST', '/orders', { token: ANA, body: { item: 'Atlas', quantity: 3 } });
  assert.equal(ok.status, 201); assert.equal(ok.headers.get('location'), `/orders/${ok.json.id}`);
  assert.equal((await call('GET', `/orders/${ok.json.id}`, { token: ANA })).json.quantity, 3);
  const total = async () => (await call('GET', '/orders?limit=1', { token: ANA })).json.total;
  assert.equal(await total(), 6);
  for (const body of [{ item: 'x', quantity: 0 }, { item: 'x', quantity: '3' }, { quantity: 2 }, { item: '  ', quantity: 1 }]) {
    const r = await call('POST', '/orders', { token: ANA, body });
    assert.equal(r.status, 400); assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  }
  assert.equal((await call('POST', '/orders', { token: ANA, raw: '{' })).json.error.code, 'INVALID_JSON');
  assert.equal(await total(), 6);
});

test('POST no es idempotente; PUT cancelación sí (efecto final)', async (t) => {
  const { call, close } = await start(); t.after(close);
  const a = await call('POST', '/orders', { token: ANA, body: { item: 'Repetido', quantity: 1 } });
  const b = await call('POST', '/orders', { token: ANA, body: { item: 'Repetido', quantity: 1 } });
  assert.notEqual(a.json.id, b.json.id);
  const c1 = await call('PUT', '/orders/ord-001/cancellation', { token: ANA });
  const c2 = await call('PUT', '/orders/ord-001/cancellation', { token: ANA });
  const final = await call('GET', '/orders/ord-001', { token: ANA });
  assert.equal(final.json.status, 'cancelled');
  assert.equal(final.json.statusChanges, 1);
  assert.equal(final.json.cancelledAt, c1.json.cancelledAt);
  assert.deepEqual(c1.json, c2.json);
});

test('cancelar pedido ajeno no tiene efecto', async (t) => {
  const { call, close } = await start(); t.after(close);
  assert.equal((await call('PUT', '/orders/ord-006/cancellation', { token: ANA })).status, 403);
  const check = await call('GET', '/orders/ord-006', { token: LUIS });
  assert.equal(check.json.status, 'created'); assert.equal(check.json.statusChanges, 0);
  assert.equal((await call('PUT', '/orders/ord-999/cancellation', { token: ANA })).status, 404);
});

test('FAULT=quantity_as_string devuelve quantity como texto (defecto controlado)', async (t) => {
  const { call, close } = await start({ fault: 'quantity_as_string' }); t.after(close);
  const r = await call('GET', '/orders/ord-001', { token: ANA });
  assert.equal(typeof r.json.quantity, 'string');
});
