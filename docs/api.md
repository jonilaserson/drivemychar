## API Reference — Chapter 1

Base URL (local): `http://localhost:4000`

Notes
- All endpoints return JSON.
- CORS is enabled with `credentials: true`; when calling from a browser, send `credentials: 'include'` so cookies are sent.
- Auth is session-cookie based, obtained via `POST /auth/google` after verifying a Google ID token.
- Public encounter endpoints do not require auth.

### Health & Auth
- GET `/health` → `{ ok: boolean, dbOk: boolean }`
- GET `/me` → 401 or `{ user }`
- POST `/auth/google` body `{ idToken: string }` → `{ user }`
- POST `/auth/logout` → `{ ok: true }`
- POST `/auth/impersonate` (admin) body `{ sub?, email?, displayName?, role? }` → `{ user }`

### NPCs (auth required)
- GET `/npcs`
  - Response: `{ npcs: [{ id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at, current_encounter_slug, current_encounter_last_message }] }`
- GET `/npcs/:id` → `{ npc }`
- POST `/npcs`
  - Body: `{ paragraph: string, name?: string }`
  - Response: `{ npc: { ..., current_encounter_slug } }` (also creates an empty current encounter)
- PATCH `/npcs/:id`
  - Body: any subset of `{ name, sections_json, image_url, defaults_json }`
  - Response: `{ npc }`
- POST `/npcs/:id/regen-image` → `{ npc }`
- DELETE `/npcs/:id` → `{ ok: true }` (cascades: clears `current_encounter_id`, deletes encounters and messages for this NPC)

### Encounters
- POST `/npcs/:id/encounters` (auth)
  - Creates a new encounter, sets it as the NPC’s current encounter
  - Response: `{ encounter: { id, slug } }`
- GET `/encounters/:slug` (public)
  - Response: `{ encounter: { id, slug, state_json, created_at, updated_at, npc_id, npc_name, npc_image_url } }`
- GET `/encounters/:slug/messages` (public)
  - Response: `{ messages: [{ id, author_type: 'user'|'npc', text, audio_url, model_meta_json, flags_json, created_at }] }`
- POST `/encounters/:slug/messages` (public)
  - Body: `{ text: string }`
  - Response: `{ userMessage, npcMessage, state }` (mock NPC reply is generated server-side)

### Admin (admin role required)
- GET `/admin/users` → `{ users: [...] }`
- GET `/admin/npcs` → `{ npcs: [...] }`
- GET `/admin/encounters` → `{ encounters: [...] }`
- GET `/admin/audit` → `{ audit: [...] }`

### Auth & Cookies (client notes)
- After `POST /auth/google`, the server sets a session cookie. Subsequent requests from the same browser should include cookies.
- From `fetch`, use `credentials: 'include'` and ensure your frontend origin is allowed by CORS.


