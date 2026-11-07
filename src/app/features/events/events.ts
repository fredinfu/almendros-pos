import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, FormRecord, Validators } from '@angular/forms';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS, statusLabels, paymentLabels } from '../../shared/ui';
import { newId, now, parseMoney } from '../../domain/models';
@Component({
  selector: 'app-events',
  imports: UI_IMPORTS,
  templateUrl: './events.html',
  styleUrl: './events.scss',
})
export class EventsPage {
  readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  readonly statusLabels = statusLabels;
  readonly paymentLabels = paymentLabels;
  readonly expenseId = signal('');
  readonly expenseLabels: Record<string, string> = {
    stand: 'Stand',
    transport: 'Transporte',
    supplies: 'Insumos',
    food: 'Alimentación',
    other: 'Otro',
  };
  readonly creating = signal(false);
  readonly closing = signal(false);
  readonly expenses = computed(() =>
    this.store.data().expenses.filter((e) => e.eventId === this.store.eventId()),
  );
  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    venue: [''],
    city: [''],
    startsAt: [''],
    notes: [''],
    openingCash: [''],
  });
  readonly transfer = this.fb.nonNullable.group({
    variantId: ['', Validators.required],
    quantity: [1, [Validators.min(1), Validators.pattern(/^\d+$/)]],
  });
  readonly expense = this.fb.nonNullable.group({
    category: ['stand'],
    description: ['', Validators.required],
    amount: ['', Validators.required],
    paymentMethod: ['cash'],
  });
  readonly counts = new FormRecord<FormControl<string>>({});
  readonly closeForm = this.fb.nonNullable.group({ reason: [''], cash: [''] });
  private closeEventId = '';
  private expectedCounts: Record<string, number> = {};
  constructor() {
    effect(() => {
      this.store.eventId();
      this.closing.set(false);
      this.expenseId.set('');
    });
  }
  async open(): Promise<void> {
    await this.store.run(() => this.store.events.open(this.store.eventId()), 'Evento abierto.');
  }
  async create(): Promise<void> {
    if (this.form.invalid) return;
    const id = newId();
    const ok = await this.store.run(() => {
      const v = this.form.getRawValue();
      return this.store.events.create({
        id,
        name: v.name,
        ...(v.venue ? { venue: v.venue } : {}),
        ...(v.city ? { city: v.city } : {}),
        ...(v.startsAt ? { startsAt: new Date(`${v.startsAt}T00:00:00-06:00`).toISOString() } : {}),
        notes: v.notes,
        ...(v.openingCash ? { openingCashMinor: parseMoney(v.openingCash) } : {}),
      });
    }, 'Evento creado en borrador. Ya puedes registrar ventas.');
    if (ok) {
      this.store.selectEvent(id);
      this.creating.set(false);
      this.form.reset();
    }
  }
  async transferStock(): Promise<void> {
    if (this.transfer.invalid) return;
    const ok = await this.store.run(
      () =>
        this.store.inventory.transfer({
          ...this.transfer.getRawValue(),
          id: newId(),
          eventId: this.store.eventId(),
        }),
      'Inventario transferido.',
    );
    if (ok) this.transfer.reset({ variantId: '', quantity: 1 });
  }
  async saveExpense(): Promise<void> {
    if (this.expense.invalid) return;
    const ok = await this.store.run(
      () => {
        const v = this.expense.getRawValue();
        if (this.expenseId()) {
          const reason = window.prompt('Motivo de la corrección del gasto:');
          if (!reason) throw new Error('Corrección cancelada.');
          const closed = this.store.event()?.status === 'closed';
          if (
            closed &&
            !window.confirm(
              'Este evento está cerrado. La corrección quedará en el historial y recalculará gastos y caja esperada; no cambiará el efectivo contado. ¿Continuar?',
            )
          )
            throw new Error('Corrección cancelada.');
          return this.store.events.correctExpense(
            this.expenseId(),
            {
              description: v.description,
              category: v.category,
              amountMinor: parseMoney(v.amount),
              paymentMethod: v.paymentMethod,
            },
            reason,
            closed,
          );
        }
        return this.store.events.expense({
          id: newId(),
          eventId: this.store.eventId(),
          category: v.category,
          description: v.description,
          amountMinor: parseMoney(v.amount),
          paymentMethod: v.paymentMethod,
          incurredAt: now(),
          createdAt: now(),
        });
      },
      this.expenseId() ? 'Gasto corregido.' : 'Gasto registrado.',
    );
    if (ok) {
      this.expenseId.set('');
      this.expense.patchValue({ description: '', amount: '' });
    }
  }
  editExpense(id: string): void {
    const e = this.store.data().expenses.find((e) => e.id === id)!;
    this.expenseId.set(id);
    this.expense.patchValue({
      description: e.description,
      category: e.category,
      amount: (e.amountMinor / 100).toFixed(2),
      paymentMethod: e.paymentMethod ?? 'other',
    });
  }
  async voidExpense(id: string): Promise<void> {
    const reason = window.prompt('Motivo para anular el gasto:');
    if (!reason) return;
    const closed = this.store.event()?.status === 'closed';
    if (
      !window.confirm(
        closed
          ? '¿Corregir el evento cerrado anulando este gasto? Se conservará el historial y se recalculará la caja esperada, sin cambiar el conteo final.'
          : '¿Anular este gasto? Se conservará en el historial y dejará de sumar en los reportes.',
      )
    )
      return;
    await this.store.run(() => this.store.events.voidExpense(id, reason, closed), 'Gasto anulado.');
  }
  prepareClose(): void {
    this.closeEventId = this.store.eventId();
    this.expectedCounts = {};
    Object.keys(this.counts.controls).forEach((key) => this.counts.removeControl(key));
    for (const v of this.store.variants().filter((v) => v.trackInventory)) {
      const expected = this.store.stock(v.id);
      this.expectedCounts[v.id] = expected;
      this.counts.addControl(
        v.id,
        new FormControl(expected === 0 ? '0' : '', {
          nonNullable: true,
          validators: [Validators.required, Validators.pattern(/^\d+$/)],
        }),
      );
    }
    this.closeForm.reset();
    this.closing.set(true);
  }
  difference(id: string): number | undefined {
    const value = this.counts.controls[id]?.value;
    return value === '' ? undefined : Number(value) - (this.expectedCounts[id] ?? 0);
  }
  async close(): Promise<void> {
    if (this.counts.invalid) {
      this.counts.markAllAsTouched();
      return;
    }
    if (
      !window.confirm(
        '¿Cerrar el evento y devolver las unidades contadas al Almacén General? Esta operación impedirá nuevas ventas y anulaciones.',
      )
    )
      return;
    const ok = await this.store.run(() => {
      const values = Object.fromEntries(
        Object.entries(this.counts.getRawValue()).map(([id, count]) => [id, Number(count)]),
      );
      const close = this.closeForm.getRawValue();
      return this.store.events.close(
        this.closeEventId,
        values,
        close.reason,
        close.cash ? parseMoney(close.cash) : undefined,
        this.expectedCounts,
      );
    }, 'Evento cerrado. Los sobrantes regresaron al almacén. Descarga un respaldo.');
    if (ok) this.closing.set(false);
  }
}
