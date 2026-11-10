## Actualización 1.2.0

Venta diaria / ambulatoria, tablero de pedidos con entrega y pago independientes, WhatsApp preparado, tarjetas de ventas y foto de anulación. Consulta [la guía de pedidos](docs/ORDERS.md). Descargar respaldo antes de actualizar; el respaldo nuevo (formato 4) incluye clientes y pedidos, pero no cuentas bancarias locales.

> **v1.1.1 — Fotos de transferencia y GitHub Pages.** Consulta [publicación, instalación en iPad, datos locales y pruebas offline](docs/DEPLOYMENT.md). El catálogo público contiene 10 productos / 27 presentaciones; las instalaciones existentes mantienen su catálogo local. Las fotos de pago se guardan localmente y en el respaldo privado, nunca en GitHub.

> Actualización v1.1: venta rápida sin evento, inventario pendiente de conciliación, catálogo agrupado y corrección de gastos. Antes de actualizar, descarga un JSON en Ajustes y respaldos. Consulta [guía de uso, migración y pruebas](docs/UX_REFINEMENT.md). Las instrucciones antiguas que exigen evento abierto/inventario previo ya no aplican a las ventas rápidas.

# Almendros POS

PWA local para inventario y ventas de Almendros Coffee Co. y AFTER Coffee durante ferias. Angular 22, Material, Signals, Reactive Forms, Dexie/IndexedDB y Zod. Interfaz en español, HNL en centavos y fechas en America/Tegucigalpa.

## Ejecutar en Windows

Proyecto entregado en `C:\github\Coffee Shop`.

Con Node **24.15 o posterior de la línea 24**:

```powershell
cd 'C:\github\Coffee Shop'
npm.cmd ci
npm.cmd start
```

Abrir `http://localhost:4200`. No abrir index.html como archivo.

En el equipo de desarrollo se detectó Node global 22.15.0, incompatible con Angular 22. Sin cambiarlo globalmente, ejecutar:

```powershell
cd 'C:\github\Coffee Shop'
.\start-local.cmd
```

El lanzador usa Node 24 desde la caché de npm; requiere internet si todavía no está descargado. Si faltan dependencias, instalar Node 24 o ejecutar la instalación con ese runtime. No usar `--legacy-peer-deps` ni ignorar los requisitos de motores. La primera instalación de esta sesión produjo avisos EBADENGINE por el wrapper de npm; las comprobaciones finales se ejecutaron con Node 24.22.2 explícito.

## Primer uso

1. **Productos:** revisar catálogo. Configurar precios faltantes, costos si se conocen y unidades reales de paquetes de pods. Crear productos y variantes según necesidad.
2. **Inventario:** elegir Almacén General y registrar existencias reales con motivo. El inventario inicial es cero.
3. **Eventos:** crear borrador, transferir unidades desde general y abrir el evento.
4. **Punto de venta:** tocar presentaciones, ajustar cantidad/molienda, aplicar descuento, cobrar y confirmar. BAC/Kash son registros manuales.
5. Registrar muestras/mermas en Inventario y gastos desde Eventos.
6. Consultar ventas y, si corresponde, anular con motivo y estado del reembolso.
7. Al terminar, preparar cierre, contar existencias, explicar diferencias, resolver reembolsos pendientes y confirmar devolución.
8. Descargar un respaldo JSON y guardarlo fuera del dispositivo.

El selector del encabezado determina el evento de POS, reportes y operaciones. Cambiar de evento vacía el carrito. Los eventos cerrados no se reabren ni admiten anulaciones.

## Funcionalidades

| Área       | Incluido                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Catálogo   | 2 marcas, 5 categorías, 12 productos y 25 presentaciones iniciales editables; activación; código y costo opcionales             |
| Inventario | Almacén general, ubicaciones por evento, entradas, ajustes, transferencias atómicas, muestras, mermas e historial            |
| Eventos    | Borrador/apertura/cierre, gastos, conteo físico, diferencias y devolución                                                    |
| POS        | Carrito táctil, cantidades, molienda, descuentos exactos, pago único cash/BAC/Kash/otro, cambio, snapshots e idempotencia    |
| Historial  | Filtros por evento/estado, detalle, anulaciones con reversa y seguimiento de reembolso                                       |
| Reportes   | Bruto/neto/descuentos, transacciones, ticket, unidades, marca/producto/categoría/método, gastos, stock y costos parciales    |
| Datos      | JSON completo con vista previa y restauración confirmada; CSV de ventas, detalles, inventario, movimientos, gastos y reporte |
| PWA        | Manifest, Service Worker, recursos locales y ventas offline después de preparar la aplicación                                |

## Estructura

```text
src/app/core/                    Estado reactivo, coordinación y DI
src/app/domain/                  Modelos, validación, reglas y servicios
src/app/infrastructure/          IndexedDB, repositorio y semillas
src/app/features/               dashboard, catalog, inventory, events,
                                pos, sales, reports, backups
src/app/shared/                  Componentes Material y etiquetas
public/                         Manifest e iconos locales
tests/                          Unitarias/integración y E2E
docs/                           Modelo, arquitectura, reglas y progreso
.github/workflows/              Calidad y publicación manual en Pages
```

## Calidad

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

`npm run check` agrupa typecheck, lint, Vitest y build. El build valida los templates Angular. E2E usa Chrome instalado en Windows, perfiles aislados y un servidor efímero en puerto 4173. En CI se instala Chromium. Tests nunca usan el perfil de ventas real.

Cobertura funcional: semillas idempotentes, SKU, inventario, concurrencia entre conexiones, rollback, pagos, descuentos, snapshots, bebidas sin receta, anulaciones, caja, cierre y respaldos. El caso 30 pods → 18 vendidos + 4 muestras → 8 devueltos se prueba en servicios y navegador. Playwright también verifica venta y recarga offline, creación de producto/variante y vista tablet/móvil.

Los resultados concretos y limitaciones de la última ejecución están en [PROGRESS](docs/PROGRESS.md).

## Probar desde iPad o la misma red

```powershell
npm.cmd start -- --host 0.0.0.0
# Alternativa con Node local:
.\start-local.cmd --host 0.0.0.0
```

Consultar la IP privada del PC con `ipconfig`. En el iPad, conectado a la misma Wi-Fi, abrir `http://IP-DEL-PC:4200`. Permitir Node/puerto 4200 únicamente en red privada en Firewall de Windows si el sistema lo solicita. No se modificó el firewall automáticamente. `localhost` en el iPad es el propio iPad, no el PC.

HTTP por IP local sirve para revisar interfaz y persistencia de desarrollo; no habilita Service Worker/PWA. Para el uso offline real se requiere HTTPS con certificado confiable, por ejemplo GitHub Pages, o un servidor HTTPS local correctamente configurado. El fallback UUID de desarrollo usa crypto.getRandomValues y no elimina la exigencia de HTTPS para PWA.

En Safari con la dirección HTTPS: Compartir → Agregar a pantalla de inicio → abrir el icono → esperar la preparación → revisar Ajustes y respaldos → probar modo avión. Cargar todas las pantallas la primera vez y comprobar recarga, venta, historial y respaldo antes del evento. La prueba automática de viewport no sustituye una prueba en iPad físico.

## Producción local y offline

```powershell
npm.cmd run build
npm.cmd run preview
```

Abrir `http://localhost:4173`. localhost es una excepción de contexto seguro para probar Service Worker en el propio PC. Esperar la instalación, recargar y activar Offline en DevTools. Verificar una venta y recarga sin conexión usando un perfil de prueba. [Guía oficial de Angular PWA](https://angular.dev/ecosystem/service-workers/getting-started).

La aplicación no necesita servicios de red para vender una vez preparada. Los assets se almacenan en Service Worker; las ventas e inventario están en IndexedDB. No borrar datos del sitio para solucionar una actualización sin exportar primero un respaldo.

## GitHub Pages — listo, sin publicar

No se creó un repositorio remoto, no se hizo push ni se publicó la aplicación.

Cuando el propietario autorice publicar:

1. Crear repositorio y subir el código fuente (excluir node_modules, dist y datos de prueba).
2. En Settings → Pages, seleccionar **GitHub Actions**.
3. Ejecutar manualmente el workflow **Publicar en GitHub Pages** desde la rama deseada.
4. El workflow valida, prueba E2E, calcula base_path con configure-pages, compila para esa ruta y despliega el artefacto estático.
5. Abrir la URL HTTPS emitida por GitHub y probar la PWA.

Las rutas hash permiten recarga directa (`/#/inventory`) sin rewrites. Para build manual de un repositorio `almendros-pos`: `npm run build -- --base-href /almendros-pos/`. Para dominio propio o repositorio de usuario, base `/`. [Workflows oficiales de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Cambiar de dominio/origen crea otro almacenamiento local. Exportar antes y restaurar después. GitHub Pages solo aloja archivos y **no sincroniza datos entre dispositivos**.

## Limitaciones y próximos pasos

- Datos locales sujetos a borrado por usuario/sistema. Respaldos externos obligatorios; persistencia del navegador no es garantía.
- No hay backend, login, sincronización, pedidos WhatsApp, recetas, trazabilidad ni integración bancaria.
- No hay facturación fiscal ni pagos divididos. Utilidad solo estimada, y parcial cuando falten costos.
- Eventos cerrados inmutables. La corrección posterior al cierre necesita una política futura.
- Se carga el historial en memoria: adecuado para el MVP de ferias, sin ensayo de grandes volúmenes.
- Validar en un iPad físico y hacer una simulación operativa con los precios y cantidades reales antes del primer evento.

Documentación: [modelo](docs/DATA_MODEL.md), [arquitectura](docs/ARCHITECTURE.md), [reglas](docs/INVENTORY_RULES.md), [decisiones](docs/DECISIONS.md), [roadmap](docs/ROADMAP.md), [avisos de Codex](docs/NOTIFICATIONS.md).
