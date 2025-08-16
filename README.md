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



