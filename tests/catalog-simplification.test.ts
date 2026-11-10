import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { createDatabase } from '../src/app/infrastructure/indexeddb/database';
import { DexieRepository } from '../src/app/infrastructure/repositories/dexie.repository';
import { seedDatabase } from './fixtures/legacy-seed';
import { CatalogService } from '../src/app/domain/catalog.service';
import { InventoryService } from '../src/app/domain/inventory.service';
import { EventsService } from '../src/app/domain/events.service';
import { SalesService } from '../src/app/domain/sales.service';
import { BackupService } from '../src/app/domain/backups';
import { eventReport } from '../src/app/domain/reports';
import { newId, stock } from '../src/app/domain/models';

it('código y costo opcionales: crea presentaciones sin colisiones y admite edición', async () => {
  const database = createDatabase(`optional-${newId()}`);
  try {
    const repository = new DexieRepository(database);
    await seedDatabase(repository);
    const existing = (await repository.read()).variants.find((v) => v.sku === 'AL-BO-2')!;
    const catalog = new CatalogService(repository);
    const first = { ...existing, id: newId(), sku: '', name: '1 lb' };
    const second = { ...existing, id: newId(), sku: undefined, name: '500 g' };
    await catalog.saveVariant(first);
    await catalog.saveVariant(second);
    await catalog.saveVariant({ ...first, name: '½ lb' });
    const state = await repository.read();
    const added = state.variants.filter((v) => [first.id, second.id].includes(v.id));
    expect(added).toHaveLength(2);
    expect(new Set(added.map((v) => v.sku)).size).toBe(2);
    expect(added.every((v) => v.sku.startsWith('AUTO-') && v.unitCostMinor === undefined)).toBe(
      true,
    );
    expect(state.variants.find((v) => v.id === first.id)?.name).toBe('½ lb');
    expect(
      new BackupService(repository).preview(
        JSON.stringify(await new BackupService(repository).export()),
      ),
    ).toBeTruthy();
  } finally {
    await database.delete();
  }
});

it('migra v1 a v2 sin perder las existencias de 250 g ni la historia de 227 g y ventas', async () => {
  const name = `migration-${newId()}`;
  const legacy = new Dexie(name);
  legacy.version(1).stores({
    brands: 'id,&slug',
    categories: 'id,&name',
    products: 'id,brandId,categoryId',
    variants: 'id,&sku,productId',
    locations: 'id,type,eventId',
    movements: 'id,variantId,fromLocationId,toLocationId,eventId,saleId,referenceId',
    events: 'id,status',
    expenses: 'id,eventId',
    sales: 'id,&receiptNumber,eventId,status',
    items: 'id,saleId,variantId',
    payments: 'id,saleId',
    settings: 'id',
  });
  const upgraded = createDatabase(name);
  try {
    const setup = createDatabase('setup-' + newId());
    const repository = new DexieRepository(setup);
    await seedDatabase(repository);
    const initial = await repository.read();
    const current = initial.variants.find((v) => v.sku === 'AL-BO-2')!;
    const oldId = newId();
    await repository.transact((state) => {
      const product = state.products.find((p) => p.id === current.productId)!;
      product.name = 'Blended Ones';
      product.description = 'Descripción anterior';
      product.grindOptions = ['Molido medio', 'Grano', 'Molido'];
      const variant = state.variants.find((v) => v.id === current.id)!;
      variant.priceMinor = 20000;
      variant.unitCostMinor = 12000;
      state.variants.push({ ...variant, id: oldId, sku: 'AL-BO-1', name: '227 g', isActive: true });
    });
    const inventory = new InventoryService(repository);
    const events = new EventsService(repository);
    const generalId = initial.locations[0].id;
    await inventory.record({
      id: newId(),
      variantId: current.id,
      locationId: generalId,
      quantity: 8,
      type: 'restock',
      note: 'Existencias reales',
    });
    await inventory.record({
      id: newId(),
      variantId: oldId,
      locationId: generalId,
      quantity: 2,
      type: 'restock',
      note: 'Existencias históricas',
    });
    const eventId = await events.create({ id: newId(), name: 'Evento existente' });
    await inventory.transfer({ id: newId(), eventId, variantId: current.id, quantity: 3 });
    await events.open(eventId);
    await new SalesService(repository).checkout({
      id: newId(),
      eventId,
      lines: [
        {
          variantId: current.id,
          quantity: 1,
          expectedPriceMinor: 20000,
          grindOption: 'Molido medio',
        },
      ],
      discountMinor: 0,
      method: 'cash',
    });
    const before = await repository.read();
    await legacy.open();
    for (const table of legacy.tables)
      await table.bulkPut(before[table.name as keyof typeof before]);
    await setup.delete();
    legacy.close();
    const newRepository = new DexieRepository(upgraded);
    const after = await newRepository.read();
    expect(upgraded.verno).toBe(4);
    expect(after.products.find((p) => p.id === current.productId)?.name).toBe('Blended One');
    expect(after.products.find((p) => p.id === current.productId)?.description).toContain(
      'Geisha proceso honey y Catimor proceso natural',
    );
    expect(after.variants.find((v) => v.id === current.id)?.priceMinor).toBe(24500);
    expect(after.variants.find((v) => v.id === current.id)?.unitCostMinor).toBeUndefined();
    expect(after.variants.find((v) => v.id === oldId)?.isActive).toBe(false);
    expect(stock(after, current.id, generalId)).toBe(5);
    expect(stock(after, oldId, generalId)).toBe(2);
    for (const table of ['locations', 'movements', 'sales', 'items', 'payments', 'events'] as const)
      expect(after[table]).toEqual(before[table]);
    expect(after.items[0].unitPriceMinor).toBe(20000);
    expect(after.items[0].unitCostMinor).toBe(12000);
    const backup = await new BackupService(newRepository).export();
    expect(new BackupService(newRepository).preview(JSON.stringify(backup))).toBeTruthy();
    await new CatalogService(newRepository).saveVariant({
      ...after.variants.find((v) => v.id === current.id)!,
      priceMinor: 25000,
    });
    upgraded.close();
    await upgraded.open();
    expect((await newRepository.read()).variants.find((v) => v.id === current.id)?.priceMinor).toBe(
      25000,
    );
  } finally {
    legacy.close();
    await upgraded.delete();
  }
});

it('vende Grano y Molido juntos al mismo precio, compartiendo stock y sin exigir costos', async () => {
  const database = createDatabase(`grind-${newId()}`);
  try {
    const repository = new DexieRepository(database);
    await seedDatabase(repository);
    const state = await repository.read();
    const variant = state.variants.find((v) => v.sku === 'AL-BO-2')!;
    await new CatalogService(repository).saveProduct({
      ...state.products.find((p) => p.id === variant.productId)!,
      grindOptions: ['Molido', 'Grano'],
    });
    const events = new EventsService(repository);
    const inventory = new InventoryService(repository);
    const eventId = await events.create({ id: newId(), name: 'Venta mixta' });
    await inventory.record({
      id: newId(),
      variantId: variant.id,
      locationId: state.locations[0].id,
      quantity: 8,
      type: 'restock',
      note: 'Prueba',
    });
    await inventory.transfer({ id: newId(), eventId, variantId: variant.id, quantity: 8 });
    await events.open(eventId);
    await new SalesService(repository).checkout({
      id: newId(),
      eventId,
      lines: ['Grano', 'Molido'].map((grindOption) => ({
        variantId: variant.id,
        quantity: 1,
        expectedPriceMinor: 24500,
        grindOption,
      })),
      discountMinor: 0,
      method: 'cash',
    });
    const after = await repository.read();
    expect(stock(after, variant.id, after.events[0].stockLocationId)).toBe(6);
    expect(after.sales[0].totalMinor).toBe(49000);
    expect(after.items.map((i) => i.grindOptionSnapshot).sort()).toEqual(['Grano', 'Molido']);
    expect(eventReport(after, eventId).estimatedProfit).toBeUndefined();
  } finally {
    await database.delete();
  }
});
