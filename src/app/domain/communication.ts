import { z } from 'zod';
import { Order } from './models';
export const DAILY_PROFILE = 'daily';
export const PAYMENT_CHOICES = [
  { method: 'bac', name: 'BAC' },
  { method: 'ficohsa', name: 'Ficohsa' },
  { method: 'atlantida', name: 'Banco Atlántida' },
  { method: 'kash', name: 'Kash' },
];
const accountSchema = z.strictObject({
  method: z.enum(['bac', 'ficohsa', 'atlantida', 'kash']),
  code: z.string().trim().min(1).max(100),
  holder: z.string().trim().min(1).max(150),
});
export const profileSchema = z.strictObject({
  accounts: z.array(accountSchema).max(4),
  businessName: z.string().trim().min(1).max(150),
  whatsapp: z.string().regex(/^[1-9][0-9]{7,14}$/),
  pickupAddress: z.string().trim().max(500),
  instructions: z.string().trim().max(500),
});
export type LocalAccount = z.infer<typeof accountSchema>;
export type BusinessProfile = z.infer<typeof profileSchema>;
export const defaultProfile = (): BusinessProfile => ({
  accounts: [],
  businessName: 'Almendros Coffee Co.',
  whatsapp: '50488793266',
  pickupAddress: '',
  instructions: '',
});
export function normalizePhone(value: string): string {
  if (!/^\+?[\d\s()-]+$/.test(value.trim())) return '';
  const digits = value.replace(/\D/g, '');
  return digits.length === 8 ? '504' + digits : /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}
export function orderMessage(order: Order, profile: BusinessProfile, paid: boolean): string {
  const money = (n: number) => 'L ' + (n / 100).toFixed(2);
  return [
    '*' + profile.businessName + '*',
    'Hola ' + order.customer.name + ', este es tu pedido:',
    ...order.lines.map(
      (l) =>
        `${l.quantity} × ${l.productNameSnapshot} · ${l.variantNameSnapshot}${l.grindOption ? ' · ' + l.grindOption : ''}\n${(l.pieceDescriptions ?? []).filter(Boolean).join(', ')}${l.pieceDescriptions?.some(Boolean) ? '\n' : ''}${money(l.quantity * l.unitPriceMinor)}`,
    ),
    ...(order.discountMinor ? ['Descuento: ' + money(order.discountMinor)] : []),
    '*Total: ' + money(order.totalMinor) + '*',
    order.customer.fulfillment === 'delivery'
      ? 'Delivery: ' + order.customer.address
      : 'Pickup: ' + (order.customer.address || profile.pickupAddress || 'Por coordinar'),
    ...(order.customer.notes ? ['Indicaciones: ' + order.customer.notes] : []),
    'Pedido: ' +
      { open: 'Abierto', packed: 'Empacado', delivered: 'Entregado', cancelled: 'Cancelado' }[
        order.status
      ],
    'Pago: ' + (order.status === 'cancelled' ? 'Pedido cancelado' : paid ? 'Pagado' : 'Pendiente'),
    ...(!paid && order.status !== 'cancelled'
      ? [
          'Opciones de pago: Efectivo',
          ...profile.accounts.map(
            (a) =>
              `${PAYMENT_CHOICES.find((p) => p.method === a.method)!.name}: ${a.code} (${a.holder})`,
          ),
        ]
      : []),
    ...(profile.instructions ? [profile.instructions] : []),
    '🛒 Pedidos por WhatsApp: https://wa.me/' + profile.whatsapp,
    '🌐 https://almendroscoffee.com',
    '📸 Instagram: @almendroscoffeeco',
  ].join('\n\n');
}
export function whatsappUrl(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Indica un teléfono válido con código de país.');
  return 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(message);
}
