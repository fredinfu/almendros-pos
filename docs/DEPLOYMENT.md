# Publicación, datos locales y fotos — v1.1.1

## Arquitectura y privacidad

GitHub Pages aloja solamente Angular, CSS, iconos, manifest, Service Worker y el catálogo público. No hay servidor de ventas, autenticación en el POS ni sincronización. La base estable `almendros-pos` usa IndexedDB/Dexie. Cada navegador/perfil/origen tiene su propia instalación; pestañas del mismo origen comparten la base. Safari y una PWA instalada pueden tener comportamientos de almacenamiento distintos: comprobarlo físicamente, no asumir que comparten datos.

localhost y https://fredinfu.github.io son orígenes distintos. Publicar no mueve automáticamente tus datos. Para llevar tu operación a Pages, exporta JSON desde localhost y restaura en Pages. **Restaurar reemplaza los datos del destino**; no fusiona inventarios ni ventas de equipos distintos. Exporta un respaldo después de cada evento. Guarda el archivo de forma privada.

## Foto de transferencia

Al cobrar con BAC, Kash u Otro hay botones **Tomar foto** y **Adjuntar foto**, vista previa y **Quitar foto**. Son opcionales: no validan la transferencia con el banco. `capture="environment"` solicita cámara trasera en móviles compatibles; el navegador decide el selector disponible. En escritorio normalmente aparece un selector de archivo.

La foto se decodifica y vuelve a codificar a JPEG, máximo 1600 px y aproximadamente 1 MB binario; se eliminan metadatos EXIF y el nombre original. Se guarda en `Payment.evidence` dentro de la misma transacción de cobro. El historial permite expandirla. No se sube a GitHub ni a servicios externos. Cambiar a efectivo o completar/cambiar el contexto de venta limpia el adjunto del carrito; un error al cobrar lo conserva para reintentar.

Respaldo formato **3** incluye las fotos y acepta formatos 1, 2 y 3. Límite de importación 200 MB. Las fotos incrementan el tamaño y consumen cuota local: mantener respaldos externos. La cámara/galería y compatibilidad HEIC deben probarse en el iPad real; si el navegador no decodifica una foto, usar JPEG/PNG o captura de pantalla. No se ha probado una cámara física desde automatización.

## Generador de catálogo público

El respaldo original permanece fuera del repositorio y nunca se copia a assets. El generador usa listas explícitas de campos permitidos y descarta costos, pagos, fotos, movimientos, existencias, eventos, gastos, datos de clientes, configuración e identificador de instalación.

```powershell
npm run catalog:seed -- "C:\ruta-privada\respaldo.json" "src/app/infrastructure/seed/catalog.public.json" "2026-11-07.1"
```

Revisar los textos públicos de nombres/descripciones antes de confirmar y publicar la salida. El catálogo generado actual tiene 10 familias y 27 presentaciones; conserva precios y estados activos/inactivos del respaldo facilitado. No se adivinan tamaños, unidades de packs ni precios. Por ejemplo, una presentación sin cantidad de pack sigue requiriendo que el operador la configure.

La semilla se incluye dentro del bundle, disponible offline. Una instalación nueva recibe catálogo, General vacío/sin registrar y una configuración con UUID de instalación. No recibe operaciones ni cantidades físicas. `settings.catalogSeedVersion` registra la semilla aplicada. La existencia de settings evita reaplicarla: nuevas publicaciones nunca sobrescriben precios o productos locales. No hay actualización automática de catálogo en instalaciones existentes.

Versiones independientes: aplicación 1.1.1, IndexedDB 3 (sin migración estructural nueva para la foto), respaldo 3, semilla 2026-11-07.1. Los campos nuevos de pago/settings son opcionales y compatibles con registros previos.

## Offline y actualizaciones

Angular Service Worker usa prefetch para todos los bundles, incluidos lazy chunks, CSS, manifest e iconos. La interfaz usa fuentes del sistema y no depende de CDNs ni APIs para operar.

En **Ajustes y respaldos → Comprobar uso sin internet**, el indicador verifica que el Service Worker controla la página y que cada recurso del manifiesto está realmente en caché, comprobando su hash. Estar conectado o tener un worker activo no basta para mostrar «Lista para usar sin internet». Si aún no está lista, mantener conexión y volver a comprobar. El navegador puede eliminar cachés/datos después: el indicador refleja la última comprobación, no una garantía permanente.

Una nueva versión muestra un aviso y pide terminar/cancelar el carrito antes de recargar. No se borra IndexedDB. El operador controla la recarga; los registros guardados se mantienen.

Referencias: [caché de Angular Service Worker](https://angular.dev/ecosystem/service-workers/config) y [workflows de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Despliegue

Repositorio previsto: `fredinfu/almendros-pos`. Settings → Pages → Source: GitHub Actions. Ejecutar manualmente **Publicar en GitHub Pages**. El workflow instala Node 24/dependencias, comprueba tipos/lint/tests, compila y prueba producción, obtiene base_path de Pages, recompila para esa subruta, repite las pruebas y publica únicamente `dist/almendros-pos/browser`.

Rutas hash (`/#/pos`), manifest y Apple touch icon relativos al base href. La subruta del repositorio es `/almendros-pos/`. No usar scripts ni respaldos privados dentro de `public/`. `.gitignore` excluye respaldos JSON, evidencias privadas y el prompt original local `docs/PRD.md`, que contiene costos históricos internos.

Prueba local de la subruta:

```powershell
npm run build -- --base-href /almendros-pos/
$env:TEST_SUBPATH = '/almendros-pos/'
npm run test:e2e
```

El servidor de aceptación y su endpoint para simular una actualización viven en scripts/test-server.mjs; no forman parte del sitio desplegado. Las pruebas usan bases/perfiles aislados. La regresión anterior carga su fixture histórico exclusivamente en esos perfiles, mientras la aceptación de despliegue usa el catálogo público real.

## Instalar en iPad y pruebas físicas pendientes

1. Abrir la URL HTTPS de Pages en Safari con conexión.
2. Esperar el indicador de disponibilidad offline en Ajustes.
3. Compartir → Añadir a pantalla de inicio → Añadir.
4. Abrir desde el icono y comprobar su catálogo/datos. Si corresponde, importar el respaldo en esta instalación concreta.
5. Activar modo avión, cerrar y reabrir, navegar por todas las pantallas, hacer una venta de prueba y exportar un respaldo.
6. Probar Tomar foto, galería, orientación y legibilidad de la referencia guardada; verificar que restaura en otro perfil de prueba.
7. Volver a conectar, aceptar una actualización fuera de un cobro y confirmar que las ventas/precios siguen presentes.

No se ha verificado instalación ni cámara en Safari/iPadOS físico. La automatización verifica Chromium, viewport móvil/tablet, subruta, caché completa, operaciones offline, reapertura de página, foto adjunta, respaldo entre perfiles y actualización real del Service Worker.
