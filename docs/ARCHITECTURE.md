# Arquitectura

Angular standalone, TypeScript estricto y templates estrictos. Componentes, HTML y SCSS separados. Angular Material actual con tema M2 café/crema, controles táctiles y rutas diferidas. No usa backend, autenticación ni servicios bancarios.

## Capas

```
features/           Pantallas y Reactive Forms
core/app.store.ts   Signals, estado de UI, coordinación y DI
domain/            Entidades Zod, reglas, servicios y contrato DataRepository
infrastructure/    Dexie, esquema IndexedDB y semillas
shared/            Imports Material y etiquetas españolas
```

`DataRepository` equivale a una unidad de trabajo: `transact` entrega un estado consistente y confirma solo si el comando termina. El adaptador Dexie bloquea todas las tablas en una transacción readwrite. Los callbacks son síncronos y no hacen llamadas HTTP ni esperan interacciones de usuario. La exclusión de IndexedDB protege pestañas concurrentes. Los componentes no importan Dexie.

El adaptador compara tablas para escribir únicamente las modificadas con bulkPut. Conserva los registros históricos. Las lecturas usan transacciones readonly y liveQuery mantiene las pantallas al día, incluso ante cambios en otra pestaña. La restauración es el único flujo que reemplaza tablas completas.

## Servicios

- CatalogService: productos y variantes, SKU único, control de inventario inmutable tras movimientos.
- InventoryService: entradas, ajustes, muestras, mermas y transferencias. No depende de POS.
- EventsService: preparación, apertura, gastos, conciliación y devolución atómica.
- SalesService: checkout, snapshots, pagos manuales, anulaciones y reembolsos.
- BackupService: validación profunda, exportación y reemplazo atómico.
- eventReport: proyecciones sin escritura, descuentos distribuidos y costos parciales explícitos.

Las ventas están separadas de los futuros pedidos. El comando checkout actual valida un evento abierto, pero inventario, dinero y persistencia no requieren una arquitectura centrada exclusivamente en eventos.

## Persistencia y migraciones

IndexedDB v2 en `infrastructure/indexeddb/database.ts`, conservando la definición v1. La migración v1→v2 corrige el catálogo de Blended One una sola vez, sin cambiar campos, identificadores ni historia. El formato de respaldo sigue en schemaVersion 1. Para futuras alteraciones estructurales, agregar otra versión, fixtures y evolución explícita del backup. No modificar versiones ya publicadas.

UUID interoperables con Guid de .NET, enteros HNL y timestamps ISO. El deviceInstallId identifica el conjunto local de datos y viaja con el respaldo; no es autenticación ni clave para sincronizar. En una futura sincronización se separará identidad del dispositivo receptor.

## Límites operativos

El MVP carga los registros completos en memoria y reconstruye saldos desde movimientos. Adecuado para ferias pequeñas; requiere índices de saldo/proyecciones incrementales y paginación para grandes historiales. No tiene certificación fiscal, comprobantes tributarios ni control multiusuario. Cada origen/navegador/perfil mantiene datos independientes.

El Service Worker almacena recursos estáticos locales. IndexedDB almacena los datos. Rutas hash evitan 404 en GitHub Pages. No hay fuentes, iconos ni recursos de red necesarios durante ventas offline. El icono POS es genérico y no pretende ser un logotipo oficial.


## Refinamiento operativo v1.1 — 2026-11-07

Esta sección sustituye las restricciones operativas anteriores donde entren en conflicto.

- Venta rápida sin evento (eventId ausente), y ventas en borrador o abierto; cerrado sigue bloqueado.
- Inventario verificado: asignación por artículo a evento primero y luego general, sin transferencias ficticias. Una venta puede tener varios movimientos por artículo. La reversa respeta los orígenes.
- Inventario sin registrar: ausencia de movimientos y conteos para la presentación. Se guarda una obligación en SaleItem, sin inventar existencias ni permitir saldos negativos. Un cero contado es conocido y bloquea.
- Conciliación en General: «inicio» descuenta pendientes una vez; «actual» registra lo físicamente disponible sin volver a descontar. IDs de conteo y artículos enlazados, verificación de pendientes obsoletos e idempotencia transaccional. Entradas normales se bloquean si hay pendientes. Cierre exige resolver pendientes del evento.
- Familias agrupadas en catálogo/POS; presentaciones mantienen precios y stock propios. Nuevos cafés usan Molido; Grano opcional. Opciones heredadas se conservan. Paquetes son unidades físicas independientes: no contar su contenido también como unidades sueltas.
- Gastos editables/anulables con historial. Corrección de evento cerrado requiere motivo y confirmación explícita; recalcula gastos/caja esperada y conserva el efectivo contado.

La tabla inventoryCounts participa en la misma transacción global del repositorio. La UI sigue usando AppStore y servicios de dominio; no accede directamente a Dexie. El selector POS usa focus trap CDK y Escape, conservando Angular Material.
