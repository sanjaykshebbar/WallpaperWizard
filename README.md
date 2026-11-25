# AdBoard V3: Self-Hosted Kiosk Display Board

AdBoard V3 is a production-ready, self-hosted digital board slide platform designed for schools, corporate workspaces, hotels, retail outlets, and community centers. It enables administrators to manage visual advertisements, custom transition paces, and schedule periods, projecting them on immersive public display carousels.

> **🧡 A hobby project — private by design.** AdBoard is built for the joy of building and shared under the MIT License. It collects **no telemetry** — no analytics, no tracking, no phoning home — and everything it stores lives on infrastructure *you* control. Host it as you need, improve it as you need. See [PRIVACY.md](/PRIVACY.md) for the full usage & privacy policy, [THIRD-PARTY-NOTICES.txt](/THIRD-PARTY-NOTICES.txt) for dependency attribution, and [Documents/FOSS-REVIEW.md](/Documents/FOSS-REVIEW.md) for the open-source licensing review. All of this is also summarized in-app under **About AdBoard** in the admin sidebar.

---

## 🛠️ Technology Stack

*   **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide icons, Vite
*   **Backend Support**: Firebase Authentication, Google Firestore Database, Cloud Storage
*   **Host Compatibility**: Firebase Hosting, Static App Services, Cloud Run

---

## 📂 Professional Project Architecture

```txt
adboard-v3/
│
├── firebase-blueprint.json (Abstract state models schema intermediate representer)
├── firestore.rules         (Hardened client-side validation database rules)
├── storage.rules           (Sizing and MIME validation configuration storage rules)
├── security_spec.md        (Data invariant statements and synthetic penetration tests)
├── README.md               (Operational guide and developer documentations)
│
├── public/                 (Static vector icons and launcher graphics)
│
└── src/
    ├── App.tsx             (Central routing manager with permission gate guards)
    ├── index.css           (Main stylesheet importing webtography)
    ├── main.tsx            (React rendering entry block)
    ├── types.ts            (Global TypeScript contracts and interface entities)
    │
    ├── contexts/
    │   └── FirebaseContext.tsx (User auth states and database readiness providers)
    │
    ├── firebase/
    │   ├── config.ts       (SDK clients connection tester)
    │   └── errorHandler.ts (Diagnostic permission error logging interceptor)
    │
    ├── pages/
    │   ├── Setup.tsx       (First-run platform administrator wizard with console guide)
    │   ├── Login.tsx       (Administrative sign-in with session memory)
    │   ├── Admin.tsx       (Asset management control center, drag-and-drop form)
    │   └── DisplayBoard.tsx (Autoplay presenting kiosk with timing scheduler)
    │
    └── services/
        ├── firebaseService.ts (Firestore database CRUD adapters)
        └── mediaService.ts     (File footprint size and extension sanitizers)
```

---

## ⚡ First Run Installation & Setup Guide

Get started with the application locally in minutes:

### 1. Clone & Install Dependencies
```bash
git clone <repository_url> adboard-v3
cd adboard-v3
npm install
```

### 2. Configure Firebase Cloud Credentials
Create a project in the [Firebase Console](https://console.firebase.google.com/), then retrieve your Web configuration credentials block under Project Settings. Paste those coordinates in `firebase-applet-config.json` at the root folder:

```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "...firebaseapp.com",
  "projectId": "...",
  "storageBucket": "...appspot.com",
  "messagingSenderId": "...",
  "appId": "..."
}
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## ⚙️ Step-by-Step Google Firebase Console Enabler Guide

This self-hosted platform is designed to connect secure services directly from your Google Cloud client. Follow these paths to enable modules in your Firebase Console:

### 🔑 Enable Email/Password Auth Provider
1. Go to **Build > Authentication** inside the Firebase sidebar.
2. Click **Get Started** (if opening Auth for the first time).
3. Select the **Sign-in method** tab, then click **Add new provider**.
4. Choose **Email/Password**, toggle the **Enable** switch, and click **Save**.

### 🗄️ Prepare Firestore Database & Rules
1. Expand **Build > Firestore Database** in the console.
2. Click **Create database** and select your preferred Cloud region location.
3. Select **Start in production mode** and complete creation.
4. Open the **Rules** tab at the top of the Firestore panel.
5. Paste the contents of `firestore.rules` inside the code editor, and click **Publish**.

### 📁 Prepare Storage Bucket & Rules
1. Go to **Build > Storage**.
2. Click **Get Started**, choose **Start in production mode**, select your location region, and create the default bucket.
3. Click the **Rules** tab at the top of the Storage screen.
4. Replace the rule template with the contents of `storage.rules`, then click **Publish**.

---

## 🔒 Security Policy Guard Audits

AdBoard V3 implements a **Zero-Trust Attribute-Based Access Control (ABAC)** schema defined across our static files and policies:

1.  **Identity Verification**: All mutation queries (`create`, `update`, `delete`) must originate from verified authenticated accounts validated within `/users/{uid}` database rosters.
2.  **File Validation Bounds**: Upload formats are intercepted on the client side and also governed in `storage.rules`:
    *   **Images**: Strict `20MB` limit, extensions checked for `.jpeg, .png, .gif, .webp`.
    *   **Videos**: Strict `500MB` limit, extensions checked for `.mp4, .mov, .webm`.
3.  **Role Verification Invariant**: Users are restricted from modifying state values or adding secondary admins. Temporal attributes (`createdAt`, `updatedAt`) are matched to database server clocks (`request.time`) to prevent spoofing.

Detailed vulnerability payloads and penetration audits are available inside **`security_spec.md`**.

---

## 👥 Roles, Access Control & Auditing

AdBoard supports a small team with two roles, IP-based access restriction, and a full audit trail. These features are available on the **Supabase** and **self-hosted Docker** backends (the offline sandbox is single-user).

### Roles

*   **Superadmin** — the first account created by the setup wizard. Can do everything: manage advertisements, display settings, **create/remove other users**, configure **IP restrictions**, and view the **audit log**.
*   **Editor** — invited by the superadmin from **Manage Users**. Can add, update, and remove advertisements and adjust display settings, but **cannot** create users or change access restrictions.

### Display Viewers (per-device approval, naming & playtime)

Found under **Display Viewers** (superadmin only). Every screen showing your public display registers a device and heartbeats, so you see a **live count of connected screens** and, for each one, its **IP address, hostname, and a friendly browser/OS descriptor** with last-seen time. You can:

- **Block or approve each device individually.** Because this is per-device — not per-IP — blocking one screen does **not** affect other screens behind the same public IP (the office/NAT problem). A blocked screen stops showing content within seconds.
- **Name each screen** (e.g. "Lobby TV") with the pencil icon. On the **self-hosted** backend a real hostname is additionally resolved via reverse DNS where the network provides a PTR record; browsers cannot expose a machine hostname, so cloud deployments rely on the assigned name + browser descriptor.
- **Require approval for new screens** — hold new devices as *pending* until you approve them.

**Content playtime:** each media card in the gallery shows **how long that slide has actually been on screen and on how many displays** (e.g. "Aired 3h 24m on 2 screens"). Screens report elapsed time once a minute; on Supabase this is written through a `SECURITY DEFINER` function so a screen can accumulate time but never read or tamper with the totals. Deny/approval status is likewise served server-side so a screen cannot approve itself.

### IP-Based Access Restriction — Beta

Found under **Access Restrictions** (superadmin only). **Disabled by default.** When enabled, only devices whose IP matches the allowlist may open the dashboard (`/login`, `/setup`, `/admin`); the public display at `/` is never restricted. Supports exact IPv4/IPv6 addresses and IPv4 CIDR ranges (e.g. `192.168.1.0/24`), with a lock-out guard that refuses to enable unless your current IP is allowed.

> **Enforcement (why it's Beta):**
> - **Self-hosted Docker** — enforced **server-side** on every request. Fully effective; can allow individual devices by private LAN IP.
> - **Vercel** — enforced at the edge **only if** you deploy the included [`middleware.ts`](/middleware.ts) and set the Supabase env vars (see [SUPABASE.md](/SUPABASE.md)). Otherwise the in-browser check is best-effort (the page JS has already loaded before it runs).
> - **Cloud, no middleware** — deters casual access only; real protection remains sign-in + database RLS.

### Audit Log

Every administrative action — advertisement create/update/delete/upload, user creation and removal, display-settings changes, IP-policy updates, and sign-ins — is recorded with the actor and timestamp. View it under **Audit Log** (superadmin only). Entries are append-only.

### Feedback → GitHub issues

**Send Feedback** (admin sidebar) files a GitHub issue on the project repo. For a **public** repo it opens a pre-filled issue for one-click submit. For a **private** repo (this project), issues can only be created server-side, so set a `GITHUB_TOKEN` (Issues: write) on your deployment — the included `api/feedback.ts` Vercel function then files issues for any user, no GitHub account required. Full setup in **[SUPABASE.md](/SUPABASE.md) → In-app Feedback**.

### Database schema

These features add three tables (`adboard_users`, `adboard_security`, `adboard_audit_logs`) plus `adboard_viewers`. For a **fresh install**, the complete, ready-to-run SQL — tables, Row-Level Security policies, and the superadmin bootstrap — is in **[SUPABASE.md](/SUPABASE.md)**. An idempotent upgrade script for existing databases is included there too. The self-hosted Docker backend stores all of this in its local `data/db.json` automatically; no action needed.

---

## 🛠️ Operational Troubleshooting

### Problem: The page is stuck on "Synchronizing console" loader
*   **Diagnosis**: The program cannot communicate with Firebase endpoints or does not have local database registers initialized yet.
*   **Resolution**: Verify your network connectivity. If running in a preview sandbox where Firebase is unprovisioned, complete the setup wizard at `/setup` first to initialize your local cache registers.

### Problem: Image upload fails with validation alert
*   **Diagnosis**: File is either oversized or lacks appropriate formatting extensions.
*   **Resolution**: Verify that the selected file is less than 20MB for images or less than 500MB for videos. Ensure its extension name ends in standard formats (`.jpg, .png, .gif, .webp, .mp4, .mov, .webm`).

### Problem: "Quota Exceeded" or Permitted Write Blocked
*   **Diagnosis**: Firestore free daily Spark limits have been met, or rules have rejected the write attempt due to out-of-order scheduling inputs.
*   **Resolution**: Check active database and billing configurations. If scheduling, verify that your Start Airtime occurs chronologically before the Expiry Time.

---

---

## 🌐 One-Click Cloud Deployments & Standalone Handbooks

To assist with hosting this self-sustaining digital kiosk platform, we have synthesized three comprehensive, highly visual, step-by-step deployment handbooks designed to get your digital billboard display rotating in minutes:

*   🔥 **[Firebase Cloud Deploy Handbook (FIREBASE.md)](/FIREBASE.md)**: Establishes your live application on Firebase Hosting, linking authenticated routes and assets securely behind Cloud Storage bins, 100% free under the Spark tier.
*   ⚡ **[Vercel Serverless Deploy Handbook (VERCEL.md)](/VERCEL.md)**: Deploys your React frontend on Vercel's high-speed global Edge network using secure environment variable keyboxes to shield database coordinates.
*   🐳 **[Docker & Rancher Self-Hosting Handbook (DOCKER.md)](/DOCKER.md)**: Packages your application into an offline, zero-dependency, full-stack container running its own local Express API and asset uploads disk directory—perfect for LAN networks, standalone smart screens, home labs, or enterprise orchestrators like SUSE Rancher.
*   ⚡ **[Supabase Cloud Deploy Handbook (SUPABASE.md)](/SUPABASE.md)**: Deploys your standalone static app directly to Vercel connected directly to Supabase PostgreSQL, Storage, and Auth — 100% Firebase-free.

---

## 📄 License, Privacy & Open Source

This project is open source, released under the [MIT License](/LICENSE). You are free to use, modify, and distribute it — commercially or privately — provided the copyright notice is preserved.

- **[PRIVACY.md](/PRIVACY.md)** — usage & privacy policy: no telemetry, complete list of external connections, and what data your deployment stores (on your own backend).
- **[THIRD-PARTY-NOTICES.txt](/THIRD-PARTY-NOTICES.txt)** — attribution and license texts for all 190 shipped open-source packages.
- **[Documents/FOSS-REVIEW.md](/Documents/FOSS-REVIEW.md)** — full licensing & compliance review (verdict: 100% permissive tree, no copyleft, low risk). A formatted copy ships as [Documents/AdBoard-FOSS-Review.docx](/Documents/AdBoard-FOSS-Review.docx).

---

