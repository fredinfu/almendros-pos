import { z } from 'zod';
import { DataRepository } from './repository';
import {
  Sale,
  State,
  Order,
  PaymentEvidence,
  grindOptions,
  inventoryKnown,
  stock,
  SaleItem,
  mustFind,
  newId,
  now,
  paymentMethodSchema,
  paymentEvidenceSchema,
  requireRule,
  safeMoney,
} from './models';
import { appendMovement } from './inventory.service';

export const checkoutSchema = z.strictObject({
  id: z.uuid(),
  eventId: z.uuid().optional(),
  lines: z
    .array(
      z.strictObject({
        variantId: z.uuid(),
        quantity: z.number().int().positive().max(1000000),
        expectedPriceMinor: z.number().int().nonnegative(),
        pieceDescriptions: z.array(z.string().trim().max(120)).max(1000).optional(),
        grindOption: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(200),
  discountMinor: z.number().int().nonnegative(),
  method: paymentMethodSchema,
  receivedMinor: z.number().int().nonnegative().optional(),
  reference: z.string().max(500).optional(),
  evidence: paymentEvidenceSchema.optional(),
  notes: z.string().max(2000).optional(),
});
export type Checkout = z.infer<typeof checkoutSchema>;

export class SalesService {
  constructor(private readonly repository: DataRepository) {}
  checkout(input: Checkout): Promise<Sale> {
    const command = checkoutSchema.parse(input);
    return this.repository.transact((state) => {
      return recordSale(state, command);
    });
  }
  void(
    saleId: string,
    reason: string,
    refunded: boolean,
    evidence?: PaymentEvidence,
  ): Promise<void> {
    const checked = evidence ? paymentEvidenceSchema.parse(evidence) : undefined;
    return this.repository.transact((state) => {
      voidSale(state, saleId, reason, refunded, checked);
    });
  }
  markRefunded(saleId: string): Promise<void> {
    return this.repository.transact((state) => {
      const sale = mustFind(state.sales, saleId);
      requireRule(
        sale.status === 'voided' && sale.refundStatus === 'pending',
        'No hay reembolso pendiente.',
      );
      requireRule(
        !sale.eventId || mustFind(state.events, sale.eventId).status !== 'closed',
        'Resuelva el reembolso antes del cierre.',
      );
      sale.refundStatus = 'completed';
      sale.refundedAt = now();
    });
  }
}

/** Shared synchronous ledger operation: delivery and payment cannot debit stock twice. */
export function recordSale(state: State, command: Checkout, pending = false, order?: Order): Sale {
  const existing = state.sales.find((s) => s.id === command.id);
  if (existing) return existing;
  const event = command.eventId ? mustFind(state.events, command.eventId) : undefined;
  requireRule(event?.status !== 'closed', 'El evento está cerrado.');
  requireRule(
    !command.evidence || command.method !== 'cash',
    'La foto de referencia corresponde a pagos electrónicos.',
  );
  const timestamp = now();
  const items: SaleItem[] = command.lines.map((line, index) => {
    if (order) {
      const { grindOption, ...snapshot } = order.lines[index];
      return {
        id: newId(),
        saleId: command.id,
        ...snapshot,
        ...(grindOption ? { grindOptionSnapshot: grindOption } : {}),
        lineDiscountMinor: 0,
        lineTotalMinor: safeMoney(snapshot.quantity * snapshot.unitPriceMinor),
      };
    }
    const variant = mustFind(state.variants, line.variantId);
    const product = mustFind(state.products, variant.productId);
    const brand = mustFind(state.brands, product.brandId);
    const category = mustFind(state.categories, product.categoryId);
    requireRule(
      variant.isActive && product.isActive && brand.isActive && category.isActive,
      'Un producto del carrito está inactivo.',
    );
    requireRule(variant.priceMinor !== undefined, 'Configure el precio antes de vender.');
    requireRule(
      variant.priceMinor === line.expectedPriceMinor,
      'El precio cambió. Quite y vuelva a agregar el producto.',
    );
    if (line.grindOption)
      requireRule(
        grindOptions(product, state.variants).includes(line.grindOption),
        'La preparación ya no está disponible.',
      );
    if (
      ['coffee_pod', 'merchandise'].includes(product.productType) &&
      /bolsa|paquete|pack/i.test(variant.name)
    )
      requireRule(variant.packUnits, 'Configure las unidades del paquete.');
    if (line.pieceDescriptions)
      requireRule(
        product.productType === 'merchandise' &&
          line.pieceDescriptions.length === line.quantity * (variant.packUnits ?? 1),
        'Revise las descripciones por pieza de mercadería.',
      );
    return {
      ...(line.pieceDescriptions ? { pieceDescriptions: line.pieceDescriptions } : {}),
      id: newId(),
      saleId: command.id,
      variantId: variant.id,
      skuSnapshot: variant.sku,
      productNameSnapshot: product.name,
      variantNameSnapshot: variant.name,
      brandNameSnapshot: brand.name,
      categoryNameSnapshot: category.name,
      ...(line.grindOption ? { grindOptionSnapshot: line.grindOption } : {}),
      quantity: line.quantity,
      unitPriceMinor: variant.priceMinor,
      ...(variant.unitCostMinor === undefined ? {} : { unitCostMinor: variant.unitCostMinor }),
      lineDiscountMinor: 0,
      lineTotalMinor: safeMoney(variant.priceMinor * line.quantity),
      trackInventorySnapshot: variant.trackInventory,
    };
  });
  const subtotal = safeMoney(items.reduce((sum, item) => sum + item.lineTotalMinor, 0));
  const discount = safeMoney(command.discountMinor);
  requireRule(discount <= subtotal, 'El descuento supera el subtotal.');
  // Cumulative integer allocation avoids floating-point money and lost cents.
  let cumulative = 0;
  let allocated = 0;
  for (const item of items) {
    cumulative += item.lineTotalMinor;
    const target =
      subtotal === 0 ? 0 : Number((BigInt(discount) * BigInt(cumulative)) / BigInt(subtotal));
    item.lineDiscountMinor = target - allocated;
    allocated = target;
    item.lineTotalMinor -= item.lineDiscountMinor;
  }
  const total = subtotal - discount;
  const received = command.method === 'cash' ? safeMoney(command.receivedMinor ?? total) : total;
  requireRule(received >= total, 'El efectivo recibido es insuficiente.');
  const sale: Sale = {
    id: command.id,
    ...(event ? { eventId: event.id } : {}),
    receiptNumber: `AL-${timestamp.slice(0, 10).replaceAll('-', '')}-${command.id}`,
    status: pending ? 'pending' : 'completed',
    ...(order ? { orderId: order.id } : {}),
    ...(!pending ? { paidAt: timestamp } : {}),
    subtotalMinor: subtotal,
    discountMinor: discount,
    totalMinor: total,
    totalPaidMinor: pending ? 0 : total,
    changeMinor: pending ? 0 : received - total,
    ...(command.notes ? { notes: command.notes } : {}),
    soldAt: timestamp,
    createdAt: timestamp,
  };
  state.sales.push(sale);
  state.items.push(...items);
  if (!pending)
    state.payments.push({
      id: newId(),
      saleId: sale.id,
      method: command.method,
      amountMinor: total,
      receivedMinor: received,
      changeMinor: received - total,
      ...(command.reference ? { reference: command.reference } : {}),
      ...(command.evidence ? { evidence: command.evidence } : {}),
      paidAt: timestamp,
    });
  const general = state.locations.find((l) => l.type === 'general')!;
  for (const item of items.filter((i) => i.trackInventorySnapshot)) {
    if (!inventoryKnown(state, item.variantId)) {
      item.inventoryStatus = 'pending';
      item.inventoryLocationId = general.id;
      continue;
    }
    item.inventoryAllocations = [];
    let remaining = item.quantity;
    for (const locationId of [...(event ? [event.stockLocationId] : []), general.id]) {
      const quantity = Math.min(remaining, stock(state, item.variantId, locationId));
      if (!quantity) continue;
      appendMovement(state, {
        id: newId(),
        variantId: item.variantId,
        fromLocationId: locationId,
        quantity,
        type: 'sale',
        ...(event ? { eventId: event.id } : {}),
        saleId: sale.id,
        referenceId: item.id,
        occurredAt: timestamp,
        createdAt: timestamp,
      });
      item.inventoryAllocations.push({ locationId, quantity });
      remaining -= quantity;
    }
    requireRule(remaining === 0, 'Stock insuficiente: existencias verificadas.');
  }
  return sale;
}
export function voidSale(
  state: State,
  saleId: string,
  reason: string,
  refunded: boolean,
  checked?: PaymentEvidence,
): void {
  const sale = mustFind(state.sales, saleId);
  requireRule(sale.status !== 'voided', 'La venta ya está anulada.');
  requireRule(
    reason.trim().length > 0 && reason.trim().length <= 200,
    'Indique un motivo de hasta 200 caracteres.',
  );
  const event = sale.eventId ? mustFind(state.events, sale.eventId) : undefined;
  requireRule(event?.status !== 'closed', 'No se permiten anulaciones en eventos cerrados.');
  const timestamp = now();
  for (const item of state.items.filter((i) => i.saleId === saleId && i.trackInventorySnapshot)) {
    if (item.inventoryStatus === 'pending') {
      item.inventoryStatus = 'cancelled';
      continue;
    }
    const sources = state.movements.filter((m) => m.type === 'sale' && m.referenceId === item.id);
    if (item.inventoryStatus === 'resolved' && !sources.length)
      sources.push({
        id: newId(),
        variantId: item.variantId,
        quantity: item.quantity,
        type: 'sale',
        fromLocationId: item.inventoryLocationId!,
        occurredAt: timestamp,
        createdAt: timestamp,
      });
    for (const source of sources)
      appendMovement(state, {
        id: newId(),
        variantId: item.variantId,
        toLocationId: source.fromLocationId,
        quantity: source.quantity,
        type: 'sale_void_reversal',
        ...(event ? { eventId: event.id } : {}),
        saleId,
        referenceId: item.id,
        note: reason,
        occurredAt: timestamp,
        createdAt: timestamp,
      });
  }
  sale.status = 'voided';
  sale.voidReason = reason.trim();
  if (checked) sale.voidEvidence = checked;
  sale.voidedAt = timestamp;
  const paid = state.payments.some((p) => p.saleId === sale.id);
  sale.refundStatus = !paid || refunded ? 'completed' : 'pending';
  if (!paid || refunded) sale.refundedAt = timestamp;
  const order = state.orders.find((o) => o.id === sale.orderId);
  if (order) {
    order.status = 'cancelled';
    order.cancelledAt = timestamp;
    order.cancelReason = reason.trim();
    order.updatedAt = timestamp;
    if (checked) order.cancelEvidence = checked;
  }
}
export function collectPendingSale(
  state: State,
  sale: Sale,
  payment: Pick<Checkout, 'method' | 'receivedMinor' | 'reference' | 'evidence'>,
): Sale {
  if (sale.status === 'completed') return sale;
  requireRule(sale.status === 'pending', 'El pedido está anulado.');
  requireRule(
    !sale.eventId || mustFind(state.events, sale.eventId).status !== 'closed',
    'El evento está cerrado.',
  );
  requireRule(
    !payment.evidence || payment.method !== 'cash',
    'La foto corresponde a pagos electrónicos.',
  );
  const received =
    payment.method === 'cash'
      ? safeMoney(payment.receivedMinor ?? sale.totalMinor)
      : sale.totalMinor;
  requireRule(received >= sale.totalMinor, 'El efectivo recibido es insuficiente.');
  const timestamp = now();
  state.payments.push({
    id: newId(),
    saleId: sale.id,
    method: payment.method,
    amountMinor: sale.totalMinor,
    receivedMinor: received,
    changeMinor: received - sale.totalMinor,
    ...(payment.reference ? { reference: payment.reference } : {}),
    ...(payment.evidence ? { evidence: payment.evidence } : {}),
    paidAt: timestamp,
  });
  sale.status = 'completed';
  sale.totalPaidMinor = sale.totalMinor;
  sale.changeMinor = received - sale.totalMinor;
  sale.paidAt = timestamp;
  return sale;
}
