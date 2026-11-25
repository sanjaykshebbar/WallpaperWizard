# ⚡ Standalone Vercel & Supabase Deploy Handbook (100% Firebase-Free)

Welcome to the **AdBoard V3 Standalone Deploy Handbook**! If you want to deploy a high-performance digital billboard platform to the web using **Vercel** for lightning-fast SPA hosting and **Supabase** for zero-cost, persistent PostgreSQL database storage, secure user authentication, and high-performance asset file storage—completely bypassing Google Firebase—this guide is for you.

With this setup, your billboard frontend connects directly to your own self-managed Supabase instance. This means:
- **0% Firebase dependency**: No Google accounts or complex SDK configs.
- **100% Serverless & Zero-Cost**: Runs perfectly under Vercel's free Hobby tier and Supabase's free tier.
- **Durable Persistence**: All display settings, scheduler configs, and administrator profiles are safely saved in a relational SQL database.
- **Global Synchronization**: Any update to the slides instantly updates all active screens or physical TV displays on the floor.

---

## 🏗️ Architecture Design

```
┌──────────────────────────────────────────────┐
│                    VERCEL                    │
│                                              │
│        React Single Page Application         │
│         (Vite Client served globally)        │
└──────────────────────┬───────────────────────┘
                       │
                       │ (Secure Client-to-DB Connection)
                       ▼
┌──────────────────────────────────────────────┐
│                   SUPABASE                   │
│                                              │
│   ┌──────────────┐ ┌────────────┐ ┌──────┐   │
│   │  PostgreSQL  │ │  Storage   │ │ Auth │   │
│   │  (Database)  │ │ (Bucket)   │ │Login │   │
│   └──────────────┘ └────────────┘ └──────┘   │
└──────────────────────────────────────────────┘
```

---

## ⚡ Step 1: Initialize Your Supabase Database

1. Create a free account at **[Supabase](https://supabase.com)**.
2. Click **New Project**, select an organization, name your project (e.g. `AdBoard-Kiosk`), set a secure database password, and choose your preferred server region.
3. Once the database finishes provisioning (~1 minute), click on the **SQL Editor** tab in the left sidebar.
4. Click **New Query**, paste the following schema SQL DDL script, and click **Run**:

```sql
-- 1. Configuration Table (tracks initial setup completion)
CREATE TABLE public.adboard_config (
    id integer PRIMARY KEY DEFAULT 1,
    setup_completed boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

-- 2. Display Config Settings Table
CREATE TABLE public.adboard_settings (
    id integer PRIMARY KEY DEFAULT 1,
    kiosk_mode boolean DEFAULT false,
    autoplay_seconds integer DEFAULT 8,
    transition_effect text DEFAULT 'fade'::text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

-- 3. Digital Slides & Advertisements Table
CREATE TABLE public.adboard_media (
    id text PRIMARY KEY,
    title text NOT NULL,
    url text NOT NULL,
    type text DEFAULT 'image'::text NOT NULL,
    mime_type text DEFAULT ''::text NOT NULL,
    file_name text DEFAULT ''::text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    duration numeric DEFAULT 8 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    scheduled_start timestamp with time zone,
    scheduled_end timestamp with time zone,
    owner_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row-Level Security (RLS) to safeguard records
ALTER TABLE public.adboard_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_media ENABLE ROW LEVEL SECURITY;

-- Setup Permissive Read / Authenticated Admin Write Policies
CREATE POLICY "Allow public read for config" ON public.adboard_config FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full-access for config" ON public.adboard_config FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow public read for settings" ON public.adboard_settings FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full-access for settings" ON public.adboard_settings FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow public read for media" ON public.adboard_media FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full-access for media" ON public.adboard_media FOR ALL TO authenticated USING (true);
```

---

## 📂 Step 2: Configure Supabase Storage Buckets

To store physical slide graphics and videos:

1. In your Supabase sidebar, select **Storage**.
2. Click the **New Bucket** button.
3. Name the bucket **`adboard-assets`**.
4. Make sure to toggle the bucket to **Public** (this allows the billboard screens to load slide assets directly).
5. Click **Save**.
6. Select your new `adboard-assets` bucket, navigate to **Policies**, and add an authorization rule:
   - Provide **Authenticated** users full capabilities (`INSERT`, `SELECT`, `UPDATE`, `DELETE`) so that only your logged-in administrators can upload files and delete obsolete assets.

---

## 🚀 Step 3: Deploy Frontend to Vercel

Since our React kiosk is packaged as a high-performance single-page app, it can be deployed directly to Vercel with zero friction:

### Option A: Import via the Vercel Dashboard (Recommended)
1. Push this codebase to your own private or public **GitHub**, **GitLab**, or **Bitbucket** repository.
2. Go to **[Vercel](https://vercel.com)**, click **Add New** -> **Project**.
3. Import your repository from the Git workspace list.
4. Set the **Framework Preset** to **`Vite`** (Vercel usually autodetects this).
5. Expand the **Environment Variables** panel and add your Supabase connection parameters (which can be found in your Supabase dashboard under **Project Settings > API**):

| Variable Name | Description / Value |
|---|---|
| **`VITE_SUPABASE_URL`** | Your Supabase Project API URL (e.g., `https://xxxxxx.supabase.co`) |
| **`VITE_SUPABASE_ANON_KEY`** | Your Supabase Project `anon` `public` API key |

6. Click **Deploy**! 🎉

### Option B: Deploy Using Vercel CLI
If you prefer terminal-driven deployment, run the following commands in the project root:
```bash
# Install CLI
npm install -g vercel

# Deploy
vercel
```
Follow the terminal instructions to link your project and add the two variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## 🧭 Step 4: Initial Setup Wizard

Once Vercel completes compiling and hosting your application:
1. Navigate to your newly assigned Vercel URL (e.g. `https://adboard-kiosk.vercel.app`).
2. You will be automatically routed to the **Initial Setup Wizard**.
3. Create your master administrative **Email** and **Password** (this registers your login credentials directly inside Supabase Auth and seeds your PostgreSQL tables).
4. After logging in, you can start design, uploading, scheduling, and displaying beautiful advertisements immediately!

---

## 🛠️ Operational FAQ & Custom Configurations

### 1. Handling Client-Side Routing (404 Page Refreshes)
When hosting single-page React apps on static hosters like Vercel, reloading pages like `/admin` or `/setup` directly can throw a `404 Not Found` error because the physical server doesn't contain a real file matching that path.
- **Fix Included**: This project includes a pre-configured **`vercel.json`** file at the root. It automatically overrides routing and forwards requests safely to `index.html` where React Router handles path resolution seamlessly.

### 2. File Upload Limits
By using Supabase Storage, the default max file size per file is set to **50MB** (which is more than enough for high-fidelity images). If you are uploading heavy, high-definition videos (up to 500MB), you can easily adjust this limit in your **Supabase Dashboard** under **Storage > Settings > Max File Size**.

---

*Enjoy a robust, highly scalable digital kiosk deployment hosted 100% on serverless, modern clouds!* ⚡
