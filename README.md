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


