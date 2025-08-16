## Roadmap — Chapter 1: Skeleton & Flow (No External AI)

This chapter delivers the end‑to‑end screen structure and app flow for both backend and frontend, running locally, with mock AI responses and Cloudinary for image storage. No external AI calls will be made.

### Scope of Chapter 1
- Backend (Node.js + TypeScript + Express/Fastify) bootstrapped and runnable locally
- Frontend (React + Vite) bootstrapped and runnable locally
- Google sign‑in and backend session cookies
- Postgres schema and CRUD for Users/NPCs/Encounters/Messages
- NPC generation/editing flow using a mock LLM parser
- Encounter room (shareable URL) with persisted messages and mock NPC replies
- Cloudinary used for image storage; one test image is sufficient

### Environment & Config (created during phases)
- docker‑compose for local Postgres
- .env files for backend and frontend
- Required env vars (final names to be created in Phase 0):
  - Backend: `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER` (e.g., `npcs`), `MOCK_AI_ENABLED=true`, `SEED_NPC_IMAGE_URL` (optional)
  - Frontend: `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`

---

## Phase 0 — Project Scaffolding & Tooling

### Implement
- Create monorepo layout per spec: `backend/`, `frontend/`, `docker-compose.yml`, `.env.example`, `docs/`
- Backend: TypeScript project with Express/Fastify, ESLint/Prettier, tsconfig, nodemon/ts-node-dev scripts
- Frontend: React + Vite + TypeScript, ESLint/Prettier
- Shared conventions: commit scripts, folder naming, request logging

### Definition of DONE
- `npm run dev` starts backend on port 4000
- `npm run dev` starts frontend on port 5173
- `.env.example` exists for both apps with all required keys
- `docker-compose up -d` brings up Postgres and `DATABASE_URL` works

---

## Phase 1 — Auth: Google Sign‑In + Sessions

### Implement
- Frontend: Google Identity Services button on `/` (Landing)
- Backend: `POST /auth/google` verifies ID token (google-auth-library), issues HttpOnly session cookie
- Backend: `POST /auth/logout` clears session cookie
- Backend: `POST /auth/impersonate` (admin only) stubbed but functional with role check
- Middleware to protect non-public routes and attach `req.user`

### Definition of DONE
- A user can sign in with Google and receive a session cookie
- After refresh, frontend detects signed‑in state via a `/me` or similar endpoint
- Admin role is supported (stored in DB once Phase 2 is complete) and impersonation endpoint exists (no UI yet)

---

## Phase 2 — Database & Models

### Implement
- Create Postgres schema and migrations for:
  - `users(id, google_sub, email, display_name, role, created_at, updated_at)`
  - `npcs(id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at)`
  - `encounters(id, npc_id, slug, state_json, created_at, updated_at)`
  - `encounter_messages(id, encounter_id, author_type, text, audio_url, model_meta_json, flags_json, created_at)`
  - `audit_log(id, actor_user_id, action, target_type, target_id, created_at)`
- Minimal query layer (TypeScript types for rows and payloads)

### Definition of DONE
- `npm run db:migrate` applies schema on local Postgres without errors
- Basic CRUD read/write verified for `users` and `npcs`

---

## Phase 3 — NPCs: Create, List, Edit (Mock LLM + Cloudinary)

### Implement
- Backend endpoints:
  - `POST /npcs` accepts `{ paragraph, name? }` and uses a mock parser to generate 5 sections (visual/personality/knowledge/motivations/pitfalls)
  - Assign default `image_url` using Cloudinary (see Test Image note below) and set `voice_id=null`
  - `GET /npcs` returns NPCs owned by the requesting user
  - `GET /npcs/:id` returns details if owner or admin
  - `PATCH /npcs/:id` edits sections, image_url, name, defaults
  - `POST /npcs/:id/regen-image` replaces `image_url` with the Cloudinary test image (no DALL·E yet)
- Frontend pages:
  - `/npc/new` — textarea for paragraph, optional name, submit to create
  - `/npc/:id` — editable form for the 5 sections, image preview, save button; button to regen/replace portrait
  - NPC list page showing only owned NPCs

### Definition of DONE
- From the UI, user can create an NPC from a paragraph and see a portrait image URL
- User can view their NPC list and open an NPC to edit any section
- Regenerating an image swaps in the configured Cloudinary test image URL

### Test Image (what you need to provide)
- Preferred: Upload a portrait image to Cloudinary at folder `npcs/seed/portrait.png` and set backend env `SEED_NPC_IMAGE_URL` to its secure URL
- Alternative: Provide a direct Cloudinary public ID via `CLOUDINARY_FOLDER` + code defaults; we’ll assemble `npcs/seed/portrait.png`

---

## Phase 4 — Encounters: Create + View + Converse (Mock Replies)

### Implement
- Backend endpoints:
  - `POST /npcs/:id/encounters` — creates encounter with random slug, initial patience/interest in `state_json`
  - `GET /encounters/:slug` — returns encounter + NPC summary (name, image_url) and state
  - `GET /encounters/:slug/messages` — returns ordered transcript
  - `POST /encounters/:slug/messages` — accepts a user message, persists it, applies patience rule, then enqueues a mock NPC reply and persists it
    - Mock reply strategy: simple templated response that references last user message; optionally randomize tone to simulate personality; set `motivationTriggered` true 20% of time to test resets
- Frontend page `/e/:slug`:
  - Shows NPC portrait, name, current transcript
  - Composer to send a message; after sending, show both user msg and mock NPC reply
  - On refresh, the conversation is loaded from the server

### Definition of DONE
- From an NPC page, user can launch an encounter and receive a shareable URL
- Visiting the URL opens the encounter room, showing image and transcript
- User can post a message and receive a server‑generated mock reply
- Another user opening the same URL later sees the updated transcript after refresh

---

## Phase 5 — Minimal Admin & Observability

### Implement
- Backend: `GET /admin/users`, `GET /admin/npcs`, `GET /admin/encounters`, `GET /admin/audit` (basic listings)
- Audit key actions: sign‑in, create NPC, edit NPC, create encounter, post message
- Frontend: `/admin` page with very simple tables (behind admin check)

### Definition of DONE
- Admin can load `/admin` and see simple lists populated from DB
- Audit log records basic actions

---

## Phase 6 — Local Runbook & Acceptance Verification

### Implement
- Provide run scripts and docs in `README.md`:
  - Start DB: `docker-compose up -d`
  - Backend: `cd backend && npm i && npm run db:migrate && npm run dev`
  - Frontend: `cd frontend && npm i && npm run dev`
- Document required env vars and how to obtain a Google Client ID (Web)
- Confirm Cloudinary credentials and test image URL

### Definition of DONE (maps to Chapter 1 goals)
1. User can sign in with Google on `/` and receives a session cookie (Phase 1)
2. User sees the list of NPCs they manage (Phase 3)
3. User can generate a new NPC from a text paragraph (Phase 3, mock LLM)
4. User can edit any config section of an existing NPC they own (Phase 3)
5. User can launch an encounter from one of their NPCs and obtain a URL (Phase 4)
6. Visiting that URL opens the encounter room (Phase 4)
7. Room shows NPC image and current conversation history (Phase 4)
8. User can write new messages (Phase 4)
9. Server returns a mock NPC reply (Phase 4)
10. Other users who visit the URL later see the updated conversation on refresh (Phase 4)

---

## Out‑of‑Scope for Chapter 1
- Real OpenAI/DALL·E/ElevenLabs integrations
- Realtime updates (SSE/WebSocket) beyond simple refresh semantics
- Fine‑grained permissions, GM live tools, and content moderation

## Notes & Risks
- Ensure server‑side token verification for Google ID tokens; do not trust client
- Use HttpOnly, Secure cookies; sameSite=Lax for local; consider CSRF later
- Patience & interest stored in `state_json` for flexibility; we will normalize later if needed
- Keep mock reply deterministic enough for testing but with minor variation


