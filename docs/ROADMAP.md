# Evolución futura — fuera del MVP

## Pedidos y clientes

Order independiente de Sale. Cliente, teléfono, productos, presentación, molienda, descuentos, envío, pagos, método/dirección de entrega, fechas previstas/reales. Estados preliminares pending, confirmed, preparing, ready, shipped, delivered y cancelled. Revisar reglas antes de fijarlos. Entrada manual desde WhatsApp primero; ninguna integración implementada.

## Logística

Entrega local, puntos de encuentro, retiro, envíos nacionales, proveedores logísticos, costos, tracking y responsables. Distinguir cobro, entrega y reconocimiento de venta.

## Recetas y costos

Recipe, RecipeIngredient, IngredientStock y CoffeeBatch. Unidades normalizadas, conversiones explícitas y consumos por receta; no inferir gramos por bebida. Costos por componentes: empaque, etiqueta, arte, tueste, pérdida de masa, mano de obra. Referencias del PRD son históricas, no valores vigentes garantizados. Programas de descuentos y fidelización posteriores.

## Trazabilidad de finca

Farm → Harvest → CoffeeLot → Variety → ProcessingBatch → Fermentation → RoastingBatch → PackagedBatch → LotInventory → Shipment. Relación entre artículo vendido y lote mediante asignaciones explícitas, sin reescribir historial.

## Backend ASP.NET Core / SQLite

API REST con EF Core, validación equivalente a contratos de dominio, UUID/Guid, importador de backups versionados, autenticación y autorización. Repositorios remotos sustituyen adaptadores mediante DI.

Sincronización offline-first requerirá outbox/inbox, claves idempotentes, versión de entidades, marca de eliminación, servidor autoritativo para inventario y política de conflictos. No sumar respaldos como método de sincronización. Definir reservas y límites offline por dispositivo antes de permitir ventas concurrentes sobre stock compartido. Migrar fixtures JSON de manera reversible y auditada.

## Mejoras siguientes del MVP

Paginación e índices de saldos para historiales grandes, comprobantes imprimibles no fiscales, políticas formales de corrección después del cierre, conteos por lotes, precios específicos por evento y automatización asistida de respaldos. Solo después de prueba real en feria y decisiones del propietario.
