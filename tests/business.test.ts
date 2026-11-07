import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { createDatabase } from '../src/app/infrastructure/indexeddb/database';
import { DexieRepository } from '../src/app/infrastructure/repositories/dexie.repository';
import { seedDatabase } from './fixtures/legacy-seed';
import { CatalogService } from '../src/app/domain/catalog.service';
import { InventoryService } from '../src/app/domain/inventory.service';
import { EventsService } from '../src/app/domain/events.service';
import { SalesService, Checkout } from '../src/app/domain/sales.service';
import { BackupService, toCsv, validateState, csvRows } from '../src/app/domain/backups';
import { eventReport } from '../src/app/domain/reports';
import { newId, now, parseMoney, stock } from '../src/app/domain/models';

let database: Dexie;
let repository: DexieRepository;
let inventory: InventoryService;
let events: EventsService;
let sales: SalesService;
let catalog: CatalogService;
let backups: BackupService;
let podId: string;
let generalId: string;
let eventId: string;
let locationId: string;
beforeEach(async () => {
  database = createDatabase(`test-${newId()}`);
  repository = new DexieRepository(database);
  inventory = new InventoryService(repository);
  events = new EventsService(repository);
  sales = new SalesService(repository);
  catalog = new CatalogService(repository);
  backups = new BackupService(repository);
  await seedDatabase(repository);
  const state = await repository.read();
  podId = state.variants.find((v) => v.sku === 'AL-POD-1')!.id;
  generalId = state.locations[0].id;
  eventId = await events.create({ id: newId(), name: 'Feria de prueba', openingCashMinor: 10000 });
  locationId = (await repository.read()).events[0].stockLocationId;
});
afterEach(async () => {
  await database.delete();
});
async function prepare(quantity = 30): Promise<void> {
  await inventory.record({
    id: newId(),
    variantId: podId,
    locationId: generalId,
    quantity,
    type: 'initial_stock',
    note: 'Conteo real',
  });
  await inventory.transfer({ id: newId(), variantId: podId, eventId, quantity });
  await events.open(eventId);
}
function checkout(quantity = 1, overrides: Partial<Checkout> = {}): Checkout {
  return {
    id: newId(),
    eventId,
    lines: [{ variantId: podId, quantity, expectedPriceMinor: 3500 }],
    discountMinor: 0,
    method: 'cash',
    ...overrides,
  };
}

describe('Catálogo y persistencia', () => {
  it('cambia estado y elimina del disco una presentación sin historial', async () => {
    await catalog.setVariantActive(podId, false);
    expect((await repository.read()).variants.find((v) => v.id === podId)?.isActive).toBe(false);
    await catalog.setVariantActive(podId, true);
    await catalog.deleteVariant(podId);
    expect((await repository.read()).variants.some((v) => v.id === podId)).toBe(false);
  });
  it('impide eliminar una presentación que tiene movimientos', async () => {
    await prepare();
    await expect(catalog.deleteVariant(podId)).rejects.toThrow('historial');
    expect(stock(await repository.read(), podId, locationId)).toBe(30);
  });
  it('inicializa semillas una sola vez, sin stock y con precios pendientes', async () => {
    await Promise.all([seedDatabase(repository), seedDatabase(repository)]);
    const state = await repository.read();
    expect(state.brands).toHaveLength(2);
    expect(state.products).toHaveLength(12);
    expect(state.variants).toHaveLength(25);
    expect(state.movements).toHaveLength(0);
    expect(state.variants.some((v) => v.sku === 'AL-BO-1')).toBe(false);
    expect(state.variants.find((v) => v.sku === 'AL-BO-2')?.priceMinor).toBe(24500);
    expect(state.variants.find((v) => v.sku === 'AL-POD-2')?.priceMinor).toBeUndefined();
  });
  it('crea variantes y rechaza un SKU duplicado', async () => {
    const existing = (await repository.read()).variants[0];
    const variant = { ...existing, id: newId(), sku: 'NUEVA-250', name: '250 g' };
    await catalog.saveVariant(variant);
    expect((await repository.read()).variants).toHaveLength(26);
    await expect(catalog.saveVariant({ ...variant, id: newId() })).rejects.toThrow('SKU');
  });
  it('exige unidades reales para poner precio a paquetes de pods', async () => {
    const variant = (await repository.read()).variants.find((v) => v.sku === 'AL-POD-2')!;
    await expect(catalog.saveVariant({ ...variant, priceMinor: 10000 })).rejects.toThrow('pods');
  });
  it('conserva datos al cerrar y reabrir IndexedDB', async () => {
    await prepare();
    const name = database.name;
    database.close();
    database = createDatabase(name);
    repository = new DexieRepository(database);
    expect(stock(await repository.read(), podId, locationId)).toBe(30);
  });
});
describe('Inventario atómico', () => {
  it('cumple 30 → 18 ventas + 4 muestras → 8 devueltos y evento en cero', async () => {
    await prepare();
    await sales.checkout(checkout(18));
    await inventory.record({
      id: newId(),
      variantId: podId,
      locationId,
      quantity: 4,
      type: 'sample',
      note: 'Degustación',
    });
    await events.close(eventId, { [podId]: 8 }, '');
    const state = await repository.read();
    expect(stock(state, podId, generalId)).toBe(8);
    expect(stock(state, podId, locationId)).toBe(0);
    expect(eventReport(state, eventId).units).toBe(18);
    expect(eventReport(state, eventId).samples).toBe(4);
    expect(state.movements).toHaveLength(5);
    expect(validateState(state)).toBeTruthy();
  });
  it('impide transferencias sin existencias', async () => {
    await expect(
      inventory.transfer({ id: newId(), eventId, variantId: podId, quantity: 1 }),
    ).rejects.toThrow('Stock');
    expect((await repository.read()).movements).toHaveLength(0);
  });
  it('las transferencias duplicadas no duplican unidades', async () => {
    await inventory.record({
      id: newId(),
      variantId: podId,
      locationId: generalId,
      quantity: 30,
      type: 'initial_stock',
      note: 'Inicial',
    });
    const input = { id: newId(), eventId, variantId: podId, quantity: 10 };
    await Promise.all([inventory.transfer(input), inventory.transfer(input)]);
    expect(stock(await repository.read(), podId, locationId)).toBe(10);
  });
  it('serializa escrituras desde dos conexiones y evita saldo negativo', async () => {
    await inventory.record({
      id: newId(),
      variantId: podId,
      locationId: generalId,
      quantity: 30,
      type: 'initial_stock',
      note: 'Inicial',
    });
    const other = createDatabase(database.name);
    const otherInventory = new InventoryService(new DexieRepository(other));
    try {
      const outcomes = await Promise.allSettled([
        inventory.transfer({ id: newId(), eventId, variantId: podId, quantity: 20 }),
        otherInventory.transfer({ id: newId(), eventId, variantId: podId, quantity: 20 }),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(stock(await repository.read(), podId, generalId)).toBe(10);
    } finally {
      other.close();
    }
  });
  it('rechaza muestras excesivas y no genera ingresos por muestras', async () => {
    await prepare(4);
    await expect(
      inventory.record({
        id: newId(),
        variantId: podId,
        locationId,
        quantity: 5,
        type: 'sample',
        note: 'Muestra',
      }),
    ).rejects.toThrow('Stock');
    await inventory.record({
      id: newId(),
      variantId: podId,
      locationId,
      quantity: 4,
      type: 'sample',
      note: 'Muestra',
    });
    expect(eventReport(await repository.read(), eventId).net).toBe(0);
  });
  it('no permite inventario inicial repetido ni unidades fraccionarias', async () => {
    await prepare();
    await expect(
      inventory.record({
        id: newId(),
        variantId: podId,
        locationId: generalId,
        quantity: 2,
        type: 'initial_stock',
        note: 'Inicial',
      }),
    ).rejects.toThrow('reposición');
    await expect(
      inventory.transfer({ id: newId(), eventId, variantId: podId, quantity: 1.5 }),
    ).rejects.toThrow();
  });
  it('separa existencias entre eventos', async () => {
    await prepare();
    const second = await events.create({ id: newId(), name: 'Otro evento' });
    await events.open(second);
    await expect(sales.checkout(checkout(1, { eventId: second }))).rejects.toThrow('Stock');
    expect(stock(await repository.read(), podId, locationId)).toBe(30);
  });
});
describe('Ventas y dinero', () => {
  it('convierte dinero a centavos exactos y rechaza fracciones adicionales', () => {
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('134.05')).toBe(13405);
    expect(() => parseMoney('1.001')).toThrow();
    expect(() => parseMoney('-2')).toThrow();
    expect(() => parseMoney('9007199254740991')).toThrow();
  });
  it('guarda venta, detalles, pago y descuento de stock una sola vez', async () => {
    await prepare();
    const input = checkout(2, { receivedMinor: 10000, discountMinor: 1 });
    await Promise.all([sales.checkout(input), sales.checkout(input)]);
    const state = await repository.read();
    expect(state.sales).toHaveLength(1);
    expect(state.payments).toHaveLength(1);
    expect(state.items).toHaveLength(1);
    expect(state.sales[0].totalMinor).toBe(6999);
    expect(state.sales[0].changeMinor).toBe(3001);
    expect(stock(state, podId, locationId)).toBe(28);
  });
  it('revierte todo si el segundo artículo no tiene stock', async () => {
    await prepare();
    const other = (await repository.read()).variants.find((v) => v.sku === 'AL-ST-1')!;
    await inventory.reconcile({
      id: newId(),
      variantId: other.id,
      quantity: 0,
      mode: 'current',
      expectedPendingIds: [],
    });
    const input = checkout();
    input.lines.push({ variantId: other.id, quantity: 1, expectedPriceMinor: 3000 });
    await expect(sales.checkout(input)).rejects.toThrow('Stock');
    const state = await repository.read();
    expect(state.sales).toHaveLength(0);
    expect(state.items).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
    expect(stock(state, podId, locationId)).toBe(30);
  });
  it('vende varios productos y distribuye descuentos sin perder centavos', async () => {
    await prepare();
    const other = (await repository.read()).variants.find((v) => v.sku === 'AL-ST-1')!;
    await inventory.record({
      id: newId(),
      variantId: other.id,
      locationId: generalId,
      quantity: 3,
      type: 'restock',
      note: 'Reposición',
    });
    await inventory.transfer({ id: newId(), variantId: other.id, eventId, quantity: 3 });
    const input = checkout(2, { discountMinor: 101, method: 'bac' });
    input.lines.push({ variantId: other.id, quantity: 1, expectedPriceMinor: 3000 });
    await sales.checkout(input);
    const state = await repository.read();
    expect(state.items.reduce((n, i) => n + i.lineDiscountMinor, 0)).toBe(101);
    expect(state.sales[0].totalMinor).toBe(9899);
    expect(stock(state, other.id, locationId)).toBe(2);
    expect(validateState(state)).toBeTruthy();
  });
  it('conserva el precio y marca históricos después de editar catálogo', async () => {
    await prepare();
    await sales.checkout(checkout());
    const state = await repository.read();
    await catalog.saveVariant({
      ...state.variants.find((v) => v.id === podId)!,
      priceMinor: 9900,
      isActive: false,
    });
    expect((await repository.read()).items[0].unitPriceMinor).toBe(3500);
  });
  it('rechaza precio desactualizado, faltante y efectivo insuficiente', async () => {
    await prepare();
    await expect(sales.checkout(checkout(1, { receivedMinor: 10 }))).rejects.toThrow(
      'insuficiente',
    );
    const input = checkout();
    input.lines[0].expectedPriceMinor = 1;
    await expect(sales.checkout(input)).rejects.toThrow('precio cambió');
    const missing = (await repository.read()).variants.find((v) => v.sku === 'AL-POD-2')!;
    input.lines = [{ variantId: missing.id, quantity: 1, expectedPriceMinor: 0 }];
    await expect(sales.checkout(input)).rejects.toThrow('precio');
  });
  it('bebidas no descuentan bolsas de café ni ingredientes', async () => {
    await prepare();
    const drink = (await repository.read()).variants.find((v) => v.sku === 'AL-BEV1-1')!;
    await catalog.saveVariant({ ...drink, priceMinor: 6000 });
    const input = checkout();
    input.lines = [{ variantId: drink.id, quantity: 1, expectedPriceMinor: 6000 }];
    await sales.checkout(input);
    const state = await repository.read();
    expect(state.movements.filter((m) => m.type === 'sale')).toHaveLength(0);
    expect(stock(state, podId, locationId)).toBe(30);
  });
  it('anula con reversa y conserva la obligación del reembolso', async () => {
    await prepare();
    const sale = await sales.checkout(checkout(2));
    await sales.void(sale.id, 'Cliente canceló', false);
    let state = await repository.read();
    expect(stock(state, podId, locationId)).toBe(30);
    expect(eventReport(state, eventId).net).toBe(0);
    expect(eventReport(state, eventId).pendingRefunds).toBe(7000);
    await expect(sales.void(sale.id, 'Otra', false)).rejects.toThrow('anulada');
    await expect(events.close(eventId, { [podId]: 30 }, '')).rejects.toThrow('reembolsos');
    await sales.markRefunded(sale.id);
    state = await repository.read();
    expect(state.sales[0].refundStatus).toBe('completed');
    expect(validateState(state)).toBeTruthy();
  });
});
describe('Cierre, reportes y respaldos', () => {
  it('exige motivo de diferencias y aplica ajuste más devolución atómica', async () => {
    await prepare();
    await expect(events.close(eventId, { [podId]: 28 }, '')).rejects.toThrow('diferencias');
    expect(stock(await repository.read(), podId, locationId)).toBe(30);
    await events.close(eventId, { [podId]: 28 }, 'Dos dañados');
    const state = await repository.read();
    expect(stock(state, podId, generalId)).toBe(28);
    expect(state.movements.filter((m) => m.type === 'adjustment_out')).toHaveLength(1);
    await expect(sales.checkout(checkout())).rejects.toThrow('cerrado');
  });
  it('impide un cierre basado en conteos obsoletos', async () => {
    await prepare();
    await sales.checkout(checkout());
    await expect(
      events.close(eventId, { [podId]: 30 }, '', undefined, { [podId]: 30 }),
    ).rejects.toThrow('cambió');
  });
  it('rechaza operaciones y anulaciones después del cierre', async () => {
    await prepare();
    const sale = await sales.checkout(checkout());
    await events.close(eventId, { [podId]: 29 }, '');
    await expect(sales.void(sale.id, 'Retorno', true)).rejects.toThrow('cerrados');
    await expect(
      inventory.transfer({ id: newId(), eventId, variantId: podId, quantity: 1 }),
    ).rejects.toThrow('cerrado');
  });
  it('reporta costos incompletos sin inventar utilidad y registra gastos', async () => {
    await prepare();
    await sales.checkout(checkout());
    await events.expense({
      id: newId(),
      eventId,
      category: 'stand',
      description: 'Stand',
      amountMinor: 1000,
      paymentMethod: 'cash',
      incurredAt: now(),
      createdAt: now(),
    });
    const report = eventReport(await repository.read(), eventId);
    expect(report.costsKnown).toBe(false);
    expect(report.estimatedProfit).toBeUndefined();
    expect(report.expenses).toBe(1000);
    expect(report.expectedCash).toBe(12500);
  });
  it('exporta y restaura sin duplicar inventarios ni ventas', async () => {
    await prepare();
    await sales.checkout(checkout());
    const backup = await backups.export();
    await sales.checkout(checkout(2));
    await backups.restore(backups.preview(JSON.stringify(backup)));
    expect(await repository.read()).toEqual(backup.data);
    await backups.restore(backup);
    expect((await repository.read()).sales).toHaveLength(1);
    expect(stock(await repository.read(), podId, locationId)).toBe(29);
  });
  it('rechaza versiones, referencias y totales corruptos antes de reemplazar', async () => {
    await prepare();
    await sales.checkout(checkout());
    const backup = await backups.export();
    expect(() => backups.preview(JSON.stringify({ ...backup, schemaVersion: 999 }))).toThrow();
    const bad = structuredClone(backup);
    bad.data.products[0].brandId = newId();
    await expect(backups.restore(bad)).rejects.toThrow();
    const badSale = structuredClone(backup);
    badSale.data.sales[0].totalMinor = 1;
    await expect(backups.restore(badSale)).rejects.toThrow('Totales');
    expect((await repository.read()).sales[0].totalMinor).toBe(3500);
  });
  it('rechaza reversas duplicadas y stock negativo en backups', async () => {
    await prepare();
    const backup = await backups.export();
    const bad = structuredClone(backup);
    bad.data.movements.find((m) => m.type === 'transfer_to_event')!.quantity = 31;
    await expect(backups.restore(bad)).rejects.toThrow('negativas');
  });
  it('CSV preserva comillas, español, saltos de línea y bloquea fórmulas', async () => {
    const csv = toCsv([
      { nombre: '=1+1', nota: 'Café "especial"\nHonduras' },
      { nombre: ' @SUM(A1)', nota: 'Normal' },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('""especial""');
    expect(csv).toContain("' @SUM(A1)");
    expect(csvRows(await repository.read(), 'inventory', '')).toHaveLength(44);
  });
});
