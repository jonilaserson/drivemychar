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

### 4.3 Edit NPC
- GM/Admin can edit any section, change portrait URL, toggle voice.  

### 4.4 Launch Encounter
1. From NPC page, GM clicks "Launch encounter".  
2. Backend creates encounter with random slug.  
3. Initial patience & interest set from NPC defaults.  
4. Share URL → full access for anyone with link.  

### 4.5 Conversation Runtime
- Viewer UI: message list, composer, voice toggle.  
- Send message → patience−1, run LLM, check motivation, possibly reset patience to 5.  
- Generate TTS if enabled.  
- Persist messages and state.  

---

## 5) Data Model

**users**  
- `id`, `google_sub`, `email`, `display_name`, `role`, timestamps  

**npcs**  
- `id`, `owner_id`, name, sections, image_url, voice_id, defaults, timestamps  

**encounters**  
- `id`, `npc_id`, `slug`, state fields, timestamps  

**encounter_messages**  
- `id`, `encounter_id`, `author_type`, `text`, `audio_url`, `model_meta`, `flags`, timestamp  

**audit_log**  
- `id`, `actor_user_id`, `action`, `target_type`, `target_id`, timestamp  

---

## 6) API Endpoints

**Auth**  
- `POST /auth/google`  
- `POST /auth/impersonate` (admin)  
- `POST /auth/logout`  

**NPCs**  
- `POST /npcs`  
- `POST /npcs/:id/regen-image`  
- `PATCH /npcs/:id`  
- `GET /npcs`  
- `GET /npcs/:id`  

**Encounters**  
- `POST /npcs/:id/encounters`  
- `GET /encounters/:slug`  
- `GET /encounters/:slug/messages`  
- `POST /encounters/:slug/messages`  
- `GET /encounters/:slug/stream` (SSE)  

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

- `/` — Landing & sign-in.  
- `/npc/new` — Create NPC.  
- `/npc/:id` — View/edit NPC.  
- `/e/:slug` — Encounter room.  
- `/admin` — Admin dashboard.  

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
│   ├── src/
│   │   ├── api/                # Route handlers for auth, NPC, encounter, admin APIs
│   │   ├── db/                 # Database connection, migrations, query helpers
│   │   ├── llm/                # LLM prompt templates & OpenAI API client
│   │   ├── tts/                # ElevenLabs integration and audio processing
│   │   ├── images/             # DALL·E + Cloudinary integration
│   │   ├── models/             # Data model definitions (TypeScript interfaces)
│   │   ├── middleware/         # Auth, logging, rate-limiting middleware
│   │   ├── utils/              # Shared utilities and helpers
│   │   └── index.ts            # App entrypoint (Express/Fastify bootstrap)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/         # UI components (forms, lists, buttons, etc.)
│   │   ├── pages/              # Route components for /, /npc/:id, /e/:slug, /admin
│   │   ├── hooks/              # Custom React hooks for API calls and state
│   │   ├── api/                # API client wrappers for backend endpoints
│   │   ├── styles/             # CSS/SCSS or Tailwind config
│   │   └── main.tsx            # React app entrypoint
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml          # Local Postgres service definition
├── .env.example                 # Example env vars for local dev
├── README.md
└── docs/
    └── specs.md                 # This spec document
````

**Key File Descriptions:**

* **backend/src/api/** — Each file groups REST/SSE endpoints by domain (auth, npc, encounter).
* **backend/src/llm/** — Handles prompt assembly, OpenAI calls, and JSON response parsing.
* **backend/src/tts/** — Encapsulates ElevenLabs API usage, audio URL generation, Cloudinary upload.
* **backend/src/images/** — Portrait generation prompts, DALL·E calls, Cloudinary upload logic.
* **backend/src/models/** — TypeScript types for DB rows and API payloads.
* **frontend/src/pages/** — Each file maps to a route; imports components for layout.
* **frontend/src/api/** — Fetch wrappers with auth cookie handling.


