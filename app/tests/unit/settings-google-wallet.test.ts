import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setGoogleWalletDesignAction, toggleGoogleWalletAction } from '@/lib/actions/settings';

const mockFrom = vi.fn();
const mockAdminClient = { from: mockFrom };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
  getEffectiveOrgId: vi.fn().mockResolvedValue('org-123'),
}));

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn().mockResolvedValue({
    id: 'admin-1',
    subject_id: 'admin-1',
    subject_type: 'officer',
    name: 'Admin',
    role: 'admin',
    organization_id: 'org-123',
    issued_at: 0,
    expires_at: 0,
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('toggleGoogleWalletAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates google_wallet_enabled in organization_settings', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const res = await toggleGoogleWalletAction(true);
    expect(res.success).toBe(true);
  });

  it('rejects non-admin roles', async () => {
    const { getSessionUser } = await import('@/lib/session');
    vi.mocked(getSessionUser).mockResolvedValueOnce({
      id: 'student-1',
      subject_id: 'student-1',
      subject_type: 'student',
      name: 'Student',
      role: 'student',
      organization_id: 'org-123',
      issued_at: 0,
      expires_at: 0,
    });

    const res = await toggleGoogleWalletAction(true);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/unauthorized/i);
    }
  });

  it('lets an admin select the organization-wide Wallet design', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const res = await setGoogleWalletDesignAction('legacy');
    expect(res.success).toBe(true);
  });

  it('rejects an invalid Wallet design', async () => {
    const res = await setGoogleWalletDesignAction('broken' as never);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/invalid/i);
  });
});
