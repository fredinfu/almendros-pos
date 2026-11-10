import { State, stock } from './models';

export function eventReport(state: State, eventId: string) {
  const event = state.events.find((e) => e.id === eventId);
  const sales = state.sales.filter(
    (s) => (s.eventId ?? '') === eventId && s.status === 'completed',
  );
  const saleIds = new Set(sales.map((s) => s.id));
  const items = state.items.filter((i) => saleIds.has(i.saleId));
  const expenses = state.expenses.filter((e) => e.eventId === eventId && !e.voidedAt);
  const movements = state.movements.filter((m) => (m.eventId ?? '') === eventId);
  const gross = sales.reduce((n, s) => n + s.subtotalMinor, 0);
  const discounts = sales.reduce((n, s) => n + s.discountMinor, 0);
  const net = gross - discounts;
  const costsKnown = items.every((i) => i.unitCostMinor !== undefined);
  const knownCost = items.reduce((n, i) => n + (i.unitCostMinor ?? 0) * i.quantity, 0);
  const expenseTotal = expenses.reduce((n, e) => n + e.amountMinor, 0);
  const group = (key: 'brandNameSnapshot' | 'productNameSnapshot' | 'categoryNameSnapshot') => {
    const values = new Map<string, { name: string; quantity: number; totalMinor: number }>();
    for (const item of items) {
      const name = item[key];
      const row = values.get(name) ?? { name, quantity: 0, totalMinor: 0 };
      row.quantity += item.quantity;
      row.totalMinor += item.lineTotalMinor;
      values.set(name, row);
    }
    return [...values.values()].sort((a, b) => b.quantity - a.quantity);
  };
  const payments = ['cash', 'bac', 'kash', 'other'].map((method) => ({
    method,
    totalMinor: state.payments
      .filter((p) => p.method === method && saleIds.has(p.saleId))
      .reduce((n, p) => n + p.amountMinor, 0),
  }));
  const pendingRefunds = state.sales
    .filter((s) => (s.eventId ?? '') === eventId && s.refundStatus === 'pending')
    .reduce((n, s) => n + s.totalMinor, 0);
  const pendingCash = state.payments
    .filter(
      (p) =>
        p.method === 'cash' &&
        state.sales.some(
          (s) => s.id === p.saleId && (s.eventId ?? '') === eventId && s.refundStatus === 'pending',
        ),
    )
    .reduce((n, p) => n + p.amountMinor, 0);
  const cashExpenses = expenses
    .filter((e) => e.paymentMethod === 'cash')
    .reduce((n, e) => n + e.amountMinor, 0);
  return {
    gross,
    discounts,
    net,
    transactions: sales.length,
    average: sales.length ? Math.round(net / sales.length) : 0,
    units: items.reduce((n, i) => n + i.quantity, 0),
    expenses: expenseTotal,
    costsKnown,
    knownCost,
    missingCostUnits: items
      .filter((i) => i.unitCostMinor === undefined)
      .reduce((n, i) => n + i.quantity, 0),
    estimatedProfit: costsKnown ? net - knownCost - expenseTotal : undefined,
    partialMargin: net - knownCost - expenseTotal,
    samples: movements.filter((m) => m.type === 'sample').reduce((n, m) => n + m.quantity, 0),
    waste: movements.filter((m) => m.type === 'waste').reduce((n, m) => n + m.quantity, 0),
    byBrand: group('brandNameSnapshot'),
    byProduct: group('productNameSnapshot'),
    byCategory: group('categoryNameSnapshot'),
    payments,
    pendingRefunds,
    receivables: state.sales
      .filter((s) => (s.eventId ?? '') === eventId && s.status === 'pending')
      .reduce((n, s) => n + s.totalMinor, 0),
    expectedCash:
      (event?.openingCashMinor ?? 0) + payments[0]!.totalMinor + pendingCash - cashExpenses,
    remaining: event
      ? state.variants
          .filter((v) => v.trackInventory)
          .map((v) => ({
            variantId: v.id,
            sku: v.sku,
            quantity: stock(state, v.id, event.stockLocationId),
          }))
          .filter((v) => v.quantity > 0)
      : [],
  };
}
