import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BadgeCard } from '@/components/badges/badge-card';
import type { BadgeStudent } from '@/lib/types/models';

describe('BadgeCard UI', () => {
  const student: BadgeStudent = {
    id: 's-1',
    uid: '2024-001',
    student_number: '2024-00001',
    full_name: 'Test Student',
    course: 'BSIT',
    year: '1st Year',
    section: '1',
    status: 'Active',
    avatar_url: null,
  };

  it('renders Google Wallet button when walletSaveUrl is passed', () => {
    const element = React.createElement(BadgeCard, {
      student,
      walletSaveUrl: 'https://pay.google.com/gp/v/save/test-jwt',
    });
    const html = renderToString(element);
    expect(html).toContain('Add to Google Wallet');
    expect(html).toContain('href="https://pay.google.com/gp/v/save/test-jwt"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('data:image/png');
  });

  it('does not render Google Wallet button when walletSaveUrl is null and showWalletButton is false', () => {
    const element = React.createElement(BadgeCard, {
      student,
      walletSaveUrl: null,
      showWalletButton: false,
    });
    const html = renderToString(element);
    expect(html).not.toContain('Add to Google Wallet');
  });

  it('renders Google Wallet button when showWalletButton is true even without precomputed walletSaveUrl', () => {
    const element = React.createElement(BadgeCard, {
      student,
      walletSaveUrl: null,
      showWalletButton: true,
    });
    const html = renderToString(element);
    expect(html).toContain('Add to Google Wallet');
    expect(html).toContain('<button');
  });
});
