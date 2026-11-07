# Almendros POS — instrucciones de mantenimiento

Leer docs/PROGRESS.md, DATA_MODEL.md e INVENTORY_RULES.md antes de cambiar operaciones. El prompt original docs/PRD.md es privado (solo local, ignorado por Git); las reglas públicas están en estos documentos.

## Arquitectura y convenciones

Angular standalone + strict TypeScript + Signals + Reactive Forms + Material + SCSS. UI y docs funcionales en español; código en inglés. Separar componentes, templates y estilos. Sin Dexie en componentes: usar AppStore y servicios de dominio mediante DataRepository. No introducir backend ni módulos futuros.

UUID, ISO UTC, dinero HNL en centavos enteros. Preservar snapshots históricos. No borrar movimientos o ventas. Solo restauración confirmada reemplaza datos. No inferir precios, costos, unidades de paquetes ni recetas.

## Operaciones seguras

Venta rápida sin evento o con evento draft/open. Usar stock de evento y luego General; sin registro guardar obligación en SaleItem. Cero verificado bloquea. Conciliación inicio/actual y sus referencias son transaccionales. No insertar movimientos ficticios. Cierre bloquea pendientes. Gastos cerrados solo mediante corrección auditada explícita. Todo cambio de inventario ocurre dentro de transact. Evitar awaits externos en callbacks de IndexedDB. Validar stock dentro de la transacción. Mantener idempotencia de checkout y transferencias. No cambiar esquema v1 publicado: agregar migración y pruebas. v3 añade inventoryCounts sin modificar filas; no normalizar datos ambiguos ni reaplicar semillas. Respaldo formato 3 acepta 1/2/3, incluye fotos locales de pagos. No publicar respaldos, evidencias, costos internos ni docs/PRD.md. Generar catálogo exclusivamente con scripts/catalog-seed.mjs y revisar su allowlist. Semillas solo al inicializar settings.

## Comandos

Node 24.15+ (línea 24). `npm ci`, `npm start`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. En Windows con Node antiguo, `start-local.cmd` utiliza Node 24 desde npm sin cambiar instalación global. Ver README para comandos completos.

Vitest/fake-indexeddb prueban repositorios y reglas. Playwright usa perfiles aislados con Chrome instalado; CI instala Chromium. Nunca usar la base de operación para pruebas. Probar escenario 30/18/4/8, rollback, concurrencia, anulaciones, cierre y backup en cambios críticos. Build comprueba templates Angular.

## Entrega

Actualizar PROGRESS y decisiones cuando cambien reglas. Revisar interfaz tablet/móvil y offline tras cambios PWA. No publicar, push, borrar trabajo preexistente ni cambiar configuración global sin autorización. No declarar probado en iPad físico si solo se usó viewport emulado.
