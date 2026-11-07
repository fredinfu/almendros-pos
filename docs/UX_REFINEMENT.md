# Guía operativa v1.1

## Antes de actualizar

En el mismo navegador, perfil y dirección donde operas (por ejemplo http://localhost:4200), entra en **Ajustes y respaldos → Descargar respaldo JSON**. Verifica que el archivo exista y guárdalo fuera de la carpeta del proyecto. No borres datos del navegador ni cambies localhost por 127.0.0.1: son almacenamientos distintos.

La actualización v2→v3 solo crea una tabla vacía para conteos. No cambia productos, nombres, precios, stock, opciones, ventas ni gastos. La app no borra IndexedDB y las semillas solo corren cuando no existe configuración. El formato nuevo de respaldo es 2 y restaura también formato 1. No usar una versión antigua de la app para restaurar formato 2.

## Vender

1. Elige **Venta rápida · Sin evento** en el encabezado, o tu evento en borrador/abierto. Un cerrado no admite nuevas ventas.
2. Toca un producto. Si solo tiene una presentación/preparación, se agrega directamente; si hay varias, selecciona tamaño/pack y preparación.
3. Si falta precio, introdúcelo en la ventana y continúa. Se guarda en la presentación existente. Si no hay presentación, se crea una con formato contextual sin duplicar el producto.
4. Revisa cantidad, precio, total y pago. Costos y códigos comerciales son opcionales.

Con inventario desconocido puedes cobrar y se muestra «Inventario pendiente de conciliar». No se inventan unidades. Si hay stock registrado, se descuenta primero el asignado al evento y luego General. Un saldo conocido insuficiente se bloquea; no hay override ni negativos.

## Registrar / conciliar stock

En Inventario selecciona la presentación y **Unidades contadas** (cero es válido). El conteo corresponde al **Almacén General**, sin incluir existencias asignadas a eventos.

- **Stock al inicio del período de ventas**: por ejemplo tenías 8 bolsas antes de vender 2; entra 8, se resuelven esas 2 ventas y quedan 6. Solo se permite antes de registrar stock.
- **Stock físico actualmente disponible**: si ahora cuentas 8 bolsas después de haber vendido 2, entra 8; las ventas anteriores se concilian sin descontar otras 2. Quedan 8.

La confirmación explica la diferencia. Si otras ventas cambiaron la lista de pendientes, revisa de nuevo. Un mismo ID de conteo no se aplica dos veces. Reposiciones normales se usan después de resolver pendientes. El cierre del evento exige inventario y reembolsos pendientes resueltos.

## Catálogo

Una fila por familia; las presentaciones se expanden debajo. Puedes activar/desactivar o eliminar productos y presentaciones con confirmación. Los registros con movimientos, conteos o ventas no se eliminan: desactívalos.

Nuevo café requiere nombre, marca/tipo y precio para vender; Molido viene habilitado. Grano es opcional y comparte stock/precio. Tamaños diferentes tienen precios independientes. Bebidas usan Vaso, pods/mercadería Individual; café simple usa Única internamente y oculta ese nombre cuando no ayuda.

Los packs se agregan deliberadamente con nombre, cantidad real y precio propio. Una venta de 1 pack descuenta 1 pack físico, no sus unidades individuales. No registres como sueltas las unidades ya empaquetadas. No hay ensamblado automático.

**Revisión manual:** si una presentación antigua se llama Grano/Molido, usa «Revisar presentación» para escribir el tamaño real o Única. No se asume 227/250 g, no se mezclan balances y no se cambia el precio. Si existen dos familias realmente duplicadas, desactiva la que no corresponda tras revisar su historial; no hay fusión automática. «Bolsa mediana/grande» requiere introducir la cantidad real del paquete.

## Gastos

Editar pide motivo y conserva valores anteriores. Anular pide motivo/confirmación y conserva la fila; deja de contribuir a gastos y caja. En un cerrado se confirma expresamente la corrección del resultado final. El efectivo contado permanece intacto y puede aparecer una diferencia nueva de caja. El historial de correcciones se expande en cada gasto.

## Prueba manual sugerida (en perfil de prueba)

- Crea café simple sin código/costo, precio L99; vende sin evento y confirma una sola venta al doble clic.
- Concilia inicio 8 tras vender 2: saldo 6. En otro producto repite con conteo actual 8: saldo 8.
- Registra conteo cero y comprueba bloqueo. Reposición 1 permite vender 1.
- Crea borrador, vende desde General sin transferencia y revisa reporte. Con stock asignado, comprueba consumo de evento antes de General.
- Abre Washed Blend: una tarjeta y cuatro tamaños/precios. Habilita Grano y verifica snapshot en historial.
- Edita/anula un gasto en efectivo y comprueba caja/ingresos. En cerrado verifica confirmación extra.
- Exporta/restaura un respaldo solo en el perfil de prueba; comprueba pendientes y conteos. Prueba recarga sin red y layouts de 390/1024 px.

## Límites

Datos locales por navegador/perfil/origen, sin sincronización. Grano/Molido comparten stock; las asignaciones por ubicación y snapshots dejan separada la preparación para evolución futura, sin implementar inventario por molienda ahora. No se infieren tamaños ni contenido de bolsas, no se fusionan familias, no hay ensamblado de packs. La aceptación en iPad/Safari físico sigue pendiente; viewports emulados no la sustituyen.
