'use strict';
// Ejecuta la colección dos veces con Newman y guarda evidencia legible en evidence/:
//   1) API con defecto controlado (quantity como texto) -> debe FALLAR
//   2) API corregida                                   -> debe PASAR
const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
const { createApp } = require('../src/server');

const root = path.join(__dirname, '..');
const evidence = path.join(root, 'evidence');

async function runOnce(fault, port) {
  const { server } = createApp({ fault });
  await new Promise((r) => server.listen(port, r));
  try {
    return await new Promise((resolve, reject) => newman.run({
      collection: path.join(root, 'postman/orders.postman_collection.json'),
      environment: path.join(root, 'postman/local.example.postman_environment.json'),
      envVar: [{ key: 'baseUrl', value: `http://localhost:${port}` }],
      reporters: 'cli',
    }, (err, summary) => (err ? reject(err) : resolve(summary))));
  } finally { server.close(); }
}

function digest(label, fault, summary) {
  const stats = summary.run.stats;
  const names = summary.run.executions.flatMap((e) => (e.assertions || []).map((a) => a.assertion));
  const cases = new Set(names.map((n) => (/^(TC-\d+)/.exec(n) || [])[1]).filter(Boolean));
  return {
    escenario: label, falloInyectado: fault || 'ninguno', fecha: new Date().toISOString(),
    node: process.version, newman: require('newman/package.json').version,
    solicitudes: stats.requests.total, aserciones: stats.assertions.total, asercionesFallidas: stats.assertions.failed,
    casosEjecutados: cases.size,
    fallos: summary.run.failures.map((f) => ({ solicitud: f.source && f.source.name, prueba: f.error.test, mensaje: f.error.message })),
  };
}

function toMarkdown(d) {
  const rows = d.fallos.length
    ? d.fallos.map((f) => `| ${f.solicitud} | ${f.prueba} | ${String(f.mensaje).replace(/\|/g, '/')} |`).join('\n')
    : '| – | – | Sin fallos |';
  return `# ${d.escenario}\n\n- Fecha: ${d.fecha}\n- Defecto inyectado: ${d.falloInyectado}\n- Node ${d.node} · Newman ${d.newman}\n` +
    `- Solicitudes: ${d.solicitudes} · Aserciones: ${d.aserciones} · **Fallidas: ${d.asercionesFallidas}**\n- Casos de la matriz ejecutados: ${d.casosEjecutados} de 14\n\n` +
    `| Solicitud | Prueba | Mensaje |\n| --- | --- | --- |\n${rows}\n`;
}

(async () => {
  const bad = digest('01 · Incompatibilidad detectada', 'quantity_as_string', await runOnce('quantity_as_string', 3101));
  const good = digest('02 · Corrección verificada', '', await runOnce('', 3102));
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, '01-fallo-controlado.json'), JSON.stringify(bad, null, 2));
  fs.writeFileSync(path.join(evidence, '01-fallo-controlado.md'), toMarkdown(bad));
  fs.writeFileSync(path.join(evidence, '02-correccion.json'), JSON.stringify(good, null, 2));
  fs.writeFileSync(path.join(evidence, '02-correccion.md'), toMarkdown(good));
  console.log(`\nFallo controlado: ${bad.asercionesFallidas} aserciones fallidas | Corrección: ${good.asercionesFallidas} fallidas`);
  if (bad.asercionesFallidas === 0 || good.asercionesFallidas !== 0) process.exitCode = 1;
})();
