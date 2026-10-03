'use strict';
const http = require('node:http');

// Tokens de DEMOSTRACIÓN (no son secretos): identifican a dos usuarios locales.
const TOKENS = { 'token-demo-ana': 'ana', 'token-demo-luis': 'luis' };

function createApp({ fault = process.env.FAULT || '' } = {}) {
  let orders = new Map();
  let nextId = 1;

  function create(ownerId, item, quantity) {
    const id = 'ord-' + String(nextId++).padStart(3, '0');
    const order = { id, ownerId, item, quantity, status: 'created', statusChanges: 0,
      createdAt: new Date().toISOString(), cancelledAt: null };
    orders.set(id, order);
    return order;
  }

  // Datos controlados: 5 pedidos de Ana y 1 de Luis.
  function reset() {
    orders = new Map();
    nextId = 1;
    const seed = [
      ['ana', 'Cuaderno rayado', 2], ['ana', 'Lapices de colores', 10],
      ['ana', 'Regla de 30 cm', 1], ['ana', 'Mochila escolar', 1],
      ['ana', 'Diccionario', 1], ['luis', 'Libro de cocina', 1],
    ];
    const made = seed.map(([o, i, q]) => create(o, i, q));
    return {
      anaOrderIds: made.filter((o) => o.ownerId === 'ana').map((o) => o.id),
      luisOrderIds: made.filter((o) => o.ownerId === 'luis').map((o) => o.id),
    };
  }

  // FAULT=quantity_as_string reproduce la incompatibilidad controlada del contrato.
  function view(o) {
    const out = { ...o };
    if (fault === 'quantity_as_string') out.quantity = String(o.quantity);
    return out;
  }

  function send(res, status, body, headers = {}) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(payload);
  }
  const fail = (res, status, code, message, details, headers) =>
    send(res, status, { error: { code, message, ...(details ? { details } : {}) } }, headers);

  const readBody = (req) => new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

  const strictInt = (v) => (/^\d+$/.test(v) ? Number(v) : NaN);

  function authenticate(req, res) {
    const header = req.headers.authorization;
    const challenge = { 'WWW-Authenticate': 'Bearer' };
    if (!header) { fail(res, 401, 'MISSING_CREDENTIALS', 'Falta el encabezado Authorization.', null, challenge); return null; }
    const m = /^Bearer (.+)$/.exec(header);
    const user = m && TOKENS[m[1]];
    if (!user) { fail(res, 401, 'INVALID_CREDENTIALS', 'El token no es válido.', null, challenge); return null; }
    return user;
  }

  function owned(res, user, id) {
    const order = orders.get(id);
    if (!order) { fail(res, 404, 'NOT_FOUND', 'El pedido no existe.'); return null; }
    if (order.ownerId !== user) { fail(res, 403, 'FORBIDDEN', 'No tienes permiso sobre este pedido.'); return null; }
    return order;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const method = req.method;
    try {
      if (method === 'POST' && pathname === '/__test/reset') return send(res, 200, reset());

      const isList = pathname === '/orders';
      const one = /^\/orders\/([^/]+)$/.exec(pathname);
      const cancel = /^\/orders\/([^/]+)\/cancellation$/.exec(pathname);
      const known = (isList && ['GET', 'POST'].includes(method)) ||
        (one && method === 'GET') || (cancel && method === 'PUT');
      if (!known) return fail(res, 404, 'ROUTE_NOT_FOUND', 'Ruta o método no soportado.');

      const user = authenticate(req, res);
      if (!user) return;

      if (isList && method === 'GET') {
        const page = url.searchParams.has('page') ? strictInt(url.searchParams.get('page')) : 1;
        const limit = url.searchParams.has('limit') ? strictInt(url.searchParams.get('limit')) : 10;
        const details = [];
        if (!(page >= 1)) details.push({ field: 'page', message: 'page debe ser un entero >= 1.' });
        if (!(limit >= 1 && limit <= 50)) details.push({ field: 'limit', message: 'limit debe ser un entero entre 1 y 50.' });
        if (details.length) return fail(res, 400, 'INVALID_PAGINATION', 'Parámetros de paginación inválidos.', details);
        const mine = [...orders.values()].filter((o) => o.ownerId === user);
        const data = mine.slice((page - 1) * limit, page * limit).map(view);
        return send(res, 200, { data, page, limit, total: mine.length, totalPages: Math.ceil(mine.length / limit) });
      }

      if (isList && method === 'POST') {
        let data;
        try { data = JSON.parse(await readBody(req)); }
        catch { return fail(res, 400, 'INVALID_JSON', 'El cuerpo no es JSON válido.'); }
        if (data === null || typeof data !== 'object' || Array.isArray(data)) {
          return fail(res, 400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.');
        }
        const details = [];
        if (typeof data.item !== 'string' || !data.item.trim() || data.item.length > 80) {
          details.push({ field: 'item', message: 'item es obligatorio: texto de 1 a 80 caracteres.' });
        }
        if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 100) {
          details.push({ field: 'quantity', message: 'quantity es obligatorio: entero entre 1 y 100.' });
        }
        if (details.length) return fail(res, 400, 'VALIDATION_ERROR', 'Datos inválidos.', details);
        const order = create(user, data.item.trim(), data.quantity);
        return send(res, 201, view(order), { Location: `/orders/${order.id}` });
      }

      if (one) {
        const order = owned(res, user, decodeURIComponent(one[1]));
        return order && send(res, 200, view(order));
      }

      // PUT /orders/{id}/cancellation: idempotente por diseño (fija un estado destino).
      const order = owned(res, user, decodeURIComponent(cancel[1]));
      if (!order) return;
      if (order.status !== 'cancelled') {
        order.status = 'cancelled';
        order.statusChanges += 1;
        order.cancelledAt = new Date().toISOString();
      }
      return send(res, 200, view(order));
    } catch (err) {
      return fail(res, 500, 'INTERNAL_ERROR', 'Error interno.');
    }
  });

  reset();
  return { server, reset };
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().server.listen(port, () => console.log(`API de pedidos en http://localhost:${port}`));
}
