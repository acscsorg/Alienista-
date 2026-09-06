import QRCode from 'qrcode';
import { BADGE_SPEC, serializeBadgePayload } from '@/lib/badges/badge';
import { buildBadgeSvgDocument, type BadgeArtworkAssets } from '@/lib/badges/artwork';
import type { BadgeData } from '@/lib/types/models';

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Image conversion failed.'));
    reader.readAsDataURL(blob);
  });
}

async function loadAvatarDataUrl(source: string | null): Promise<string | null> {
  if (!source) return null;
  try {
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) return null;
    return await blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

export async function buildBadgeArtworkAssets(badge: BadgeData): Promise<BadgeArtworkAssets> {
  const [qrDataUrl, avatarDataUrl] = await Promise.all([
    QRCode.toDataURL(serializeBadgePayload(badge), {
      width: BADGE_SPEC.qr_size,
      margin: 1,
      color: { dark: BADGE_SPEC.colors.qr_dark, light: BADGE_SPEC.colors.qr_light },
      errorCorrectionLevel: 'M',
    }),
    loadAvatarDataUrl(badge.avatar_url),
  ]);
  return { qrDataUrl, avatarDataUrl };
}

export async function renderBadgeToDataUrl(badge: BadgeData, providedAssets?: BadgeArtworkAssets): Promise<string> {
  const assets = providedAssets || await buildBadgeArtworkAssets(badge);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildBadgeSvgDocument(badge, assets))}`);
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_SPEC.width;
  canvas.height = BADGE_SPEC.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable.');
  context.drawImage(image, 0, 0, BADGE_SPEC.width, BADGE_SPEC.height);
  return canvas.toDataURL('image/png');
}
