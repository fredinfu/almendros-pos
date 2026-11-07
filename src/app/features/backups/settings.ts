import { OfflineService } from '../../core/offline.service';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS } from '../../shared/ui';
import { Backup } from '../../domain/backups';
@Component({
  selector: 'app-settings',
  imports: UI_IMPORTS,
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage implements OnInit {
  readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  readonly preview = signal<Backup | null>(null);
  readonly fileName = signal('');
  readonly confirmation = this.fb.nonNullable.control('');
  readonly storage = signal('Consultando…');
  readonly persistent = signal(false);
  readonly offline = inject(OfflineService);
  readonly form = this.fb.nonNullable.group({
    businessName: [this.store.data().settings[0].businessName, Validators.required],
    timeZone: [this.store.data().settings[0].timeZone, Validators.required],
    compactDisplay: [this.store.data().settings[0].compactDisplay],
    backupReminderDays: [
      this.store.data().settings[0].backupReminderDays,
      [Validators.min(1), Validators.max(365)],
    ],
  });
  async ngOnInit(): Promise<void> {
    await this.inspectStorage();
  }
  async inspectStorage(): Promise<void> {
    try {
      const estimate = await navigator.storage?.estimate();
      this.storage.set(
        estimate
          ? `${((estimate.usage ?? 0) / 1024 / 1024).toFixed(1)} MB usados / ${((estimate.quota ?? 0) / 1024 / 1024).toFixed(0)} MB de cuota aproximada`
          : 'Información no disponible',
      );
      this.persistent.set((await navigator.storage?.persisted()) ?? false);
      await this.offline.check();
    } catch {
      this.storage.set('El navegador no permite consultar el almacenamiento.');
    }
  }
  async persist(): Promise<void> {
    await this.store.run(async () => {
      const granted = await navigator.storage?.persist();
      if (!granted)
        throw new Error(
          'El navegador no concedió almacenamiento persistente. Mantén respaldos externos.',
        );
      await this.inspectStorage();
    }, 'Almacenamiento persistente solicitado. Los respaldos siguen siendo necesarios.');
  }
  async save(): Promise<void> {
    if (this.form.invalid) return;
    await this.store.run(() =>
      this.store.saveSettings({ ...this.store.data().settings[0], ...this.form.getRawValue() }),
    );
  }
  async selectFile(event: Event): Promise<void> {
    this.preview.set(null);
    this.confirmation.setValue('');
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.store.run(async () => {
      if (file.size > 200 * 1024 * 1024) throw new Error('El respaldo excede 200 MB.');
      const backup = this.store.backups.preview(await file.text());
      this.preview.set(backup);
      this.fileName.set(file.name);
    }, 'Respaldo validado. Revisa la vista previa antes de restaurar.');
  }
  async restore(): Promise<void> {
    const backup = this.preview();
    if (!backup || this.confirmation.value !== 'REEMPLAZAR') return;
    if (
      !window.confirm(
        'Se reemplazarán TODOS los datos de este dispositivo con el archivo seleccionado. ¿Continuar?',
      )
    )
      return;
    const ok = await this.store.run(
      () => this.store.backups.restore(backup),
      'Respaldo restaurado. Los datos anteriores se reemplazaron.',
    );
    if (ok) {
      this.store.eventId.set(this.store.data().events.find((e) => e.status === 'open')?.id ?? '');
      this.preview.set(null);
      this.form.patchValue(this.store.data().settings[0]);
    }
  }
}
