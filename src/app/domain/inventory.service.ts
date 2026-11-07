import { DataRepository } from './repository';
import {
  Movement,
  State,
  movementSchema,
  mustFind,
  now,
  newId,
  requireRule,
  stock,
} from './models';

export function appendMovement(state: State, input: Movement): void {
  const movement = movementSchema.parse(input);
  requireRule(movement.fromLocationId || movement.toLocationId, 'Seleccione una ubicación.');
  requireRule(
    movement.fromLocationId !== movement.toLocationId,
    'Origen y destino deben ser distintos.',
  );
  requireRule(
    mustFind(state.variants, movement.variantId).trackInventory,
    'Esta variante no controla existencias.',
  );
  for (const locationId of [movement.fromLocationId, movement.toLocationId]) {
    if (!locationId) continue;
    const location = mustFind(state.locations, locationId);
    if (location.eventId)
      requireRule(
        mustFind(state.events, location.eventId).status !== 'closed',
        'El evento está cerrado.',
      );
  }
  if (movement.fromLocationId)
    requireRule(
      stock(state, movement.variantId, movement.fromLocationId) >= movement.quantity,
      'Stock insuficiente.',
    );
  requireRule(!state.movements.some((m) => m.id === movement.id), 'Movimiento duplicado.');
  state.movements.push(movement);
}

export class InventoryService {
  constructor(private readonly repository: DataRepository) {}
  reconcile(input: {
    id: string;
    variantId: string;
    quantity: number;
    mode: 'beginning' | 'current';
    expectedPendingIds: string[];
  }): Promise<void> {
    return this.repository.transact((state) => {
      if (state.inventoryCounts.some((c) => c.id === input.id)) return;
      requireRule(
        Number.isSafeInteger(input.quantity) && input.quantity >= 0 && input.quantity <= 1000000,
        'Indique una cantidad entera entre 0 y 1000000.',
      );
      requireRule(['beginning', 'current'].includes(input.mode), 'Seleccione el tipo de conteo.');
      const variant = mustFind(state.variants, input.variantId);
      requireRule(variant.trackInventory, 'Esta presentación no controla inventario.');
      const general = state.locations.find((l) => l.type === 'general')!;
      const pending = state.items.filter(
        (i) => i.variantId === input.variantId && i.inventoryStatus === 'pending',
      );
      requireRule(
        JSON.stringify(pending.map((i) => i.id).sort()) ===
          JSON.stringify([...input.expectedPendingIds].sort()),
        'Las ventas pendientes cambiaron. Revise el conteo otra vez.',
      );
      const total = pending.reduce((n, i) => n + i.quantity, 0);
      const registered =
        state.movements.some((m) => m.variantId === input.variantId) ||
        state.inventoryCounts.some((c) => c.variantId === input.variantId);
      requireRule(
        input.mode !== 'beginning' || !registered,
        'El inventario ya está registrado. Use el conteo físico actual del almacén.',
      );
      requireRule(
        input.mode !== 'beginning' || input.quantity >= total,
        'El stock inicial no alcanza para las ventas pendientes. Revise el conteo.',
      );
      const timestamp = now();
      const difference = input.quantity - stock(state, variant.id, general.id);
      if (difference)
        appendMovement(state, {
          id: newId(),
          variantId: variant.id,
          quantity: Math.abs(difference),
          type: difference > 0 ? 'adjustment_in' : 'adjustment_out',
          ...(difference > 0 ? { toLocationId: general.id } : { fromLocationId: general.id }),
          referenceId: input.id,
          note:
            input.mode === 'current'
              ? 'Conteo físico actual; ventas previas ya excluidas'
              : 'Stock al inicio del período',
          occurredAt: timestamp,
          createdAt: timestamp,
        });
      for (const item of pending) {
        const sale = mustFind(state.sales, item.saleId);
        if (input.mode === 'beginning')
          appendMovement(state, {
            id: newId(),
            variantId: variant.id,
            quantity: item.quantity,
            type: 'sale',
            fromLocationId: general.id,
            saleId: sale.id,
            ...(sale.eventId ? { eventId: sale.eventId } : {}),
            referenceId: item.id,
            occurredAt: timestamp,
            createdAt: timestamp,
          });
        item.inventoryStatus = 'resolved';
        item.reconciliationId = input.id;
      }
      state.inventoryCounts.push({
        id: input.id,
        variantId: variant.id,
        locationId: general.id,
        quantity: input.quantity,
        mode: input.mode,
        pendingItemIds: pending.map((i) => i.id),
        occurredAt: timestamp,
      });
    });
  }
  record(input: {
    id: string;
    variantId: string;
    locationId: string;
    quantity: number;
    type: 'initial_stock' | 'restock' | 'sample' | 'waste' | 'adjustment_in' | 'adjustment_out';
    note: string;
  }): Promise<void> {
    return this.repository.transact((state) => {
      if (state.movements.some((m) => m.id === input.id)) return;
      const location = mustFind(state.locations, input.locationId);
      requireRule(
        !state.items.some(
          (i) => i.variantId === input.variantId && i.inventoryStatus === 'pending',
        ),
        'Hay ventas pendientes. Use Registrar / conciliar stock antes de agregar movimientos.',
      );
      requireRule(input.note.trim(), 'Indique el motivo del movimiento.');
      const incoming = ['initial_stock', 'restock', 'adjustment_in'].includes(input.type);
      if (['initial_stock', 'restock'].includes(input.type))
        requireRule(location.type === 'general', 'Las entradas se reciben en el Almacén General.');
      if (input.type === 'initial_stock')
        requireRule(
          !state.movements.some((m) => m.variantId === input.variantId),
          'Esta variante ya tiene movimientos; use una reposición.',
        );
      if (location.eventId)
        requireRule(
          mustFind(state.events, location.eventId).status === 'open',
          'Abra el evento antes de registrar consumos o ajustes.',
        );
      const timestamp = now();
      appendMovement(state, {
        id: input.id,
        variantId: input.variantId,
        quantity: input.quantity,
        type: input.type,
        ...(incoming ? { toLocationId: location.id } : { fromLocationId: location.id }),
        ...(location.eventId ? { eventId: location.eventId } : {}),
        note: input.note,
        occurredAt: timestamp,
        createdAt: timestamp,
      });
    });
  }
  transfer(input: {
    id: string;
    eventId: string;
    variantId: string;
    quantity: number;
  }): Promise<void> {
    return this.repository.transact((state) => {
      if (state.movements.some((m) => m.id === input.id)) return;
      const event = mustFind(state.events, input.eventId);
      requireRule(event.status !== 'closed', 'El evento está cerrado.');
      const general = state.locations.find((l) => l.type === 'general')!;
      const timestamp = now();
      appendMovement(state, {
        id: input.id,
        variantId: input.variantId,
        fromLocationId: general.id,
        toLocationId: event.stockLocationId,
        quantity: input.quantity,
        type: 'transfer_to_event',
        eventId: event.id,
        occurredAt: timestamp,
        createdAt: timestamp,
      });
    });
  }
}
