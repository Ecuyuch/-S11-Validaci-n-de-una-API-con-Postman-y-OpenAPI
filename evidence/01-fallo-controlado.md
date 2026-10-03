# 01 · Incompatibilidad detectada

- Fecha: 2026-10-03T14:45:59.973Z
- Defecto inyectado: quantity_as_string
- Node v22.23.2 · Newman 6.2.2
- Solicitudes: 28 · Aserciones: 51 · **Fallidas: 8**
- Casos de la matriz ejecutados: 14 de 14

| Solicitud | Prueba | Mensaje |
| --- | --- | --- |
| TC-01 · Listar página intermedia y aislamiento entre usuarios | TC-01 · 200 y esquema de lista | expected data to satisfy schema but found following errors: 
data.data[0].quantity should be integer, data.data[1].quantity should be integer |
| TC-02 (a) · Última página parcial | TC-02a · última página con un solo elemento | expected data to satisfy schema but found following errors: 
data.data[0].quantity should be integer |
| TC-08 (a) · Crear pedido válido | TC-08a · 201 y esquema de pedido | expected data to satisfy schema but found following errors: 
data.quantity should be integer |
| TC-08 (b) · Consultar el pedido creado | TC-08b · el pedido persiste con los datos enviados | expected data to satisfy schema but found following errors: 
data.quantity should be integer |
| TC-11 (a) · Primer POST idéntico | TC-11a · 201 y esquema | expected data to satisfy schema but found following errors: 
data.quantity should be integer |
| TC-12 (a) · Primera cancelación | TC-12a · 200, esquema y estado cancelado | expected data to satisfy schema but found following errors: 
data.quantity should be integer |
| TC-12 (b) · Segunda cancelación (repetición) | TC-12b · repetir no cambia el recurso | expected '2026-10-03T14:45:59.446Z' to equal undefined |
| TC-12 (c) · Efecto final observable con GET | TC-12c · el estado final es el de una sola cancelación | expected data to satisfy schema but found following errors: 
data.quantity should be integer |
