import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../core/app.store';
import { EventPaymentsService, PAYMENT_CHOICES } from '../core/event-payments.service';
import { UI_IMPORTS } from './ui';
import { DAILY_PROFILE, defaultProfile, normalizePhone } from '../domain/communication';
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
  readonly dailyId = DAILY_PROFILE;
  readonly name = this.fb.nonNullable.control('Almendros Coffee Co.', [
    Validators.required,
    Validators.maxLength(150),
  ]);
  readonly contact = this.fb.nonNullable.group({
    whatsapp: '50488793266',
    pickupAddress: '',
    instructions: '',
  });
  private sharedHolder = '';
  private holderSource = '';
  suggestHolder(value: string, method: string): void {
    if (!this.holderSource && value.trim()) this.holderSource = method;
    if (this.holderSource !== method) return;
    const previous = this.sharedHolder;
    this.sharedHolder = value;
    for (const row of this.rows) {
      const field = row.form.controls.holder;
      if (!field.dirty && (!field.value || field.value === previous)) field.setValue(value);
    }
  }
  enable(method: string): void {
    const row = this.rows.find((r) => r.method === method)!;
    if (row.form.controls.enabled.value && !row.form.controls.holder.value)
      row.form.controls.holder.setValue(this.sharedHolder);
  }
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
        void this.vault
          .readProfile(DAILY_PROFILE)
          .then((profile) => {
            if (!profile && !this.vault.request())
              this.vault.request.set({ eventId: DAILY_PROFILE });
          })
          .catch(() => this.vault.request.set({ eventId: DAILY_PROFILE }));
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
    this.name.reset(defaultProfile().businessName);
    this.contact.reset({
      whatsapp: defaultProfile().whatsapp,
      pickupAddress: '',
      instructions: '',
    });
    this.sharedHolder = '';
    this.holderSource = '';
    this.rows.forEach((r) => r.form.reset());
    try {
      const profile = await this.vault.readProfile(id);
      const accounts = profile?.accounts;
      if (profile) {
        this.name.setValue(profile.businessName);
        this.contact.patchValue(profile);
      }
      this.sharedHolder = accounts?.[0]?.holder ?? '';
      this.holderSource = accounts?.[0]?.method ?? '';
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
    if (!this.name.value.trim()) {
      this.error.set('Escribe el nombre del negocio o perfil.');
      return;
    }
    const accounts = this.rows
      .filter((r) => r.form.controls.enabled.value)
      .map((r) => ({
        method: r.method as 'bac' | 'ficohsa' | 'atlantida' | 'kash',
        code: r.form.controls.code.value.trim(),
        holder: r.form.controls.holder.value.trim(),
      }));
    const id = request.eventId || DAILY_PROFILE;
    this.loading.set(true);
    const ok = await this.store.run(async () => {
      const contact = this.contact.getRawValue();
      await this.vault.save(id, accounts, {
        ...contact,
        whatsapp: normalizePhone(contact.whatsapp),
        businessName: this.name.value.trim(),
        accounts,
      });
      if (request.openAfter) await this.store.events.open(id);
    }, 'Métodos guardados solo en este dispositivo.');
    this.loading.set(false);
    if (ok) {
      this.store.selectEvent(id === DAILY_PROFILE ? '' : id);
      this.vault.request.set(undefined);
    } else this.error.set(this.store.error());
  }
}
