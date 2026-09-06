import { describe, expect, it } from 'vitest';
import { buildBadgeData } from '@/lib/badges/badge';
import { buildBadgeSvgDocument, buildBadgeSvgMarkup } from '@/lib/badges/artwork';

const badge = buildBadgeData({
  id: 'student-1',
  uid: 'ST-2026-0001',
  student_number: '2026-12345',
  full_name: 'Ada Lovelace',
  course: 'BS Computer Science',
  year: '4th Year',
  section: '1',
  status: 'Active',
  avatar_url: null,
});

describe('canonical SVG badge artwork', () => {
  it('contains the branded layout and student identity fields', () => {
    const markup = buildBadgeSvgMarkup(badge, { qrDataUrl: 'data:image/png;base64,qr', avatarDataUrl: null });
    expect(markup).toContain('ALIENISTA · ACS CAMPUS BADGE');
    expect(markup).toContain('Ada Lovelace');
    expect(markup).toContain('ST-2026-0001');
    expect(markup).toContain('data:image/png;base64,qr');
  });

  it('wraps the exact same markup in a fixed-size SVG document for export', () => {
    const assets = { qrDataUrl: 'data:image/png;base64,qr', avatarDataUrl: null };
    const document = buildBadgeSvgDocument(badge, assets);
    expect(document).toContain('width="400" height="640" viewBox="0 0 400 640"');
    expect(document).toContain(buildBadgeSvgMarkup(badge, assets));
  });
});
