# Validación de una API de pedidos con Postman y OpenAPI

Proyecto individual (S11 · Aseguramiento de la Calidad de Software). Una API local de pedidos de papelería,
su contrato OpenAPI 3.1 y una colección de Postman que automatiza 14 casos de prueba.

- **Autor:** Eddy Gerardo Cuyuch Lopez · Carné 2890-22-8567
- **Repositorio:** https://github.com/Ecuyuch/-S11-Validaci-n-de-una-API-con-Postman-y-OpenAPI
- **Video (máx. 3 min):** _pendiente: reemplazar por el enlace al publicarlo_

## Qué hace la API

| Operación | Comportamiento evaluado |
| --- | --- |
| `GET /orders?page&limit` | Lista paginada de los pedidos del usuario autenticado |
| `POST /orders` | Crea un pedido (**no idempotente**) |
| `GET /orders/{orderId}` | Consulta un pedido propio (403 si es ajeno, 404 si no existe) |
| `PUT /orders/{orderId}/cancellation` | Cancela un pedido (**idempotente**: fija el estado destino) |

Dos usuarios de demostración, **Ana** y **Luis**, permiten verificar permisos. Su aislamiento se prueba en TC-01, TC-06 y TC-13.

## Requisitos y versiones

| Herramienta | Versión mínima | Verificada |
| --- | --- | --- |
| Node.js | 20 | v22.23.2 |
| npm | 10 | 10.9.8 |
| Newman | 6.2.2 (se instala con `npm install`) | 6.2.2 |
| Postman Desktop (alternativa a Newman) | 11 | _opcional_ |

Formato de la colección: **Postman Collection v2.1** (`postman/orders.postman_collection.json`).
Versiones obtenidas con `npm run versions` en Windows 10/11 (PowerShell).

## Preparación e inicio

```powershell
npm install
npm start          # API en http://localhost:3000 (terminal 1)
```

**Datos controlados:** cada ejecución de la colección empieza con `POST /__test/reset`, que deja a Ana con
`ord-001`..`ord-005` y a Luis con `ord-006`. La colección guarda esos IDs en variables, por lo que no depende de
ejecuciones anteriores. `/__test/reset` es solo para pruebas locales y no forma parte del contrato.

## Ejecutar las pruebas

Con la API iniciada, en una segunda terminal:

```powershell
npm test               # pruebas unitarias de la API (node:test)
npm run collection     # colección completa con Newman; guarda evidence/latest-collection-result.json
```

Alternativa con Postman Desktop: importa los dos archivos de `postman/`, selecciona el ambiente
**Pedidos local (ejemplo)** y ejecuta la colección completa con **Collection Runner**, sin saltar solicitudes ni
cambiar el orden. También sirve Postman CLI:
`postman collection run postman/orders.postman_collection.json -e postman/local.example.postman_environment.json`.

Resultado esperado: **28 solicitudes** (1 de preparación + 27 de los casos), **51 aserciones**, **0 fallos**, **14 casos** (TC-01 a TC-14).

## Usuarios de demostración

Valores locales de prueba, no son secretos ni credenciales reales.

| Usuario | Token |
| --- | --- |
| Ana | `token-demo-ana` |
| Luis | `token-demo-luis` |

## Incompatibilidad controlada

Para demostrar que las pruebas detectan un defecto, la API admite una variable de entorno de prueba:
`FAULT=quantity_as_string` hace que `quantity` se devuelva como texto (`"3"`), lo que contradice el esquema
`integer` de `Order` en `openapi.yaml`.

```powershell
npm run evidence
```

El script ejecuta la colección con la API defectuosa (debe **fallar**) y con la API corregida (debe **pasar**), y
guarda en `evidence/`: `01-fallo-controlado.md/.json` y `02-correccion.md/.json`, con número de casos, aserciones y
fallos. Para reproducirlo a mano: `$env:FAULT="quantity_as_string"; npm start`, ejecuta la colección, y repite sin la variable.

**El contrato no se modifica para ocultar el defecto**: la corrección se hace en el código de la API.

### Evidencia obtenida (ejecución del 2026-10-03, Newman 6.2.2)

| Escenario | Solicitudes | Aserciones | Aserciones fallidas | Casos ejecutados | Archivo |
| --- | --- | --- | --- | --- | --- |
| API correcta (`npm run collection`) | 28 | 51 | **0** | 14 de 14 | `evidence/latest-collection-result.json` |
| API con defecto `quantity_as_string` | 28 | 51 | **8** | 14 de 14 | `evidence/01-fallo-controlado.md` |
| API corregida | 28 | 51 | **0** | 14 de 14 | `evidence/02-correccion.md` |

En el escenario con defecto, 7 fallos son directamente de esquema (`quantity should be integer`): TC-01, TC-02a,
TC-08a, TC-08b, TC-11a, TC-12a y TC-12c. El octavo (TC-12b) es un efecto en cadena: TC-12a falló antes de guardar
`cancelledAt`, por lo que TC-12b comparó contra un valor indefinido. Newman informa `requests: 0 failed` porque
todas las solicitudes HTTP respondieron; lo que falla son las aserciones.

## Archivos

- `src/server.js`: API local.
- `openapi.yaml`: contrato OpenAPI 3.1.
- `matriz-pruebas.md`: 14 casos con ID, operación, riesgo, precondiciones, datos, resultado esperado, aserciones y limpieza.
- `postman/`: colección v2.1 y ambiente de ejemplo sin secretos.
- `scripts/build-collection.js`: genera la colección y el ambiente (`npm run build:collection`).
- `scripts/demo-incompatibility.js`: genera la evidencia del fallo y la corrección.
- `test/api.test.js`: pruebas de la API con `node:test`.
- `evidence/`: resultados de ejecución.

## Alcance de la validación de esquemas

La colección valida el **cuerpo de las respuestas** con `pm.response.to.have.jsonSchema` usando esquemas copiados de
`openapi.yaml`. **No es una validación completa de OpenAPI**: no verifica parámetros, encabezados ni rutas contra el
contrato. Otras limitaciones están en `matriz-pruebas.md`.

## Uso responsable de IA

Declara aquí con honestidad:

- **Qué utilicé:** _por ejemplo, IA para proponer la estructura de casos y generar el borrador del código, la colección y la documentación._
- **Qué verifiqué personalmente:** _marca solo lo que hiciste de verdad_
  - [ ] Ejecuté `npm test` y `npm run collection` desde un estado limpio.
  - [ ] Revisé cada aserción y entiendo qué comprueba.
  - [ ] Provoqué el fallo controlado y vi fallar las pruebas.
  - [ ] Revisé que no haya secretos ni datos reales en archivos ni evidencia.
- No cargué secretos ni datos reales en ninguna herramienta de IA.
