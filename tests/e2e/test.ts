import { test as base } from '@playwright/test';
export { expect, type Page } from '@playwright/test';
// Legacy scenarios opt out of onboarding and explicitly accept cash-only event setup.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(
      page.getByRole('heading', { name: 'Métodos de pago del evento' }),
      async () => {
        await page.getByRole('button', { name: 'Guardar métodos' }).click();
      },
    );
    await page.goto('./#/pos');
    await page.getByRole('heading', { name: 'Configurar venta diaria / ambulatoria' }).waitFor();
    await page.getByLabel('BAC', { exact: true }).check();
    await page.getByLabel('Cuenta o usuario BAC').fill('DEMO-BAC');
    await page.getByLabel('Titular BAC').fill('Titular de prueba');
    await page.getByRole('button', { name: 'Guardar métodos' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await use(page);
  },
});
