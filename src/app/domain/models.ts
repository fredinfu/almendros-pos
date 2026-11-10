import { z } from 'zod';

const id = z.uuid();
const text = z.string().trim().min(1).max(200);
const note = z.string().trim().max(2000);
const date = z.iso.datetime();
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().positive().max(1000000);
const timestamps = { createdAt: date, updatedAt: date };
export const paymentMethodSchema = z.enum(['cash', 'bac', 'kash', 'other']);
export const movementTypeSchema = z.enum([
  'initial_stock',
  'restock',
  'transfer_to_event',
  'return_to_general',
  'sale',
  'sale_void_reversal',
  'sample',
  'waste',
  'adjustment_in',
  'adjustment_out',
]);
export const brandSchema = z.strictObject({
  id,
  name: text,
  slug: text,
  description: note.optional(),
  isActive: z.boolean(),
  ...timestamps,
});
export const categorySchema = z.strictObject({
  id,
  name: text,
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export const productSchema = z.strictObject({
  id,
  brandId: id,
  categoryId: id,
  name: text,
  description: note,
  productType: z.enum(['packaged_coffee', 'coffee_pod', 'beverage', 'merchandise', 'other']),
  grindOptions: z.array(text).min(1).max(10).optional(),
  imageUrl: z.url().optional(),
  tags: z.array(text).max(30),
  isActive: z.boolean(),
  ...timestamps,
});
export const variantSchema = z.strictObject({
  id,
  productId: id,
  sku: text.regex(/^[A-Z0-9_-]+$/),
  name: text,
  weightValue: z.number().positive().optional(),
  weightUnit: z.enum(['g', 'lb', 'ml']).optional(),
  grindOption: text.optional(),
  process: text.optional(),
  priceMinor: money.optional(),
  compareAtPriceMinor: money.optional(),
  unitCostMinor: money.optional(),
  trackInventory: z.boolean(),
  lowStockThreshold: money.optional(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  packUnits: quantity.optional(),
  ...timestamps,
});
export const locationSchema = z.strictObject({
  id,
  name: text,
  type: z.enum(['general', 'event']),
  eventId: id.optional(),
  isActive: z.boolean(),
  createdAt: date,
});
export const movementSchema = z.strictObject({
  id,
  variantId: id,
  fromLocationId: id.optional(),
  toLocationId: id.optional(),
  quantity,
  type: movementTypeSchema,
  eventId: id.optional(),
  saleId: id.optional(),
  referenceId: id.optional(),
  note: note.optional(),
  occurredAt: date,
  createdAt: date,
});
export const eventSchema = z.strictObject({
  id,
  name: text,
  venue: note.optional(),
  city: text.optional(),
  startsAt: date.optional(),
  endsAt: date.optional(),
  status: z.enum(['draft', 'open', 'closed']),
  stockLocationId: id,
  openingCashMinor: money.optional(),
  notes: note.optional(),
  closedAt: date.optional(),
  closingCashMinor: money.optional(),
  ...timestamps,
});
export const expenseSchema = z.strictObject({
  id,
  eventId: id,
  category: z.enum(['stand', 'transport', 'supplies', 'food', 'other']),
  description: text,
  amountMinor: money.refine((v) => v > 0),
  paymentMethod: paymentMethodSchema.optional(),
  voidedAt: date.optional(),
  correctionHistory: z
    .array(
      z.strictObject({
        at: date,
        description: text,
        category: text,
        amountMinor: money,
        paymentMethod: paymentMethodSchema.optional(),
        reason: text,
      }),
    )
    .optional(),
  incurredAt: date,
  createdAt: date,
});
export const countSchema = z.strictObject({
  id,
  variantId: id,
  locationId: id,
  quantity: money,
  mode: z.enum(['beginning', 'current']),
  pendingItemIds: z.array(id),
  occurredAt: date,
});
export const paymentEvidenceSchema = z.strictObject({
  dataUrl: z
    .string()
    .max(1400000)
    .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/),
  width: z.number().int().min(1).max(1600),
  height: z.number().int().min(1).max(1600),
});
export type PaymentEvidence = z.infer<typeof paymentEvidenceSchema>;
export const saleSchema = z.strictObject({
  id,
  eventId: id.optional(),
  receiptNumber: text,
  status: z.enum(['completed', 'voided', 'pending']),
  orderId: id.optional(),
  paidAt: date.optional(),
  subtotalMinor: money,
  discountMinor: money,
  totalMinor: money,
  totalPaidMinor: money,
  changeMinor: money,
  notes: note.optional(),
  soldAt: date,
  voidedAt: date.optional(),
  voidReason: text.optional(),
  voidEvidence: paymentEvidenceSchema.optional(),
  refundStatus: z.enum(['pending', 'completed']).optional(),
  refundedAt: date.optional(),
  createdAt: date,
});
export const itemSchema = z.strictObject({
  id,
  saleId: id,
  variantId: id,
  skuSnapshot: text,
  productNameSnapshot: text,
  variantNameSnapshot: text,
  brandNameSnapshot: text,
  categoryNameSnapshot: text,
  grindOptionSnapshot: text.optional(),
  pieceDescriptions: z.array(z.string().trim().max(120)).max(1000).optional(),
  quantity,
  unitPriceMinor: money,
  unitCostMinor: money.optional(),
  lineDiscountMinor: money,
  lineTotalMinor: money,
  trackInventorySnapshot: z.boolean(),
  inventoryAllocations: z.array(z.strictObject({ locationId: id, quantity })).optional(),
  inventoryStatus: z.enum(['pending', 'resolved', 'cancelled']).optional(),
  reconciliationId: id.optional(),
  inventoryLocationId: id.optional(),
});
export const paymentSchema = z.strictObject({
  id,
  saleId: id,
  method: paymentMethodSchema,
  amountMinor: money,
  receivedMinor: money.optional(),
  changeMinor: money.optional(),
  reference: note.optional(),
  evidence: paymentEvidenceSchema.optional(),
  paidAt: date,
});
export const settingsSchema = z.strictObject({
  id,
  businessName: text,
  currency: z.literal('HNL'),
  locale: z.literal('es-HN'),
  timeZone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat('es-HN', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  schemaVersion: z.literal(1),
  catalogSeedVersion: text.optional(),
  deviceInstallId: id,
  lastBackupAt: date.optional(),
  compactDisplay: z.boolean(),
  backupReminderDays: z.number().int().min(1).max(365),
});

export const customerSchema = z
  .strictObject({
    name: text,
    phone: z.string().regex(/^[1-9][0-9]{7,14}$/),
    fulfillment: z.enum(['pickup', 'delivery']),
    address: note,
    notes: note,
  })
  .refine(
    (c) => c.fulfillment !== 'delivery' || !!c.address.trim(),
    'Indica la dirección de entrega.',
  );
export const orderLineSchema = z.strictObject({
  variantId: id,
  quantity,
  unitPriceMinor: money,
  productNameSnapshot: text,
  variantNameSnapshot: text,
  skuSnapshot: text,
  brandNameSnapshot: text,
  categoryNameSnapshot: text,
  unitCostMinor: money.optional(),
  trackInventorySnapshot: z.boolean(),
  grindOption: text.optional(),
  pieceDescriptions: z.array(z.string().trim().max(120)).max(1000).optional(),
});
export const orderSchema = z.strictObject({
  id,
  eventId: id.optional(),
  customer: customerSchema,
  lines: z.array(orderLineSchema).min(1).max(200),
  subtotalMinor: money,
  discountMinor: money,
  totalMinor: money,
  status: z.enum(['open', 'packed', 'delivered', 'cancelled']),
  saleId: id.optional(),
  packedAt: date.optional(),
  deliveredAt: date.optional(),
  cancelledAt: date.optional(),
  cancelReason: text.optional(),
  cancelEvidence: paymentEvidenceSchema.optional(),
  ...timestamps,
});
export type Order = z.infer<typeof orderSchema>;
export type Customer = z.infer<typeof customerSchema>;
export const stateSchema = z.strictObject({
  inventoryCounts: z.array(countSchema).default([]),
  orders: z.array(orderSchema).default([]),
  brands: z.array(brandSchema),
  categories: z.array(categorySchema),
  products: z.array(productSchema),
  variants: z.array(variantSchema),
  locations: z.array(locationSchema),
  movements: z.array(movementSchema),
  events: z.array(eventSchema),
  expenses: z.array(expenseSchema),
  sales: z.array(saleSchema),
  items: z.array(itemSchema),
  payments: z.array(paymentSchema),
  settings: z.array(settingsSchema),
});
export type State = z.infer<typeof stateSchema>;
export type Brand = z.infer<typeof brandSchema>;
export type Product = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type StockLocation = z.infer<typeof locationSchema>;
export type Movement = z.infer<typeof movementSchema>;
export type CoffeeEvent = z.infer<typeof eventSchema>;
export type Sale = z.infer<typeof saleSchema>;
export type SaleItem = z.infer<typeof itemSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type TableName = keyof State;
export const tableNames: TableName[] = [
  'orders',
  'inventoryCounts',
  'brands',
  'categories',
  'products',
  'variants',
  'locations',
  'movements',
  'events',
  'expenses',
  'sales',
  'items',
  'payments',
  'settings',
];
export const emptyState = (): State => ({
  orders: [],
  inventoryCounts: [],
  brands: [],
  categories: [],
  products: [],
  variants: [],
  locations: [],
  movements: [],
  events: [],
  expenses: [],
  sales: [],
  items: [],
  payments: [],
  settings: [],
});
export const newId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues remains available over LAN HTTP for development; PWA still needs HTTPS.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const now = (): string => new Date().toISOString();
export function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function safeMoney(value: number): number {
  requireRule(Number.isSafeInteger(value) && value >= 0, 'Importe fuera de rango.');
  return value;
}
export function parseMoney(value: string): number {
  requireRule(
    /^\d+(\.\d{1,2})?$/.test(value.trim()),
    'Use un importe positivo con hasta dos decimales.',
  );
  const [whole, cents = ''] = value.trim().split('.');
  return safeMoney(Number(whole) * 100 + Number(cents.padEnd(2, '0')));
}
export function stock(state: State, variantId: string, locationId: string): number {
  return state.movements
    .filter((m) => m.variantId === variantId)
    .reduce(
      (sum, m) =>
        sum +
        (m.toLocationId === locationId ? m.quantity : 0) -
        (m.fromLocationId === locationId ? m.quantity : 0),
      0,
    );
}
export function mustFind<T extends { id: string }>(rows: T[], key: string): T {
  const row = rows.find((r) => r.id === key);
  requireRule(row, 'Registro no encontrado.');
  return row;
}

export function grindOptions(product: Product, variants: Variant[] = []): string[] {
  if (product.productType !== 'packaged_coffee') return [];
  return (
    product.grindOptions ?? [
      ...new Set([
        'Grano',
        'Molido',
        ...variants
          .filter((v) => v.productId === product.id && v.grindOption)
          .map((v) => v.grindOption!),
      ]),
    ]
  );
}
export function inventoryKnown(state: State, variantId: string): boolean {
  return (
    state.movements.some((m) => m.variantId === variantId) ||
    state.inventoryCounts.some((c) => c.variantId === variantId)
  );
}
export function saleAvailability(
  state: State,
  variantId: string,
  eventId?: string,
): number | undefined {
  const variant = mustFind(state.variants, variantId);
  if (!variant.trackInventory || !inventoryKnown(state, variantId)) return undefined;
  const event = state.events.find((e) => e.id === eventId);
  const general = state.locations.find((l) => l.type === 'general');
  return (
    stock(state, variantId, general?.id ?? '') +
    (event ? stock(state, variantId, event.stockLocationId) : 0)
  );
}
