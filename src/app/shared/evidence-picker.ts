import { Component, input, model } from '@angular/core';
import { UI_IMPORTS } from './ui';
import { PaymentEvidence } from '../domain/models';
import { preparePaymentPhoto } from './payment-photo';
@Component({
  selector: 'app-evidence-picker',
  imports: UI_IMPORTS,
  templateUrl: './evidence-picker.html',
})
export class EvidencePicker {
  readonly label = input('Foto de referencia');
  readonly disabled = input(false);
  readonly photo = model<PaymentEvidence | undefined>(undefined);
  readonly busy = model(false);
  error = '';
  async attach(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy() || this.disabled()) return;
    this.busy.set(true);
    this.error = '';
    try {
      this.photo.set(await preparePaymentPhoto(file));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'No se pudo preparar la foto.';
    } finally {
      this.busy.set(false);
    }
  }
}
