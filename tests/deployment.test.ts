import { it, expect } from 'vitest';
import { createDatabase } from '../src/app/infrastructure/indexeddb/database';
import { DexieRepository } from '../src/app/infrastructure/repositories/dexie.repository';
import { seedDatabase, CATALOG_SEED_VERSION } from '../src/app/infrastructure/seed/seed';
import catalog from '../src/app/infrastructure/seed/catalog.public.json';
import { CatalogService } from '../src/app/domain/catalog.service';
import { SalesService } from '../src/app/domain/sales.service';
import { BackupService, validateState } from '../src/app/domain/backups';
import { newId, paymentEvidenceSchema } from '../src/app/domain/models';
import { sanitizeCatalog } from '../scripts/catalog-seed.mjs';

it('semilla pública excluye costos y cualquier dato operativo incluso si hay fotos', () => {
  const poisoned = {
    data: {
      ...catalog,
      settings: [{ privateAccount: 'SECRET' }],
      sales: [{ secret: 'PRIVATE' }],
      payments: [{ evidence: 'PRIVATE' }],
      movements: [{ quantity: 500 }],
      expenses: [{ amountMinor: 123 }],
      locations: [{}],
      products: catalog.products.map((p) => ({ ...p, customer: 'PRIVATE' })),
      variants: catalog.variants.map((v) => ({ ...v, unitCostMinor: 999, secret: 'PRIVATE' })),
    },
  };
  const clean = sanitizeCatalog(poisoned);
  expect(Object.keys(clean).sort()).toEqual([
    'brands',
    'catalogSeedVersion',
    'categories',
    'products',
    'variants',
  ]);
  const text = JSON.stringify(clean);
  for (const key of ['PRIVATE', 'SECRET', 'unitCostMinor', 'movements', 'settings', 'evidence'])
    expect(text).not.toContain(key);
  expect(clean.products).toEqual(catalog.products);
  expect(clean.variants).toEqual(catalog.variants);
});
it('instalaciones nuevas comparten catálogo pero no IDs de instalación ni operaciones', async () => {
  const a = createDatabase('public-a-' + newId()),
    b = createDatabase('public-b-' + newId());
  try {
    const ra = new DexieRepository(a),
      rb = new DexieRepository(b);
    await Promise.all([seedDatabase(ra), seedDatabase(rb)]);
    const sa = await ra.read(),
      sb = await rb.read();
    expect(sa.products).toHaveLength(10);
    expect(sa.variants).toHaveLength(27);
    expect(sa.settings[0].catalogSeedVersion).toBe(CATALOG_SEED_VERSION);
    for (const table of [
      'sales',
      'items',
      'payments',
      'movements',
      'events',
      'expenses',
      'inventoryCounts',
    ] as const)
      expect(sa[table]).toHaveLength(0);
    expect(sa.settings[0].deviceInstallId).not.toBe(sb.settings[0].deviceInstallId);
    expect(sa.variants.map((v) => v.id)).toEqual(sb.variants.map((v) => v.id));
    validateState(sa);
  } finally {
    await a.delete();
    await b.delete();
  }
});
it('reaplicar semilla conserva precios, productos propios, estados y ventas', async () => {
  const db = createDatabase('seed-update-' + newId());
  try {
    const repo = new DexieRepository(db);
    await seedDatabase(repo);
    const data = await repo.read();
    const v = data.variants.find((v) => v.sku === 'AL-ST-1')!;
    const c = new CatalogService(repo);
    await c.saveVariant({ ...v, priceMinor: 12300 });
    await c.createSimple(
      { ...data.products.find((p) => p.id === v.productId)!, id: newId(), name: 'Producto propio' },
      7777,
    );
    await new SalesService(repo).checkout({
      id: newId(),
      lines: [{ variantId: v.id, quantity: 1, expectedPriceMinor: 12300 }],
      discountMinor: 0,
      method: 'bac',
    });
    await c.setProductActive(v.productId, false);
    const before = await repo.read();
    await Promise.all([seedDatabase(repo), seedDatabase(repo)]);
    expect(await repo.read()).toEqual(before);
  } finally {
    await db.delete();
  }
});
it('foto se guarda atómicamente con pago, sobrevive respaldo y no se duplica en reintento', async () => {
  const db = createDatabase('photo-' + newId()),
    other = createDatabase('photo-restored-' + newId());
  try {
    const repo = new DexieRepository(db);
    await seedDatabase(repo);
    const v = (await repo.read()).variants.find((v) => v.sku === 'AL-ST-1')!;
    const evidence = { dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 1, height: 1 };
    const cmd = {
      id: newId(),
      lines: [{ variantId: v.id, quantity: 1, expectedPriceMinor: 3000 }],
      discountMinor: 0,
      method: 'bac' as const,
      evidence,
    };
    const sales = new SalesService(repo);
    await Promise.all([sales.checkout(cmd), sales.checkout(cmd)]);
    const state = await repo.read();
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].evidence).toEqual(evidence);
    const backups = new BackupService(repo),
      backup = await backups.export();
    expect(backup.schemaVersion).toBe(3);
    await new BackupService(new DexieRepository(other)).restore(backup);
    expect(await new DexieRepository(other).read()).toEqual(state);
    await expect(sales.checkout({ ...cmd, id: newId(), method: 'cash' })).rejects.toThrow(
      'electrónicos',
    );
    expect((await repo.read()).sales).toHaveLength(1);
  } finally {
    await db.delete();
    await other.delete();
  }
});
it('rechaza adjuntos remotos, SVG y demasiado grandes', () => {
  for (const dataUrl of [
    'https://example.com/private.jpg',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/jpeg;base64,/9j/' + 'A'.repeat(1400000),
  ])
    expect(() => paymentEvidenceSchema.parse({ dataUrl, width: 1, height: 1 })).toThrow();
});
