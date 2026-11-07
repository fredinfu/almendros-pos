import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS, statusLabels, paymentLabels } from '../../shared/ui';
@Component({
  selector: 'app-sales',
  imports: UI_IMPORTS,
  templateUrl: './sales.html',
  styleUrl: './sales.scss',
})
export class SalesPage {
  readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  readonly statusLabels = statusLabels;
  readonly paymentLabels = paymentLabels;
  readonly filter = signal('');
  readonly allEvents = signal(false);
  readonly selectedId = signal('');
  readonly rows = computed(() =>
    this.store
      .data()
      .sales.filter(
        (s) =>
          (this.allEvents() || (s.eventId ?? '') === this.store.eventId()) &&
          (!this.filter() || s.status === this.filter()),
      )
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt)),
  );
  readonly selected = computed(() =>
    this.store.data().sales.find((s) => s.id === this.selectedId()),
  );
  readonly payment = computed(() =>
    this.store.data().payments.find((p) => p.saleId === this.selectedId()),
  );
  readonly items = computed(() =>
    this.store.data().items.filter((i) => i.saleId === this.selectedId()),
  );
  readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(200)]],
    refunded: [false],
  });
  eventName(id?: string): string {
    return this.store.data().events.find((e) => e.id === id)?.name ?? 'Venta rápida';
  }
  method(id: string): string {
    return this.paymentLabels[
      this.store.data().payments.find((p) => p.saleId === id)?.method ?? 'other'
    ];
  }
  canVoid(): boolean {
    return (
      this.store.data().events.find((e) => e.id === this.selected()?.eventId)?.status !== 'closed'
    );
  }
  async voidSale(): Promise<void> {
    if (
      this.form.invalid ||
      !window.confirm(
        '¿Anular la venta y devolver las unidades descontadas a su ubicación de origen? El historial se conservará.',
      )
    )
      return;
    const v = this.form.getRawValue();
    const ok = await this.store.run(
      () => this.store.sales.void(this.selectedId(), v.reason, v.refunded),
      'Venta anulada y stock restituido.',
    );
    if (ok) this.form.reset();
  }
  async refund(): Promise<void> {
    if (window.confirm('¿Confirmas que el dinero ya fue devuelto al cliente?'))
      await this.store.run(
        () => this.store.sales.markRefunded(this.selectedId()),
        'Reembolso marcado como realizado.',
      );
  }
}
