import { DataRepository } from './repository';
import {
  CoffeeEvent,
  eventSchema,
  expenseSchema,
  mustFind,
  newId,
  now,
  requireRule,
  safeMoney,
  stock,
} from './models';
import { appendMovement } from './inventory.service';

export class EventsService {
  constructor(private readonly repository: DataRepository) {}
  create(
    input: Omit<CoffeeEvent, 'stockLocationId' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    return this.repository.transact((state) => {
      if (state.events.some((e) => e.id === input.id)) return input.id;
      const timestamp = now();
      const locationId = newId();
      const event = eventSchema.parse({
        ...input,
        status: 'draft',
        stockLocationId: locationId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      requireRule(
        !event.endsAt || !event.startsAt || event.endsAt >= event.startsAt,
        'La fecha final es anterior al inicio.',
      );
      state.events.push(event);
      state.locations.push({
        id: locationId,
        name: event.name,
        type: 'event',
        eventId: event.id,
        isActive: true,
        createdAt: timestamp,
      });
      return event.id;
    });
  }
  open(eventId: string): Promise<void> {
    return this.repository.transact((state) => {
      const event = mustFind(state.events, eventId);
      requireRule(event.status === 'draft', 'Solo se abre un borrador.');
      event.status = 'open';
      event.updatedAt = now();
    });
  }
  expense(input: unknown): Promise<void> {
    const expense = expenseSchema.parse(input);
    return this.repository.transact((state) => {
      requireRule(
        mustFind(state.events, expense.eventId).status !== 'closed',
        'El evento debe estar abierto.',
      );
      if (!state.expenses.some((e) => e.id === expense.id)) state.expenses.push(expense);
    });
  }
  correctExpense(
    id: string,
    patch: { description: string; category: string; amountMinor: number; paymentMethod: string },
    reason: string,
    confirmClosed = false,
  ): Promise<void> {
    return this.repository.transact((state) => {
      const old = mustFind(state.expenses, id);
      requireRule(!old.voidedAt, 'El gasto está anulado.');
      requireRule(reason.trim(), 'Indique el motivo de la corrección.');
      requireRule(
        mustFind(state.events, old.eventId).status !== 'closed' || confirmClosed,
        'Confirme la corrección del evento cerrado.',
      );
      const history = [
        ...(old.correctionHistory ?? []),
        {
          at: now(),
          description: old.description,
          category: old.category,
          amountMinor: old.amountMinor,
          ...(old.paymentMethod ? { paymentMethod: old.paymentMethod } : {}),
          reason,
        },
      ];
      Object.assign(old, expenseSchema.parse({ ...old, ...patch, correctionHistory: history }));
    });
  }
  voidExpense(id: string, reason: string, confirmClosed = false): Promise<void> {
    return this.repository.transact((state) => {
      const old = mustFind(state.expenses, id);
      requireRule(!old.voidedAt, 'El gasto ya está anulado.');
      requireRule(reason.trim(), 'Indique un motivo.');
      requireRule(
        mustFind(state.events, old.eventId).status !== 'closed' || confirmClosed,
        'Confirme la corrección del evento cerrado.',
      );
      old.correctionHistory = [
        ...(old.correctionHistory ?? []),
        {
          at: now(),
          description: old.description,
          category: old.category,
          amountMinor: old.amountMinor,
          ...(old.paymentMethod ? { paymentMethod: old.paymentMethod } : {}),
          reason,
        },
      ];
      old.voidedAt = now();
    });
  }
  close(
    eventId: string,
    counts: Record<string, number>,
    reason: string,
    closingCashMinor?: number,
    expectedCounts?: Record<string, number>,
  ): Promise<void> {
    return this.repository.transact((state) => {
      const event = mustFind(state.events, eventId);
      requireRule(
        !state.orders.some(
          (o) =>
            o.eventId === eventId &&
            o.status !== 'cancelled' &&
            (o.status !== 'delivered' ||
              !state.sales.some((s) => s.id === o.saleId && s.status === 'completed')),
        ),
        'Hay pedidos sin entregar o sin cobrar. Resuélvelos antes del cierre.',
      );
      requireRule(event.status === 'open', 'El evento debe estar abierto.');
      requireRule(
        !state.sales.some((s) => s.eventId === eventId && s.refundStatus === 'pending'),
        'Complete los reembolsos pendientes antes del cierre.',
      );
      requireRule(
        !state.items.some(
          (i) =>
            i.inventoryStatus === 'pending' &&
            state.sales.some((s) => s.id === i.saleId && s.eventId === eventId),
        ),
        'Concilie el inventario pendiente antes del cierre.',
      );
      const general = state.locations.find((l) => l.type === 'general')!;
      if (expectedCounts)
        for (const variant of state.variants.filter((v) => v.trackInventory))
          requireRule(
            stock(state, variant.id, event.stockLocationId) === (expectedCounts[variant.id] ?? 0),
            'El inventario cambió durante el conteo. Cancele y prepare el cierre otra vez.',
          );
      const timestamp = now();
      for (const key of Object.keys(counts))
        requireRule(
          state.variants.some((v) => v.id === key && v.trackInventory),
          'Conteo de variante desconocida.',
        );
      for (const variant of state.variants.filter((v) => v.trackInventory)) {
        const expected = stock(state, variant.id, event.stockLocationId);
        if (expected === 0 && counts[variant.id] === undefined) continue;
        const counted = counts[variant.id];
        requireRule(
          counted !== undefined && Number.isInteger(counted) && counted >= 0 && counted <= 1000000,
          'Complete todos los conteos con unidades enteras.',
        );
        const difference = counted - expected;
        if (difference !== 0) {
          requireRule(reason.trim(), 'Explique las diferencias del conteo físico.');
          appendMovement(state, {
            id: newId(),
            variantId: variant.id,
            quantity: Math.abs(difference),
            type: difference > 0 ? 'adjustment_in' : 'adjustment_out',
            ...(difference > 0
              ? { toLocationId: event.stockLocationId }
              : { fromLocationId: event.stockLocationId }),
            eventId,
            note: reason,
            occurredAt: timestamp,
            createdAt: timestamp,
          });
        }
        if (counted > 0)
          appendMovement(state, {
            id: newId(),
            variantId: variant.id,
            quantity: counted,
            type: 'return_to_general',
            fromLocationId: event.stockLocationId,
            toLocationId: general.id,
            eventId,
            occurredAt: timestamp,
            createdAt: timestamp,
          });
      }
      event.status = 'closed';
      event.closedAt = timestamp;
      event.updatedAt = timestamp;
      if (closingCashMinor !== undefined) event.closingCashMinor = safeMoney(closingCashMinor);
      mustFind(state.locations, event.stockLocationId).isActive = false;
    });
  }
}
