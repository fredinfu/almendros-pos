import { test, expect } from '@playwright/test';

test('primer evento, cuentas cifradas locales, edición y separación por evento', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/pos');
  await expect(page.getByRole('heading', { name: 'Tu primer evento' })).toBeVisible();
  await page.getByLabel('Nombre del evento', { exact: true }).fill('Evento de prueba local');
  await page.getByLabel('BAC', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar métodos' }).click();
  await expect(page.getByRole('dialog')).toContainText('Completa cuenta');
  await page.getByLabel('Cuenta o usuario BAC').fill('DEMO-CUENTA');
  await page.getByLabel('Titular BAC').fill('Titular de prueba');
  await page.getByRole('button', { name: 'Guardar métodos' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Evento de prueba local');
  await page.getByLabel('Buscar producto o presentación').fill('Stickers');
  await page.locator('.product-tile').click();
  await page.getByLabel('Presentación de venta').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Agregar a la venta' }).click();
  await expect(page.getByLabel('Pieza 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.getByRole('combobox', { name: 'Método de pago', exact: true }).click();
  await expect(page.getByRole('option', { name: /Ficohsa/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('option', { name: /BAC/ }).click();
  await expect(page.locator('.account-code')).toHaveText('DEMO-CUENTA');
  await page.getByRole('button', { name: 'Copiar cuenta' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('DEMO-CUENTA');
  const sealed = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('almendros-payment-vault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['records', 'keys']);
    const read = <T>(name: string) =>
      new Promise<T[]>((resolve) => {
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
      });
    const records = await read<{ data: ArrayBuffer }>('records');
    const keys = await read<{ key: CryptoKey }>('keys');
    db.close();
    return {
      ciphertext: new TextDecoder().decode(records[0].data),
      extractable: keys[0].key.extractable,
    };
  });
  expect(sealed.ciphertext).not.toContain('DEMO-CUENTA');
  expect(sealed.ciphertext).not.toContain('Titular de prueba');
  expect(sealed.extractable).toBe(false);
  await page.goto('./#/events');
  await page.getByRole('button', { name: 'Nuevo evento' }).click();
  await page.getByLabel('Nombre del evento', { exact: true }).fill('Segundo evento');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByLabel('BAC', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Guardar métodos' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('./#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar respaldo JSON' }).click();
  const stream = await (await download).createReadStream();
  let text = '';
  for await (const chunk of stream!) text += chunk.toString();
  expect(text).not.toContain('DEMO-CUENTA');
  expect(text).not.toContain('Titular de prueba');
  await context.setOffline(true);
  await page.goto('./#/events');
  await page.getByRole('button', { name: 'Métodos de pago', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Métodos de pago del evento' })).toBeVisible();
});
