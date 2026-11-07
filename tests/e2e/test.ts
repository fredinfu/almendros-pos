import { test as base } from '@playwright/test';
export { expect, type Page } from '@playwright/test';
// Legacy scenarios opt out of onboarding and explicitly accept cash-only event setup.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(
      page.getByRole('button', { name: 'Continuar para restaurar respaldo' }),
      async () => {
        await page.getByRole('button', { name: 'Continuar para restaurar respaldo' }).click();
      },
    );
    await page.addLocatorHandler(
      page.getByRole('heading', { name: 'Métodos de pago del evento' }),
      async () => {
        await page.getByRole('button', { name: 'Guardar métodos' }).click();
      },
    );
    await use(page);
  },
});
