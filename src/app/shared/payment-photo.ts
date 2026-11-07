import { PaymentEvidence } from '../domain/models';

/** Re-encode pixels only: strips EXIF/account filename metadata, limits local backup growth. */
export async function preparePaymentPhoto(file: File): Promise<PaymentEvidence> {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una fotografía.');
  if (file.size > 20 * 1024 * 1024)
    throw new Error('La foto supera 20 MB. Elige una imagen más pequeña.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error('No se pudo abrir la foto. Usa JPEG, PNG o una captura de pantalla.');
    }
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5, 0.35]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= 1400000) return { dataUrl, width: canvas.width, height: canvas.height };
    }
    throw new Error(
      'La imagen sigue siendo demasiado grande. Recorta la referencia y vuelve a adjuntarla.',
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
