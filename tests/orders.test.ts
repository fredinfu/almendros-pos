import { beforeEach, afterEach, it, expect } from 'vitest';
import Dexie from 'dexie';
import { createDatabase } from '../src/app/infrastructure/indexeddb/database';
import { DexieRepository } from '../src/app/infrastructure/repositories/dexie.repository';
import { seedDatabase } from './fixtures/legacy-seed';
import { OrdersService, OrderInput } from '../src/app/domain/orders.service';
import { InventoryService } from '../src/app/domain/inventory.service';
import { SalesService } from '../src/app/domain/sales.service';
import { CatalogService } from '../src/app/domain/catalog.service';
import { EventsService } from '../src/app/domain/events.service';
import { BackupService, validateState } from '../src/app/domain/backups';
import { newId, stock } from '../src/app/domain/models';
import { eventReport } from '../src/app/domain/reports';
import {
  defaultProfile,
  normalizePhone,
  orderMessage,
  whatsappUrl,
} from '../src/app/domain/communication';
let db: ReturnType<typeof createDatabase>,
  repo: DexieRepository,
  orders: OrdersService,
  inventory: InventoryService,
  variantId: string,
  locationId: string;
beforeEach(async () => {
  db = createDatabase('orders-' + newId());
  repo = new DexieRepository(db);
  await seedDatabase(repo);
  orders = new OrdersService(repo);
  inventory = new InventoryService(repo);
  const state = await repo.read();
  variantId = state.variants.find((v) => v.sku === 'AL-POD-1')!.id;
  locationId = state.locations[0].id;
});
afterEach(async () => {
  await db.delete();
});
it('actualiza v3 a v4 sin reescribir ventas ni catálogo existentes', async () => {
  const before = await repo.read();
  const legacyName = 'orders-v3-' + newId();
  const legacy = new Dexie(legacyName);
  legacy
    .version(3)
    .stores(
      Object.fromEntries(
        db.tables
          .filter((t) => t.name !== 'orders')
          .map((t) => [
            t.name,
            [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(','),
          ]),
      ),
    );
  await legacy.open();
  for (const table of legacy.tables) await table.bulkPut(before[table.name as keyof typeof before]);
  legacy.close();
  const migrated = createDatabase(legacyName);
  try {
    expect(await new DexieRepository(migrated).read()).toEqual(before);
    expect(migrated.verno).toBe(4);
  } finally {
    await migrated.delete();
  }
});
it('entregar y cobrar simultáneamente conserva un pago y una sola salida', async () => {
  await stockUp();
  const order = await orders.create(input());
  await orders.pack(order.id);
  await Promise.all([orders.deliver(order.id), orders.pay(order.id, { method: 'bac' })]);
  const state = await repo.read();
  expect(state.payments).toHaveLength(1);
  expect(stock(state, variantId, locationId)).toBe(8);
  expect(state.orders[0].status).toBe('delivered');
  validateState(state);
});
const input = (): OrderInput => ({
  id: newId(),
  customer: {
    name: 'Cliente de prueba',
    phone: '50499999999',
    fulfillment: 'delivery',
    address: 'Dirección ficticia',
    notes: '',
  },
  lines: [{ variantId, quantity: 2, expectedPriceMinor: 3500 }],
  discountMinor: 500,
});
async function stockUp(quantity = 10) {
  await inventory.record({
    id: newId(),
    variantId,
    locationId,
    quantity,
    type: 'initial_stock',
    note: 'Stock de prueba',
  });
}
it('pedido abierto no es venta ni reserva; entrega sin pago descuenta una vez, cobrar después no duplica', async () => {
  await stockUp();
  const o = await orders.create(input());
  let s = await repo.read();
  expect(s.sales).toHaveLength(0);
  expect(stock(s, variantId, locationId)).toBe(10);
  await orders.pack(o.id);
  await Promise.all([orders.deliver(o.id), orders.deliver(o.id)]);
  s = await repo.read();
  expect(stock(s, variantId, locationId)).toBe(8);
  expect(s.payments).toHaveLength(0);
  expect(eventReport(s, '').net).toBe(0);
  expect(eventReport(s, '').receivables).toBe(6500);
  validateState(s);
  await Promise.all([
    orders.pay(o.id, { method: 'cash', receivedMinor: 7000 }),
    orders.pay(o.id, { method: 'cash', receivedMinor: 7000 }),
  ]);
  s = await repo.read();
  expect(s.payments).toHaveLength(1);
  expect(s.sales).toHaveLength(1);
  expect(s.sales[0].changeMinor).toBe(500);
  expect(stock(s, variantId, locationId)).toBe(8);
  expect(eventReport(s, '').net).toBe(6500);
  expect(eventReport(s, '').receivables).toBe(0);
  validateState(s);
});
it('cobrar antes de entregar descuenta una vez y conserva precio del pedido', async () => {
  await stockUp();
  const o = await orders.create(input());
  const v = (await repo.read()).variants.find((v) => v.id === variantId)!;
  await new CatalogService(repo).saveVariant({ ...v, priceMinor: 9900 });
  await orders.pay(o.id, { method: 'bac' });
  await orders.pack(o.id);
  await orders.deliver(o.id);
  const s = await repo.read();
  expect(s.sales[0].totalMinor).toBe(6500);
  expect(stock(s, variantId, locationId)).toBe(8);
  expect(s.movements.filter((m) => m.type === 'sale')).toHaveLength(1);
  validateState(s);
});
it('stock insuficiente revierte entrega y pago íntegros; no cambia estado del pedido', async () => {
  await stockUp(1);
  const o = await orders.create(input());
  await orders.pack(o.id);
  const before = await repo.read();
  await expect(orders.deliver(o.id)).rejects.toThrow('Stock insuficiente');
  expect(await repo.read()).toEqual(before);
  await expect(orders.pay(o.id, { method: 'cash' })).rejects.toThrow('Stock insuficiente');
  expect(await repo.read()).toEqual(before);
});
it('entrega con stock desconocido se concilia antes del cobro sin descontarlo dos veces', async () => {
  const o = await orders.create(input());
  await orders.pack(o.id);
  await orders.deliver(o.id);
  let s = await repo.read();
  validateState(s);
  const ids = s.items.map((i) => i.id);
  await inventory.reconcile({
    id: newId(),
    variantId,
    quantity: 8,
    mode: 'current',
    expectedPendingIds: ids,
  });
  await orders.pay(o.id, { method: 'cash' });
  s = await repo.read();
  expect(stock(s, variantId, locationId)).toBe(8);
  expect(s.movements.filter((m) => m.type === 'sale')).toHaveLength(0);
  validateState(s);
});
it('cancelación de entrega impaga devuelve stock, exige motivo y guarda foto sin reembolso ficticio', async () => {
  await stockUp();
  const o = await orders.create(input());
  await orders.pack(o.id);
  await orders.deliver(o.id);
  await expect(orders.cancel(o.id, ' ', false)).rejects.toThrow('motivo');
  const evidence = { dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 1, height: 1 };
  await orders.cancel(o.id, 'Cliente devolvió el pedido', false, evidence);
  const s = await repo.read();
  expect(stock(s, variantId, locationId)).toBe(10);
  expect(s.payments).toHaveLength(0);
  expect(s.sales[0].voidEvidence).toEqual(evidence);
  expect(s.sales[0].refundStatus).toBe('completed');
  validateState(s);
});
it('anular venta pagada también cancela su pedido y no admite un segundo cobro', async () => {
  await stockUp();
  const o = await orders.create(input());
  await orders.pay(o.id, { method: 'bac' });
  await new SalesService(repo).void(o.id, 'Pedido devuelto', false);
  const s = await repo.read();
  expect(s.orders[0].status).toBe('cancelled');
  expect(s.sales[0].refundStatus).toBe('pending');
  await expect(orders.pay(o.id, { method: 'cash' })).rejects.toThrow('cancelado');
  validateState(s);
});
it('respaldo incluye cliente, pedidos, evidencia y entregas pendientes; rechaza enlaces y totales alterados', async () => {
  const cmd = input();
  cmd.lines.push({ ...cmd.lines[0], quantity: 1 });
  const o = await orders.create(cmd);
  await orders.pack(o.id);
  await orders.deliver(o.id);
  const backups = new BackupService(repo);
  const backup = await backups.export();
  expect(backup.schemaVersion).toBe(4);
  expect(backups.preview(JSON.stringify(backup)).data.orders).toHaveLength(1);
  const other = createDatabase('restore-' + newId());
  try {
    const target = new DexieRepository(other);
    await new BackupService(target).restore(backup);
    expect(await target.read()).toEqual(await repo.read());
  } finally {
    await other.delete();
  }
  const bad = structuredClone(backup.data);
  bad.orders[0].totalMinor++;
  expect(() => validateState(bad)).toThrow();
  const links = structuredClone(backup.data);
  links.orders[0].saleId = newId();
  expect(() => validateState(links)).toThrow();
});
it('no cierra evento con pedido por cobrar/entregar y no elimina productos referenciados', async () => {
  const events = new EventsService(repo);
  const eventId = await events.create({ id: newId(), name: 'Evento' });
  await events.open(eventId);
  const o = await orders.create({ ...input(), eventId });
  await expect(events.close(eventId, {}, '')).rejects.toThrow('pedidos');
  await orders.cancel(o.id, 'No continuará', false);
  await events.close(eventId, {}, '');
  validateState(await repo.read());
});
it('WhatsApp conserva total exacto, entrega y contactos; teléfono validado y URL codificada', async () => {
  const o = await orders.create(input());
  const text = orderMessage(o, defaultProfile(), false);
  expect(text).toContain('L 65.00');
  expect(text).toContain('Pendiente');
  expect(text).toContain('Dirección ficticia');
  expect(text).toContain('https://wa.me/50488793266');
  const url = new URL(whatsappUrl(o.customer.phone, text));
  expect(url.searchParams.get('text')).toBe(text);
  expect(url.pathname).toBe('/50499999999');
  expect(normalizePhone('8879-3266')).toBe('50488793266');
  expect(normalizePhone('javascript:12345678')).toBe('');
});
