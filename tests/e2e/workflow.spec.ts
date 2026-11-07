import { loadLegacyFixture } from './legacy-fixture';
import { test, expect, Page } from '@playwright/test';
test.beforeEach(async ({ page }) => loadLegacyFixture(page));

test('acciones directas: cancelar y confirmar estado y eliminación', async ({ page }) => {
  await route(page, 'catalog');
  await page.getByLabel('Buscar producto o marca').fill('Blended');
  const toggle = page.getByRole('switch', { name: 'Estado producto Blended One', exact: true });
  page.once('dialog', (d) => d.dismiss());
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Mostrar inactivos').check();
  page.once('dialog', (d) => d.accept());
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  page.once('dialog', (d) => d.accept());
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Eliminar producto', exact: true }).click();
  await expect(page.locator('.product-group')).toHaveCount(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Eliminar producto', exact: true }).click();
  await expect(page.locator('.product-group')).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Buscar producto o marca').fill('Blended');
  await expect(page.locator('.product-group')).toHaveCount(0);
});

async function choose(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}
async function route(page: Page, path: string): Promise<void> {
  await page.goto(`./#/${path}`);
  await expect(page.locator('main h1')).toBeVisible();
}
async function prepare(page: Page): Promise<void> {
  await route(page, 'inventory');
  await choose(page, 'Variante', 'Coffee Pods · Individual premium');
  await page.getByLabel('Unidades', { exact: true }).fill('30');
  await page.getByLabel('Motivo', { exact: true }).fill('Stock de prueba aislado');
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Movimiento registrado');
  await route(page, 'events');
  await page.getByRole('button', { name: 'Nuevo evento' }).click();
  await page.getByLabel('Nombre del evento').fill('Feria de prueba');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.locator('.alert.success')).toContainText('Evento creado');
  await choose(page, 'Producto para transferir', /Coffee Pods · Individual premium/);
  await page.getByLabel('Cantidad a transferir').fill('30');
  await page.getByRole('button', { name: 'Transferir', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Inventario transferido');
  await page.getByRole('button', { name: 'Abrir evento', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Evento abierto');
}
async function sell(page: Page, quantity: string): Promise<void> {
  await route(page, 'pos');
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('.product-tile').filter({ hasText: 'Individual premium' }).click();
  await page.getByRole('button', { name: 'Agregar a la venta', exact: true }).click();
  await page.getByLabel('Cantidad Coffee Pods · Individual premium').fill(quantity);
  await page.getByLabel('Cantidad Coffee Pods · Individual premium').blur();
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/pos-checkout.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page.locator('.receipt')).toContainText('Venta registrada');
}

test('flujo completo: stock, evento, 18 ventas, 4 muestras, cierre, respaldo y restauración', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await prepare(page);
  await sell(page, '18');
  await route(page, 'sales');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(page.locator('main')).toContainText('630.00');
  await route(page, 'inventory');
  await choose(page, 'Ubicación de inventario', 'Feria de prueba');
  await choose(page, 'Variante', 'Coffee Pods · Individual premium');
  await choose(page, 'Movimiento', 'Muestra');
  await page.getByLabel('Unidades', { exact: true }).fill('4');
  await page.getByLabel('Motivo', { exact: true }).fill('Degustación');
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Movimiento registrado');
  await route(page, 'events');
  await page.getByRole('button', { name: 'Preparar cierre' }).click();
  await page.getByLabel('Conteo AL-POD-1', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Confirmar cierre y devolución' }).click();
  await expect(page.locator('.alert.success')).toContainText('Evento cerrado');
  await route(page, 'inventory');
  const row = page.getByRole('row').filter({ hasText: 'AL-POD-1' });
  await expect(row.locator('td').nth(2)).toHaveText('8');
  await route(page, 'settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar respaldo JSON' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.locator('.restore-preview')).toContainText('1 ventas');
  await page.getByLabel('Escribe REEMPLAZAR para confirmar').fill('REEMPLAZAR');
  await page.getByRole('button', { name: 'Reemplazar datos y restaurar' }).click();
  await expect(page.locator('.alert.success')).toContainText('Respaldo restaurado');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Ajustes y respaldos', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('PWA: recarga offline y venta persistente sin red', async ({ page, context }) => {
  await prepare(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator('main h1')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await sell(page, '2');
  await page.reload();
  await expect(page.locator('main h1')).toContainText('Feria de prueba');
  await expect(page.locator('#active-event option:checked')).toContainText('Feria de prueba');
  await route(page, 'sales');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('70.00');
});

test('iPad horizontal y móvil: navegación y catálogo accesibles', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await route(page, 'dashboard');
  await expect(page.getByRole('heading', { name: 'Resumen de operación' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-ipad.png', fullPage: true });
  await route(page, 'catalog');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await page.getByLabel('Nombre del producto').fill('Producto de prueba');
  await page.getByLabel('Precio de venta L', { exact: true }).fill('99.50');
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Cambios guardados');
  await expect(page.locator('.catalog-groups')).toContainText('Producto de prueba');
  await expect(page.locator('.catalog-groups')).toContainText('99.50');
  await page.setViewportSize({ width: 390, height: 844 });
  await route(page, 'dashboard');
  await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.getByRole('link', { name: '04 Inventario' }).click();
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/inventory-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('Blended One: presentación única, código/costo opcionales y Grano + Molido en una venta', async ({
  page,
}) => {
  await prepare(page);
  await route(page, 'catalog');
  await page.getByLabel('Buscar producto o marca').fill('Blended');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('.product-group summary').first().click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByLabel('Nombre del producto')).toHaveValue('Blended One');
  await page.getByLabel('Grano', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Cambios guardados');
  await expect(page.getByLabel('Precio L', { exact: true })).toHaveValue('245.00');
  await expect(page.getByLabel('Descripción')).toHaveValue(
    'Café de especialidad: blend de Geisha proceso honey y Catimor proceso natural.',
  );
  await page
    .getByText('Opciones adicionales: código, costo y otros detalles', { exact: true })
    .click();
  await expect(page.getByLabel('Costo unitario L (opcional)')).toHaveValue('');
  await page.getByLabel('Código del producto (opcional)').fill('');
  await page.getByRole('button', { name: 'Guardar presentación', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Cambios guardados');
  await route(page, 'inventory');
  await choose(page, 'Variante', 'Blended One · 250 g');
  await page.getByLabel('Unidades', { exact: true }).fill('8');
  await page.getByLabel('Motivo', { exact: true }).fill('Prueba de molienda');
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Movimiento registrado');
  await route(page, 'events');
  await choose(page, 'Producto para transferir', /Blended One · 250 g/);
  await page.getByLabel('Cantidad a transferir').fill('8');
  await page.getByRole('button', { name: 'Transferir', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Inventario transferido');
  await route(page, 'pos');
  const tile = page.locator('.product-tile').filter({ hasText: 'Blended One' });
  await tile.click();
  await page.getByLabel('Preparación de venta', { exact: true }).selectOption('Molido');
  await page.getByRole('button', { name: 'Agregar a la venta', exact: true }).click();
  await tile.click();
  await page.getByLabel('Preparación de venta', { exact: true }).selectOption('Grano');
  await page.getByRole('button', { name: 'Agregar a la venta', exact: true }).click();
  await expect(page.locator('.cart-line')).toHaveCount(2);
  await expect(page.locator('.cart-line select').nth(0)).toHaveValue('Molido');
  await expect(page.locator('.cart-line select').nth(1)).toHaveValue('Grano');
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page.locator('.receipt')).toContainText('490.00');
  await expect(tile).toContainText('6 disp.');
  await route(page, 'sales');
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(page.locator('main')).toContainText('Molido');
  await expect(page.locator('main')).toContainText('Grano');
  await route(page, 'catalog');
  await page.getByLabel('Buscar producto o marca').fill('Blended');
  await page.locator('.product-group summary').first().click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: 'test-results/catalog-simple.png', fullPage: true });
});
