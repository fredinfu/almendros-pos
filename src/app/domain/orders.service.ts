import { z } from 'zod';
import { DataRepository } from './repository';
import {
  Customer,
  Order,
  State,
  customerSchema,
  orderSchema,
  now,
  mustFind,
  requireRule,
  safeMoney,
  grindOptions,
  PaymentEvidence,
  paymentEvidenceSchema,
} from './models';
import {
  Checkout,
  checkoutSchema,
  recordSale,
  collectPendingSale,
  voidSale,
} from './sales.service';

const createSchema = checkoutSchema
  .pick({ id: true, eventId: true, lines: true, discountMinor: true })
  .extend({ customer: customerSchema });
const paymentSchema = checkoutSchema.pick({
  method: true,
  receivedMinor: true,
  reference: true,
  evidence: true,
});
export type OrderInput = z.infer<typeof createSchema>;
export type OrderPayment = z.infer<typeof paymentSchema>;
export class OrdersService {
  constructor(private readonly repository: DataRepository) {}
  create(input: OrderInput): Promise<Order> {
    const command = createSchema.parse(input);
    return this.repository.transact((state) => {
      const existing = state.orders.find((o) => o.id === command.id);
      if (existing) return existing;
      if (command.eventId)
        requireRule(
          mustFind(state.events, command.eventId).status !== 'closed',
          'El evento está cerrado.',
        );
      const lines = command.lines.map((line) => {
        const v = mustFind(state.variants, line.variantId),
          p = mustFind(state.products, v.productId);
        const b = mustFind(state.brands, p.brandId),
          c = mustFind(state.categories, p.categoryId);
        requireRule(
          v.isActive && p.isActive && b.isActive && c.isActive,
          'Un producto está inactivo.',
        );
        requireRule(
          v.priceMinor !== undefined && v.priceMinor === line.expectedPriceMinor,
          'El precio cambió. Vuelve a agregar el producto.',
        );
        if (line.grindOption)
          requireRule(
            grindOptions(p, state.variants).includes(line.grindOption),
            'Preparación inválida.',
          );
        if (
          ['coffee_pod', 'merchandise'].includes(p.productType) &&
          /pack|paquete|bolsa/i.test(v.name)
        )
          requireRule(v.packUnits, 'Configura las unidades del pack.');
        if (line.pieceDescriptions)
          requireRule(
            p.productType === 'merchandise' &&
              line.pieceDescriptions.length === line.quantity * (v.packUnits ?? 1),
            'Revisa las piezas de mercadería.',
          );
        return {
          variantId: v.id,
          quantity: line.quantity,
          unitPriceMinor: v.priceMinor,
          productNameSnapshot: p.name,
          variantNameSnapshot: v.name,
          skuSnapshot: v.sku,
          brandNameSnapshot: b.name,
          categoryNameSnapshot: c.name,
          trackInventorySnapshot: v.trackInventory,
          ...(v.unitCostMinor === undefined ? {} : { unitCostMinor: v.unitCostMinor }),
          ...(line.grindOption ? { grindOption: line.grindOption } : {}),
          ...(line.pieceDescriptions ? { pieceDescriptions: line.pieceDescriptions } : {}),
        };
      });
      const subtotal = safeMoney(
        lines.reduce((n, l) => safeMoney(n + l.quantity * l.unitPriceMinor), 0),
      );
      requireRule(command.discountMinor <= subtotal, 'El descuento supera el subtotal.');
      const timestamp = now();
      const order = orderSchema.parse({
        id: command.id,
        ...(command.eventId ? { eventId: command.eventId } : {}),
        customer: command.customer,
        lines,
        subtotalMinor: subtotal,
        discountMinor: command.discountMinor,
        totalMinor: subtotal - command.discountMinor,
        status: 'open',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      state.orders.push(order);
      return order;
    });
  }
  private active(state: State, id: string): Order {
    const order = mustFind(state.orders, id);
    requireRule(order.status !== 'cancelled', 'El pedido está cancelado.');
    requireRule(
      !order.eventId || mustFind(state.events, order.eventId).status !== 'closed',
      'El evento está cerrado.',
    );
    return order;
  }
  private command(order: Order, payment: OrderPayment): Checkout {
    return {
      id: order.id,
      ...(order.eventId ? { eventId: order.eventId } : {}),
      lines: order.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        expectedPriceMinor: l.unitPriceMinor,
      })),
      discountMinor: order.discountMinor,
      ...payment,
    };
  }
  pack(id: string): Promise<void> {
    return this.repository.transact((state) => {
      const order = this.active(state, id);
      if (order.status === 'packed' || order.status === 'delivered') return;
      order.status = 'packed';
      order.packedAt = now();
      order.updatedAt = order.packedAt;
    });
  }
  deliver(id: string): Promise<void> {
    return this.repository.transact((state) => {
      const order = this.active(state, id);
      if (order.status === 'delivered') return;
      requireRule(order.status === 'packed', 'Marca el pedido como empacado antes de entregarlo.');
      if (!order.saleId) {
        const sale = recordSale(state, this.command(order, { method: 'cash' }), true, order);
        order.saleId = sale.id;
      }
      order.status = 'delivered';
      order.deliveredAt = now();
      order.updatedAt = order.deliveredAt;
    });
  }
  pay(id: string, input: OrderPayment): Promise<void> {
    const payment = paymentSchema.parse(input);
    return this.repository.transact((state) => {
      const order = this.active(state, id);
      const sale = order.saleId
        ? collectPendingSale(state, mustFind(state.sales, order.saleId), payment)
        : recordSale(state, this.command(order, payment), false, order);
      order.saleId = sale.id;
      order.updatedAt = now();
    });
  }
  updateCustomer(id: string, input: Customer): Promise<void> {
    const customer = customerSchema.parse(input);
    return this.repository.transact((state) => {
      const order = this.active(state, id);
      order.customer = customer;
      order.updatedAt = now();
    });
  }
  cancel(id: string, reason: string, refunded: boolean, evidence?: PaymentEvidence): Promise<void> {
    const checked = evidence ? paymentEvidenceSchema.parse(evidence) : undefined;
    return this.repository.transact((state) => {
      const order = this.active(state, id);
      requireRule(
        !!reason.trim() && reason.trim().length <= 200,
        'Indica un motivo de hasta 200 caracteres.',
      );
      if (order.saleId) voidSale(state, order.saleId, reason, refunded, checked);
      else {
        order.status = 'cancelled';
        order.cancelReason = reason.trim();
        order.cancelledAt = now();
        order.updatedAt = order.cancelledAt;
        if (checked) order.cancelEvidence = checked;
      }
    });
  }
}
