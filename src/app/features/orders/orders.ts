import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../../core/app.store';
import { EventPaymentsService } from '../../core/event-payments.service';
import {
  BusinessProfile,
  DAILY_PROFILE,
  PAYMENT_CHOICES,
  orderMessage,
  whatsappUrl,
  normalizePhone,
} from '../../domain/communication';
import { Order, PaymentEvidence, PaymentMethod, parseMoney } from '../../domain/models';
import { UI_IMPORTS } from '../../shared/ui';
import { EvidencePicker } from '../../shared/evidence-picker';
@Component({
  selector: 'app-orders',
  imports: [...UI_IMPORTS, EvidencePicker],
  templateUrl: './orders.html',
  styleUrl: './orders.scss',
})
export class OrdersPage {
  readonly store = inject(AppStore);
  readonly vault = inject(EventPaymentsService);
  private readonly fb = inject(FormBuilder);
  readonly allContexts = signal(false);
  readonly showAll = signal(false);
  readonly search = signal('');
  readonly selectedId = signal('');
  readonly action = signal<'pay' | 'message' | 'cancel' | 'edit'>('message');
  readonly profile = signal<BusinessProfile | undefined>(undefined);
  readonly evidence = signal<PaymentEvidence | undefined>(undefined);
  readonly photoBusy = signal(false);
  readonly preparing = signal(false);
  readonly message = signal('');
  readonly url = signal('');
  readonly columns = [
    { id: 'open', name: 'Abiertos' },
    { id: 'packed', name: 'Empacados' },
    { id: 'delivered', name: 'Entregados' },
    { id: 'cancelled', name: 'Cancelados' },
  ];
  readonly selected = computed(() =>
    this.store.data().orders.find((o) => o.id === this.selectedId()),
  );
  readonly scope = computed(() =>
    this.store
      .data()
      .orders.filter((o) => this.allContexts() || (o.eventId ?? '') === this.store.eventId()),
  );
  readonly rows = computed(() =>
    this.scope()
      .filter(
        (o) =>
          (this.showAll() ||
            (o.status !== 'cancelled' && !(o.status === 'delivered' && this.paid(o)))) &&
          `${o.customer.name} ${o.customer.phone}`
            .toLowerCase()
            .includes(this.search().toLowerCase()),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  readonly outstanding = computed(() =>
    this.scope()
      .filter((o) => o.status !== 'cancelled' && !this.paid(o))
      .reduce((n, o) => n + o.totalMinor, 0),
  );
  readonly payment = this.fb.nonNullable.group({ method: 'cash', received: '', reference: '' });
  readonly cancellation = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(200)]],
    refunded: false,
  });
  readonly customer = this.fb.nonNullable.group({
    name: '',
    phone: '',
    fulfillment: 'pickup',
    address: '',
    notes: '',
  });
  constructor() {
    effect(() => {
      this.store.eventId();
      untracked(() => this.close());
    });
  }
  paid(o: Order): boolean {
    return this.store.data().sales.some((s) => s.id === o.saleId && s.status === 'completed');
  }
  contextName(o: Order): string {
    return this.store.data().events.find((e) => e.id === o.eventId)?.name ?? 'Venta diaria';
  }
  closed(o: Order): boolean {
    return this.store.data().events.find((e) => e.id === o.eventId)?.status === 'closed';
  }
  inColumn(status: string): Order[] {
    return this.rows().filter((o) => o.status === status);
  }
  methodName(method: string): string {
    return PAYMENT_CHOICES.find((p) => p.method === method)?.name ?? method;
  }
  async pack(o: Order): Promise<void> {
    await this.store.run(() => this.store.orders.pack(o.id), 'Pedido empacado.');
  }
  async deliver(o: Order): Promise<void> {
    if (
      !window.confirm(
        this.paid(o)
          ? '¿Confirmar que el cliente recibió el pedido?'
          : '¿Confirmar entrega pendiente de pago? Se descontará el inventario y quedará por cobrar.',
      )
    )
      return;
    await this.store.run(() => this.store.orders.deliver(o.id), 'Entrega registrada.');
  }
  close(): void {
    if (!this.photoBusy() && !this.store.busy()) {
      this.selectedId.set('');
      this.message.set('');
      this.url.set('');
      this.evidence.set(undefined);
    }
  }
  async show(o: Order, action: 'pay' | 'message' | 'cancel' | 'edit'): Promise<void> {
    if (this.preparing() || this.store.busy()) return;
    this.action.set(action);
    this.evidence.set(undefined);
    this.payment.reset({ method: 'cash' });
    this.cancellation.reset();
    this.customer.patchValue(o.customer);
    this.profile.set(undefined);
    this.message.set('');
    this.url.set('');
    if (action === 'pay' || action === 'message') {
      this.preparing.set(true);
      try {
        const profile = await this.vault.readProfile(o.eventId ?? DAILY_PROFILE);
        if (!profile) {
          this.vault.request.set({ eventId: o.eventId ?? DAILY_PROFILE });
          this.store.notice.set('Configura el perfil y vuelve al pedido.');
          return;
        }
        this.profile.set(profile);
        if (action === 'message') {
          const message = orderMessage(o, profile, this.paid(o));
          this.message.set(message);
          this.url.set(whatsappUrl(o.customer.phone, message));
        }
      } catch (error) {
        this.store.error.set(this.store.errorText(error));
        return;
      } finally {
        this.preparing.set(false);
      }
    }
    this.selectedId.set(o.id);
  }
  async pay(): Promise<void> {
    const order = this.selected();
    if (!order || this.photoBusy()) return;
    const ok = await this.store.run(async () => {
      const v = this.payment.getRawValue();
      const profile = await this.vault.readProfile(order.eventId ?? DAILY_PROFILE);
      if (!profile || (v.method !== 'cash' && !profile.accounts.some((a) => a.method === v.method)))
        throw new Error('Configura un método de pago habilitado.');
      await this.store.orders.pay(order.id, {
        method: (['ficohsa', 'atlantida'].includes(v.method) ? 'other' : v.method) as PaymentMethod,
        ...(v.method === 'cash'
          ? { receivedMinor: parseMoney(v.received || (order.totalMinor / 100).toFixed(2)) }
          : {}),
        ...(v.method !== 'cash' && this.evidence() ? { evidence: this.evidence() } : {}),
        reference: [v.method === 'cash' ? '' : this.methodName(v.method), v.reference]
          .filter(Boolean)
          .join(' · '),
      });
    }, 'Pedido pagado. Venta registrada sin duplicar inventario.');
    if (ok) this.close();
  }
  async cancel(): Promise<void> {
    const order = this.selected();
    if (!order || this.photoBusy() || this.cancellation.invalid) return;
    if (
      !window.confirm(
        '¿Cancelar el pedido? Si ya hubo salida de inventario, confirma que los productos regresan; se conservará el motivo y el historial.',
      )
    )
      return;
    const v = this.cancellation.getRawValue();
    const ok = await this.store.run(
      () => this.store.orders.cancel(order.id, v.reason, v.refunded, this.evidence()),
      'Pedido cancelado.',
    );
    if (ok) this.close();
  }
  async saveCustomer(): Promise<void> {
    const order = this.selected();
    if (!order) return;
    const v = this.customer.getRawValue();
    const ok = await this.store.run(
      () =>
        this.store.orders.updateCustomer(order.id, {
          ...v,
          phone: normalizePhone(v.phone),
          fulfillment: v.fulfillment as 'pickup' | 'delivery',
        }),
      'Datos del cliente actualizados.',
    );
    if (ok) this.close();
  }
  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.store.notice.set('Copiado.');
    } catch {
      this.store.error.set('Mantén presionado el texto para copiarlo.');
    }
  }
}
