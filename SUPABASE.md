# ⚡ Standalone Vercel & Supabase Hosting Guide (100% Firebase-Free)

Welcome! If you want to deploy **AdBoard V3** to **Vercel** and use **Supabase** for fully persistent database storage, authentication, and file storage—completely bypassing Google Firebase—this guide is for you.

With this setup, the frontend SPA will connect directly to your own Supabase cloud server, giving you zero cloud-run costs and instant responsiveness.

---

## 🏗️ Step 1: Set Up Your Supabase Database

1. Create a free account on **[Supabase](https://supabase.com)** and create a new project (e.g., `AdBoard`).
2. Open your Supabase Dashboard, navigate to the **SQL Editor**, and run the following DDL script to create the required tables:

> **Fresh install:** run this entire script once in the SQL Editor. It creates
> every table AdBoard needs — configuration, display settings, media, **users,
> IP access policy, and the audit log** — with Row-Level Security wired up. If
> you are upgrading an older database, see *Upgrading an existing database* below.

```sql
-- ============================================================
-- AdBoard — complete fresh-install schema
-- ============================================================

-- 1. Configuration Table (tracks setup state)
CREATE TABLE public.adboard_config (
    id integer PRIMARY KEY DEFAULT 1,
    setup_completed boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

-- 2. Display Settings Table (includes the customizable default slide)
CREATE TABLE public.adboard_settings (
    id integer PRIMARY KEY DEFAULT 1,
    kiosk_mode boolean DEFAULT false,
    autoplay_seconds integer DEFAULT 8,
    transition_effect text DEFAULT 'fade'::text,
    fallback_url text,
    fallback_type text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

-- 3. Digital Billboard Slides Table
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

-- 4. Dashboard Users (roles: 'superadmin' or 'editor')
--    The first account to sign in becomes the superadmin automatically.
CREATE TABLE public.adboard_users (
    user_id text PRIMARY KEY,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'editor',
    tutorial_seen boolean NOT NULL DEFAULT false,
    created_by text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Access Policy (single row; every restriction is OFF by default)
CREATE TABLE public.adboard_security (
    id integer PRIMARY KEY DEFAULT 1,
    ip_restriction_enabled boolean NOT NULL DEFAULT false,
    allowed_ips jsonb NOT NULL DEFAULT '[]'::jsonb,
    viewer_approval_required boolean NOT NULL DEFAULT false,
    updated_by text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

-- 6. Immutable Audit Log
CREATE TABLE public.adboard_audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id text,
    actor_email text,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    details text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Viewer Devices (public display screens showing content)
CREATE TABLE public.adboard_viewers (
    device_id text PRIMARY KEY,
    label text,
    hostname text,
    ip text,
    user_agent text,
    status text NOT NULL DEFAULT 'approved',   -- pending | approved | denied
    first_seen timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Playtime (accumulated on-screen seconds per media item per device)
CREATE TABLE public.adboard_playtime (
    media_id text NOT NULL,
    device_id text NOT NULL,
    seconds numeric NOT NULL DEFAULT 0,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (media_id, device_id)
);

-- ============================================================
-- Helper: is the current user the superadmin?
-- SECURITY DEFINER lets the policy check the users table safely.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.adboard_users
    WHERE user_id = auth.uid()::text AND role = 'superadmin'
  );
$$;

-- ============================================================
-- Viewer heartbeat: a display screen registers/refreshes and learns its
-- approval status WITHOUT being able to set that status itself (that would
-- defeat "deny"). SECURITY DEFINER runs it with elevated rights; anon only
-- gets EXECUTE, never direct write access to the table.
-- ============================================================
CREATE OR REPLACE FUNCTION public.viewer_heartbeat(p_device_id text, p_user_agent text, p_ip text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_status text; v_required boolean;
BEGIN
  SELECT status INTO v_status FROM public.adboard_viewers WHERE device_id = p_device_id;
  IF v_status IS NULL THEN
    SELECT viewer_approval_required INTO v_required FROM public.adboard_security WHERE id = 1;
    v_status := CASE WHEN COALESCE(v_required, false) THEN 'pending' ELSE 'approved' END;
    INSERT INTO public.adboard_viewers (device_id, ip, user_agent, status, first_seen, last_seen)
      VALUES (p_device_id, p_ip, left(coalesce(p_user_agent,''),300), v_status, now(), now());
  ELSE
    UPDATE public.adboard_viewers
      SET ip = p_ip, user_agent = left(coalesce(p_user_agent,''),300), last_seen = now()
      WHERE device_id = p_device_id;
  END IF;
  RETURN v_status;
END;
$$;
GRANT EXECUTE ON FUNCTION public.viewer_heartbeat(text, text, text) TO anon, authenticated;

-- ============================================================
-- Playtime logging: a display screen adds seconds for the slides it showed.
-- SECURITY DEFINER so anon can accumulate time but cannot read or alter the
-- table directly. Only registered devices (present in adboard_viewers) count.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_playtime(p_device_id text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE e jsonb; v_media text; v_secs numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.adboard_viewers WHERE device_id = p_device_id) THEN
    RETURN;  -- ignore unknown devices
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) LOOP
    v_media := e->>'media_id';
    v_secs := least(greatest(coalesce((e->>'seconds')::numeric, 0), 0), 600); -- cap 10 min/flush
    IF v_media ~ '^[a-zA-Z0-9_-]{1,128}$' AND v_secs > 0 THEN
      INSERT INTO public.adboard_playtime (media_id, device_id, seconds, updated_at)
        VALUES (v_media, p_device_id, v_secs, now())
      ON CONFLICT (media_id, device_id)
        DO UPDATE SET seconds = public.adboard_playtime.seconds + v_secs, updated_at = now();
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_playtime(text, jsonb) TO anon, authenticated;

-- ============================================================
-- Enable Row-Level Security
-- ============================================================
ALTER TABLE public.adboard_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_media       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_security    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_audit_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_viewers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adboard_playtime    ENABLE ROW LEVEL SECURITY;

-- Policies are dropped-then-created so this whole block is safe to re-run if a
-- previous attempt half-applied (a common cause of "RLS is on but I can't save").
DROP POLICY IF EXISTS "config read"    ON public.adboard_config;
DROP POLICY IF EXISTS "config write"   ON public.adboard_config;
DROP POLICY IF EXISTS "settings read"  ON public.adboard_settings;
DROP POLICY IF EXISTS "settings write" ON public.adboard_settings;
DROP POLICY IF EXISTS "media read"     ON public.adboard_media;
DROP POLICY IF EXISTS "media write"    ON public.adboard_media;
DROP POLICY IF EXISTS "users read"     ON public.adboard_users;
DROP POLICY IF EXISTS "users insert"   ON public.adboard_users;
DROP POLICY IF EXISTS "users update"   ON public.adboard_users;
DROP POLICY IF EXISTS "users delete"   ON public.adboard_users;
DROP POLICY IF EXISTS "security read"  ON public.adboard_security;
DROP POLICY IF EXISTS "security write" ON public.adboard_security;
DROP POLICY IF EXISTS "audit insert"   ON public.adboard_audit_logs;
DROP POLICY IF EXISTS "audit read"     ON public.adboard_audit_logs;
DROP POLICY IF EXISTS "viewers read"   ON public.adboard_viewers;
DROP POLICY IF EXISTS "viewers manage" ON public.adboard_viewers;
DROP POLICY IF EXISTS "playtime read"  ON public.adboard_playtime;

-- Config: public read, authenticated write
CREATE POLICY "config read"  ON public.adboard_config  FOR SELECT USING (true);
CREATE POLICY "config write" ON public.adboard_config  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Settings: public read (the kiosk needs it), authenticated write
CREATE POLICY "settings read"  ON public.adboard_settings FOR SELECT USING (true);
CREATE POLICY "settings write" ON public.adboard_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Media: public read (the kiosk needs it), authenticated full access (editors included)
CREATE POLICY "media read"  ON public.adboard_media FOR SELECT USING (true);
CREATE POLICY "media write" ON public.adboard_media FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Users: any signed-in admin may read the roster (needed for the first-run
-- superadmin bootstrap). You may insert your OWN row (bootstrap) and the
-- superadmin may insert/delete anyone. Everyone may update their own row
-- (e.g. tutorial_seen); the superadmin may update anyone.
CREATE POLICY "users read"   ON public.adboard_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert" ON public.adboard_users FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid()::text OR public.is_superadmin());
CREATE POLICY "users update" ON public.adboard_users FOR UPDATE TO authenticated
    USING (user_id = auth.uid()::text OR public.is_superadmin());
CREATE POLICY "users delete" ON public.adboard_users FOR DELETE TO authenticated
    USING (public.is_superadmin());

-- Security policy: PUBLIC read (the pre-login browser gate and the Vercel edge
-- middleware must read it while unauthenticated); only the superadmin may change it.
CREATE POLICY "security read"  ON public.adboard_security FOR SELECT USING (true);
CREATE POLICY "security write" ON public.adboard_security FOR ALL TO authenticated
    USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Audit log: any admin may append; only the superadmin may read. No update/delete
-- policies exist, so rows are effectively immutable.
CREATE POLICY "audit insert" ON public.adboard_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "audit read"   ON public.adboard_audit_logs FOR SELECT TO authenticated USING (public.is_superadmin());

-- Viewers: admins read the list; only the superadmin changes a device's status.
-- (New devices register via the viewer_heartbeat() function above, not direct writes.)
CREATE POLICY "viewers read"   ON public.adboard_viewers FOR SELECT TO authenticated USING (true);
CREATE POLICY "viewers manage" ON public.adboard_viewers FOR UPDATE TO authenticated
    USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Playtime: admins read the totals; screens add time only via log_playtime().
CREATE POLICY "playtime read" ON public.adboard_playtime FOR SELECT TO authenticated USING (true);

-- Seed the single-row tables
INSERT INTO public.adboard_security (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

### Upgrading an existing database

The simplest, safest path is to **re-run the entire fresh-install script above** —
every table uses `CREATE TABLE` (skip ones you already have) and every policy is
`DROP ... IF EXISTS` then `CREATE`, so it reconciles a half-applied schema. If you
prefer a minimal delta, run just what's new:

```sql
-- Default-slide + viewer-approval columns
ALTER TABLE public.adboard_settings ADD COLUMN IF NOT EXISTS fallback_url text;
ALTER TABLE public.adboard_settings ADD COLUMN IF NOT EXISTS fallback_type text;
ALTER TABLE public.adboard_security ADD COLUMN IF NOT EXISTS viewer_approval_required boolean NOT NULL DEFAULT false;

-- Viewer registry table (+ hostname column for reverse-DNS on self-hosted)
CREATE TABLE IF NOT EXISTS public.adboard_viewers (
    device_id text PRIMARY KEY, label text, hostname text, ip text, user_agent text,
    status text NOT NULL DEFAULT 'approved',
    first_seen timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.adboard_viewers ADD COLUMN IF NOT EXISTS hostname text;
ALTER TABLE public.adboard_viewers ENABLE ROW LEVEL SECURITY;

-- Playtime table (accumulated on-screen seconds per media item per device)
CREATE TABLE IF NOT EXISTS public.adboard_playtime (
    media_id text NOT NULL, device_id text NOT NULL,
    seconds numeric NOT NULL DEFAULT 0,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (media_id, device_id)
);
ALTER TABLE public.adboard_playtime ENABLE ROW LEVEL SECURITY;
```

Then **re-run the fresh-install block's** `is_superadmin()` function, the
`viewer_heartbeat()` and `log_playtime()` functions + their GRANTs, and the full
`DROP POLICY ... / CREATE POLICY ...` section (it now makes `adboard_security`
**publicly readable**, which the IP gate and Vercel middleware require, and adds
the `playtime read` policy). Finally:

```sql
INSERT INTO public.adboard_security (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- IMPORTANT: mark your admin account as the superadmin, otherwise no one can
-- manage users, viewers, or access restrictions. This makes the FIRST-created
-- auth user the superadmin (or replace with your specific email):
INSERT INTO public.adboard_users (user_id, email, role)
SELECT id, email, 'superadmin' FROM auth.users ORDER BY created_at ASC LIMIT 1
ON CONFLICT (user_id) DO UPDATE SET role = 'superadmin';
```

### Troubleshooting: "RLS is enabled but I can't save anything"

This almost always means the **policies were not fully applied** (a statement
earlier in the script errored, so later `CREATE POLICY` lines never ran), or your
account has **no superadmin row**. Fix both by re-running the whole fresh-install
policy block (it's idempotent) and the superadmin `INSERT` above. Also confirm your
Supabase account's email is **confirmed** (Auth → Users) — an unconfirmed account
has no authenticated session, so every write is rejected by RLS.

### Two-factor authentication (optional)

AdBoard supports TOTP authenticator apps through Supabase's built-in MFA. It works out of the box on the free tier; admins can enroll from **Account & Security** in the dashboard. Important: the admin's email must be **confirmed** (or the *Confirm email* switch disabled under **Auth → Providers → Email**) before sign-in and dashboard writes will work — the app no longer allows unconfirmed sessions.

### IP access restriction on Vercel (Beta)

The in-app IP restriction can only *react* in the browser on static hosting — the page has already loaded by then. For **real** blocking on Vercel, the repo ships a `middleware.ts` that runs at the edge before the app is served:

1. Deploy the project to Vercel (the `middleware.ts` at the repo root is picked up automatically).
2. In the Vercel project settings, set env vars **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** (the same values as your build).
3. Enable IP restriction and add your allowed IPs/CIDRs under **Access Restrictions** in the dashboard.

The middleware reads the allowlist from the public `adboard_security` row and returns **403** for disallowed IPs on `/admin`, `/login`, `/setup`. The public display at `/` is never blocked. It **fails open** (allows through) if it can't read the config, so a misconfiguration never bricks your dashboard.

> **Office / individual-device note:** devices behind one office router share a single public IP, so IP rules can't single out one device. For per-device control, use **Display Viewers → approve/deny**, or self-host on the LAN where each device's private IP is visible.

### In-app Feedback → GitHub issues

The **Send Feedback** form files a GitHub issue on your repository.

- **Public repo:** works with no setup — the form opens a pre-filled "New issue" page for the submitter to post (they need a GitHub account).
- **Private repo (this project):** GitHub does **not** let non-collaborators (or anyone in an incognito session) open issues, so the pre-fill page would 404. Feedback must be filed **server-side** with a token. Set it up once:
  1. Create a **fine-grained Personal Access Token** with **Issues: Read and write** scoped to this repository.
  2. In your Vercel project → **Settings → Environment Variables**, add:
     - `GITHUB_TOKEN` = the token
     - `GITHUB_REPO` = `owner/repo` (e.g. `sanjaykshebbar/Adboard_v4`)
  3. Redeploy. The included `api/feedback.ts` function now creates issues for **any** user — no GitHub account required on their side. The token never reaches the browser.

  Also set the build-time flag `VITE_GITHUB_REPO_PRIVATE="true"` (default) so the app never opens a broken pre-fill page; if the token isn't configured it shows a clear "ask the administrator" message instead. On the self-hosted Docker backend, set the same `GITHUB_TOKEN`/`GITHUB_REPO` env vars on the container.

---

## 📂 Step 2: Configure Supabase Storage Bucket

To host uploaded image/video slides, create a storage bucket in Supabase:

1. Navigate to **Storage** in the Supabase Sidebar.
2. Click **New Bucket**.
3. Name the bucket **`adboard-assets`** and ensure it is toggled to **Public** (so anyone displaying the billboard can load the slides).
4. Go to **Policies** in Storage, and add a policy for **`adboard-assets`**:
   - Give **Authenticated** users full permissions (`INSERT`, `SELECT`, `UPDATE`, `DELETE`) so only logged-in administrators can upload and prune assets.

---

## 🚀 Step 3: Deploy to Vercel

Since our React app compiles into a static single-page application (SPA), deploying it to Vercel takes less than a minute:

### Option A: Using the Vercel CLI (Fastest)
1. Install the Vercel CLI on your machine:
   ```bash
   npm i -g vercel
   ```
2. Run the deployment command in the repository folder:
   ```bash
   vercel
   ```
3. Set your deployment environment variables when prompted, or configure them in the Vercel Web Dashboard.

### Option B: Import via Vercel Web Dashboard
1. Push this codebase to your **GitHub**, **GitLab**, or **Bitbucket** repository.
2. Go to **[Vercel](https://vercel.com)**, click **Add New** -> **Project**.
3. Import your repository.
4. Expand the **Environment Variables** section and insert the following two keys:

| Key | Description / Value |
|---|---|
| **`VITE_SUPABASE_URL`** | Your Supabase Project URL (e.g. `https://your-project.supabase.co`) |
| **`VITE_SUPABASE_ANON_KEY`** | Your Supabase project public `anon` key |

5. Click **Deploy**! 🎉

---

## 🧭 Step 4: Accessing Your Hosted Kiosk

Once Vercel completes compiling your build:
1. Open your assigned Vercel deployment URL (e.g., `https://adboard-kiosk.vercel.app`).
2. You will be automatically routed to the **Initial Setup Wizard**.
3. Enter your desired administrator **Email** and **Password** to register your master credentials inside Supabase Auth.
4. Log in, design your billboard, and enjoy a high-performance, Firebase-free digital signage dashboard!
