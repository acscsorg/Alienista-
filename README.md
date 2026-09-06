# 🛸 Alienista — ACS Campus Attendance System

> The official attendance management, QR badge verification, and event tracking platform for the **Association of Computer Scientists (ACS)** at **Palawan State University (PSU)**.

---

## 📋 Table of Contents
- [About the Project](#-about-the-project)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Local Setup & Installation](#-local-setup--installation)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Set Up Supabase Database & Migrations](#4-set-up-supabase-database--migrations)
  - [5. Set Up Supabase Storage Bucket](#5-set-up-supabase-storage-bucket)
- [Running the Application](#-running-the-application)
- [Default Login Credentials](#-default-login-credentials)
- [Project Directory Structure](#-project-directory-structure)
- [Offline Mode & QR Scanning Notes](#-offline-mode--qr-scanning-notes)
- [Running Automated Tests](#-running-automated-tests)
- [Contributing Guidelines](#-contributing-guidelines)

---

## 📖 About the Project

**Alienista** replaces paper-based attendance sheets with an offline-first QR scanning and student verification system tailored for university organizations. It empowers officers to scan hundreds of student badges per minute with instant audio-visual feedback, even in areas with spotty or zero internet connectivity.

---

## ✨ Key Features

- ⚡ **Offline-First Scanner**: Real-time camera QR scanning with client-side deduplication, instant optimistic writes to IndexedDB, and automatic background sync when reconnected.
- 🖼️ **Student Face Verification & Offline Caching**: Automatic pre-caching of student photos in the browser Cache Storage API for 0ms visual verification during check-in.
- 🪪 **Digital Student Badges & QR Generator**: Option A ID badge layout with student photo, academic info, and high-resolution downloadable QR passes with UID.
- 🎨 **Canonical Badge Artwork**: The website renders the real Alienista SVG badge layout; the downloaded PNG is rasterized from that same artwork.
- 💳 **Google Wallet Passes**: Optional branded `Alienista` passes with refreshable student information and QR attendance compatibility.
- 🧪 **Reversible Wallet Design Test**: Admins can enable the Pass Builder-style Wallet layout organization-wide and revert to the legacy payload from System Settings.
- 🕒 **Time-Slotted Events**: Configurable attendance windows (e.g., Morning In/Out, Afternoon In/Out) with live countdown timers.
- 🔐 **Role-Based Portals**:
  - **Admin**: Full control over student rosters, bulk CSV import/export, term advancement, and organization settings.
  - **Officer**: High-speed camera scanner, manual UID override, and live sync monitoring.
  - **Student**: View personal attendance history and download individual QR badges.
- 🔄 **Student First-Login Security Flow**: Automatic surname default password with forced permanent password creation on first sign-in.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React 19) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/), Base UI, Lucide Icons, tw-animate-css |
| **Database & Backend** | [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Service Role Admin Client) |
| **Storage** | Supabase Storage (`student-avatars` bucket) |
| **QR Engine** | `html5-qrcode` & `qrcode` |
| **Offline Storage** | IndexedDB (`offlineDB`) & Browser Cache Storage API |
| **Validation** | [Zod](https://zod.dev/) |
| **Testing** | [Vitest](https://vitest.dev/) |

---

## 📦 Prerequisites

Before getting started, ensure you have the following installed on your local development machine:

1. **Node.js**: `v20.x` or later (LTS recommended) — [Download Node.js](https://nodejs.org/)
2. **npm**: `v10.x` or later (bundled with Node.js)
3. **Git**: [Download Git](https://git-scm.com/)
4. **Supabase Account**: A free Supabase project created at [supabase.com](https://supabase.com/)

---

## 🚀 Local Setup & Installation

Follow these steps carefully to run Alienista on your machine:

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/Alienista-.git
cd Alienista-
```

### 2. Install Dependencies

All application source code and scripts live inside the `app/` directory:

```bash
cd app
npm install
```

### 3. Configure Environment Variables

Create your local environment file by copying `.env.example`:

```bash
# While inside the app/ directory:
cp .env.example .env.local
```

Open `app/.env.local` in your editor and fill in your Supabase credentials:

```env
# -----------------------------------------------------------------------------
# Supabase Project Credentials
# Obtain from: https://supabase.com/dashboard > Project Settings > API
# -----------------------------------------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# -----------------------------------------------------------------------------
# Session Encryption Secret
# Generate a secure 32-byte hex string (see command below)
# -----------------------------------------------------------------------------
SESSION_SECRET=replace_with_a_32_byte_random_hex_string

# -----------------------------------------------------------------------------
# App Site URL
# -----------------------------------------------------------------------------
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional: stable public HTTPS Alienista logo for Google Wallet.
# If omitted, the student's public Supabase avatar is used as the small logo.
GOOGLE_WALLET_LOGO_URL=https://your-public-domain.example/icon-512.png
GOOGLE_WALLET_HERO_URL=https://your-public-domain.example/wallet-hero.png
```

> 💡 **Tip to generate `SESSION_SECRET`:**
> Run this in your terminal:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

### 4. Set Up Supabase Database & Migrations

In your Supabase project dashboard, open the **SQL Editor** (`https://supabase.com/dashboard/project/<your-ref>/sql`) and execute the migration files located in the `supabase/migrations/` folder in numerical order:

1. **`001_initial_schema.sql`** — Creates all enum types, tables (`organizations`, `profiles`, `students`, `officers`, `events`, `event_slots`, `attendance_logs`, `organization_settings`), triggers, and RLS policies.
2. **`002_event_slots.sql`** — Adds multi-slot support to event scheduling.
3. **`003_admin_credentials.sql`** — Adds direct admin credentials and sets default admin password hash (`admin123`).
4. **`004_permissions.sql`** — Grants necessary schema permissions to `anon`, `authenticated`, and `service_role`.

---

### 5. Set Up Supabase Storage Bucket

To allow student photo / avatar uploads:

1. Go to **Supabase Dashboard** > **Storage** > **Buckets**.
2. Click **New Bucket** and name it `student-avatars`.
3. Check the **Public bucket** toggle (so avatars can be loaded by badges and scanner without auth headers).
4. Set the maximum file size limit to **2MB**.
5. Save the bucket.

*(Note: The app will also automatically attempt to initialize this bucket if it doesn't already exist when an admin uploads a photo).*

---

## 💻 Running the Application

Make sure you are in the `app/` folder:

```bash
cd app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available npm Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server with Turbopack |
| `npm run build` | Builds the production bundle |
| `npm run start` | Runs the built production server locally |
| `npm test` | Runs the automated test suite using Vitest |
| `npx tsc --noEmit` | Runs the TypeScript compiler for type checking |
| `npm run lint` | Runs ESLint to check for code quality issues |

---

## 🔑 Default Login Credentials

After applying the SQL migrations, the system comes pre-configured with the following default credentials:

### 1. Admin Portal (`/login`)
- **Role**: `Admin`
- **Username**: `admin`
- **Password**: `admin123`
- *(Admin credentials can be changed in the Organization Settings page).*

### 2. Officer Portal (`/login`)
- **Role**: `Officer`
- **Access**: Sign in using an active officer profile or PIN configured in the Officers tab.

### 3. Student Portal (`/login`)
- **Role**: `Student`
- **Identifier**: Student Number (e.g., `2023-8-0044`)
- **Default Password**: The student's **LAST NAME in UPPERCASE** (e.g., `MAGNETICO`).
- **First-time Login**: When a student logs in with their default password for the first time, the system will prompt them to set a permanent, secure password (minimum 6 characters) before redirecting to `/my-qr`.

---

## 📁 Project Directory Structure

```text
Alienista-/
├── README.md                           # Documentation for setup and development
├── supabase/
│   └── migrations/                     # SQL migration scripts (run in order)
│       ├── 001_initial_schema.sql
│       ├── 002_event_slots.sql
│       ├── 003_admin_credentials.sql
│       └── 004_permissions.sql
└── app/
    ├── package.json
    ├── .env.example                    # Template for environment variables
    ├── .env.local                      # Local secrets (git-ignored)
    ├── src/
    │   ├── app/
    │   │   ├── (auth)/login/           # Unified role-based login portal
    │   │   ├── (dashboard)/            # Admin/Officer protected routes
    │   │   │   ├── events/             # Event scheduling & slot windows
    │   │   │   ├── scanner/            # Camera QR scanner & live attendance
    │   │   │   ├── students/           # Student management, photos, CSV import/export
    │   │   │   ├── statistics/         # Visual analytics & attendance reporting
    │   │   │   └── settings/           # Org settings & academic year rollover
    │   │   └── (student)/              # Student protected routes
    │   │       ├── my-qr/              # Student digital badge & QR download
    │   │       └── my-attendance/      # Personal attendance records
    │   ├── components/
    │   │   ├── badges/                 # BadgeCard component (Option A ID layout)
    │   │   ├── scanner/                # QrScannerComponent (html5-qrcode), audio feedback
    │   │   └── ui/                     # Reusable UI component library
    │   ├── hooks/
    │   │   └── use-auto-sync.ts        # Background sync hook for offline scans
    │   └── lib/
    │       ├── actions/                # Next.js Server Actions (auth, attendance, students)
    │       ├── image-compression.ts    # Client-side 500x500 WebP photo optimizer
    │       ├── offline-db.ts           # IndexedDB offline engine & avatar cache
    │       ├── session.ts              # HMAC-signed session cookie management
    │       ├── supabase/               # Supabase browser and admin service clients
    │       └── validations/            # Zod validation schemas
    └── tests/
        └── unit/                       # Unit tests (dedup, validations, slots, auth)
```

---

## 📡 Offline Mode & QR Scanning Notes

1. **Camera Permissions**: When opening the `/scanner` page, your browser will request camera access. Ensure you grant permission.
2. **Multi-Camera Toggle**: The scanner includes a quick switch button (`SwitchCamera`) to swap between rear and front-facing cameras.
3. **Offline Attendance Flow**:
   - If an officer loses internet connection during an event, scans are **instantly written to the device's IndexedDB** (`pending_scans`).
   - Student faces and details will continue to load instantly thanks to the **Cache Storage API pre-caching**.
   - When connection returns, the sync banner will show `Sync X Offline Scans` and automatically flush queued records to Supabase.

Alienista currently runs production attendance through QR only. The Web NFC/NDEF reader hook is retained as commented future preparation, but it is not mounted in the scanner. Phone-to-phone NFC/HCE will require a native Android implementation and is intentionally outside the web/PWA scanner. Google Wallet design selection is organization-wide and admin-only; use **Revert** in System Settings if the Pass Builder experiment causes a provisioning issue.

---

## 🧪 Running Automated Tests

Alienista uses **Vitest** for unit testing core business logic (session encryption, attendance slot windows, QR deduplication, and Zod schemas).

To run all tests:

```bash
cd app
npm test
```

To run continuous test watching during development:

```bash
cd app
npx vitest
```

---

## 🤝 Contributing Guidelines

1. **Create a Feature Branch**: Always create a descriptive branch (e.g., `git checkout -b feat/slot-scheduler`).
2. **Follow Type Safety**: Run `npx tsc --noEmit` before committing to ensure there are zero TypeScript compilation errors.
3. **Verify Tests**: Run `npm test` and ensure all unit tests pass.
4. **Environment Variables**: Never commit `.env.local` or service role keys to Git. Update `.env.example` if you introduce any new configuration keys.

---

## 🛡️ License

Built with ❤️ for the **Association of Computer Scientists (ACS)** — Palawan State University.
