# Running the zcrypt backend on your own server

The backend stores nothing itself: users, files and keys live in Neon and the storage platforms. Any Linux machine with Docker can run it, and a broken server can be replaced in minutes with this folder and the same `.env`.

Traffic reaches it through a Cloudflare Tunnel, so the server needs no open ports, firewall rules or TLS certificates.

## 1. Get a server

**Oracle Cloud Always Free** (recommended: $0, 10 TB/month of traffic):

1. Sign up at cloud.oracle.com. Pick the home region **US East (Ashburn)**, because the Neon database is in us-east-1. You can't change the home region later.
2. Optional but recommended: upgrade to **Pay As You Go**. You keep the free limits and aren't charged, but free servers become much easier to get and are never reclaimed for being idle.
3. Create an instance:
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere VM.Standard.A1.Flex**, 2 OCPU, 12 GB RAM
   - Add your SSH public key.

   If it says "out of capacity", try another availability domain or try again later.

Any other Ubuntu VPS works the same way (arm64 or x86_64, 1 GB RAM minimum).

## 2. Create the Cloudflare Tunnel

1. In the Cloudflare dashboard, open **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and name it `zcrypt-backend`.
2. Copy the **token** from the install command (the long string after `--token`).
3. Under **Public hostname**, add `api.zcrypt.cloud` with service **HTTP** and URL **`backend:8080`**.

This needs `zcrypt.cloud` on Cloudflare DNS. If the domain isn't on Cloudflare, use the free `*.trycloudflare.com` quick tunnel for testing, or point any reverse proxy at port 8080 instead.

## 3. Make the server env (on your laptop)

```bash
deploy/server/make-env.sh <TUNNEL_TOKEN> https://api.zcrypt.cloud
```

This copies the live secrets from `app/backend/.env` into `deploy/server/.env`, which git ignores. `MASTER_KEY` and `ZCRYPT_JWT_SECRET` must stay the same as before. Otherwise stored platform tokens can't be decrypted and everyone is signed out.

## 4. Start it (on the server)

```bash
git clone https://github.com/Wosmos/zcrypt.git && cd zcrypt
# from your laptop: scp deploy/server/.env <user>@<server-ip>:zcrypt/deploy/server/.env
bash deploy/server/setup.sh
```

The script installs Docker, builds the backend, starts it with the tunnel, and waits until `/api/health` answers.

Check it from anywhere:

```bash
curl https://api.zcrypt.cloud/api/health
```

## 5. Point the site at it

1. In Vercel, open **Project → Settings → Environment Variables** and set `NEXT_PUBLIC_API_URL=https://api.zcrypt.cloud` for Production. Then redeploy.
2. The desktop and Android apps call `www.zcrypt.cloud/api`, which Vercel forwards to `NEXT_PUBLIC_API_URL`, so the redeploy repoints them too. No app release is needed.
3. Sign-in with GitHub or Google: change each OAuth app's callback URL to the new backend host: `https://api.zcrypt.cloud/api/auth/oauth/github/callback` and `https://api.zcrypt.cloud/api/auth/oauth/google/callback`.

## Deploying an update

```bash
cd zcrypt && git pull && bash deploy/server/setup.sh
```

## Logs and restarts

```bash
cd zcrypt/deploy/server
docker compose logs -f backend
docker compose restart backend
```

## Flipping the backend to a new Railway account

1. CI publishes `ghcr.io/<owner>/zcrypt-backend:latest` on every backend push (`backend-image.yml`); make that GHCR package public once.
2. `railway login` on the new account, then fill `deploy/railway.env` from `deploy/railway.env.example` (copy DATABASE_URL, MASTER_KEY, ZCRYPT_JWT_SECRET unchanged).
3. Run `bash scripts/railway-flip.sh`: it creates the project and service from the image, sets variables, adds a domain on port 8080 and waits for `/api/health`.
4. It prints the follow-ups (Vercel `NEXT_PUBLIC_API_URL` + `vercel redeploy --prod`, `gh variable set BACKEND_HEALTH_URL`, `gh secret set RAILWAY_TOKEN`); `--apply` runs the Vercel and variable steps for you.
5. Update the OAuth callback URLs only if you use the Railway host directly; web and desktop go through www.zcrypt.cloud and need nothing else.
