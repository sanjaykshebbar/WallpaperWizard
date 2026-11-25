# 🐳 Ultimate Docker & Rancher Deployment Guide (100% Offline Self-Hosting)

Welcome! If you love self-hosting and want a high-performance digital kiosk platform with **0% external dependencies, 0% cloud setups, and 100% local operation**, this guide is made specifically for **you**.

By the end of this guide, you will have your own instance of **AdBoard V3** packaged in an ultra-lean Docker container running on your local server, home lab, or enterprise orchestrator like **SUSE Rancher**.

---

## 🧭 Overview: How the Offline Container Works

Unlike traditional cloud deployments that rely on Google Firebase, we have packaged a high-performance, full-stack environment entirely inside the Docker image. 

The container compiles the React client to run in "Local-First" mode and boots a lightweight native **Node.js Express backend**. This backend manages slide scheduling, settings, administrator profiles, and handles physical image/video uploads directly on the host machine's disk drive.

```
                  ┌──────────────────────────────────────────────┐
                  │                 DOCKER ENGINE                │
                  │                                              │
                  │   ┌──────────────────────────────────────┐   │
                  │   │        Vite React Web Kiosk          │   │
                  │   │       (Loads in any browser)         │   │
                  │   └──────────────────┬───────────────────┘   │
                  │                      │ (REST API /api/*)     │
                  │                      ▼                       │
                  │   ┌──────────────────────────────────────┐   │
                  │   │      Full-Stack Express Server       │   │
                  │   │     (Authenticates & Manages)        │   │
                  │   └──────────┬───────────────────┬───────┘   │
                  │              │                   │           │
                  │              ▼ (Save Slides)     ▼ (Save Files)
                  │       ┌─────────────┐     ┌─────────────┐    │
                  │       │   db.json   │     │  /uploads/  │    │
                  │       └──────┬──────┘     └──────┬──────┘    │
                  └──────────────┼───────────────────┼───────────┘
                                 ▼                   ▼
                  ┌──────────────────────────────────────────────┐
                  │           DURABLE HOST VOLUMES MAP           │
                  └──────────────────────────────────────────────┘
```

### 💎 Key Benefits of this Local-First Image:
* **0% Google Firebase Dependency**: No analytics trackers, no Google accounts, and zero cloud API latency.
* **Persistent Disk Storage**: Slide database structures (`data/db.json`) and uploaded graphic/video assets (`data/uploads/`) remain on your owned local storage volume.
* **Full Multi-Screen Synchronization**: Because slide data is saved directly in the container rather than client-side `localStorage`, any administrative change made from your laptop updates all connected screens or TVs immediately and globally!
* **Optimized Standby**: The combined container is highly streamlined to load assets immediately from local memory.

---

## ⚡ Step 1: Running with Docker Compose (Easiest)

Docker Compose is the absolute easiest way to build, configure, and boot the application locally in one step. No configuration files or environment files are needed!

1. Ensure you have **Docker Desktop** or **Docker Engine** installed on your server.
2. Clone this repository to your target server.
3. Open your terminal in this repository folder and launch:
   ```bash
   docker compose up -d --build
   ```
4. 🎉 **Success!** Your billboard dashboard is now running locally.
   - Open your browser to: **`http://localhost:8080`**

### 💾 What happens under the hood?
1. The builder compiles your web views with the `VITE_LOCAL_BACKEND=true` build variable.
2. It bundles the backend server files inside `/app/dist/server.cjs` and launches it on port `3000`.
3. It mounts a durable system named volume (`adboard-data`) to `/app/data` to ensure all setup profiles, settings, and slides persist safely through computer reboots or container upgrades!

To stop the container, simply run from the same directory:
```bash
docker compose down
```

---

## 📦 Step 2: Hosting on SUSE Rancher & Kubernetes

If you represent an enterprise or run a professional home lab orchestrating containers via **SUSE Rancher** or raw **Kubernetes**, follow these operational guidelines:

### 1. Build and Tag your Container Image
Since Kubernetes works by pulling precompiled assets, compile your image on your build machine and push it to your docker hub namespace or private container registry:

```bash
# Login to registry
docker login

# Build the self-contained production bundle
docker build -t your-registry-username/adboard-v3:latest .

# Push image to registry
docker push your-registry-username/adboard-v3:latest
```

### 2. Configure persistent storage (PersistentVolumeClaim)
Create a Persistent Volume Claim (PVC) in your cluster namespace mapping to path `/app/data` inside the container. This ensures that `db.json` and `/uploads` do not vanish when Kubernetes restarts pods.

### 3. Deploy Workload via Rancher UI
1. Open your **Rancher Web Console Dashboard**.
2. Select your target **Cluster** and navigate to your **Namespace** (e.g. `kiosk-services`).
3. Under **Workloads**, click **Create**.
4. Configure the following parameters:
   - **Workload Type**: `Deployment`
   - **Name**: `adboard-kiosk`
   - **Container Image**: `your-registry-username/adboard-v3:latest` (Use the image path you pushed)
5. **Port Mapping**:
   - Private Container Port: **`3000`** (This is our internal Node Express server port)
   - Service Type: `ClusterIP` or `NodePort`
6. **Storage Settings (Persistent Storage)**:
   - Click **Add Volume** -> Choose **Persistent Volume Claim**.
   - **Mount Path**: Type **`/app/data`**
7. Click **Launch**! 

Once the pod turns green, configure an Ingress rule pointing your local kiosk domain name (e.g. `billboard.local` or `adboard.company.net`) at service port `3000`.

---

## 🛠️ Step 3: Raw Docker Commands (No Compose)

If you prefer using direct Docker CLI commands without docker compose, launch using:

### 1. Build raw image:
```bash
docker build -t adboard:v3 .
```

### 2. Run container with local folder maps:
Map a local folder on your computer (e.g. `/home/user/adboard_data`) to pass storage safely:
```bash
docker run -d \
  --name adboard-kiosk \
  -p 8080:3000 \
  -v /home/user/adboard_data:/app/data \
  --restart unless-stopped \
  adboard:v3
```

- Open: `http://localhost:8080` to log in!

---

## 📋 Step 4: Initial Setup (Setup Wizard)

When you access your newly hosted URL for the first time:
1. You will be greeted by the **Platform Setup Wizard**.
2. Create your administrator **Email** and **Password**. 
3. This creates your master login credentials profile. They are saved securely inside `data/db.json` in your local container storage volume (no network requests made outside).
4. After logging in, you can click **Add Advertisement**, upload graphic files, schedule times, and enjoy 100% private digital ad rotations!

---

## 💡 Common Pitfalls & Troubleshooting

### 1. File Upload Size Limits
* **Q**: What is the maximum file size I can upload for localized images/slides?
* **A**: Images up to **20MB** and videos up to **500MB** are completely allowed. These limits are governed by the built-in multer stream limits.

### 2. Can I inspect or backup the database?
* **A**: **Absolutely!** Because everything is hosted inside your mounted Docker volume, you can open `db.json` inside your volume mapped folder at any time. It is stored as standard, highly human-readable JSON!

---

*Enjoy secure, high-performance, fully private digital billboard rotations! 🐳*
