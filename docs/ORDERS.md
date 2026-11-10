# Venta diaria, pedidos y WhatsApp

## Operación

El selector del encabezado incluye **Venta diaria / ambulatoria**. No crea un evento ni un almacén adicional: utiliza General. Conserva las ventas anteriores sin evento en este perfil. Los eventos existentes siguen funcionando.

En una instalación sin eventos ni perfil diario, se solicita configurar el negocio, WhatsApp, lugar de pickup, indicaciones y métodos de pago. También se accede desde POS → Configurar perfil y métodos o desde Eventos. Los datos de cuentas no vienen precargados. El primer titular se sugiere en las demás cuentas; una edición manual conserva el titular distinto.

Para un pedido: agrega productos al carrito → Crear pedido para seguimiento → nombre, teléfono, pickup/delivery y dirección → Guardar pedido abierto. Los teléfonos de ocho dígitos se interpretan como Honduras; para otros países indica el código internacional. Delivery exige dirección. Los precios y descripciones del pedido quedan fijados al crearlo; para cambiar sus productos, cancélalo y crea otro.

En **Pedidos** se gestionan Abierto, Empacado y Entregado; el pago es independiente. Se puede cobrar antes o después de entregar. Los entregados sin pago permanecen pendientes; los entregados y pagados pasan a terminados. El filtro permite consultar terminados y cancelados. Se pueden corregir los datos de contacto y entrega.

Un pedido abierto o empacado sin pago no reserva existencias. Al cobrar o entregar, lo que ocurra primero, se valida y descuenta el inventario una sola vez. Cobrar una entrega pendiente no vuelve a descontarlo. Si faltan existencias verificadas, se rechaza toda la operación. El stock desconocido utiliza la misma conciliación pendiente del POS. Un evento con pedidos por entregar o cobrar no puede cerrarse.

**Preparar WhatsApp** muestra una vista previa con productos, total, entrega, estado de pago, cuentas habilitadas y contactos públicos. **Abrir WhatsApp del cliente** abre el chat con el texto preparado; el operador decide enviarlo en WhatsApp/WhatsApp Business. También puede copiarse. No se envía automáticamente ni se confirma la recepción. En equipos con ambas aplicaciones instaladas, la aplicación que abre el enlace depende del dispositivo. Formato basado en [la documentación de WhatsApp](https://faq.whatsapp.com/5913398998672934).

## Ventas y anulaciones

Ventas muestra tarjetas con productos, cantidades, estado y total; al pie muestra los totales netos del perfil/evento, excluyendo anulaciones y pedidos sin pagar. El detalle se abre en una ventana con foco y desplazamiento propios. El recibo largo queda dentro de un desplegable.

Anular requiere motivo y admite una foto opcional, comprimida localmente como la evidencia del pago. Si los productos ya se descontaron, anular implica devolverlos físicamente y reponer el inventario al origen; confirma esa devolución antes de usar la acción. Una venta vinculada a un pedido cancela también ese pedido. Una entrega impaga no genera un reembolso ficticio; una venta pagada conserva la opción de reembolso pendiente/realizado.

## Datos y compatibilidad

IndexedDB v4 agrega la tabla `orders`; no reescribe filas anteriores. Respaldo formato 4 acepta formatos 1–4 y contiene pedidos, clientes, ventas y fotos. Mantén los respaldos privados: ahora también contienen información de clientes. Las cuentas y el perfil de comunicación continúan en la bóveda cifrada de este navegador, fuera del respaldo operativo; reingrésalos en otro dispositivo.

Para reutilizar el libro de inventario, una entrega aún no cobrada crea internamente una venta `pending`, sin pago, ligada al pedido. No se incluye en ingresos, caja ni tarjetas de ventas cobradas. El cobro posterior registra un único pago y cambia a `completed`, preservando todos los movimientos. `paidAt` distingue el momento del cobro de la salida original. Las referencias, importes y transiciones se validan también al restaurar.

La aplicación y los pedidos funcionan sin conexión una vez disponible la caché. Abrir/enviar WhatsApp requiere el servicio externo y conectividad; no hay sincronización de pedidos entre dispositivos.
