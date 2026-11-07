## Métodos privados por evento — 2026-11-07

Se retiran todas las cuentas precargadas. Configuración explícita por evento: efectivo siempre y BAC/Ficohsa/Atlántida/Kash opcionales con cuenta/usuario y titular obligatorios al habilitar. Primer ingreso sin eventos abre diálogo; permite continuar para restaurar respaldo. Se exige configurar antes de abrir evento o cobrar en él. Eventos existentes conservados. Bóveda separada IndexedDB AES-GCM con clave no exportable del dispositivo, IV aleatorio y eventId autenticado. No se incluye en JSON ni en Git ni se sincroniza: hay que reingresar cuentas en otro navegador. El cifrado en reposo no protege frente a alguien con acceso al navegador desbloqueado.

## Ajuste sencillo de mercadería y cuentas — 2026-11-07

Descripciones opcionales por pieza en carrito de mercadería (cantidad × packUnits, individual=1), sugerencias nativas desde ventas locales guardadas, historial y respaldo. Campo SaleItem.pieceDescriptions opcional: sin migración ni cambios de stock. BAC, Ficohsa, Atlántida y Kash muestran cuenta y copiar; Ficohsa/Atlántida conservan método interno Otro y nombre en referencia. Sin QR ni dependencias nuevas.

## v1.1.1 — Publicación estática y evidencia de pago

- Una foto opcional por pago electrónico, comprimida y sin EXIF/nombre original; persistencia atómica en Payment.evidence. No se añade backend, subida remota ni verificación bancaria.
- Generador local por allowlist: el respaldo privado queda fuera de Git. El prompt original con costos históricos también se excluye. La semilla pública preserva datos de catálogo aportados, sin stock ni costos.
- Prefetch de todos los recursos necesarios. El indicador offline comprueba hashes de recursos realmente almacenados en Cache Storage; no equivale a conectividad ni sincronización.
- Publicación manual vía Actions y pruebas de producción tanto en raíz como en la subruta de Pages. Actualizar código no reejecuta semillas ni borra IndexedDB.

# Decisiones

## Refinamiento operativo v1.1 — 2026-11-07

Esta sección sustituye las restricciones operativas anteriores donde entren en conflicto.

- Venta rápida sin evento (eventId ausente), y ventas en borrador o abierto; cerrado sigue bloqueado.
- Inventario verificado: asignación por artículo a evento primero y luego general, sin transferencias ficticias. Una venta puede tener varios movimientos por artículo. La reversa respeta los orígenes.
- Inventario sin registrar: ausencia de movimientos y conteos para la presentación. Se guarda una obligación en SaleItem, sin inventar existencias ni permitir saldos negativos. Un cero contado es conocido y bloquea.
- Conciliación en General: «inicio» descuenta pendientes una vez; «actual» registra lo físicamente disponible sin volver a descontar. IDs de conteo y artículos enlazados, verificación de pendientes obsoletos e idempotencia transaccional. Entradas normales se bloquean si hay pendientes. Cierre exige resolver pendientes del evento.
- Familias agrupadas en catálogo/POS; presentaciones mantienen precios y stock propios. Nuevos cafés usan Molido; Grano opcional. Opciones heredadas se conservan. Paquetes son unidades físicas independientes: no contar su contenido también como unidades sueltas.
- Gastos editables/anulables con historial. Corrección de evento cerrado requiere motivo y confirmación explícita; recalcula gastos/caja esperada y conserva el efectivo contado.

- v3 es aditiva. No se infieren tamaños, precios o cantidades de packs ni se fusionan nombres similares.
- No se crean eventos ficticios: ausencia de asociación identifica Venta rápida; reportes y ventas admiten ese contexto.
- Stock desconocido se determina por presentación globalmente, para no interpretar como desconocido el saldo agotado de otra ubicación. Si ya existe historial en otra ubicación, la falta de saldo utilizable bloquea.
- Conciliación al inicio solo antes de cualquier registro de stock; conteo actual es del Almacén General, excluye lo asignado físicamente a eventos. Se conserva el conteo explícito de cero.
- Gastos cerrados usan corrección auditada, sin reabrir evento. El reporte representa valores corregidos; el conteo final histórico permanece igual.
- Pruebas v1/v2 y v2/v3 aisladas, jamás bases del usuario. No se cambia framework, no hay sincronización ni módulos nuevos.


- Simplificación solicitada: Grano/Molido en el carrito, tamaños como presentaciones, código y costo en opciones adicionales. Referencias AUTO internas cuando no se define código. Catálogo muestra activos por defecto y permite consultar inactivos.
- Blended One: café de especialidad blend de Geisha honey y Catimor natural, una presentación activa de 250 g a L245, costo pendiente. Migración IndexedDB v2 conserva IDs, saldos y snapshots; la presentación antigua de 227 g se desactiva sin fusionar inventario. Nuevas instalaciones crean solo 250 g. Restaurar un respaldo antiguo mantiene explícitamente el catálogo de ese respaldo; no reaplica una migración ya ejecutada.

- Se limita el tema CSS a componentes Material utilizados y se separan etiquetas del módulo de imports UI: paquete inicial reducido de 1.26 MB a aproximadamente 942 kB (206 kB de transferencia estimada).
- Override acotado de minimatch a 11.0.1+ dentro de typescript-estree para corregir GHSA-g3hv-75wg-m249; npm audit pasó a cero vulnerabilidades. Validar lint tras futuras actualizaciones y retirar el override cuando la dependencia lo incorpore.

- 2026-11-06: Angular Core 22.2.5 / CLI 22.2.6 disponibles en npm, TypeScript 6 y Node 24.22.2 para comprobaciones. Node global 22.15.0 no es compatible; se utilizó runtime aislado, sin modificación global. Compatibilidad: https://angular.dev/reference/versions.
- Se usa una factoría que devuelve Dexie en vez de heredar de Dexie: TypeScript 6 evaluaba recursivamente TXWithTables al asignar una subclase y producía TS2589. El contrato de repositorio sigue tipado.
- Tema Material M2 con componentes Material actuales. Tipografía de sistema y assets locales. No había logos oficiales en el workspace; icono genérico POS.
- Dinero integer seguro, entradas decimales convertidas por texto; no usar parseFloat para dinero. Presentación con Intl, redondeo del ticket promedio solo para visualización.
- SKU independientes para paquetes, preservando 227 g, 250 g, ½ lb y 500 g. Cantidad real de pods por paquete queda por configurar.
- Precios históricos y costo unitario al vender; costos faltantes quedan ausentes. Las referencias históricas de empaque/tueste se documentan en PRD, sin cálculo automático.
- Molienda como opción del artículo vendido, compartiendo inventario de su presentación.
- No se añaden ventas demo ni eventos demo al iniciar. Semillas transaccionales idempotentes identificadas por existencia de configuración.
- Cierre irreversible en MVP. Ajustes físicos motivados y devolución atómica. Anulaciones solo con evento abierto y reembolsos resueltos antes del cierre.
- Restauración completa con vista previa, texto REEMPLAZAR y confirmación del navegador. Rechazo de versiones desconocidas y referencias inválidas; sin merge automático.
- Datos por dispositivo; no se prometen almacenamiento permanente ni sincronización. Respaldo descargable con recordatorio y al cierre.
- GitHub Pages con hash routing y base href configurable. Workflow manual de despliegue: no publica automáticamente al desarrollar.
- Pruebas sobre bases UUID aisladas y perfiles efímeros de navegador. Un iPad físico sigue necesitando aceptación de campo.
