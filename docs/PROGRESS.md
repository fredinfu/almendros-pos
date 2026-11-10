# v1.2.0 — Venta diaria, pedidos y tarjetas de ventas — 2026-11-10

Venta diaria independiente de eventos; perfil de comunicación/cuentas cifrado local. Primera instalación propone perfil diario, WhatsApp público precargado, titular sugerido editable. Pedidos con cliente/teléfono/pickup/delivery, estados abiertos/empacados/entregados y pago separado. Entrega sin pago autorizada: stock sale al entregar o cobrar por primera vez; cobro posterior sin duplicación. Precios de pedido conservados. WhatsApp con vista previa y enlace, nunca envío automático. Vista Ventas en tarjetas, detalle modal, totales netos por evento/perfil; motivo y foto opcional en anulación.

IndexedDB v4 agrega orders sin reescritura. Backup formato 4 acepta 1–4, incluye clientes/pedidos/fotos; cuentas y perfil de comunicación fuera del backup en la bóveda local. Guía completa en [ORDERS.md](ORDERS.md).

Verificación de dominio: 71 pruebas unitarias/integración; incluye migración v3, rollback por stock, concurrencia entrega/cobro, reconciliación de entrega impaga, precios históricos, anulación y restauración. Sin datos de operación reales en pruebas.

Verificación de esta actualización: 60/60 pruebas unitarias, 14/14 escenarios de navegador, lint y build correctos. Incluye cifrado local persistente, separación por evento, exclusión del respaldo, descripciones de piezas y copia de una cuenta ficticia.

## Métodos privados por evento — 2026-11-07

Se retiran todas las cuentas precargadas. Configuración explícita por evento: efectivo siempre y BAC/Ficohsa/Atlántida/Kash opcionales con cuenta/usuario y titular obligatorios al habilitar. Primer ingreso sin eventos abre diálogo; permite continuar para restaurar respaldo. Se exige configurar antes de abrir evento o cobrar en él. Eventos existentes conservados. Bóveda separada IndexedDB AES-GCM con clave no exportable del dispositivo, IV aleatorio y eventId autenticado. No se incluye en JSON ni en Git ni se sincroniza: hay que reingresar cuentas en otro navegador. El cifrado en reposo no protege frente a alguien con acceso al navegador desbloqueado.

## Ajuste sencillo de mercadería y cuentas — 2026-11-07

Descripciones opcionales por pieza en carrito de mercadería (cantidad × packUnits, individual=1), sugerencias nativas desde ventas locales guardadas, historial y respaldo. Campo SaleItem.pieceDescriptions opcional: sin migración ni cambios de stock. BAC, Ficohsa, Atlántida y Kash muestran cuenta y copiar; Ficohsa/Atlántida conservan método interno Otro y nombre en referencia. Sin QR ni dependencias nuevas.

# Progreso — 2026-11-07

## v1.1.1 — Foto de pago, catálogo público y Pages

- Pago BAC/Kash/Otro admite tomar/adjuntar foto opcional, vista previa/quitar, compresión JPEG sin EXIF y consulta histórica. Persistencia atómica con el cobro y respaldo formato 3 (lee 1/2/3), límite de importación 200 MB. No se suben fotos a servidores.
- Generador local por allowlist desde el respaldo suministrado: 10 productos / 27 presentaciones. Costos, operaciones, stock, configuración e identificadores de instalación excluidos. El respaldo original y docs/PRD.md (prompt con costos internos) quedan fuera de Git.
- Semilla versionada e idempotente, sin reescribir instalaciones existentes. Datos locales independientes por navegador/perfil/origen; pestañas de igual origen comparten IndexedDB.
- Indicador offline verifica recursos reales en caché y sus hashes. Aviso de actualización con recarga explícita fuera de un cobro.
- Workflow Pages revisado: producción raíz y subruta, pruebas antes de publicar, hash routing/manifest/iconos relativos. Repositorio solicitado: fredinfu/almendros-pos. Despliegue manual mediante Actions.

Verificaciones locales: 60/60 pruebas Vitest; typecheck y ESLint correctos; build raíz y /almendros-pos/ correctos; 12/12 escenarios Playwright bajo la subruta. Se probaron foto/backup entre perfiles, primera instalación sin operaciones/stock, rutas lazy y operaciones offline, reapertura de página y actualización real del Service Worker conservando registros/precios propios. La regresión antigua usa un fixture aislado; las pruebas de despliegue usan el catálogo público generado.

Limitaciones: cámara e instalación Safari/iPadOS físico pendientes. El indicador de caché no garantiza que el sistema nunca elimine almacenamiento. Catálogo futuro no se impone a instalaciones ya iniciadas. Ver [guía de despliegue y migración entre dispositivos](DEPLOYMENT.md).

## Refinamiento UX y operación v1.1

Implementado sobre la aplicación existente, sin reiniciar IndexedDB ni reemplazar catálogo del operador:

- Venta rápida sin evento, ventas en borrador y precio/configuración mínima desde POS. Doble clic protegido e idempotencia del comando.
- Descuento del evento primero y General después, con asignaciones por artículo. Anulación devuelve a los orígenes reales.
- Stock desconocido con obligaciones pendientes, cero contado bloqueante y conciliación inicio/actual sin doble descuento. Conteos de cero persistidos; cierre exige resolver pendientes.
- Catálogo y POS agrupados por producto, tamaños/precios independientes, selección condicional y foco accesible, búsqueda entre categorías y filtros recordados.
- Creación atómica de producto/presentación contextual; nuevos cafés Molido, Grano opcional, códigos/costos opcionales. Corrección manual no destructiva de nombres Grano/Molido.
- CRUD directo de producto/presentación con confirmaciones; historial de movimientos, conteos o ventas impide borrado.
- Editar/anular gastos con motivo e historial, recálculo de caja sin alterar ingresos. Correcciones en cerrado requieren confirmación especial, conservan efectivo contado.
- Indicador de datos locales/sin sincronización, POS primero y guía operativa actualizada.

Modelo: IndexedDB v3 añade inventoryCounts sin alterar filas v2; Product.grindOptions opcional, Sale.eventId opcional, SaleItem con asignaciones/obligación/conciliación, EventExpense con voidedAt/correctionHistory. Respaldo formato 2 con importación del formato 1. La migración v2→v3 se probó comparando todos los registros editados. No se cambió la migración v2 publicada.

Verificación ejecutada: **55/55 pruebas Vitest**, **9/9 escenarios Playwright en Chrome**, typecheck y ESLint sin errores, compilación Angular de producción correcta. Escenarios incluyen venta rápida, precio inline, conteos, gastos, agrupación, snapshots Grano/Molido, regresión 30/18/4/8, respaldo/restauración y venta offline. Capturas móvil 390 px y tablet 1024 px revisadas; no representa prueba en iPad físico.

Entrega: código y build para C:\github\Coffee Shop; servidor localhost:4200 conservado activo. Copia de archivos fuente previos en la carpeta de trabajo (no es respaldo de IndexedDB). Sin publicación ni push. Antes de actualizar, usar Ajustes y respaldos → Descargar respaldo JSON.

Revisión del operador: presentaciones heredadas llamadas Grano/Molido, cantidades reales de bolsas/packs, precios ausentes y inventario pendiente. No se fusionan familias/saldos ni se inventan tamaños o costos. Ver [guía de operación y migración](UX_REFINEMENT.md).

## Registro de entregas anteriores — 2026-11-06

## Acciones CRUD directas

Verificación: build y lint correctos; 34/34 pruebas de negocio y 5/5 E2E (incluye cancelar/confirmar switch y borrado, y recarga sin reaparición del registro eliminado).

Switch de activación y botón Eliminar en cada fila del catálogo, con confirmación y cancelación sin cambios. Se elimina únicamente catálogo sin movimientos ni detalles de venta; la última presentación elimina también su producto. Las filas con historial solo pueden desactivarse. El adaptador persiste eliminaciones únicamente en productos/variantes dentro de la misma transacción. No se borran movimientos ni ventas.

## Actualización: catálogo sencillo y Blended One

Implementado: selección Grano/Molido con precio e inventario compartidos, incluso en una misma venta; formulario principal con presentación/precio; código y costo opcionales en detalles adicionales; filtro de inactivos. Blended One 250 g a L245 y descripción Geisha honey + Catimor natural. Migración v1→v2 conserva inventario y snapshots, desactiva 227 g sin borrarlo. Nuevos catálogos tienen 25 presentaciones.

Verificación de esta actualización: typecheck y lint correctos; **32/32 pruebas** unitarias/integración y **4/4 escenarios E2E** en Chrome (28.8 s). Build correcto, 943.27 kB iniciales. Pruebas añadidas para códigos vacíos, migración con stock y ventas previas, y venta mixta sin costos. Captura de catálogo simplificado revisada en 1024×768. Se aplica a C:\github\Coffee Shop conservando activo el servidor de desarrollo. Al recargar se ejecuta la migración local una sola vez; no se vacía IndexedDB. Resultados de la entrega anterior debajo.

## Implementado

- Angular 22, Material clásico, navegación, formularios, SCSS responsive.
- Dominio validado, repositorio transaccional Dexie v1, seeds idempotentes sin stock.
- Catálogo, variantes, existencias, transferencias, eventos, POS, pagos manuales.
- Muestras, mermas, gastos, anulaciones/reembolsos, conciliación/cierre.
- Reportes por evento, costos parciales, JSON validado y CSV protegido.
- Manifest y Service Worker, recursos locales y rutas hash.

## Verificación final

| Comprobación | Resultado |
|---|---|
| Typecheck (`tsc --noEmit -p tsconfig.app.json`) | Correcto |
| Lint (`eslint src tests`) | Correcto, sin errores |
| Vitest (`vitest run`) | 29/29 pruebas, 2 archivos |
| Build (`ng build`) | Correcto, sin advertencias de presupuesto |
| Playwright (`playwright test`) | 3/3 escenarios en Chrome; repetidos desde C:\github\Coffee Shop, 22.5 segundos |
| Dependencias (`npm install` con auditoría) | 0 vulnerabilidades |

Node 24.22.2 aislado; Angular Core 22.2.5, CLI 22.2.6. Bundle inicial final 942.41 kB, transferencia estimada 206.09 kB. Las pantallas funcionales usan lazy loading. Build final ejecutado satisfactoriamente desde C:\github\Coffee Shop.

Escenarios E2E: crear stock y evento, transferir 30 pods, vender 18, muestras 4, cierre con retorno 8, descargar/restaurar JSON; venta y recarga offline; creación de producto/variante y navegación tablet/móvil. Capturas revisadas de dashboard 1024×768, inventario móvil 390 px y checkout. Pruebas con bases y perfiles efímeros; sin datos ficticios en semillas reales.

## Incidencias resueltas

- Wrapper npm de PowerShell absorbía argumentos: usar npm.cmd y Node explícito.
- TS2589 en asignación de subclase Dexie con TypeScript 6: sustituida por factoría tipada.
- Sandbox bloqueaba sockets localhost y eliminación de cachés (EPERM): comprobaciones repetidas con aprobación nativa, sin deshabilitar sandbox.
- Eliminada dependencia vulnerable de minimatch mediante override acotado; lint comprobado.
- Reducido bundle separando imports UI del shell y limitando CSS a componentes Material utilizados.
- Transferencia limpia la selección tras éxito para impedir un segundo clic posterior a la confirmación.
- Restauración valida también el almacén de descuento de cada venta y saldos históricos agrupados por timestamp.

## Entrega y pendientes

Código, dependencias y build copiados a `C:\github\Coffee Shop`; 23,786 archivos copiados sin errores y hashes de archivos representativos verificados. Git local inicializado en rama main, sin commit ni remoto. No se publicó ni se hizo push. Workflow Pages preparado con activación manual. Última corrección visual: selector de evento tras recarga y enlace accesible para saltar al contenido.

No quedan errores conocidos que bloqueen el flujo MVP probado. Aceptación pendiente en **iPad/Safari físico**, instalación desde HTTPS real y simulación de campo con catálogo/costos reales. No se ejecutó el workflow en GitHub porque no se autorizó publicación ni se configuró remoto. Los módulos futuros están solamente en ROADMAP. Las limitaciones de almacenamiento local, tamaño de historial y eventos cerrados están en README.

Próximos pasos: abrir la carpeta entregada como proyecto de Codex; iniciar con start-local.cmd; revisar precios pendientes; cargar inventario real; ensayo del evento; autorizar publicación cuando corresponda.
