Drive My Char — Monorepo (Chapter 1 / Phase 0)

Local Dev Quickstart

1) Start Postgres
- docker-compose up -d

2) Backend
- cd backend
- cp .env.example .env
- npm install
- npm run dev
- Visit http://localhost:4000/health → { ok: true }

3) Frontend
- cd frontend
- cp .env.example .env
- npm install
- npm run dev
- Visit http://localhost:5173

Notes
- Default Postgres credentials: user dmc / password dmc / db dmc
- Adjust ports or envs as needed

LAN sharing (open encounter links on phone)
- Backend must be reachable on LAN: visit http://<LAN_IP>:4000/health from phone
- Frontend env (restart after editing):
  - VITE_API_BASE_URL=http://localhost:4000 (laptop workflow; encounter room auto-rewrites for viewers)
  - Optional: VITE_PUBLIC_BASE_URL=http://<LAN_IP>:5173 or http://<sslip_host>:5173 (copied links)
  - Optional: VITE_LAN_HOST=<LAN_IP or sslip host>
- Frontend server config (`frontend/vite.config.ts`) binds to LAN and allows hosts (already set)
- Sign-in flows must use http://localhost:5173 on laptop (Google blocks raw IP origins). Encounter room `/e/:slug` is public and works from LAN IP.


Phase 1 (Auth) — Minimal Notes

- Create a Google OAuth 2.0 Web Client in Google Cloud Console.
- Authorized JavaScript origins:
  - http://localhost:5173
  - http://127.0.0.1:5173
- Set env vars:
  - backend/.env → GOOGLE_CLIENT_ID=<web client id>
  - frontend/.env → VITE_GOOGLE_CLIENT_ID=<same id>
- Restart both servers. Open http://localhost:5173 and click the Google button.
- Verify:
  - Signed-out: GET http://localhost:4000/me → 401
  - After sign-in: GET http://localhost:4000/me → user JSON



API Reference
- See `docs/api.md` for the full list of endpoints available in Chapter 1.

