# Feasibility Study: Google Wallet Student Badge Integration

> [!NOTE]
> **Summary & Verdict:** Integrating Google Wallet passes into Alienista is **100% technically feasible** with one organization-settings migration and **no breaking changes** to existing attendance, scanning, or badge generation flows.

---

## 1. Executive Summary & Architectural Overview

The Alienista codebase already contains all data primitives needed to issue Google Wallet passes. Adding this feature requires no new PostgreSQL columns or tables, no ORM modifications, and no new npm dependencies.

```mermaid
flowchart TD
    subgraph Alienista Web App
        Student[Student in /my-qr]
        BadgeCard[BadgeCard Component]
        ServerAction[Next.js Server Action / Helper]
        Scanner[Attendance Scanner /scanner]
    end

    subgraph Supabase Database
        DB[(students table)]
    end

    subgraph Google Infrastructure
        WalletAPI[Google Wallet Save URL / Signed JWT]
        GWallet[Google Wallet App on Phone]
    end

    Student -->|Visits /my-qr| BadgeCard
    BadgeCard -->|Renders PNG & Canvas| Student
    BadgeCard -->|Click 'Save to Wallet'| ServerAction
    ServerAction -->|Reads existing student fields| DB
    ServerAction -->|Generates Signed RS256 JWT| WalletAPI
    WalletAPI -->|Saves Pass| GWallet
    GWallet -->|Displays Pass QR student.uid| Scanner
    Scanner -->|recordScanAction unchanged| DB
```

---

## 2. Why the Wallet Object Is Stateless

### A. Deterministic Object IDs (No Database Tracking Column)
Google Wallet identifies pass instances using:
```
{ISSUER_ID}.{UNIQUE_OBJECT_SUFFIX}
```
Because each student record already has a permanent UUID primary key (`student.id`), the pass ID is a pure, deterministic function:
```typescript
const passId = `${process.env.GOOGLE_WALLET_ISSUER_ID}.${student.id}`;
```
There is no need to store a `google_wallet_pass_id` column in PostgreSQL.

### B. All Badge Data Already Exists on `students`
Comparing Google Wallet's `GenericObject` schema requirements against Alienista's `Student` interface:

| Google Wallet Pass Field | Alienista `Student` Model Column | Status |
| :--- | :--- | :--- |
| **Barcode Value** | `student.uid` | Already present |
| **Barcode Format** | `QR_CODE` | Matches existing scanner format |
| **Header (Card Title)** | `student.full_name` | Already present |
| **Subheader** | `${student.course} - ${student.year}` | Already present |
| **Student Number** | `student.student_number` | Already present |
| **Section Label** | `student.section` | Already present |
| **Membership Status** | `student.status` | Already present |
| **Photo / Avatar** | `student.avatar_url` (Supabase Storage) | Already present |

### C. Stateless Client-Side Provisioning via Signed JWT
Google Wallet allows creating and provisioning passes via signed JWT links:
```
https://pay.google.com/gp/v/save/{signed-jwt}
```
* The Next.js server constructs the pass definition in-memory and signs it with the Google Cloud Service Account private key.
* Google Cloud credentials live securely in `.env.local`:
  * `GOOGLE_WALLET_ISSUER_ID`
  * `GOOGLE_WALLET_CLASS_ID`
  * `GOOGLE_WALLET_CLIENT_EMAIL`
  * `GOOGLE_WALLET_PRIVATE_KEY`
  * `GOOGLE_WALLET_APP_URL` (recommended): public HTTPS origin included in the Save JWT; do not use `localhost` for deployed provisioning.
  * Supabase PostgreSQL stores the organization-level design choice in `google_wallet_design`; the pass object itself remains stateless and uses the deterministic student ID.

### Google Generic Pass Builder references

The implementation follows Google's Generic Pass Builder and REST schema:

* [Generic Pass Builder](https://developers.google.com/wallet/generic/resources/pass-builder) - field-by-field pass composition and preview.
* [Generic pass overview](https://developers.google.com/wallet/generic) - JWT issuance and lifecycle.
* [GenericObject REST schema](https://developers.google.com/wallet/reference/rest/v1/genericobject) - supported fields such as `cardTitle`, `header`, `subheader`, `logo`, `barcode`, `textModulesData`, and `heroImage`.
* [GenericObject PATCH method](https://developers.google.com/wallet/reference/rest/v1/genericobject/patch) - updates an existing object with patch semantics.

The Alienista payload mirrors the reference layout: `cardTitle` is `Alienista`, `header` is the student's name, `subheader` is `Student Member`, the green background is the Alienista brand color, the QR barcode remains `student.uid`, and program/ID/section/status are text modules. Because PATCH preserves omitted fields, the payload sends `imageModulesData: []` to remove an older photo module when switching designs.

Wallet-hosted images must be reachable over public HTTPS. Set `GOOGLE_WALLET_LOGO_URL` to a stable public Alienista logo for the production card; until then the student's versioned Supabase avatar is used as the small logo so PFP changes invalidate the image URL. Set `GOOGLE_WALLET_HERO_URL` to a stable public HTTPS Alienista banner; invalid or local URLs are ignored rather than sent to Google.

---

## 3. Preservation of Existing Functionality

> [!IMPORTANT]
> **Attendance Scanner Compatibility:**
> The QR code rendered on the Google Wallet pass encodes the exact same payload as the canvas badge: `student.uid`.
> When an officer points the scanner camera at a student's Google Wallet pass, `recordScanAction()` decodes `student.uid` identically.

* **Badge artwork:** `app/src/lib/badges/artwork.ts` is the canonical SVG source used by both the on-page badge and PNG export.
* **Wallet refresh:** Existing generic objects can be patched through the Google Wallet REST API; profile and avatar updates trigger a best-effort patch using the deterministic object ID. The student badge page refreshes the object before opening a newly issued Save URL, so an already-saved test pass must be opened from that button once after deployment.
* **Wallet design experiment:** `organization_settings.google_wallet_design` is admin-controlled and organization-wide. `builder` is the default Pass Builder-style payload; `legacy` is the one-click rollback variant exposed in System Settings.
* **Attendance Scanner:** `app/src/app/(dashboard)/scanner/scanner-view.tsx` and `app/src/lib/actions/attendance.ts` require 0 changes.
* **Offline Attendance & Sync:** Google Wallet stores passes locally on Android, WearOS, and iOS devices. If a student is offline, their Google Wallet pass still displays the QR code. If the officer is offline, Alienista's IndexedDB engine queues the scan as normal.
* **Admin Tools:** `app/src/app/(dashboard)/qr-generator/page.tsx` continues to function for batch generation and physical badges.

---

## 4. Minimalist Implementation Architecture (Ponytail Ladder)

Following the principle of avoiding speculative abstractions and unnecessary dependencies:

### A. Zero Dependencies via `node:crypto`
Node.js 20+ includes built-in RS256 signing support. No need to install `google-auth-library` or `jsonwebtoken`:

```typescript
// app/src/lib/badges/google-wallet.ts
import crypto from 'node:crypto';
import type { Student } from '@/lib/types/models';

function base64UrlEncode(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function generateGoogleWalletSaveUrl(student: Student): string {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID!;
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL!;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(/\\n/g, '\n');

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    aud: 'google',
    origins: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],
    typ: 'savetowallet',
    payload: {
      genericObjects: [
        {
          id: `${issuerId}.${student.id}`,
          classId: `${issuerId}.${classId}`,
          cardTitle: { defaultValue: { language: 'en-US', value: 'Alienista' } },
          header: { defaultValue: { language: 'en-US', value: student.full_name } },
          subheader: { defaultValue: { language: 'en-US', value: 'Student Member' } },
          hexBackgroundColor: '#2D6A4F',
          heroImage: {
            sourceUri: { uri: process.env.GOOGLE_WALLET_HERO_URL! },
            contentDescription: { defaultValue: { language: 'en-US', value: 'Alienista student membership banner' } },
          },
          imageModulesData: [],
          barcode: {
            type: 'QR_CODE',
            value: student.uid,
            alternateText: student.uid,
          },
          textModulesData: [
            { id: 'program', header: 'PROGRAM', body: `${student.course} - ${student.year}` },
            { id: 'student_number', header: 'STUDENT NO.', body: student.student_number },
            { id: 'section', header: 'SECTION', body: student.section },
            { id: 'status', header: 'STATUS', body: student.status },
          ],
        },
      ],
    },
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = base64UrlEncode(signer.sign(privateKey));

  const jwt = `${signInput}.${signature}`;
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
```

### B. UI Integration
On `app/src/app/(student)/my-qr/page.tsx` or `app/src/components/badges/badge-card.tsx`, add the official "Save to Google Wallet" button:

```tsx
<a
  href={walletSaveUrl}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center justify-center transition-opacity hover:opacity-90"
>
  <img
    src="https://developers.google.com/static/wallet/retail/images/en-us/wallet-button.png"
    alt="Save to Google Wallet"
    className="h-10"
  />
</a>
```

---

## 5. Prerequisites & Dual-Provider Setup (Test vs. Production)

To safely test during development and maintain a clean separation from staging/production, configure two distinct Google Cloud and Google Pay & Wallet console providers:

```mermaid
flowchart LR
    subgraph Test Provider [Test / Dev: lesleyvancepaxley@gmail.com]
        TestGCP[GCP Project: Wallet API Enabled] --> TestSA[Dev Service Account Key]
        TestGCP --> TestIssuer[Test Issuer ID: Demo Mode]
        TestIssuer --> TestUsers[Allowlisted Dev Accounts Only]
    end

    subgraph Prod Provider [Prod / Staging: alienistation@gmail.com]
        ProdGCP[GCP Project: Wallet API Enabled] --> ProdSA[Prod Service Account Key]
        ProdGCP --> ProdIssuer[Prod Issuer ID: Production Mode]
        ProdIssuer --> AllStudents[Any Student Google Account]
    end
```

### A. Test Provider: `lesleyvancepaxley@gmail.com` (Local Dev & Sandbox)
1. **Google Cloud Console:**
   * Sign in to [Google Cloud Console](https://console.cloud.google.com/) with `lesleyvancepaxley@gmail.com`.
   * Create a project (e.g., `alienista-wallet-test`).
   * Enable the **Google Wallet API**.
   * Navigate to **IAM & Admin > Service Accounts** and create a service account (e.g. `wallet-dev@alienista-wallet-test.iam.gserviceaccount.com`).
   * Create and download a private key in JSON format (copy `client_email` and `private_key` to `.env.local`).
2. **Google Pay & Wallet Console:**
   * **Issuer Account:** Your Test Issuer ID is `3388000000023183187`.
   * **Authorize Service Account (Crucial):** Under **Google Wallet API > Users / Service Accounts**, invite your GCP Service Account (e.g. `wallet-dev@...iam.gserviceaccount.com`) as **Developer** or **Admin**. (Without this, JWT pass signing triggers a 403 authorization error).
   * **Create Generic Class Form Guide (`/generic/create`):**
     At `https://pay.google.com/business/console/passes/BCR2DN6DVLZMZF25/issuer/3388000000023183187/generic/create`, fill in the fields as follows:
     | Form Field | Exact Value to Enter | Notes / Rationale |
     | :--- | :--- | :--- |
     | **Class ID** | `student_badge_dev` | Console prefixes with `3388000000023183187.` |
     | **Card Title** | `Alienista` | Displayed at top of card in Wallet |
     | **Issuer Name** | `Alienista` | Organization brand name |
     | **Hex Background Color** | `#1B4332` | Matches `BADGE_SPEC.colors.brand` |
     | **Logo Image** | Upload logo (square, min 660x660) | Or link to public Supabase bucket |
     | **Barcode Format** | `QR code` | Center QR code containing `student.uid` |
   * **Add to Demo Allowlist:** Under **Test accounts**, add `lesleyvancepaxley@gmail.com`, `lawsmagnet6@gmail.com` (Netorare), and tester devices.

### B. Prod / Staging Provider: `alienistation@gmail.com` (Official Deployment)
1. **Google Cloud Console:**
   * Sign in to Google Cloud Console with `alienistation@gmail.com`.
   * Create the official production project (e.g., `alienista-official-prod`).
   * Enable the **Google Wallet API**.
   * Create a production service account (e.g. `wallet-prod@alienista-official-prod.iam.gserviceaccount.com`) and export the private key.
2. **Google Pay & Wallet Console:**
   * Sign in with `alienistation@gmail.com`.
   * Create the production **Issuer Account** to receive your **Production Issuer ID**.
   * Define the production class ID (e.g. `student_badge_prod`).
   * Navigate to **Publishing Access** and submit a request for **Production Access**. Describe Alienista as a student organization management and badge verification platform. Once approved (usually within 1–3 business days), passes can be saved by *any* student's Google account without allowlisting.

### C. Seamless Environment Configuration
Because credentials and identifiers are never hardcoded, switching between `lesleyvancepaxley@gmail.com` and `alienistation@gmail.com` is 100% environment-driven:

```bash
# ==============================================================================
# LOCAL DEV (.env.local) — Test Provider: lesleyvancepaxley@gmail.com
# ==============================================================================
GOOGLE_WALLET_ISSUER_ID="3388000000023183187"
GOOGLE_WALLET_CLASS_ID="student_badge_dev"
GOOGLE_WALLET_CLIENT_EMAIL="wallet-dev@alienista-wallet-test.iam.gserviceaccount.com"
GOOGLE_WALLET_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----"

# ==============================================================================
# STAGING / PRODUCTION (Hosting Provider / Vercel) — Prod: alienistation@gmail.com
# ==============================================================================
GOOGLE_WALLET_ISSUER_ID="3388000000098765432"
GOOGLE_WALLET_CLASS_ID="student_badge_prod"
GOOGLE_WALLET_CLIENT_EMAIL="wallet-prod@alienista-official-prod.iam.gserviceaccount.com"
GOOGLE_WALLET_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1...\n-----END RSA PRIVATE KEY-----"
```

---

## 6. Conclusion & Recommendation
* **Feasibility:** High / Effortless.
* **Database Risk:** 0 (Zero migrations).
* **System Impact:** Completely isolated; purely additive.
* **Recommendation:** When ready to implement, use the zero-dependency `node:crypto` approach with a server action to keep the codebase lean and fast.
