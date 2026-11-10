import { test, expect } from './test';

test('pedido diario entregado sin pago, WhatsApp, cobro único y anulación con foto', async ({
  page,
  context,
}) => {
  await page.goto('./#/settings');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.getByRole('button', { name: 'Comprobar uso sin internet' }).click();
  await expect(page.locator('.offline-status')).toContainText('Lista para usar sin internet');
  await context.setOffline(true);
  await page.goto('./#/pos');
  await page.getByLabel('Buscar producto o presentación').fill('Stickers');
  await page.locator('.product-tile').click();
  await page.getByLabel('Presentación de venta').selectOption({ index: 0 });
  await page.getByRole('button', { name: 'Agregar a la venta' }).click();
  await page.getByLabel('Pieza 1', { exact: true }).fill('Flor');
  await page.getByRole('button', { name: 'Crear pedido para seguimiento' }).click();
  await page.getByLabel('Nombre del cliente').fill('Cliente de prueba');
  await page.getByLabel('WhatsApp del cliente').fill('99999999');
  await page.getByRole('combobox', { name: 'Tipo de entrega', exact: true }).click();
  await page.getByRole('option', { name: 'Delivery', exact: true }).click();
  await page.getByLabel('Dirección / punto de entrega').fill('Dirección ficticia');
  await page.getByRole('button', { name: 'Guardar pedido abierto' }).click();
  await expect(page.locator('main h1')).toHaveText('Pedidos');
  await expect(page.locator('.order-card')).toContainText('Pendiente de pago');
  await page.getByRole('button', { name: 'Preparar WhatsApp' }).click();
  const link = page.getByRole('link', { name: 'Abrir WhatsApp del cliente' });
  const url = new URL((await link.getAttribute('href'))!);
  expect(url.pathname).toBe('/50499999999');
  expect(url.searchParams.get('text')).toContain('L 30.00');
  expect(url.searchParams.get('text')).toContain('Dirección ficticia');
  expect(url.searchParams.get('text')).toContain('DEMO-BAC');
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar empacado' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Marcar entregado' }).click();
  await expect(
    page
      .locator('.order-column')
      .filter({ has: page.getByRole('heading', { name: /Entregados/ }) }),
  ).toContainText('Pendiente de pago');
  await page.goto('./#/sales');
  await expect(page.locator('.sale-card')).toHaveCount(0);
  await expect(page.getByText('No hay ventas para este filtro.')).toBeVisible();
  await page.goto('./#/orders');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'test-results/orders-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Cobrar pedido' }).click();
  await page.getByRole('button', { name: 'Confirmar pago del pedido' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.order-card')).toHaveCount(0);
  await page.getByLabel('Incluir terminados y cancelados').check();
  await expect(page.locator('.order-card')).toContainText('Pagado');
  await page.goto('./#/sales');
  await expect(page.locator('.sale-card')).toHaveCount(1);
  await expect(page.locator('.sale-card')).toContainText('Stickers');
  await expect(page.locator('.event-totals')).toContainText('30.00');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'test-results/sales-cards-tablet.png', fullPage: true });
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Detalle de venta' });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 20;
    c.height = 20;
    return c.toDataURL().split(',')[1];
  });
  await page.getByLabel('Adjuntar Foto de anulación', { exact: true }).setInputFiles({
    name: 'prueba.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(dialog.getByAltText('Foto de anulación', { exact: true })).toBeVisible();
  await page.getByLabel('Motivo de anulación').fill('Cliente devolvió los productos');
  await page.getByLabel('Dinero ya reembolsado').check();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirmar anulación' }).click();
  await dialog.getByText('Ver foto de anulación').click();
  await expect(dialog.getByAltText('Foto de anulación guardada')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar detalle' }).click();
  await expect(page.locator('.event-totals')).toContainText('0.00');
  await page.reload();
  await expect(page.locator('.sale-card')).toContainText('Cliente devolvió los productos');
});
