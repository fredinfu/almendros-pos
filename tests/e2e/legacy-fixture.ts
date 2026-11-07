import { Page } from '@playwright/test';
import { seedDatabase } from '../fixtures/legacy-seed';
import { emptyState } from '../../src/app/domain/models';
/** Old regression suite runs its original catalog in isolated Playwright profiles only. */
export async function loadLegacyFixture(page: Page): Promise<void> {
  const state = emptyState();
  await seedDatabase({
    read: async () => state,
    transact: async (operation) => operation(state),
    replace: async () => {},
    observe: () => () => {},
  });
  await page.goto('./');
  await page.locator('main h1').waitFor();
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('almendros-pos');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction([...db.objectStoreNames], 'readwrite');
        for (const name of Object.keys(data)) {
          const store = tx.objectStore(name);
          store.clear();
          for (const row of data[name as keyof typeof data]) store.put(row);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, state);
  await page.reload();
  await page.locator('main h1').waitFor();
}
