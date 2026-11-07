# Reglas de inventario y caja

## Refinamiento operativo v1.1 — 2026-11-07

Esta sección sustituye las restricciones operativas anteriores donde entren en conflicto.

- Venta rápida sin evento (eventId ausente), y ventas en borrador o abierto; cerrado sigue bloqueado.
- Inventario verificado: asignación por artículo a evento primero y luego general, sin transferencias ficticias. Una venta puede tener varios movimientos por artículo. La reversa respeta los orígenes.
- Inventario sin registrar: ausencia de movimientos y conteos para la presentación. Se guarda una obligación en SaleItem, sin inventar existencias ni permitir saldos negativos. Un cero contado es conocido y bloquea.
- Conciliación en General: «inicio» descuenta pendientes una vez; «actual» registra lo físicamente disponible sin volver a descontar. IDs de conteo y artículos enlazados, verificación de pendientes obsoletos e idempotencia transaccional. Entradas normales se bloquean si hay pendientes. Cierre exige resolver pendientes del evento.
- Familias agrupadas en catálogo/POS; presentaciones mantienen precios y stock propios. Nuevos cafés usan Molido; Grano opcional. Opciones heredadas se conservan. Paquetes son unidades físicas independientes: no contar su contenido también como unidades sueltas.
- Gastos editables/anulables con historial. Corrección de evento cerrado requiere motivo y confirmación explícita; recalcula gastos/caja esperada y conserva el efectivo contado.


Grano y Molido comparten existencias y precio por presentación. Se registran como opciones separadas de los detalles de venta; al vender una unidad de cada opción se descuentan dos unidades del mismo saldo. Tamaños diferentes conservan variantes y precios propios. Código comercial y costo son opcionales; el costo ausente no se interpreta como cero ni bloquea ventas.

1. Todo stock registrado entra primero al Almacén General. El catálogo nuevo comienza sin registro de stock.
2. Una transferencia tiene origen y destino en un único movimiento; no hay decrementos independientes.
3. Cantidades enteras positivas. Salidas nunca mayores que el saldo dentro de la misma transacción.
4. El inventario inicial se registra una sola vez por variante. Entradas posteriores son reposiciones.
5. Muestras, mermas y ajustes requieren motivo. No generan ingresos.
6. Los paquetes son SKU independientes: preparar un paquete no consume unidades individuales automáticamente. Registrar existencias reales por SKU. No contar simultáneamente unidades ya empaquetadas como sueltas.
7. Coffee Pods mediano/grande requieren packUnits real y precio total explícito; las referencias por pod no son precios vendibles de paquetes.
8. Bebidas comienzan sin control de inventario. No consumen bolsas ni gramos, leche o vasos. No se implementan recetas.
9. Checkout guarda venta, artículos, pago y movimientos conjuntamente. Stock vuelve a validarse al confirmar. Un precio cambiado obliga a volver a agregar el producto.
10. El id UUID de checkout es la clave idempotente; se conserva durante reintentos. Cada transferencia y entrada también usa un UUID. La UI bloquea dobles acciones mientras persiste; el servicio evita duplicar la misma clave.
11. Descuentos en centavos se distribuyen entre líneas con aritmética BigInt y resto acumulado. La suma de las líneas coincide exactamente con el total.
12. Solo efectivo admite cambio. BAC/Kash son registros manuales, sin verificación bancaria. MVP: un método por venta.
13. Anular conserva la venta, sus artículos y su pago, marca fecha/motivo y crea reversas por los orígenes descontados; las obligaciones pendientes se cancelan sin crear stock. Un reembolso pendiente es una obligación separada; no se presenta como devolución realizada.
14. Un evento cerrado no admite entradas, transferencias, ventas, anulaciones ni reembolsos nuevos. Resolver reembolsos pendientes antes del cierre. No hay reapertura en MVP.
15. Cierre: conteo real → ajustes con motivo → devoluciones → estado cerrado, todo atómico. Un cambio de stock durante el conteo invalida la vista previa. No hay confirmación implícita.
16. Caja esperada = efectivo inicial + ventas netas en efectivo + devoluciones pendientes en efectivo − gastos pagados desde caja. Al cierre se exige resolver devoluciones pendientes. Un gasto con método efectivo se entiende pagado desde la caja del evento.
17. Costos desconocidos no equivalen a cero: reportar resultado parcial y unidades sin costo, nunca utilidad exacta.

## Prueba de referencia

30 pods en general → transferir 30 → vender 18 → muestras 4 → contar 8 → cerrar.

Resultado: general 8, evento 0, 18 unidades vendidas, 4 muestras, movimientos conservados. La prueba vive en `tests/business.test.ts` y también se recorre mediante Playwright. Nunca cargar sus datos en el perfil real de operación.
