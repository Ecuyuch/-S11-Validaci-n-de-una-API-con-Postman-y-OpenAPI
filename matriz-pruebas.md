# Matriz de pruebas

Cada caso aparece en la colección con su ID en el nombre de la solicitud y en cada `pm.test`.
Datos iniciales (`SETUP`): Ana tiene `ord-001` a `ord-005`; Luis tiene `ord-006`. Cada ejecución parte de ese estado.

| ID | Operación | Riesgo | Precondiciones | Datos | Resultado esperado | Aserciones | Limpieza |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-01 | `GET /orders` | Paginación incorrecta o fuga de pedidos entre usuarios | SETUP; Ana autenticada | `page=2&limit=2` | 200; pedidos 3 y 4 de Ana | Estado, esquema de lista, `page/limit/total/totalPages`, ids exactos, todos `ownerId=ana` | Ninguna (solo lectura) |
| TC-02 | `GET /orders` | Último segmento o página fuera de rango mal manejados | Igual que TC-01 | `page=3&limit=2` y `page=4&limit=2` | (a) solo `ord-005`; (b) 200 con `data=[]` y `total=5` | Ids, lista vacía, totales intactos | Ninguna |
| TC-03 | `GET /orders` | Parámetros de paginación sin validar | Igual que TC-01 | `limit=0`, `limit=51`, `page=abc` | 400 `INVALID_PAGINATION` en los tres | Estado, esquema de error, código, campo en `details` | Ninguna |
| TC-04 | `GET /orders` | Acceso sin autenticación | Sin encabezado `Authorization` | – | 401 `MISSING_CREDENTIALS` | Estado, esquema de error, código, `WWW-Authenticate: Bearer` | Ninguna |
| TC-05 | `GET /orders` | Aceptar tokens inválidos | Token inexistente | `Bearer token-que-no-existe` | 401 `INVALID_CREDENTIALS` | Estado, esquema de error, código | Ninguna |
| TC-06 | `GET /orders/{id}` | Acceso a recurso ajeno (IDOR) | Ana autenticada; `ord-006` es de Luis | `luis1` | 403 `FORBIDDEN` sin datos del pedido | Estado, esquema, código, el cuerpo no contiene el ítem de Luis | Ninguna |
| TC-07 | `GET /orders/{id}` | Recurso inexistente tratado como éxito o error 500 | Ana autenticada | `ord-999` | 404 `NOT_FOUND` | Estado, esquema, código | Ninguna |
| TC-08 | `POST /orders` + `GET /orders/{id}` + `GET /orders` | Creación que no persiste o con datos alterados | SETUP; total de Ana = 5 | `{item:"Atlas escolar", quantity:3}` | 201 con `Location`; el GET devuelve lo mismo; total = 6 | Esquema, estado inicial (`created`, `statusChanges=0`, `cancelledAt=null`), `Location`, persistencia, total | Se descarta al reiniciar con SETUP |
| TC-09 | `POST /orders` | Datos inválidos aceptados o con efecto parcial | TC-08 ejecutado (total = 6) | `quantity=0`; `quantity:"3"` | 400 `VALIDATION_ERROR` con campo `quantity`; no se crea nada | Estado, esquema, código, `details`, total sigue en 6 | Ninguna |
| TC-10 | `POST /orders` | Campo obligatorio ausente o JSON roto | Igual que TC-09 | `{quantity:2}`; cuerpo `{` | (a) 400 `VALIDATION_ERROR` campo `item`; (b) 400 `INVALID_JSON` | Estado, esquema, código, `details` | Ninguna |
| TC-11 | `POST /orders` ×2 + `GET /orders` | Suponer que POST es idempotente | Total de Ana = 6 | Mismo cuerpo dos veces | Dos 201 con ids distintos; total = 8 | Esquema, ids distintos, **efecto final** (total) | Se descarta al reiniciar |
| TC-12 | `PUT /orders/{id}/cancellation` ×2 + `GET` | Repetición con efectos duplicados | `ord-001` en `created` | `ana1` | 200 ambas veces; estado final `cancelled`, `statusChanges=1`, `cancelledAt` sin cambios | Esquema, estado tras cada llamada, **efecto final** observado con GET independiente | Se descarta al reiniciar |
| TC-13 | `PUT /orders/{id}/cancellation` + `GET` | Modificar recurso ajeno | Ana autenticada; `ord-006` es de Luis | `luis1` | 403 `FORBIDDEN`; el pedido de Luis sigue `created` con `statusChanges=0` | Estado, esquema, código, **efecto nulo** verificado con el token de Luis | Ninguna |
| TC-14 | `PUT /orders/{id}/cancellation` | Cancelar un recurso inexistente | Ana autenticada | `ord-999` | 404 `NOT_FOUND` | Estado, esquema, código | Ninguna |

## Cobertura mínima

| Dimensión exigida | Casos |
| --- | --- |
| Solicitud válida con verificación posterior | TC-08, TC-12 |
| Datos inválidos y campos obligatorios | TC-09, TC-10 |
| Credenciales ausentes o inválidas | TC-04, TC-05 |
| Recurso ajeno | TC-06, TC-13 |
| Recurso inexistente | TC-07, TC-14 |
| Paginación | TC-01, TC-02, TC-03 |
| Idempotencia (efecto final) | TC-11 (POST no idempotente), TC-12 (PUT idempotente) |
| Esquemas de éxito y error | Todos los casos |

## Limitaciones declaradas

- La colección valida el **cuerpo** de las respuestas con JSON Schema (`jsonSchema`). No es una validación completa de OpenAPI: no comprueba parámetros de entrada, encabezados contra el contrato ni rutas no documentadas.
- Los casos comparten estado y se ejecutan **en orden**; ejecutarlos sueltos puede fallar.
- No hay pruebas de concurrencia (dos cancelaciones simultáneas) ni de carga.
- Los esquemas de la colección son una copia de los de `openapi.yaml`; si el contrato cambia hay que regenerar la colección (`npm run build:collection`).
