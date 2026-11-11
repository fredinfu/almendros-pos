# Modo servidor — piloto MySQL/MariaDB

El frontend puede funcionar en dos modos. `public/runtime-config.js` deja `window.__ALMENDROS_API__` vacío para el modo local de GitHub Pages. El backend sustituye esa respuesta por `/api` y sirve esta compilación en el mismo origen.

En modo servidor el acceso precede al arranque de Angular, el repositorio lee la API y los servicios envían comandos explícitos. No usa IndexedDB para las ventas ni cae silenciosamente al modo local cuando falla internet. El Service Worker no se registra en el nuevo origen del servidor. Cuentas/perfiles siguen en una bóveda local cifrada, con nombre separado por negocio. No hay sincronización automática entre las dos modalidades.

El UUID del comando se conserva en sessionStorage para reintentar una solicitud perdida; no se guardan allí datos de clientes, pagos ni contraseñas. El servidor decide idempotencia y valida transaccionalmente las reglas. El negocio lo establece la sesión, no el frontend. Actualización entre dispositivos cada 15 segundos. La importación está restringida a negocio sin operaciones; no es fusión de respaldos.

Backend independiente en `almendros-pos-api`, Node/Express, con adaptador MySQL/MariaDB y SQL versionado. El dominio es una copia coordinada: al cambiar reglas, actualizar ambos lados y ejecutar sus pruebas. Para desplegar juntos, compilar este frontend y usar `node scripts/sync-web.mjs RUTA_DIST_BROWSER` desde el backend. Consultar README/HOSTINGER del backend para límites del piloto y configuración.

No se han movido datos reales. El rollout debe usar un sitio independiente hasta validar migración, fotos, inventario, caja y pedidos. No reemplazar GitHub Pages automáticamente por esta modalidad.
