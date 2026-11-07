import { z } from 'zod';
import { DataRepository } from './repository';
import { State, stateSchema, mustFind, requireRule, stock, tableNames, now } from './models';
import { eventReport } from './reports';

export const backupSchema = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  appVersion: z.string().min(1),
  exportedAt: z.iso.datetime(),
  deviceInstallId: z.uuid(),
  data: stateSchema,
});
export type Backup = z.infer<typeof backupSchema>;

export function validateState(input: unknown): State {
  const state = stateSchema.parse(input);
  for (const table of tableNames)
    requireRule(
      new Set(state[table].map((row) => row.id)).size === state[table].length,
      `IDs duplicados en ${table}.`,
    );
  requireRule(state.settings.length === 1, 'El respaldo debe tener una configuración.');
  requireRule(
    state.locations.filter((l) => l.type === 'general').length === 1,
    'Debe existir un Almacén General.',
  );
  for (const [label, values] of [
    ['SKU', state.variants.map((v) => v.sku)],
    ['recibo', state.sales.map((s) => s.receiptNumber)],
    ['marca', state.brands.map((b) => b.slug)],
    ['categoría', state.categories.map((c) => c.name)],
  ] as const)
    requireRule(new Set(values).size === values.length, `${label} duplicado.`);
  for (const product of state.products) {
    mustFind(state.brands, product.brandId);
    mustFind(state.categories, product.categoryId);
  }
  for (const variant of state.variants) mustFind(state.products, variant.productId);
  for (const event of state.events) {
    const location = mustFind(state.locations, event.stockLocationId);
    requireRule(
      location.type === 'event' && location.eventId === event.id,
      'Ubicación de evento inconsistente.',
    );
    requireRule(event.status !== 'closed' || event.closedAt, 'Falta fecha de cierre.');
  }
  for (const location of state.locations) {
    if (location.type === 'general')
      requireRule(!location.eventId, 'El almacén general no pertenece a un evento.');
    else {
      requireRule(location.eventId, 'Falta evento de ubicación.');
      requireRule(
        mustFind(state.events, location.eventId).stockLocationId === location.id,
        'Ubicación duplicada.',
      );
    }
  }
  const running = new Map<string, number>();
  let previousTimestamp = '';
  for (const movement of [...state.movements].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  )) {
    if (movement.occurredAt !== previousTimestamp) {
      requireRule(
        [...running.values()].every((v) => Number.isSafeInteger(v) && v >= 0),
        'El respaldo contiene existencias históricas negativas.',
      );
      previousTimestamp = movement.occurredAt;
    }
    requireRule(
      mustFind(state.variants, movement.variantId).trackInventory,
      'Movimiento para variante sin inventario.',
    );
    requireRule(
      (movement.fromLocationId || movement.toLocationId) &&
        movement.fromLocationId !== movement.toLocationId,
      'Movimiento inválido.',
    );
    if (movement.eventId) mustFind(state.events, movement.eventId);
    if (movement.saleId) mustFind(state.sales, movement.saleId);
    if (['initial_stock', 'restock'].includes(movement.type))
      requireRule(
        movement.toLocationId &&
          mustFind(state.locations, movement.toLocationId).type === 'general',
        'Las entradas deben llegar al Almacén General.',
      );
    if (!['sale', 'sale_void_reversal'].includes(movement.type))
      requireRule(!movement.saleId, 'Referencia de venta en movimiento ajeno.');
    const inbound = ['initial_stock', 'restock', 'adjustment_in', 'sale_void_reversal'].includes(
      movement.type,
    );
    const outbound = ['sale', 'sample', 'waste', 'adjustment_out'].includes(movement.type);
    requireRule(
      !inbound || (!movement.fromLocationId && movement.toLocationId),
      'Movimiento entrante inconsistente.',
    );
    requireRule(
      !outbound || (movement.fromLocationId && !movement.toLocationId),
      'Movimiento saliente inconsistente.',
    );
    if (movement.type === 'transfer_to_event' || movement.type === 'return_to_general') {
      requireRule(
        movement.fromLocationId && movement.toLocationId && movement.eventId,
        'Transferencia incompleta.',
      );
      const from = mustFind(state.locations, movement.fromLocationId);
      const to = mustFind(state.locations, movement.toLocationId);
      requireRule(
        movement.type === 'transfer_to_event'
          ? from.type === 'general' && to.eventId === movement.eventId
          : to.type === 'general' && from.eventId === movement.eventId,
        'Dirección de transferencia incorrecta.',
      );
    }
    for (const [locationId, sign] of [
      [movement.fromLocationId, -1],
      [movement.toLocationId, 1],
    ] as const) {
      if (!locationId) continue;
      const location = mustFind(state.locations, locationId);
      if (location.eventId)
        requireRule(movement.eventId === location.eventId, 'Movimiento asociado a otro evento.');
      const key = `${movement.variantId}/${locationId}`;
      running.set(key, (running.get(key) ?? 0) + movement.quantity * sign);
    }
  }
  // Same-millisecond movements may be stored in primary-key order: validate each timestamp
  // as a group and validate exact sale/reversal effects separately below.
  requireRule(
    [...running.values()].every((v) => Number.isSafeInteger(v) && v >= 0),
    'El respaldo genera existencias negativas.',
  );
  for (const event of state.events.filter((e) => e.status === 'closed'))
    requireRule(
      state.variants.every((v) => stock(state, v.id, event.stockLocationId) === 0),
      'Evento cerrado con existencias.',
    );
  for (const expense of state.expenses) mustFind(state.events, expense.eventId);
  for (const payment of state.payments) mustFind(state.sales, payment.saleId);
  for (const item of state.items) {
    mustFind(state.sales, item.saleId);
    mustFind(state.variants, item.variantId);
    requireRule(
      item.lineTotalMinor === item.quantity * item.unitPriceMinor - item.lineDiscountMinor,
      'Detalle de venta inconsistente.',
    );
  }
  for (const sale of state.sales) {
    const event = sale.eventId ? mustFind(state.events, sale.eventId) : undefined;
    const items = state.items.filter((i) => i.saleId === sale.id);
    const payments = state.payments.filter((p) => p.saleId === sale.id);
    requireRule(items.length > 0 && payments.length === 1, 'Venta sin detalles o pago único.');
    requireRule(
      sale.subtotalMinor === items.reduce((n, i) => n + i.unitPriceMinor * i.quantity, 0) &&
        sale.discountMinor === items.reduce((n, i) => n + i.lineDiscountMinor, 0) &&
        sale.totalMinor === sale.subtotalMinor - sale.discountMinor &&
        sale.totalMinor === items.reduce((n, i) => n + i.lineTotalMinor, 0),
      'Totales de venta inconsistentes.',
    );
    const payment = payments[0]!;
    requireRule(
      payment.amountMinor === sale.totalMinor &&
        sale.totalPaidMinor === sale.totalMinor &&
        sale.changeMinor === (payment.changeMinor ?? 0) &&
        (payment.receivedMinor ?? payment.amountMinor) - (payment.changeMinor ?? 0) ===
          payment.amountMinor,
      'Pago inconsistente.',
    );
    requireRule(
      payment.method === 'cash' || (payment.changeMinor ?? 0) === 0,
      'Cambio no válido para pago electrónico.',
    );
    requireRule(
      sale.status !== 'voided' || (sale.voidReason && sale.voidedAt && sale.refundStatus),
      'Anulación incompleta.',
    );
    requireRule(
      sale.status !== 'completed' || (!sale.refundStatus && !sale.voidedAt),
      'Estado de venta inconsistente.',
    );
    requireRule(sale.refundStatus !== 'completed' || sale.refundedAt, 'Reembolso sin fecha.');
    requireRule(
      event?.status !== 'closed' || sale.refundStatus !== 'pending',
      'Evento cerrado con reembolso pendiente.',
    );
    for (const item of items) {
      const count = item.reconciliationId
        ? mustFind(state.inventoryCounts, item.reconciliationId)
        : undefined;
      if (item.inventoryStatus) {
        requireRule(
          item.trackInventorySnapshot &&
            item.inventoryLocationId &&
            mustFind(state.locations, item.inventoryLocationId).type === 'general',
          'Obligación de inventario inválida.',
        );
        requireRule(
          item.inventoryStatus !== 'pending' ||
            (sale.status === 'completed' && !count && event?.status !== 'closed'),
          'Pendiente inconsistente.',
        );
        requireRule(
          item.inventoryStatus !== 'cancelled' || (sale.status === 'voided' && !count),
          'Cancelación inconsistente.',
        );
        requireRule(
          item.inventoryStatus !== 'resolved' ||
            (count && count.variantId === item.variantId && count.pendingItemIds.includes(item.id)),
          'Conciliación sin referencia.',
        );
      } else requireRule(!count && !item.inventoryLocationId, 'Conciliación sin obligación.');
      const allocations =
        item.inventoryAllocations ??
        (item.trackInventorySnapshot && !item.inventoryStatus && event
          ? [{ locationId: event.stockLocationId, quantity: item.quantity }]
          : []);
      requireRule(
        !item.inventoryStatus || !item.inventoryAllocations?.length,
        'Asignaciones en obligación pendiente.',
      );
      if (!item.inventoryStatus) {
        requireRule(
          allocations.reduce((n, a) => n + a.quantity, 0) ===
            (item.trackInventorySnapshot ? item.quantity : 0),
          'Asignación de stock incompleta.',
        );
        for (const a of allocations)
          requireRule(
            state.movements
              .filter(
                (m) =>
                  m.type === 'sale' &&
                  m.referenceId === item.id &&
                  m.fromLocationId === a.locationId,
              )
              .reduce((n, m) => n + m.quantity, 0) === a.quantity,
            'Movimientos de venta no coinciden con el origen registrado.',
          );
      }
      for (const type of ['sale', 'sale_void_reversal'] as const) {
        const movements = state.movements.filter(
          (m) => m.saleId === sale.id && m.referenceId === item.id && m.type === type,
        );
        const pending = item.inventoryStatus === 'pending' || item.inventoryStatus === 'cancelled';
        const expected =
          item.trackInventorySnapshot &&
          !pending &&
          (type === 'sale' ? count?.mode !== 'current' : sale.status === 'voided');
        requireRule(
          movements.reduce((n, m) => n + m.quantity, 0) === (expected ? item.quantity : 0),
          'Movimientos de venta o reversa inconsistentes.',
        );
        for (const movement of movements) {
          const locationId = type === 'sale' ? movement.fromLocationId : movement.toLocationId;
          const location = locationId ? mustFind(state.locations, locationId) : undefined;
          requireRule(
            movement.variantId === item.variantId &&
              movement.eventId === sale.eventId &&
              (location?.type === 'general' || locationId === event?.stockLocationId),
            'Origen de inventario inconsistente.',
          );
        }
        if (type === 'sale_void_reversal' && expected) {
          const outgoing = state.movements.filter(
            (m) => m.type === 'sale' && m.referenceId === item.id,
          );
          const sources = new Set([
            ...outgoing.map((m) => m.fromLocationId),
            ...movements.map((m) => m.toLocationId),
          ]);
          for (const source of sources)
            requireRule(
              movements
                .filter((m) => m.toLocationId === source)
                .reduce((n, m) => n + m.quantity, 0) ===
                (count?.mode === 'current'
                  ? source === item.inventoryLocationId
                    ? item.quantity
                    : 0
                  : outgoing
                      .filter((m) => m.fromLocationId === source)
                      .reduce((n, m) => n + m.quantity, 0)),
              'Reversa en ubicación incorrecta.',
            );
        }
      }
    }
  }
  const resolvedItems = new Set<string>();
  for (const count of state.inventoryCounts) {
    mustFind(state.variants, count.variantId);
    requireRule(
      mustFind(state.locations, count.locationId).type === 'general',
      'Conteo fuera del almacén general.',
    );
    for (const id of count.pendingItemIds) {
      requireRule(!resolvedItems.has(id), 'Obligación conciliada dos veces.');
      resolvedItems.add(id);
      const item = mustFind(state.items, id);
      requireRule(
        item.inventoryStatus === 'resolved' &&
          item.reconciliationId === count.id &&
          item.variantId === count.variantId &&
          item.inventoryLocationId === count.locationId,
        'Referencia de conciliación inválida.',
      );
    }
  }

  for (const movement of state.movements.filter((m) =>
    ['sale', 'sale_void_reversal'].includes(m.type),
  ))
    requireRule(
      movement.saleId &&
        movement.referenceId &&
        state.items.some((i) => i.id === movement.referenceId && i.saleId === movement.saleId),
      'Movimiento de venta sin detalle.',
    );
  return state;
}

export class BackupService {
  constructor(private readonly repository: DataRepository) {}
  async export(): Promise<Backup> {
    const state = await this.repository.read();
    return {
      schemaVersion: 3,
      appVersion: '1.1.1',
      exportedAt: now(),
      deviceInstallId: state.settings[0]!.deviceInstallId,
      data: state,
    };
  }
  preview(json: string): Backup {
    requireRule(json.length < 200 * 1024 * 1024, 'El respaldo excede 200 MB.');
    const backup = backupSchema.parse(JSON.parse(json) as unknown);
    backup.data = validateState(backup.data);
    requireRule(
      backup.deviceInstallId === backup.data.settings[0]!.deviceInstallId,
      'Identificador de instalación inconsistente.',
    );
    return backup;
  }
  async restore(backup: Backup): Promise<void> {
    const checked = this.preview(JSON.stringify(backup));
    await this.repository.replace(checked.data);
  }
}

export function toCsv(rows: Record<string, unknown>[]): string {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown): string => {
    let text = value === undefined || value === null ? '' : String(value);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      headers.map(cell).join(','),
      ...rows.map((row) => headers.map((h) => cell(row[h])).join(',')),
    ].join('\r\n')
  );
}
export function csvRows(state: State, kind: string, eventId: string): Record<string, unknown>[] {
  if (kind === 'inventory')
    return state.locations.flatMap((l) =>
      state.variants
        .filter((v) => v.trackInventory)
        .map((v) => ({
          ubicacion: l.name,
          sku: v.sku,
          variante: v.name,
          unidades: stock(state, v.id, l.id),
        })),
    );
  if (kind === 'report') {
    const report = eventReport(state, eventId);
    return Object.entries(report)
      .filter(([, value]) => typeof value !== 'object')
      .map(([indicador, valor]) => ({
        indicador,
        valor,
        dinero: 'Importes monetarios en centavos HNL',
      }));
  }
  if (kind === 'items') {
    const ids = new Set(
      state.sales.filter((s) => !eventId || s.eventId === eventId).map((s) => s.id),
    );
    return state.items.filter((i) => ids.has(i.saleId));
  }
  if (kind === 'sales') return state.sales.filter((s) => !eventId || s.eventId === eventId);
  if (kind === 'movements') return state.movements.filter((m) => !eventId || m.eventId === eventId);
  if (kind === 'expenses') return state.expenses.filter((e) => !eventId || e.eventId === eventId);
  throw new Error('Tipo de exportación desconocido.');
}
