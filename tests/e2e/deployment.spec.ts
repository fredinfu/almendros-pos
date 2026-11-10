import { test, expect, Page } from './test';
async function route(page: Page, path: string) {
  await page.goto('./#/' + path);
  await expect(page.locator('main h1')).toBeVisible();
}
async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}
async function ready(page: Page) {
  await route(page, 'settings');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.getByRole('button', { name: 'Comprobar uso sin internet' }).click();
  await expect(page.locator('.offline-status')).toContainText('Lista para usar sin internet', {
    timeout: 45000,
  });
}
async function sticker(page: Page) {
  await route(page, 'pos');
  await page.getByLabel('Buscar producto o presentación').fill('Stickers');
  await page.locator('.product-tile').click();
  await page.getByLabel('Presentación de venta').selectOption({ index: 0 });
  await page.getByRole('button', { name: 'Agregar a la venta' }).click();
}
test('mercadería por pieza, sugerencias históricas y cuentas al cobrar', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await sticker(page);
  await page.getByLabel('Pieza 1', { exact: true }).fill('Flor de café');
  await page.getByRole('button', { name: /^Sumar / }).click();
  await page.getByLabel('Pieza 2', { exact: true }).fill('Colibrí');
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await choose(page, 'Método de pago', /BAC/);
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page.locator('.receipt')).toContainText('Venta registrada');
  await route(page, 'sales');
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('dialog').getByText('Pieza 1: Flor de café')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Pieza 2: Colibrí')).toBeVisible();
  await expect(page.getByText('Referencia: BAC')).toBeVisible();
  await sticker(page);
  await expect(page.locator('#piece-suggestions option[value="Flor de café"]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Pieza 1', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/merch-mobile.png', fullPage: true });
});
test('foto de transferencia: adjuntar/quitar/cámara, pago, respaldo y otra instalación', async ({
  page,
  browser,
}) => {
  await sticker(page);
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await choose(page, 'Método de pago', /BAC/);
  await expect(page.locator('input[capture]')).toHaveAttribute('capture', 'environment');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = '#000';
    ctx.fillText('Referencia de prueba 12345', 20, 40);
    return c.toDataURL().split(',')[1];
  });
  const file = {
    name: 'referencia.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  await page.getByLabel('Adjuntar foto de transferencia', { exact: true }).setInputFiles(file);
  await expect(page.getByAltText('Referencia de transferencia adjunta')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar foto' }).click();
  await expect(page.getByAltText('Referencia de transferencia adjunta')).toHaveCount(0);
  await page.getByLabel('Tomar foto de transferencia', { exact: true }).setInputFiles(file);
  await expect(page.getByAltText('Referencia de transferencia adjunta')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page.locator('.receipt')).toContainText('Venta registrada');
  await route(page, 'sales');
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await page.getByText('Ver foto de referencia del pago').click();
  await expect(page.getByAltText('Foto de referencia de la transferencia')).toBeVisible();
  await page.screenshot({ path: 'test-results/payment-photo.png', fullPage: true });
  await route(page, 'settings');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar respaldo JSON' }).click();
  const backup = await (await downloaded).path();
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.addLocatorHandler(
      other.getByRole('button', { name: 'Continuar para restaurar respaldo' }),
      async () => {
        await other.getByRole('button', { name: 'Continuar para restaurar respaldo' }).click();
      },
    );
    await other.goto(new URL('./#/sales', page.url()).href);
    await expect(other.locator('.sales-list')).toContainText('No hay');
    await other.goto(new URL('./#/settings', page.url()).href);
    await other.locator('input[type=file]').setInputFiles(backup!);
    await other.getByLabel('Escribe REEMPLAZAR para confirmar').fill('REEMPLAZAR');
    other.once('dialog', (d) => d.accept());
    await other.getByRole('button', { name: 'Reemplazar datos y restaurar' }).click();
    await expect(other.locator('.alert.success')).toContainText('Respaldo restaurado');
    await other.goto(new URL('./#/sales', page.url()).href);
    await other.getByRole('button', { name: 'Ver detalle' }).click();
    await other.getByText('Ver foto de referencia del pago').click();
    await expect(other.getByAltText('Foto de referencia de la transferencia')).toBeVisible();
  } finally {
    await context.close();
  }
});
test('primera instalación y todas las pantallas lazy funcionan offline; conserva venta al reabrir', async ({
  page,
  context,
}) => {
  await route(page, 'pos');
  await expect(page.locator('#active-event option')).toHaveCount(1);
  await ready(page);
  await context.setOffline(true);
  await route(page, 'catalog');
  await page.getByLabel('Mostrar inactivos').check();
  await expect(page.locator('.product-group')).toHaveCount(10);
  await route(page, 'inventory');
  await expect(page.locator('table').first()).toContainText('Sin registrar');
  await choose(page, 'Variante', 'Stickers · Individual');
  await page.getByLabel('Unidades', { exact: true }).fill('3');
  await page.getByLabel('Motivo', { exact: true }).fill('Tres unidades físicas');
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Movimiento registrado');
  await route(page, 'events');
  await page.getByRole('button', { name: 'Nuevo evento' }).click();
  await page.getByLabel('Nombre del evento').fill('Evento offline');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.locator('.alert.success')).toContainText(/Evento creado|Métodos guardados/);
  await page.getByLabel('Descripción del gasto').fill('Transporte');
  await page.getByLabel('Importe L').fill('5');
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Gasto registrado');
  await sticker(page);
  await page.getByLabel('Cantidad Stickers · Individual').fill('2');
  await page.getByLabel('Cantidad Stickers · Individual').blur();
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page.locator('.receipt')).toContainText('60.00');
  await route(page, 'reports');
  await expect(page.locator('main')).toContainText('55.00');
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar reporte CSV' }).click();
  expect(await (await csv).path()).toBeTruthy();
  await route(page, 'settings');
  await expect(page.locator('.offline-status')).toContainText('Lista para usar sin internet');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar respaldo JSON' }).click();
  expect(await (await download).path()).toBeTruthy();
  const url = page.url();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url.replace('#/settings', '#/sales'));
  await expect(reopened.locator('.sale-card')).toHaveCount(1);
  await expect(reopened.locator('.sales-list')).toContainText('60.00');
});
test('actualización real del Service Worker conserva datos locales y precios editados', async ({
  page,
  request,
}) => {
  await ready(page);
  await route(page, 'catalog');
  await page.getByLabel('Buscar producto o marca').fill('Stickers');
  await page.locator('.product-group summary').first().click();
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await page.getByLabel('Precio L', { exact: true }).fill('31');
  await page.getByRole('button', { name: 'Guardar presentación', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Cambios guardados');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await page.getByLabel('Nombre del producto').fill('Producto local persistente');
  await page.getByLabel('Precio de venta L', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Cambios guardados');
  await sticker(page);
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page.locator('.receipt')).toContainText('31.00');
  await request.post('http://localhost:4173/__test_update');
  await page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller!;
    controller.postMessage({ action: 'CHECK_FOR_UPDATES', nonce: 1244 });
  });
  await expect(page.getByText('Nueva versión disponible.', { exact: false })).toBeVisible({
    timeout: 45000,
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Actualizar aplicación', exact: true }).click();
  await expect(page.locator('main h1')).toBeVisible();
  await route(page, 'sales');
  await expect(page.locator('.sale-card')).toHaveCount(1);
  await expect(page.locator('.sales-list')).toContainText('31.00');
  await route(page, 'catalog');
  await page.getByLabel('Buscar producto o marca').fill('Producto local persistente');
  await expect(page.locator('.product-group')).toHaveCount(1);
  await page.getByLabel('Buscar producto o marca').fill('Stickers');
  await expect(page.locator('.product-summary')).toContainText('31.00');
});
