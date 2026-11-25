# ⚡ Ultimate Vercel Deployment Guide (Noob-Friendly Edition)

Welcome! If you want your **AdBoard V3** digital billboard up and running on the web in less than 2 minutes, **Vercel** is one of the easiest, fastest, and most popular hosting platforms in the world. 

It is 100% free under Vercel's generous Hobby Tier, and your website will load instantly across all devices.

---

## 🧭 Overview: What is Vercel?

If **Firebase** is the "engine" holding your users and media files, **Vercel** is the "glass display case" displaying your actual website to the public:

```
┌────────────────────────────────────────────────────────┐
│                        VERCEL                          │
├────────────────────────────────────────────────────────┤
│                     Hosting Server                     │
│                 (Serves your React UI)                 │
└──────────────────────────┬─────────────────────────────┘
                           │  (Connects via API)
                           ▼
┌────────────────────────────────────────────────────────┐
│                        FIREBASE                        │
├───────────────┬──────────────┬─────────────┬───────────┤
│    Hosting    │  Firestore   │   Storage   │   Auth    │
│  (DB Storage) │  (Database)  │ (Media Res) │  (Login)  │
└───────────────┴──────────────┴─────────────┴───────────┘
```

When someone accesses your billboard link, Vercel loads the beautiful visual screen, which then securely reaches out to Firebase to grab your latest slides!

---

## 🛠️ Step 1: Create a Vercel Account

1. Go to [Vercel.com](https://vercel.com).
2. Click **Sign Up** in the top-right corner.
3. Select the **"Hobby" (Free)** account type. Enter your name, and click Next.
4. We highly recommend signing up using your **GitHub** account. It makes importing and auto-updating your website incredibly simple!

---

## 📤 Step 2: Push your Code to GitHub

Before Vercel can host your app, it needs to grab your files from GitHub. 

If you are new to Git and GitHub, here is the easiest way to do it:

### Option A: The Desktop Way (Easiest)
1. Download [GitHub Desktop](https://desktop.github.com/).
2. Open it, log in, and choose **Add Existing Repository** from your local hard drive.
3. Click **Publish Repository** to send it directly to your online GitHub profile. Make sure to keep the repository name simple!

### Option B: The Terminal Way
If you prefer running commands, open your terminal workspace and run:
```bash
git init
git add .
git commit -m "feat: first deploy build"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/adboard-v3.git
git push -u origin main
```

---

## 🔑 Step 3: Get your Firebase Credentials

Because your GitHub project might be public (visible to other people), **NEVER** save your real database keys directly inside your files! If you do, other people could find them and use your database.

Instead, we will use Vercel's **Environment Variables**. These act like a secure keybox that only Vercel can open when launching your site.

Before starting, make sure you have your Firebase details ready from your Firebase Console (under **Project Settings > General > Your Apps > Web App**):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyByXXXXXXXX-XXXXXXXXX",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
```

---

## ⚙️ Step 4: Import and Deploy on Vercel

Now, let's link Vercel to your GitHub repository and input your secure credentials.

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click on the **"New Project"** button.
2. Under "Import Git Repository", find your `adboard-v3` repository and click **Import**.
3. **Configure Project Settings**:
   * **Project Name**: You can leave this as `adboard-v3` or change it.
   * **Framework Preset**: Vercel should automatically detect this as **`Vite`**. If it says "Other", click the dropdown and select **Vite**.
   * **Root Directory**: Leave as `./` (the default).
4. Expand the **"Environment Variables"** dropdown menu. This is the security step!
   Add the following variables one by one. Copy the names exactly as shown, and paste your values from your Firebase configuration:

   | Key (Name) | Value (From your Firebase Config) |
   | :--- | :--- |
   | `VITE_FIREBASE_API_KEY` | your `apiKey` (e.g., `AIzaSyBy...`) |
   | `VITE_FIREBASE_AUTH_DOMAIN` | your `authDomain` (e.g., `your-project-id.firebaseapp.com`) |
   | `VITE_FIREBASE_PROJECT_ID` | your `projectId` (e.g., `your-project-id`) |
   | `VITE_FIREBASE_STORAGE_BUCKET` | your `storageBucket` (e.g., `your-project-id.appspot.com`) |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID`| your `messagingSenderId` (e.g., `1234567890`) |
   | `VITE_FIREBASE_APP_ID` | your `appId` (e.g., `1:123...`) |
   | `VITE_FIREBASE_DATABASE_ID` | Type **`(default)`** |

5. Click the blue **Deploy** button!

Wait about **45 seconds** while Vercel sets up your server, compiles your code, and registers your secure keys. You will see a confetti explosion on your browser stage setup when it is completed! 🎉

---

## 💡 Common Pitfalls & Questions

### 1. Why does my page show a "404 Not Found" when I refresh on `/admin` or `/setup`?
* **Why**: React websites use client-side routing. When you click around, React simulates page transition changes instantly. But if you press the **Refresh** button on your browser or directly navigate to `yoursite.com/admin`, Vercel gets confused because there isn't actually a physical file called `admin.html` inside your project directory.
* **Fix**: This project includes a pre-built **`vercel.json`** file at the root. This is a special rulebook that instructs Vercel: *"If someone asks for any sub-page path, send them smoothly back to main `index.html` and let React take over the route!"*
* If you did not include this file, make sure to save a file named `vercel.json` at the absolute root containing:
```json
{
  "cleanUrls": true,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 2. How do I update my Vercel site when I make changes?
* **It's automatic!** Whenever you make updates to your files and run a git push to GitHub (`git push origin main`), Vercel detects the change, rebuilds your project in the background, and updates your live URL in 15 seconds. No manual intervention required!

### 3. Can I use my own Custom Domain name?
* **Absolutely!** In your Vercel project panel, go to **Settings > Domains**. Type your domain name (e.g., `billboard.myoffice.com`) and click **Add**. Vercel will guide you on how to change your DNS records, which takes about 2 minutes and is completely free!

---

*Now sit back, grab a coffee, and watch your gorgeous new digital billboard display rotate live on Vercel! 🚀*
