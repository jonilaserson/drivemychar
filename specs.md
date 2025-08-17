# drive-my-char — MVP Specs (Server-Stored Encounters)

---

## 1) Product Summary

Create, customize, and share NPCs.  
Each NPC’s owner (GM) generates the NPC from a short paragraph. We auto-parse it into structured sections and generate a semi-realistic portrait and a default voice.  
The GM (and admin) can edit sections anytime.  

Encounters are launched as **server-stored “documents”** with dedicated shareable URLs; anyone with the link can join and converse with the NPC (text by default, optional voice output).  
For this MVP there’s **no GM live intervention during the encounter**.

---

## 2) Tech Stack & Hosting

**Frontend:**  
- Netlify (React + Vite recommended)  
- Google Identity Services (OAuth) + backend token verification  
- Optional Web Audio for TTS playback  

**Backend API:**  
- Render (Node.js, TypeScript, Express/Fastify)  
- REST + SSE (Server-Sent Events) for streaming LLM tokens  
- Optional WebSocket  

**Database:** Postgres (Render)  
**Object Storage:** Cloudinary (portraits, optional JSON snapshots)  
**LLM:** OpenAI (text generation, DALL·E for portraits)  
**TTS:** ElevenLabs  
**Auth:** Direct Google OAuth + backend session cookies  
**Local Dev:** `docker-compose` for Postgres; `.env` driven backend; local frontend dev server  

---

## 3) Core Concepts

- **User:** Google-authenticated; roles: `admin`, `user`  
- **NPC:** Belongs to GM; consists of 5 sections:  
  1. Visual description  
  2. Personality  
  3. Knowledge  
  4. Motivations  
  5. Pitfalls  
  Includes portrait URL and optional voice ID.  
- **Encounter:** Server-stored document with slug URL, conversation history, interest & patience state.  
  - Patience: `[0,5]`, decremented by 1 per user utterance; reset to 5 on motivation trigger.  
  - Interest: `[0,5]`, optional heuristic updates.  

---

## 4) User Flows

### 4.1 Sign-In
1. Frontend uses Google Identity Services to get ID token.  
2. Send token to `/auth/google` → backend issues HttpOnly session cookie.  
3. Backend stores/updates user record and returns metadata.  

### 4.2 Create NPC
1. GM pastes a short paragraph.  
2. Backend parses & expands sections via OpenAI.  
3. Generate portrait via DALL·E → upload to Cloudinary.  
4. Assign default voice ID.  
5. Preview & optionally regenerate/replace portrait or disable voice.  
6. Save NPC.  
7. System creates an initial empty encounter and sets it as the NPC's current encounter (used for sharing/entering from the list).  

### 4.3 Edit NPC
- GM/Admin can edit any section, change portrait URL, toggle voice.  

### 4.4 Enter Encounter
1. From NPC page or list, GM clicks "Enter encounter".  
2. Backend creates encounter with random slug.  
3. Initial patience & interest set from NPC defaults.  
4. Share URL → full access for anyone with link.  
5. Each NPC has a single "current encounter". Creating a new encounter replaces the current one; the list shows the current encounter slug and last message preview, and offers actions: Copy link, Enter encounter, Create new encounter, Delete NPC.  

### 4.5 Conversation Runtime
- Viewer UI: message list, composer, voice toggle.  
- Send message → patience−1, run LLM, check motivation, possibly reset patience to 5.  
- Generate TTS if enabled.  
- Persist messages and state.  

### 4.6 Screens & Navigation
- Landing `/` (unauthenticated)
  - Shows Google sign-in button. After successful sign-in, redirects to Authed Home.

- Authed Home `/` (main screen)
  - Displays the user’s NPC list. For each NPC, shows portrait, name, id, and if present: `current_encounter_slug` and last message preview.
  - Per‑NPC actions: Edit, Enter encounter (opens `/e/:slug`), Copy link, Create new encounter (replaces current), Delete NPC (with confirmation).
  - Create NPC: inline toggle reveals a textarea to paste a paragraph and create a new NPC. On success, list refreshes and a current encounter is available.

- NPC Editor (inline within Authed Home)
  - When Edit is selected, the editor view replaces the list. Editable fields: name and the five sections; portrait preview with Regenerate portrait; defaults editing; Save changes; Delete NPC; Enter encounter.
  - Back returns to the NPC list and refreshes data.

- Encounter Room `/e/:slug` (public)
  - Anyone with the link can view portrait, name, and full transcript. Composer to send a message. Server returns a mock NPC reply and updates state and transcript. Refresh reflects latest transcript.

- Admin `/admin` (admin only)
  - Minimal listings for users, NPCs, encounters, and audit log.

---

## 5) Data Model

**users**  
- `id`, `google_sub`, `email`, `display_name`, `role`, timestamps  

**npcs**  
- `id`, `owner_id`, name, sections, image_url, voice_id, defaults, `current_encounter_id` (nullable), timestamps  

**encounters**  
- `id`, `npc_id`, `slug`, state fields, timestamps  

**encounter_messages**  
- `id`, `encounter_id`, `author_type`, `text`, `audio_url`, `model_meta`, `flags`, timestamp  

**audit_log**  
- `id`, `actor_user_id`, `action`, `target_type`, `target_id`, timestamp  

Notes:  
- Deleting an NPC clears its `current_encounter_id` and cascades by deleting its encounters and their messages.  

---

## 6) API Endpoints

**Auth**  
- `GET /health`  
- `GET /me`  
- `POST /auth/google`  
- `POST /auth/impersonate` (admin)  
- `POST /auth/logout`  

**NPCs**  
- `POST /npcs`  
- `POST /npcs/:id/regen-image`  
- `PATCH /npcs/:id`  
- `GET /npcs`  
- `GET /npcs/:id`  
- `DELETE /npcs/:id`  

**Encounters**  
- `POST /npcs/:id/encounters`  
- `GET /encounters/:slug`  
- `GET /encounters/:slug/messages`  
- `POST /encounters/:slug/messages`  

**Admin**  
- `GET /admin/users`  
- `GET /admin/npcs`  
- `GET /admin/encounters`  
- `GET /admin/audit`  

---

## 7) LLM & Runtime Logic

**Generation Prompt:** Parse NPC paragraph into structured sections.  
**Runtime Prompt:** Roleplay NPC, output JSON with reply and `motivationTriggered`.  

Patience rule:  
- On user message: `patience = max(0, patience-1)`  
- If `motivationTriggered`: `patience = 5`  

Interest: Optional simple heuristic adjustments.  

---

## 8) TTS

- Voice ID chosen server-side; null disables voice.  
- Per-viewer mute only affects local playback.  
- ElevenLabs synthesis; audio stored in Cloudinary or served via signed URL.  

---

## 9) Images

- Style: semi-realistic portrait, neutral background.  
- Prompt: from visual description.  
- Cloudinary path: `npcs/{npcId}/portrait_v{n}.png`.  
- Regeneration & override supported.  

---

## 10) Security & Retention

- Encounter access by unguessable URL.  
- No content moderation.  
- Retain data indefinitely for MVP.  
- Minimal PII storage.  
- Admin impersonation audited.  

---

## 11) Observability

- Structured app logs.  
- LLM usage metrics.  
- TTS/image asset logs.  
- DB slow query log.  

---

## 12) Local Development

- `docker-compose` for Postgres.  
- Backend: `npm run dev` on port 4000.  
- Frontend: `npm run dev` on port 5173.  
- `.env` contains API keys and secrets.  

---

## 13) Minimal Frontend Pages

- `/` — Landing (unauth) and Authed Home (NPC list + inline create/edit) depending on session state.  
- `/e/:slug` — Encounter room (public).  
- `/admin` — Admin dashboard (admin only).  

---

## 14) Non-Goals

- No GM live tools during encounters.  
- No granular participant permissions.  
- No content moderation.  
- No cross-encounter media consistency beyond base settings.  

---

## 15) Acceptance Criteria

- Google sign-in & admin impersonation working.  
- NPC creation from paragraph with generated sections, portrait, voice assignment.  
- NPC editing at any time.  
- Encounter launch with shareable URL.  
- Patience decrement & reset logic implemented.  
- NPC replies + optional TTS generation.  
- State & transcript persisted server-side.  
- Local dev environment functional with Postgres via docker-compose.  

---

## 16) Directory Structure

```plaintext
drive-my-char/
├── backend/
│   ├── env.example
│   ├── migrations/              # Postgres migrations (node-pg-migrate)
│   ├── package.json
│   ├── src/
│   │   ├── db.ts                # Postgres connection pool + query helper
│   │   ├── index.ts             # Express app entrypoint and routes (Chapter 1)
│   │   ├── api/                 # TBD: split routes by domain (auth, npc, encounter, admin)
│   │   ├── llm/                 # TBD: LLM prompts and clients (Chapter 2+)
│   │   ├── tts/                 # TBD: TTS integration (Chapter 2+)
│   │   ├── images/              # TBD: Image generation/upload helpers (Chapter 2+)
│   │   ├── models/              # TBD: Data model types/interfaces
│   │   ├── middleware/          # TBD: Auth/logging/rate-limit middlewares
│   │   └── utils/               # TBD: Shared utilities
│   └── tsconfig.json
│
├── frontend/
│   ├── env.example
│   ├── index.html
│   ├── package.json
│   ├── src/
│   │   ├── api.ts               # API client wrappers (fetch with credentials)
│   │   ├── main.tsx             # React app entrypoint
│   │   ├── components/          # TBD: UI components (forms, lists, buttons)
│   │   ├── pages/               # TBD: Route components for /, /npc/:id, /e/:slug, /admin
│   │   ├── hooks/               # TBD: Custom React hooks
│   │   └── styles/              # TBD: Styles or Tailwind config
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── docker-compose.yml           # Local Postgres service definition
├── docs/
│   └── api.md                   # Chapter 1 API reference
├── README.md
├── roadmap.md
├── specs.md                     # This spec document
├── pyproject.toml               # (unused placeholder for tooling)
└── uv.lock                      # (unused placeholder for tooling)
```

**Key File Descriptions:**

- `backend/src/index.ts` — Express app entrypoint and Chapter 1 routes.
- `backend/src/db.ts` — Postgres connection pool and `query` helper.
- `backend/migrations/` — Database migrations.
- `backend/src/api/` — TBD: split route handlers by domain.
- `backend/src/llm/` — TBD: prompts and LLM client integrations.
- `backend/src/tts/` — TBD: TTS provider integration and audio handling.
- `backend/src/images/` — TBD: image generation/upload helpers.
- `backend/src/models/` — TBD: data model types/interfaces.
- `backend/src/middleware/` — TBD: auth, logging, rate-limiting.
- `backend/src/utils/` — TBD: shared utilities.
- `frontend/src/main.tsx` — React app entrypoint and router.
- `frontend/src/api.ts` — Fetch wrappers with credentials and base URL logic.
- `frontend/src/components/` — TBD: shared UI components.
- `frontend/src/pages/` — TBD: route-level components.
- `frontend/src/hooks/` — TBD: React hooks.
- `frontend/src/styles/` — TBD: styles/Tailwind.
- `docs/api.md` — Chapter 1 API reference.


