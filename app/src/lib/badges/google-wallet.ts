import crypto from 'node:crypto';
import type { GoogleWalletDesign, Student } from '@/lib/types/models';

export interface GoogleWalletConfig {
  issuerId: string;
  classId: string;
  clientEmail: string;
  appUrl: string;
}

const WALLET_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GENERIC_OBJECT_ENDPOINT = 'https://walletobjects.googleapis.com/walletobjects/v1/genericObject';

function getGoogleWalletAppUrl(): string {
  return process.env.GOOGLE_WALLET_APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || 'http://localhost:3000';
}

export function base64UrlEncode(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function versionedImageUrl(url: string, updatedAt: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(updatedAt)}`;
}

function getWalletLogoUrl(student: Student): string | null {
  const configuredLogo = process.env.GOOGLE_WALLET_LOGO_URL?.trim();
  if (configuredLogo) {
    try {
      const url = new URL(configuredLogo);
      if (url.protocol === 'https:') return url.toString();
    } catch {
      // Fall through to the student's public avatar.
    }
  }

  if (!student.avatar_url) return null;
  try {
    const url = new URL(student.avatar_url);
    return url.protocol === 'https:' ? versionedImageUrl(url.toString(), student.updated_at) : null;
  } catch {
    return null;
  }
}

function getWalletHeroUrl(): string | null {
  const configuredHero = process.env.GOOGLE_WALLET_HERO_URL?.trim();
  if (!configuredHero) return null;
  try {
    const url = new URL(configuredHero);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createGoogleWalletObject(student: Student, config: GoogleWalletConfig, design: GoogleWalletDesign = 'builder') {
  const sectionLabel = student.section
    ? student.section.startsWith('Block')
      ? student.section
      : `Block ${student.section}`
    : 'Block 1';

  const fullClassId = config.classId.includes('.')
    ? config.classId
    : `${config.issuerId}.${config.classId}`;

  const cleanStudentId = student.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fullObjectId = `${config.issuerId}.${cleanStudentId}`;
  const logoUrl = getWalletLogoUrl(student);
  const heroUrl = getWalletHeroUrl();

  const object = {
    id: fullObjectId,
    classId: fullClassId,
    cardTitle: { defaultValue: { language: 'en-US', value: 'Alienista' } },
    header: { defaultValue: { language: 'en-US', value: student.full_name } },
    subheader: { defaultValue: { language: 'en-US', value: 'Student Member' } },
    hexBackgroundColor: '#2D6A4F',
    heroImage: heroUrl
      ? {
          sourceUri: { uri: heroUrl },
          contentDescription: { defaultValue: { language: 'en-US', value: 'Alienista student membership banner' } },
        }
      : undefined,
    logo: logoUrl
      ? {
          sourceUri: { uri: logoUrl },
          contentDescription: { defaultValue: { language: 'en-US', value: `${student.full_name} profile photo` } },
        }
      : undefined,
    // PATCH semantics preserve omitted fields, so an empty array removes an old image module.
    imageModulesData: [],
    barcode: {
      type: 'QR_CODE',
      value: student.uid,
      alternateText: student.uid,
    },
    textModulesData: [
      { id: 'program', header: 'PROGRAM', body: `${student.course} - ${student.year}` },
      { id: 'student_number', header: 'STUDENT NO.', body: student.student_number },
      { id: 'section', header: 'SECTION', body: sectionLabel },
      { id: 'status', header: 'STATUS', body: student.status },
    ],
  };

  if (design === 'legacy') {
    object.subheader = { defaultValue: { language: 'en-US', value: `${student.course} - ${student.year}` } };
    object.hexBackgroundColor = '#1B4332';
  }
  return object;
}

export function createGoogleWalletJwtPayload(student: Student, config: GoogleWalletConfig, design: GoogleWalletDesign = 'builder') {
  return {
    iss: config.clientEmail,
    aud: 'google',
    origins: [config.appUrl].filter(Boolean),
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: { genericObjects: [createGoogleWalletObject(student, config, design)] },
  };
}

export function signGoogleWalletJwt(payload: object, privateKeyPem: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const normalizedKey = privateKeyPem.replace(/\\n/g, '\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = base64UrlEncode(signer.sign(normalizedKey));

  return `${signInput}.${signature}`;
}

export function generateGoogleWalletSaveUrl(student: Student, design: GoogleWalletDesign = 'builder'): string | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID;
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  const appUrl = getGoogleWalletAppUrl();

  if (!issuerId || !classId || !clientEmail || !privateKey) return null;

  const payload = createGoogleWalletJwtPayload(student, { issuerId, classId, clientEmail, appUrl }, design);
  const jwt = signGoogleWalletJwt(payload, privateKey);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

function createServiceAccountAssertion(config: GoogleWalletConfig, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signGoogleWalletJwt(
    {
      iss: config.clientEmail,
      scope: WALLET_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    },
    privateKey
  );
}

async function getWalletAccessToken(config: GoogleWalletConfig, privateKey: string): Promise<string> {
  const assertion = createServiceAccountAssertion(config, privateKey);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Wallet token request failed (${response.status}).`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Wallet token response did not contain an access token.');
  return body.access_token;
}

export type GoogleWalletSyncResult =
  | { status: 'updated' }
  | { status: 'not_found' }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

export async function syncGoogleWalletObject(student: Student, design: GoogleWalletDesign = 'builder'): Promise<GoogleWalletSyncResult> {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID;
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  const appUrl = getGoogleWalletAppUrl();
  if (!issuerId || !classId || !clientEmail || !privateKey) return { status: 'skipped' };

  try {
    const config = { issuerId, classId, clientEmail, appUrl };
    const accessToken = await getWalletAccessToken(config, privateKey);
    const object = createGoogleWalletObject(student, config, design);
    const response = await fetch(`${GENERIC_OBJECT_ENDPOINT}/${encodeURIComponent(object.id)}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(object),
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) return { status: 'failed', error: `Wallet object update failed (${response.status}).` };
    return { status: 'updated' };
  } catch (error: unknown) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Wallet object update failed.' };
  }
}
