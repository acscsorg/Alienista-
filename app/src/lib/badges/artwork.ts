import type { BadgeData } from '@/lib/types/models';
import { BADGE_SPEC } from '@/lib/badges/badge';

export interface BadgeArtworkAssets {
  qrDataUrl: string | null;
  avatarDataUrl: string | null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'S';
}

export function buildBadgeSvgMarkup(badge: BadgeData, assets: BadgeArtworkAssets): string {
  const { qr_size: qrSize, colors } = BADGE_SPEC;
  const name = escapeXml(badge.full_name.slice(0, 28));
  const courseYear = escapeXml(`${badge.course} · ${badge.year}`.slice(0, 37));
  const blockStatus = escapeXml(`${badge.block_label} · ${badge.status}`);
  const uid = escapeXml(badge.uid);
  const studentNumber = escapeXml(badge.student_number);
  const qr = assets.qrDataUrl
    ? `<image href="${escapeXml(assets.qrDataUrl)}" x="60" y="172" width="${qrSize}" height="${qrSize}" preserveAspectRatio="none"/>`
    : `<rect x="60" y="172" width="${qrSize}" height="${qrSize}" rx="12" fill="${colors.mutedSurface}" stroke="${colors.border}"/>`;
  const avatar = assets.avatarDataUrl
    ? `<image href="${escapeXml(assets.avatarDataUrl)}" x="24" y="52" width="72" height="72" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/><rect x="24" y="52" width="72" height="72" rx="14" fill="none" stroke="${colors.accent}" stroke-width="3"/>`
    : `<rect x="24" y="52" width="72" height="72" rx="14" fill="${colors.brandSecondary}" stroke="${colors.accent}" stroke-width="3"/><text x="60" y="98" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="28" font-weight="700">${initials(name)}</text>`;

  return `
    <defs><clipPath id="avatarClip"><rect x="24" y="52" width="72" height="72" rx="14"/></clipPath></defs>
    <rect x="1" y="1" width="398" height="638" rx="22" fill="${colors.surface}" stroke="${colors.border}" stroke-width="2"/>
    <path d="M23 1H377A22 22 0 0 1 399 23V147H1V23A22 22 0 0 1 23 1Z" fill="${colors.brand}"/>
    <rect x="1" y="124" width="398" height="24" fill="${colors.brand}"/>
    <text x="24" y="32" fill="${colors.accent}" font-family="Arial, sans-serif" font-size="13" font-weight="700">ALIENISTA · ACS CAMPUS BADGE</text>
    ${avatar}
    <text x="116" y="70" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="18" font-weight="700">${name}</text>
    <text x="116" y="95" fill="#D1E7D7" font-family="Arial, sans-serif" font-size="13">${courseYear}</text>
    <text x="116" y="118" fill="${colors.accent}" font-family="Arial, sans-serif" font-size="12" font-weight="700">${blockStatus}</text>
    ${qr}
    <rect x="36" y="476" width="328" height="126" rx="16" fill="${colors.mutedSurface}" stroke="${colors.border}" stroke-width="1.5"/>
    <text x="200" y="504" text-anchor="middle" fill="${colors.brandSecondary}" font-family="Arial, sans-serif" font-size="11" font-weight="700">SYSTEM UID</text>
    <text x="200" y="536" text-anchor="middle" fill="${colors.text}" font-family="Consolas, monospace" font-size="21" font-weight="700">${uid}</text>
    <text x="200" y="562" text-anchor="middle" fill="${colors.mutedText}" font-family="Consolas, monospace" font-size="13">${studentNumber}</text>
    <text x="200" y="586" text-anchor="middle" fill="${colors.mutedText}" font-family="Arial, sans-serif" font-size="12">${blockStatus}</text>
  `;
}

export function buildBadgeSvgDocument(badge: BadgeData, assets: BadgeArtworkAssets): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_SPEC.width}" height="${BADGE_SPEC.height}" viewBox="0 0 ${BADGE_SPEC.width} ${BADGE_SPEC.height}">${buildBadgeSvgMarkup(badge, assets)}</svg>`;
}
