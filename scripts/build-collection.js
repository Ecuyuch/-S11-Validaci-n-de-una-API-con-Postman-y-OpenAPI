'use strict';
// Genera postman/orders.postman_collection.json (Postman Collection v2.1) y el ambiente de ejemplo.
const fs = require('node:fs');
const path = require('node:path');

// Esquemas JSON (subconjunto de los de openapi.yaml). Validan el CUERPO de cada respuesta con
// pm.response.to.have.jsonSchema; esto NO equivale a una validación completa contra OpenAPI.
const order = {
  type: 'object',
  required: ['id', 'ownerId', 'item', 'quantity', 'status', 'statusChanges', 'createdAt', 'cancelledAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: '^ord-[0-9]{3,}$' },
    ownerId: { type: 'string', enum: ['ana', 'luis'] },
    item: { type: 'string', minLength: 1, maxLength: 80 },
    quantity: { type: 'integer', minimum: 1, maximum: 100 },
    status: { type: 'string', enum: ['created', 'cancelled'] },
    statusChanges: { type: 'integer', minimum: 0 },
    createdAt: { type: 'string' },
    cancelledAt: { type: ['string', 'null'] },
  },
};
const schemas = {
  schemaOrder: order,
  schemaList: {
    type: 'object',
    required: ['data', 'page', 'limit', 'total', 'totalPages'],
    properties: {
      data: { type: 'array', items: order },
      page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 50 },
      total: { type: 'integer', minimum: 0 }, totalPages: { type: 'integer', minimum: 0 },
    },
  },
  schemaError: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' }, message: { type: 'string' },
          details: { type: 'array', items: { type: 'object', required: ['field', 'message'] } },
        },
      },
    },
  },
};

const PRE = "const S = (k) => JSON.parse(pm.collectionVariables.get(k));\nconst V = (k) => pm.collectionVariables.get(k);\nconst body = pm.response.json();\n";
const errorTests = (id, status, code) => `
pm.test('${id} · estado ${status} y esquema de error', () => {
  pm.response.to.have.status(${status});
  pm.response.to.have.jsonSchema(S('schemaError'));
});
pm.test('${id} · código de error ${code}', () => {
  pm.expect(body.error.code).to.equal('${code}');
});`;

const items = [];
function add(id, label, method, urlPath, { as = 'tokenAna', body: payload, raw, tests }) {
  const header = [];
  if (as) header.push({ key: 'Authorization', value: `Bearer {{${as}}}` });
  const req = { method, header, url: `{{baseUrl}}${urlPath}` };
  const text = raw !== undefined ? raw : payload !== undefined ? JSON.stringify(payload, null, 2) : undefined;
  if (text !== undefined) {
    header.push({ key: 'Content-Type', value: 'application/json' });
    req.body = { mode: 'raw', raw: text, options: { raw: { language: 'json' } } };
  }
  items.push({
    name: `${id}${label ? ' ' + label : ''}`,
    request: req,
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: (PRE + tests).split('\n') } }],
  });
}

// ---- SETUP (no es un caso de la matriz) ----
add('SETUP', '· Reiniciar datos controlados', 'POST', '/__test/reset', { as: null, tests: `
pm.test('SETUP · reinicio devuelve identificadores controlados', () => {
  pm.response.to.have.status(200);
  pm.expect(body.anaOrderIds).to.have.lengthOf(5);
  pm.expect(body.luisOrderIds).to.have.lengthOf(1);
  body.anaOrderIds.forEach((id, i) => pm.collectionVariables.set('ana' + (i + 1), id));
  pm.collectionVariables.set('luis1', body.luisOrderIds[0]);
});` });

// ---- Paginación ----
add('TC-01', '· Listar página intermedia y aislamiento entre usuarios', 'GET', '/orders?page=2&limit=2', { tests: `
pm.test('TC-01 · 200 y esquema de lista', () => {
  pm.response.to.have.status(200);
  pm.response.to.have.jsonSchema(S('schemaList'));
});
pm.test('TC-01 · metadatos de paginación (page 2, limit 2, total 5, totalPages 3)', () => {
  pm.expect(body.page).to.equal(2); pm.expect(body.limit).to.equal(2);
  pm.expect(body.total).to.equal(5); pm.expect(body.totalPages).to.equal(3);
});
pm.test('TC-01 · segmento esperado y solo pedidos propios', () => {
  pm.expect(body.data.map((o) => o.id)).to.eql([V('ana3'), V('ana4')]);
  pm.expect(body.data.every((o) => o.ownerId === 'ana')).to.equal(true);
});` });
add('TC-02', '(a) · Última página parcial', 'GET', '/orders?page=3&limit=2', { tests: `
pm.test('TC-02a · última página con un solo elemento', () => {
  pm.response.to.have.status(200);
  pm.response.to.have.jsonSchema(S('schemaList'));
  pm.expect(body.data.map((o) => o.id)).to.eql([V('ana5')]);
});` });
add('TC-02', '(b) · Página fuera de rango', 'GET', '/orders?page=4&limit=2', { tests: `
pm.test('TC-02b · página fuera de rango devuelve lista vacía con total intacto', () => {
  pm.response.to.have.status(200);
  pm.expect(body.data).to.eql([]);
  pm.expect(body.total).to.equal(5);
  pm.expect(body.totalPages).to.equal(3);
});` });
[['a', 'limit=0'], ['b', 'limit=51'], ['c', 'page=abc']].forEach(([l, q]) =>
  add('TC-03', `(${l}) · Paginación inválida (${q})`, 'GET', `/orders?${q}`, { tests: errorTests(`TC-03${l}`, 400, 'INVALID_PAGINATION') + `
pm.test('TC-03${l} · el detalle señala el parámetro erróneo', () => {
  pm.expect(body.error.details.map((d) => d.field)).to.include('${q.split('=')[0]}');
});` }));

// ---- Credenciales ----
add('TC-04', '· Sin credenciales', 'GET', '/orders', { as: null, tests: errorTests('TC-04', 401, 'MISSING_CREDENTIALS') + `
pm.test('TC-04 · incluye WWW-Authenticate: Bearer', () => {
  pm.expect(pm.response.headers.get('WWW-Authenticate')).to.equal('Bearer');
});` });
add('TC-05', '· Token inválido', 'GET', '/orders', { as: 'tokenInvalido', tests: errorTests('TC-05', 401, 'INVALID_CREDENTIALS') });

// ---- Recurso ajeno / inexistente ----
add('TC-06', '· Leer pedido de otro usuario', 'GET', '/orders/{{luis1}}', { tests: errorTests('TC-06', 403, 'FORBIDDEN') + `
pm.test('TC-06 · no filtra datos del pedido ajeno', () => {
  pm.expect(JSON.stringify(body)).to.not.include('Libro de cocina');
});` });
add('TC-07', '· Pedido inexistente', 'GET', '/orders/ord-999', { tests: errorTests('TC-07', 404, 'NOT_FOUND') });

// ---- Crear ----
add('TC-08', '(a) · Crear pedido válido', 'POST', '/orders', { body: { item: 'Atlas escolar', quantity: 3 }, tests: `
pm.test('TC-08a · 201 y esquema de pedido', () => {
  pm.response.to.have.status(201);
  pm.response.to.have.jsonSchema(S('schemaOrder'));
});
pm.test('TC-08a · reglas de negocio: estado inicial y Location', () => {
  pm.expect(body.status).to.equal('created');
  pm.expect(body.statusChanges).to.equal(0);
  pm.expect(body.cancelledAt).to.equal(null);
  pm.expect(body.ownerId).to.equal('ana');
  pm.expect(pm.response.headers.get('Location')).to.equal('/orders/' + body.id);
  pm.collectionVariables.set('newId', body.id);
});` });
add('TC-08', '(b) · Consultar el pedido creado', 'GET', '/orders/{{newId}}', { tests: `
pm.test('TC-08b · el pedido persiste con los datos enviados', () => {
  pm.response.to.have.status(200);
  pm.response.to.have.jsonSchema(S('schemaOrder'));
  pm.expect(body.id).to.equal(V('newId'));
  pm.expect(body.item).to.equal('Atlas escolar');
  pm.expect(body.quantity).to.equal(3);
});` });
add('TC-08', '(c) · El total aumenta en uno', 'GET', '/orders?limit=1', { tests: `
pm.test('TC-08c · total pasa de 5 a 6', () => {
  pm.response.to.have.status(200);
  pm.expect(body.total).to.equal(6);
  pm.collectionVariables.set('totalAfterCreate', String(body.total));
});` });
add('TC-09', '(a) · Cantidad fuera de rango (0)', 'POST', '/orders', { body: { item: 'Atlas escolar', quantity: 0 }, tests: errorTests('TC-09a', 400, 'VALIDATION_ERROR') + `
pm.test('TC-09a · el detalle señala quantity', () => {
  pm.expect(body.error.details.map((d) => d.field)).to.eql(['quantity']);
});` });
add('TC-09', '(b) · Cantidad con tipo incorrecto ("3")', 'POST', '/orders', { body: { item: 'Atlas escolar', quantity: '3' }, tests: errorTests('TC-09b', 400, 'VALIDATION_ERROR') });
add('TC-09', '(c) · Los datos inválidos no crearon nada', 'GET', '/orders?limit=1', { tests: `
pm.test('TC-09c · el total no cambió tras los rechazos', () => {
  pm.response.to.have.status(200);
  pm.expect(String(body.total)).to.equal(V('totalAfterCreate'));
});` });
add('TC-10', '(a) · Falta el campo obligatorio item', 'POST', '/orders', { body: { quantity: 2 }, tests: errorTests('TC-10a', 400, 'VALIDATION_ERROR') + `
pm.test('TC-10a · el detalle señala item', () => {
  pm.expect(body.error.details.map((d) => d.field)).to.eql(['item']);
});` });
add('TC-10', '(b) · JSON mal formado', 'POST', '/orders', { raw: '{', tests: errorTests('TC-10b', 400, 'INVALID_JSON') });

// ---- POST no idempotente ----
const dup = { item: 'Pedido repetido', quantity: 1 };
add('TC-11', '(a) · Primer POST idéntico', 'POST', '/orders', { body: dup, tests: `
pm.test('TC-11a · 201 y esquema', () => {
  pm.response.to.have.status(201);
  pm.response.to.have.jsonSchema(S('schemaOrder'));
  pm.collectionVariables.set('dupId', body.id);
});` });
add('TC-11', '(b) · Segundo POST idéntico crea otro recurso', 'POST', '/orders', { body: dup, tests: `
pm.test('TC-11b · 201 con identificador distinto (POST no es idempotente)', () => {
  pm.response.to.have.status(201);
  pm.expect(body.id).to.not.equal(V('dupId'));
});` });
add('TC-11', '(c) · Efecto final: dos pedidos nuevos', 'GET', '/orders?limit=1', { tests: `
pm.test('TC-11c · total = 6 + 2 = 8', () => {
  pm.response.to.have.status(200);
  pm.expect(body.total).to.equal(8);
});` });

// ---- PUT idempotente ----
add('TC-12', '(a) · Primera cancelación', 'PUT', '/orders/{{ana1}}/cancellation', { tests: `
pm.test('TC-12a · 200, esquema y estado cancelado', () => {
  pm.response.to.have.status(200);
  pm.response.to.have.jsonSchema(S('schemaOrder'));
  pm.expect(body.status).to.equal('cancelled');
  pm.expect(body.statusChanges).to.equal(1);
  pm.expect(body.cancelledAt).to.be.a('string');
  pm.collectionVariables.set('cancelledAt', body.cancelledAt);
});` });
add('TC-12', '(b) · Segunda cancelación (repetición)', 'PUT', '/orders/{{ana1}}/cancellation', { tests: `
pm.test('TC-12b · repetir no cambia el recurso', () => {
  pm.response.to.have.status(200);
  pm.expect(body.status).to.equal('cancelled');
  pm.expect(body.statusChanges).to.equal(1);
  pm.expect(body.cancelledAt).to.equal(V('cancelledAt'));
});` });
add('TC-12', '(c) · Efecto final observable con GET', 'GET', '/orders/{{ana1}}', { tests: `
pm.test('TC-12c · el estado final es el de una sola cancelación', () => {
  pm.response.to.have.status(200);
  pm.response.to.have.jsonSchema(S('schemaOrder'));
  pm.expect(body.status).to.equal('cancelled');
  pm.expect(body.statusChanges).to.equal(1);
  pm.expect(body.cancelledAt).to.equal(V('cancelledAt'));
});` });

// ---- Cancelar ajeno / inexistente ----
add('TC-13', '(a) · Cancelar pedido de otro usuario', 'PUT', '/orders/{{luis1}}/cancellation', { tests: errorTests('TC-13a', 403, 'FORBIDDEN') });
add('TC-13', '(b) · El pedido ajeno no cambió', 'GET', '/orders/{{luis1}}', { as: 'tokenLuis', tests: `
pm.test('TC-13b · el dueño ve su pedido intacto', () => {
  pm.response.to.have.status(200);
  pm.expect(body.status).to.equal('created');
  pm.expect(body.statusChanges).to.equal(0);
  pm.expect(body.cancelledAt).to.equal(null);
});` });
add('TC-14', '· Cancelar pedido inexistente', 'PUT', '/orders/ord-999/cancellation', { tests: errorTests('TC-14', 404, 'NOT_FOUND') });

const collection = {
  info: {
    name: 'Pedidos de papelería · validación de contrato',
    description: 'Casos TC-01 a TC-14 de matriz-pruebas.md. Ejecutar completa y en orden (usa SETUP como primera solicitud).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: items,
  variable: Object.entries(schemas).map(([key, value]) => ({ key, value: JSON.stringify(value), type: 'any' })),
};
const environment = {
  id: 'pedidos-local-ejemplo',
  name: 'Pedidos local (ejemplo)',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'default', enabled: true },
    { key: 'tokenAna', value: 'token-demo-ana', type: 'default', enabled: true },
    { key: 'tokenLuis', value: 'token-demo-luis', type: 'default', enabled: true },
    { key: 'tokenInvalido', value: 'token-que-no-existe', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};
const out = path.join(__dirname, '..', 'postman');
fs.writeFileSync(path.join(out, 'orders.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'local.example.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
console.log(`Colección generada: ${items.length} solicitudes.`);
