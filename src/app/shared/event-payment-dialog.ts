import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../core/app.store';
import { EventPaymentsService, PAYMENT_CHOICES } from '../core/event-payments.service';
import { UI_IMPORTS } from './ui';
import { newId } from '../domain/models';
@Component({
  selector: 'app-event-payment-dialog',
  imports: UI_IMPORTS,
  templateUrl: './event-payment-dialog.html',
  styleUrl: './event-payment-dialog.scss',
})
export class EventPaymentDialog {
  readonly store = inject(AppStore);
  readonly vault = inject(EventPaymentsService);
  readonly fb = inject(FormBuilder);
  readonly name = this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(150)]);
  readonly rows = PAYMENT_CHOICES.map((p) => ({
    ...p,
    form: this.fb.nonNullable.group({ enabled: false, code: '', holder: '' }),
  }));
  readonly loading = signal(false);
  readonly error = signal('');
  private prompted = false;
  constructor() {
    effect(() => {
      if (this.store.ready() && !this.store.data().events.length && !this.prompted) {
        this.prompted = true;
        this.vault.request.set({ eventId: '' });
      }
    });
    effect(() => {
      const request = this.vault.request();
      if (request) void this.load(request.eventId);
    });
  }
  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.name.reset();
    this.rows.forEach((r) => r.form.reset());
    try {
      const accounts = await this.vault.read(id);
      if (this.vault.request()?.eventId !== id) return;
      for (const row of this.rows) {
        const account = accounts?.find((a) => a.method === row.method);
        if (account)
          row.form.patchValue({ enabled: true, code: account.code, holder: account.holder });
      }
    } catch {
      this.error.set('Vuelve a configurar los métodos en este dispositivo.');
    } finally {
      this.loading.set(false);
    }
  }
  async save(): Promise<void> {
    const request = this.vault.request();
    if (!request || this.loading() || this.store.busy()) return;
    if (!request.eventId && !this.name.value.trim()) {
      this.error.set('Escribe el nombre del evento.');
      return;
    }
    const accounts = this.rows
      .filter((r) => r.form.controls.enabled.value)
      .map((r) => ({
        method: r.method,
        code: r.form.controls.code.value.trim(),
        holder: r.form.controls.holder.value.trim(),
      }));
    const id = request.eventId || newId();
    this.loading.set(true);
    const ok = await this.store.run(async () => {
      await this.vault.save(id, accounts);
      if (!request.eventId) await this.store.events.create({ id, name: this.name.value.trim() });
      if (request.openAfter) await this.store.events.open(id);
    }, 'Métodos guardados solo en este dispositivo.');
    this.loading.set(false);
    if (ok) {
      this.store.selectEvent(id);
      this.vault.request.set(undefined);
    } else this.error.set(this.store.error());
  }
}
