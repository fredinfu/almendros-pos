import { loadLegacyFixture } from './legacy-fixture';
import { test, expect, Page } from './test';
test.beforeEach(async ({ page }) => loadLegacyFixture(page));
async function route(page: Page, path: string) {
  await page.goto('./#/' + path);
  await expect(page.locator('main h1')).toBeVisible();
}
async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}
async function pay(page: Page) {
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).dblclick();
  await expect(page.locator('.receipt')).toContainText('Venta registrada');
}
test('venta rápida, precio inline, reportes y persistencia sin evento', async ({ page }) => {
  await route(page, 'pos');
  await expect(page.locator('main h1')).toHaveText('Venta rápida');
  await page.getByRole('button', { name: 'Bebidas', exact: true }).click();
  await page.locator('.product-tile').filter({ hasText: 'Café filtrado' }).click();
  await expect(page.getByRole('dialog')).toContainText('Configurar precio');
  await page.getByLabel('Precio de venta L', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Agregar a la venta' }).click();
  await expect(page.locator('.cart-line')).toContainText('45.00');
  await pay(page);
  await route(page, 'sales');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Venta rápida');
  await route(page, 'reports');
  await expect(page.locator('main')).toContainText('45.00');
  await page.reload();
  await expect(page.locator('main')).toContainText('45.00');
  await route(page, 'pos');
  await page.locator('.product-tile').filter({ hasText: 'Café filtrado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.cart-line')).toHaveCount(1);
});
test('nuevo café en un paso, stock pendiente y conteo actual sin doble descuento', async ({
  page,
}) => {
  await route(page, 'catalog');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await page.getByLabel('Nombre del producto').fill('Café sencillo');
  await page.getByLabel('Precio de venta L', { exact: true }).fill('99');
  await expect(page.getByLabel('Molido', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Grano', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Cambios guardados');
  await route(page, 'pos');
  await page.getByLabel('Buscar producto o presentación').fill('Café sencillo');
  await page.locator('.product-tile').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Preparación', { exact: true })).toHaveValue('Molido');
  await expect(page.locator('.cart-panel')).toContainText('Inventario pendiente de conciliar');
  await pay(page);
  await route(page, 'inventory');
  await choose(page, 'Presentación a conciliar', /Café sencillo · 1 pendientes/);
  await page.getByLabel('Unidades contadas').fill('5');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirmar conteo' }).click();
  await expect(page.locator('.alert.success')).toContainText('Inventario conciliado');
  const row = page
    .locator('table')
    .first()
    .locator('tbody tr')
    .filter({ hasText: 'Café sencillo' })
    .first();
  await expect(row.locator('td').nth(2)).toHaveText('5');
  await route(page, 'pos');
  await page.getByLabel('Buscar producto o presentación').fill('Café sencillo');
  await page.locator('.product-tile').click();
  await pay(page);
  await route(page, 'inventory');
  await expect(row.locator('td').nth(2)).toHaveText('4');
});
test('catálogo agrupado, tamaños y selector accesible en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await route(page, 'catalog');
  await page.getByLabel('Buscar producto o marca').fill('Washed Blend');
  await expect(page.locator('.product-group')).toHaveCount(1);
  await page.locator('.product-group summary').first().click();
  await expect(page.locator('.product-group tbody tr')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/catalog-grouped-mobile.png', fullPage: true });
  await route(page, 'pos');
  await page.getByLabel('Buscar producto o presentación').fill('Washed');
  await page.locator('.product-tile').click();
  await page.getByLabel('Presentación de venta').selectOption({ index: 1 });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/pos-selector-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('borrador vende sin transferencias y permite editar/anular gastos', async ({ page }) => {
  await route(page, 'events');
  await page.getByRole('button', { name: 'Nuevo evento' }).click();
  await page.getByLabel('Nombre del evento').fill('Venta en borrador');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.locator('.alert.success')).toContainText(/Evento creado|Métodos guardados/);
  await page.getByLabel('Descripción del gasto').fill('Taxi');
  await page.getByLabel('Importe L').fill('100');
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Gasto registrado');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Importe L').fill('80');
  page.once('dialog', (d) => d.accept('Monto real'));
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(page.locator('.alert.success')).toContainText('Gasto corregido');
  await route(page, 'pos');
  await page.getByLabel('Buscar producto o presentación').fill('Blended');
  await page.locator('.product-tile').click();
  await pay(page);
  await route(page, 'reports');
  await expect(page.locator('main')).toContainText('165.00');
  await route(page, 'events');
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Duplicado' : undefined));
  await page.getByRole('button', { name: 'Anular', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Gasto anulado');
  await route(page, 'reports');
  await expect(page.locator('main')).toContainText('245.00');
});
