import { beforeEach, afterEach, it, expect } from 'vitest';
import Dexie from 'dexie';
import { createDatabase } from '../src/app/infrastructure/indexeddb/database';
import { DexieRepository } from '../src/app/infrastructure/repositories/dexie.repository';
import { seedDatabase } from './fixtures/legacy-seed';
import { CatalogService } from '../src/app/domain/catalog.service';
import { SalesService, Checkout } from '../src/app/domain/sales.service';
import { InventoryService } from '../src/app/domain/inventory.service';
import { EventsService } from '../src/app/domain/events.service';
import { BackupService, validateState } from '../src/app/domain/backups';
import { newId, now, stock, inventoryKnown, grindOptions } from '../src/app/domain/models';
import { eventReport } from '../src/app/domain/reports';
let db: Dexie,
  repo: DexieRepository,
  sales: SalesService,
  inv: InventoryService,
  events: EventsService,
  catalog: CatalogService;
let variantId: string, generalId: string;
beforeEach(async () => {
  db = createDatabase('refine-' + newId());
  repo = new DexieRepository(db);
  sales = new SalesService(repo);
  inv = new InventoryService(repo);
  events = new EventsService(repo);
  catalog = new CatalogService(repo);
  await seedDatabase(repo);
  const state = await repo.read();
  variantId = state.variants.find((v) => v.sku === 'AL-BO-2')!.id;
  generalId = state.locations[0].id;
});
afterEach(async () => {
  await db.delete();
});
function command(quantity = 1, eventId?: string): Checkout {
  return {
    id: newId(),
    ...(eventId ? { eventId } : {}),
    lines: [{ variantId, quantity, expectedPriceMinor: 24500, grindOption: 'Molido' }],
    discountMinor: 0,
    method: 'cash',
  };
}
async function reconcile(
  quantity: number,
  mode: 'beginning' | 'current' = 'current',
  id = newId(),
) {
  const pending = (await repo.read()).items.filter(
    (i) => i.variantId === variantId && i.inventoryStatus === 'pending',
  );
  return inv.reconcile({
    id,
    variantId,
    quantity,
    mode,
    expectedPendingIds: pending.map((i) => i.id),
  });
}
async function restock(quantity: number) {
  await inv.record({
    id: newId(),
    variantId,
    locationId: generalId,
    quantity,
    type: 'restock',
    note: 'Conteo real',
  });
}
it('crea café con Molido y habilita Grano sin duplicar familias ni presentaciones', async () => {
  const old = (await repo.read()).products.find((p) => p.productType === 'packaged_coffee')!;
  const p = { ...old, id: newId(), name: 'Nuevo', grindOptions: undefined };
  await catalog.createSimple(p, 12300);
  let state = await repo.read();
  expect(grindOptions(state.products.find((row) => row.id === p.id)!)).toEqual(['Molido']);
  const v = state.variants.find((v) => v.productId === p.id)!;
  expect(v.name).toBe('Única');
  expect(v.unitCostMinor).toBeUndefined();
  await catalog.saveProduct({
    ...state.products.find((row) => row.id === p.id)!,
    grindOptions: ['Molido', 'Grano'],
  });
  state = await repo.read();
  expect(state.variants.filter((v) => v.productId === p.id)).toHaveLength(1);
  expect(state.products.filter((row) => row.id === p.id)).toHaveLength(1);
});
it('mantiene opciones heredadas sin reescribir el catálogo y precios independientes', async () => {
  const state = await repo.read();
  const p = { ...state.products.find((p) => p.name === 'Washed Blend')!, grindOptions: undefined };
  expect(grindOptions(p)).toEqual(['Grano', 'Molido']);
  const variants = state.variants.filter((v) => v.productId === p.id);
  expect(new Set(variants.map((v) => v.priceMinor)).size).toBe(4);
});
it('venta rápida desconocida guarda obligación, snapshot y pago sin inventar stock', async () => {
  await sales.checkout(command(2));
  const state = await repo.read();
  expect(state.sales[0].eventId).toBeUndefined();
  expect(state.items[0].inventoryStatus).toBe('pending');
  expect(state.items[0].grindOptionSnapshot).toBe('Molido');
  expect(state.movements).toHaveLength(0);
  expect(stock(state, variantId, generalId)).toBe(0);
  expect(inventoryKnown(state, variantId)).toBe(false);
  expect(eventReport(state, '').net).toBe(49000);
  validateState(state);
});
it('vende con borrador y descuenta primero evento y luego general sin transferencia ficticia', async () => {
  await restock(8);
  const eventId = await events.create({ id: newId(), name: 'Borrador' });
  await inv.transfer({ id: newId(), eventId, variantId, quantity: 2 });
  await sales.checkout(command(4, eventId));
  const state = await repo.read();
  expect(state.events[0].status).toBe('draft');
  expect(stock(state, variantId, generalId)).toBe(4);
  expect(stock(state, variantId, state.events[0].stockLocationId)).toBe(0);
  expect(state.movements.filter((m) => m.type === 'transfer_to_event')).toHaveLength(1);
  expect(state.items[0].inventoryAllocations).toHaveLength(2);
  validateState(state);
  await sales.void(state.sales[0].id, 'Prueba', true);
  const after = await repo.read();
  expect(stock(after, variantId, generalId)).toBe(6);
  expect(stock(after, variantId, state.events[0].stockLocationId)).toBe(2);
  validateState(after);
});
it('usa general en borrador sin asignación previa', async () => {
  await restock(3);
  const eventId = await events.create({ id: newId(), name: 'Venta espontánea' });
  await sales.checkout(command(2, eventId));
  const state = await repo.read();
  expect(state.movements.filter((m) => m.type === 'transfer_to_event')).toHaveLength(0);
  expect(stock(state, variantId, generalId)).toBe(1);
  validateState(state);
});
it.each(['beginning', 'current'] as const)(
  'conciliación %s no aplica dos veces las obligaciones',
  async (mode) => {
    await sales.checkout(command(2));
    const id = newId();
    await reconcile(8, mode, id);
    const state = await repo.read();
    expect(stock(state, variantId, generalId)).toBe(mode === 'beginning' ? 6 : 8);
    expect(state.items[0].inventoryStatus).toBe('resolved');
    expect(state.items[0].reconciliationId).toBe(id);
    validateState(state);
    await inv.reconcile({
      id,
      variantId,
      quantity: 8,
      mode,
      expectedPendingIds: [state.items[0].id],
    });
    expect(await repo.read()).toEqual(state);
    await sales.checkout(command());
    expect(stock(await repo.read(), variantId, generalId)).toBe(mode === 'beginning' ? 5 : 7);
  },
);
it('rechaza stock inicial menor que ventas y mantiene obligación', async () => {
  await sales.checkout(command(3));
  await expect(reconcile(2, 'beginning')).rejects.toThrow('no alcanza');
  expect((await repo.read()).items[0].inventoryStatus).toBe('pending');
  expect((await repo.read()).inventoryCounts).toHaveLength(0);
});
it('bloquea conteo obsoleto si se vendió mientras se conciliaba', async () => {
  await sales.checkout(command());
  const ids = (await repo.read()).items.map((i) => i.id);
  await sales.checkout(command());
  await expect(
    inv.reconcile({
      id: newId(),
      variantId,
      quantity: 10,
      mode: 'current',
      expectedPendingIds: ids,
    }),
  ).rejects.toThrow('cambiaron');
});
it('cero contado es conocido y bloquea venta hasta reposición', async () => {
  await reconcile(0);
  expect(inventoryKnown(await repo.read(), variantId)).toBe(true);
  await expect(sales.checkout(command())).rejects.toThrow('Stock insuficiente');
  expect((await repo.read()).sales).toHaveLength(0);
  await restock(1);
  await sales.checkout(command());
  await expect(sales.checkout(command())).rejects.toThrow('Stock insuficiente');
});
it('impide registrar entradas ambiguas mientras hay ventas pendientes', async () => {
  await sales.checkout(command());
  await expect(restock(5)).rejects.toThrow('pendientes');
});
it('anular pendiente cancela obligación sin fabricar una devolución', async () => {
  const sale = await sales.checkout(command());
  await sales.void(sale.id, 'Cancelación', true);
  const state = await repo.read();
  expect(state.items[0].inventoryStatus).toBe('cancelled');
  expect(state.movements).toHaveLength(0);
  validateState(state);
});
it.each(['beginning', 'current'] as const)(
  'anular después de conciliar %s devuelve unidades correctamente',
  async (mode) => {
    const sale = await sales.checkout(command(2));
    await reconcile(5, mode);
    await sales.void(sale.id, 'Devuelto', true);
    const state = await repo.read();
    expect(stock(state, variantId, generalId)).toBe(mode === 'beginning' ? 5 : 7);
    validateState(state);
  },
);
it('checkout doble clic es idempotente y concurrencia respeta stock', async () => {
  await restock(1);
  const cmd = command();
  await Promise.all([sales.checkout(cmd), sales.checkout(cmd)]);
  expect((await repo.read()).sales).toHaveLength(1);
  await expect(sales.checkout(command())).rejects.toThrow('Stock');
});
it('packs descuentan paquetes físicos y no descuentan unidades individuales', async () => {
  const state = await repo.read();
  for (const type of ['coffee_pod', 'merchandise']) {
    const product = state.products.find((p) => p.productType === type)!;
    const single = state.variants.find((v) => v.productId === product.id)!;
    const pack = {
      ...single,
      id: newId(),
      sku: '',
      name: 'Pack de 6',
      packUnits: 6,
      priceMinor: 9000,
    };
    await catalog.saveVariant(pack);
    await inv.record({
      id: newId(),
      variantId: pack.id,
      locationId: generalId,
      type: 'restock',
      quantity: 3,
      note: 'Tres packs físicos',
    });
    await sales.checkout({
      ...command(),
      lines: [{ variantId: pack.id, quantity: 2, expectedPriceMinor: 9000 }],
    });
    expect(stock(await repo.read(), pack.id, generalId)).toBe(1);
    expect(stock(await repo.read(), single.id, generalId)).toBe(0);
  }
  validateState(await repo.read());
});
it('gasto editado y anulado recalcula caja sin alterar ingresos y conserva auditoría', async () => {
  const eventId = await events.create({ id: newId(), name: 'Evento', openingCashMinor: 10000 });
  await sales.checkout(command(1, eventId));
  const id = newId();
  await events.expense({
    id,
    eventId,
    description: 'Transporte',
    category: 'transport',
    amountMinor: 3000,
    paymentMethod: 'cash',
    incurredAt: now(),
    createdAt: now(),
  });
  await events.correctExpense(
    id,
    { description: 'Taxi', category: 'transport', amountMinor: 2000, paymentMethod: 'cash' },
    'Monto corregido',
  );
  let state = await repo.read();
  expect(eventReport(state, eventId).expectedCash).toBe(32500);
  expect(eventReport(state, eventId).net).toBe(24500);
  expect(state.expenses[0].correctionHistory![0].amountMinor).toBe(3000);
  await events.voidExpense(id, 'Duplicado');
  state = await repo.read();
  expect(eventReport(state, eventId).expenses).toBe(0);
  expect(eventReport(state, eventId).expectedCash).toBe(34500);
  expect(state.expenses[0].voidedAt).toBeTruthy();
  validateState(state);
});
it('cierre exige conciliación y corrección posterior de gasto exige consentimiento explícito', async () => {
  const eventId = await events.create({ id: newId(), name: 'Evento' });
  await events.open(eventId);
  await sales.checkout(command(1, eventId));
  await expect(events.close(eventId, {}, '')).rejects.toThrow('Concilie');
  await reconcile(0);
  const id = newId();
  await events.expense({
    id,
    eventId,
    description: 'Stand',
    category: 'stand',
    amountMinor: 1000,
    paymentMethod: 'cash',
    incurredAt: now(),
    createdAt: now(),
  });
  await events.close(eventId, {}, '', 23500);
  await expect(events.voidExpense(id, 'Error')).rejects.toThrow('cerrado');
  await events.voidExpense(id, 'Error', true);
  const state = await repo.read();
  expect(state.events[0].closingCashMinor).toBe(23500);
  expect(eventReport(state, eventId).expectedCash).toBe(24500);
  await expect(sales.checkout(command(1, eventId))).rejects.toThrow('cerrado');
  validateState(state);
});
it('backup nuevo conserva obligaciones, conteos y anulaciones; importa formato anterior', async () => {
  const backups = new BackupService(repo);
  const old = await backups.export();
  const oldData = { ...old.data } as Record<string, unknown>;
  delete oldData['inventoryCounts'];
  expect(
    backups.preview(JSON.stringify({ ...old, schemaVersion: 1, data: oldData })).data
      .inventoryCounts,
  ).toEqual([]);
  await sales.checkout(command(2));
  await reconcile(3);
  const backup = await backups.export();
  await backups.restore(backup);
  expect(await repo.read()).toEqual(backup.data);
  const corrupted = structuredClone(backup);
  corrupted.data.items[0].reconciliationId = newId();
  await expect(backups.restore(corrupted)).rejects.toThrow();
});
it('rechaza un respaldo con evento cerrado e inventario pendiente', async () => {
  const eventId = await events.create({ id: newId(), name: 'Pendiente' });
  await sales.checkout(command(1, eventId));
  const state = await repo.read();
  state.events[0].status = 'closed';
  state.events[0].closedAt = now();
  expect(() => validateState(state)).toThrow('Pendiente inconsistente');
});
it('migración v2 a v3 conserva exactamente catálogo editado, stock, gastos, ventas y opciones', async () => {
  await restock(5);
  const eventId = await events.create({ id: newId(), name: 'Histórico' });
  await sales.checkout(command(1, eventId));
  await events.expense({
    id: newId(),
    eventId,
    description: 'Taxi',
    category: 'transport',
    amountMinor: 1000,
    incurredAt: now(),
    createdAt: now(),
  });
  await repo.transact((s) => {
    const v = s.variants.find((v) => v.id === variantId)!;
    v.priceMinor = 33300;
    v.name = 'Grano';
  });
  const before = await repo.read();
  const legacyName = 'v2-' + newId();
  const legacy = new Dexie(legacyName);
  legacy
    .version(2)
    .stores(
      Object.fromEntries(
        db.tables
          .filter((t) => t.name !== 'inventoryCounts' && t.name !== 'orders')
          .map((t) => [
            t.name,
            [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(','),
          ]),
      ),
    );
  await legacy.open();
  for (const table of legacy.tables) await table.bulkPut(before[table.name as keyof typeof before]);
  legacy.close();
  const upgraded = createDatabase(legacyName);
  try {
    const after = await new DexieRepository(upgraded).read();
    expect(after).toEqual(before);
    expect(upgraded.verno).toBe(4);
  } finally {
    await upgraded.delete();
  }
});
