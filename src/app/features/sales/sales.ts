import { EvidencePicker } from '../../shared/evidence-picker';
import { PaymentEvidence } from '../../domain/models';
import { toCsv } from '../../domain/backups';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS, statusLabels, paymentLabels } from '../../shared/ui';
@Component({
  selector: 'app-sales',
  imports: [...UI_IMPORTS, EvidencePicker],
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
  readonly voidPhoto = signal<PaymentEvidence | undefined>(undefined);
  readonly photoBusy = signal(false);
  readonly scope = computed(() =>
    this.store
      .data()
      .sales.filter(
        (s) =>
          s.status !== 'pending' &&
          (this.allEvents() || (s.eventId ?? '') === this.store.eventId()),
      ),
  );
  readonly totals = computed(() =>
    [...new Set(this.scope().map((s) => s.eventId ?? ''))].map((id) => ({
      id,
      name: this.eventName(id),
      total: this.scope()
        .filter((s) => (s.eventId ?? '') === id && s.status === 'completed')
        .reduce((n, s) => n + s.totalMinor, 0),
    })),
  );
  readonly netTotal = computed(() => this.totals().reduce((n, g) => n + g.total, 0));
  exportSales(): void {
    this.store.download('almendros-ventas.csv', toCsv(this.scope()), 'text/csv;charset=utf-8');
  }
  saleItems(id: string) {
    return this.store.data().items.filter((i) => i.saleId === id);
  }
  customer(id: string) {
    return this.store.data().orders?.find((o) => o.saleId === id)?.customer;
  }
  show(id: string): void {
    this.form.reset();
    this.voidPhoto.set(undefined);
    this.selectedId.set(id);
  }
  closeDetail(): void {
    if (!this.photoBusy() && !this.store.busy()) this.selectedId.set('');
  }
  readonly rows = computed(() =>
    this.store
      .data()
      .sales.filter(
        (s) =>
          s.status !== 'pending' &&
          (this.allEvents() || (s.eventId ?? '') === this.store.eventId()) &&
          (!this.filter() || s.status === this.filter()),
      )
      .sort((a, b) => (b.paidAt ?? b.soldAt).localeCompare(a.paidAt ?? a.soldAt)),
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
    return this.store.data().events.find((e) => e.id === id)?.name ?? 'Venta diaria / ambulatoria';
  }
  method(id: string): string {
    const payment = this.store.data().payments.find((p) => p.saleId === id);
    return payment ? this.paymentLabels[payment.method] : 'Sin pago recibido';
  }
  canVoid(): boolean {
    return (
      this.store.data().events.find((e) => e.id === this.selected()?.eventId)?.status !== 'closed'
    );
  }
  async voidSale(): Promise<void> {
    if (
      this.form.invalid ||
      this.photoBusy() ||
      this.store.busy() ||
      !window.confirm(
        '¿Anular la venta y devolver las unidades descontadas a su ubicación de origen? El historial se conservará.',
      )
    )
      return;
    const v = this.form.getRawValue();
    const ok = await this.store.run(
      () => this.store.sales.void(this.selectedId(), v.reason, v.refunded, this.voidPhoto()),
      'Venta anulada y stock restituido.',
    );
    if (ok) {
      this.form.reset();
      this.voidPhoto.set(undefined);
    }
  }
  async refund(): Promise<void> {
    if (window.confirm('¿Confirmas que el dinero ya fue devuelto al cliente?'))
      await this.store.run(
        () => this.store.sales.markRefunded(this.selectedId()),
        'Reembolso marcado como realizado.',
      );
  }
}
