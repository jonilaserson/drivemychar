import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieSession from 'cookie-session';
import { OAuth2Client } from 'google-auth-library';
import { query } from './db';
import crypto from 'crypto';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
async function tryDb(): Promise<boolean> {
  try {
    await query('select 1');
    return true;
  } catch {
    return false;
  }
}

async function audit(actorUserId: number | null, action: string, targetType: string, targetId: number | null) {
  try {
    await query('insert into audit_log (actor_user_id, action, target_type, target_id) values ($1,$2,$3,$4)', [
      actorUserId,
      action,
      targetType,
      targetId,
    ]);
  } catch {
    // ignore audit failures
  }
}

// Sessions
const sessionSecret = process.env.SESSION_SECRET || 'devsecret_change_me';
app.use(
  cookieSession({
    name: 'dmc_session',
    secret: sessionSecret,
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  }),
);

type SessionUser = {
  id: number;
  sub: string;
  email?: string | null;
  displayName?: string | null;
  role: 'user' | 'admin';
};

declare module 'express-serve-static-core' {
  interface Request {
    session: cookieSession.CookieSessionObject;
    user?: SessionUser;
  }
}

// Attach user from session to req
app.use((req, _res, next) => {
  const u = (req.session as any)?.user as SessionUser | undefined;
  if (u) req.user = u;
  next();
});

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const oauthClient = new OAuth2Client(googleClientId);

// Hydrate missing DB user id for older sessions
app.use(async (req, _res, next) => {
  try {
    if (req.user && (!req.user.id || Number.isNaN(Number(req.user.id))) && req.user.sub) {
      const { rows } = await query<{ id: number; role: 'user' | 'admin'; email: string | null; display_name: string | null }>(
        'select id, role, email, display_name from users where google_sub = $1',
        [req.user.sub],
      );
      const row = rows[0];
      if (row) {
        req.user.id = row.id;
        req.user.role = row.role;
        req.user.email = row.email;
        req.user.displayName = row.display_name;
        (req.session as any).user = req.user;
      }
    }
  } catch {
    // ignore hydration failures; downstream will 401/403 as needed
  }
  next();
});

app.get('/health', async (_req, res) => {
  const dbOk = await tryDb();
  res.json({ ok: true, dbOk });
});

app.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  res.json({ user: req.user });
});

app.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) return res.status(400).json({ error: 'missing idToken' });
    const ticket = await oauthClient.verifyIdToken({ idToken, audience: googleClientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) return res.status(401).json({ error: 'invalid token' });
    // Upsert user in DB
    const upsertSql = `
      insert into users (google_sub, email, display_name)
      values ($1, $2, $3)
      on conflict (google_sub)
      do update set email = excluded.email, display_name = excluded.display_name, updated_at = now()
      returning id, role, email, display_name;
    `;
    const up = await query<{ id: number; role: 'user' | 'admin'; email: string | null; display_name: string | null }>(
      upsertSql,
      [payload.sub, payload.email || null, payload.name || null],
    );
    const row = up.rows[0];
    const user: SessionUser = {
      id: row.id,
      sub: payload.sub,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
    };
    (req.session as any).user = user;
    res.json({ user });
    // audit sign-in
    await audit(user.id, 'auth.google', 'user', user.id);
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
});

app.post('/auth/logout', (req, res) => {
  req.session = null as any;
  res.json({ ok: true });
});

app.post('/auth/impersonate', (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { sub, email, displayName, role } = req.body as Partial<SessionUser>;
  const u: SessionUser = {
    sub: sub || `impersonated-${Date.now()}`,
    email: email || null,
    displayName: displayName || 'Impersonated',
    role: role === 'admin' ? 'admin' : 'user',
  };
  (req.session as any).user = u;
  res.json({ user: u });
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// --- NPCs ---
type NpcSections = {
  visual: string;
  personality: string;
  knowledge: string;
  motivations: string;
  pitfalls: string;
};

function mockParseParagraphToSections(paragraph: string): NpcSections {
  const base = paragraph.trim();
  const take = (label: string) => `${label}: ${base.substring(0, Math.min(160, base.length))}`;
  return {
    visual: take('Visual'),
    personality: take('Personality'),
    knowledge: take('Knowledge'),
    motivations: take('Motivations'),
    pitfalls: take('Pitfalls'),
  };
}

function pickSeedImageUrl(): string | null {
  const raw = process.env.SEED_NPC_IMAGE_URL || '';
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  const idx = Math.floor(Math.random() * parts.length);
  return parts[idx] || null;
}

app.get('/npcs', requireAuth, async (req, res) => {
  const { rows } = await query(
    `select n.id, n.owner_id, n.name, n.sections_json, n.image_url, n.voice_id, n.defaults_json,
            n.created_at, n.updated_at,
            e.slug as current_encounter_slug,
            (
              select em.text from encounter_messages em
               where em.encounter_id = n.current_encounter_id
               order by em.id desc limit 1
            ) as current_encounter_last_message
       from npcs n
  left join encounters e on e.id = n.current_encounter_id
      where n.owner_id = $1
   order by n.updated_at desc`,
    [req.user!.id],
  );
  res.json({ npcs: rows });
});

app.get('/npcs/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const { rows } = await query(
    'select id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at from npcs where id = $1',
    [id],
  );
  const npc = rows[0];
  if (!npc) return res.status(404).json({ error: 'not found' });
  if (npc.owner_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  res.json({ npc });
});

app.post('/npcs', requireAuth, async (req, res) => {
  const { paragraph, name } = req.body as { paragraph?: string; name?: string };
  if (!paragraph || paragraph.trim().length < 5) return res.status(400).json({ error: 'paragraph too short' });
  const sections = mockParseParagraphToSections(paragraph);
  const seedUrl = pickSeedImageUrl();
  const defaults = { patience: 5, interest: 5 };
  const insertSql = `
    insert into npcs (owner_id, name, sections_json, image_url, voice_id, defaults_json)
    values ($1, $2, $3::jsonb, $4, $5, $6::jsonb)
    returning id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at;
  `;
  const { rows } = await query(insertSql, [
    req.user!.id,
    name || 'Unnamed NPC',
    JSON.stringify(sections),
    seedUrl,
    null,
    JSON.stringify(defaults),
  ]);
  const npc = rows[0];
  // create initial empty encounter and set as current
  const slug = generateSlug();
  const { rows: encRows } = await query(
    'insert into encounters (npc_id, slug, state_json) values ($1, $2, $3::jsonb) returning id, slug',
    [npc.id, slug, JSON.stringify(defaults)],
  );
  await query('update npcs set current_encounter_id = $1 where id = $2', [encRows[0].id, npc.id]);
  await audit(req.user!.id, 'npc.create', 'npc', npc.id);
  res.status(201).json({ npc: { ...npc, current_encounter_slug: encRows[0].slug } });
});

app.patch('/npcs/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  // Ownership check
  const { rows: ownerRows } = await query('select owner_id from npcs where id = $1', [id]);
  const own = ownerRows[0];
  if (!own) return res.status(404).json({ error: 'not found' });
  if (own.owner_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { name, sections_json, image_url, defaults_json } = req.body as any;
  const fields: string[] = [];
  const params: any[] = [];
  let p = 1;
  if (name !== undefined) {
    fields.push(`name = $${p++}`);
    params.push(name);
  }
  if (sections_json !== undefined) {
    fields.push(`sections_json = $${p++}::jsonb`);
    params.push(JSON.stringify(sections_json));
  }
  if (image_url !== undefined) {
    fields.push(`image_url = $${p++}`);
    params.push(image_url);
  }
  if (defaults_json !== undefined) {
    fields.push(`defaults_json = $${p++}::jsonb`);
    params.push(JSON.stringify(defaults_json));
  }
  if (fields.length === 0) return res.status(400).json({ error: 'no fields to update' });
  params.push(id);
  const sql = `update npcs set ${fields.join(', ')}, updated_at = now() where id = $${p} returning id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at`;
  const { rows } = await query(sql, params);
  await audit(req.user!.id, 'npc.update', 'npc', id);
  res.json({ npc: rows[0] });
});

app.post('/npcs/:id/regen-image', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const { rows: ownerRows } = await query('select owner_id from npcs where id = $1', [id]);
  const own = ownerRows[0];
  if (!own) return res.status(404).json({ error: 'not found' });
  if (own.owner_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const seedUrl = pickSeedImageUrl();
  const { rows } = await query(
    'update npcs set image_url = $1, updated_at = now() where id = $2 returning id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at',
    [seedUrl, id],
  );
  await audit(req.user!.id, 'npc.regen_image', 'npc', id);
  res.json({ npc: rows[0] });
});

app.delete('/npcs/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
    const { rows: ownerRows } = await query('select owner_id from npcs where id = $1', [id]);
    const own = ownerRows[0];
    if (!own) return res.status(404).json({ error: 'not found' });
    if (own.owner_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    // Clear FK to encounters to allow deletion
    await query('update npcs set current_encounter_id = null where id = $1', [id]);
    // Delete encounter messages for this NPC's encounters
    await query(
      'delete from encounter_messages where encounter_id in (select id from encounters where npc_id = $1)',
      [id],
    );
    // Delete encounters
    await query('delete from encounters where npc_id = $1', [id]);
    // Delete NPC
    await query('delete from npcs where id = $1', [id]);

    await audit(req.user!.id, 'npc.delete', 'npc', id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'delete_failed' });
  }
});
// --- Encounters --- (public access via slug)
function generateSlug(): string {
  return crypto.randomBytes(6).toString('base64url');
}

app.post('/npcs/:id/encounters', requireAuth, async (req, res) => {
  const npcId = Number(req.params.id);
  if (!Number.isFinite(npcId)) return res.status(400).json({ error: 'bad npc id' });
  // ownership check
  const { rows: npcRows } = await query('select id, owner_id, defaults_json from npcs where id = $1', [
    npcId,
  ]);
  const npc = npcRows[0];
  if (!npc) return res.status(404).json({ error: 'not found' });
  if (npc.owner_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  // initial state from npc defaults
  const defaults = npc.defaults_json || { patience: 5, interest: 5 };
  let slug = '';
  for (let i = 0; i < 5; i++) {
    slug = generateSlug();
    try {
      const { rows } = await query(
        'insert into encounters (npc_id, slug, state_json) values ($1, $2, $3::jsonb) returning id, slug',
        [npcId, slug, JSON.stringify(defaults)],
      );
      const enc = rows[0];
      await query('update npcs set current_encounter_id = $1 where id = $2', [enc.id, npcId]);
      await audit(req.user!.id, 'encounter.create', 'encounter', enc.id);
      return res.status(201).json({ encounter: enc });
    } catch (e: any) {
      // retry on slug conflict
      if (!String(e.message || '').includes('duplicate key')) throw e;
    }
  }
  res.status(500).json({ error: 'failed to create encounter' });
});

app.get('/encounters/:slug', async (req, res) => {
  const slug = String(req.params.slug);
  const { rows } = await query(
    `select e.id, e.slug, e.state_json, e.created_at, e.updated_at,
            n.id as npc_id, n.name as npc_name, n.image_url as npc_image_url
       from encounters e join npcs n on n.id = e.npc_id
      where e.slug = $1`,
    [slug],
  );
  const enc = rows[0];
  if (!enc) return res.status(404).json({ error: 'not found' });
  res.json({ encounter: enc });
});

app.get('/encounters/:slug/messages', async (req, res) => {
  const slug = String(req.params.slug);
  const { rows: encRows } = await query('select id from encounters where slug = $1', [slug]);
  const enc = encRows[0];
  if (!enc) return res.status(404).json({ error: 'not found' });
  const { rows } = await query(
    'select id, author_type, text, audio_url, model_meta_json, flags_json, created_at from encounter_messages where encounter_id = $1 order by id asc',
    [enc.id],
  );
  res.json({ messages: rows });
});

function applyPatienceOnUserMessage(state: any): any {
  const patience = Math.max(0, Number(state?.patience ?? 5) - 1);
  return { ...(state || {}), patience };
}

function mockNpcReply(userText: string): { reply: string; motivationTriggered: boolean } {
  const templates = [
    (t: string) => `Hmm... ${t}? Interesting.`,
    (t: string) => `I see. About "${t}", here's what I think...`,
    (t: string) => `Let me consider that: ${t}`,
  ];
  const fn = templates[Math.floor(Math.random() * templates.length)];
  const motivationTriggered = Math.random() < 0.2;
  return { reply: fn(userText), motivationTriggered };
}

app.post('/encounters/:slug/messages', async (req, res) => {
  const slug = String(req.params.slug);
  const { text } = req.body as { text?: string };
  if (!text || text.trim().length === 0) return res.status(400).json({ error: 'empty text' });
  const { rows: encRows } = await query('select id, state_json from encounters where slug = $1', [slug]);
  const enc = encRows[0];
  if (!enc) return res.status(404).json({ error: 'not found' });

  // persist user message
  const { rows: userMsgRows } = await query(
    'insert into encounter_messages (encounter_id, author_type, text) values ($1, $2, $3) returning id, author_type, text, created_at',
    [enc.id, 'user', text],
  );
  await audit(null, 'encounter.message', 'encounter', enc.id);

  // update patience after user message
  let newState = applyPatienceOnUserMessage(enc.state_json);

  // mock npc reply
  const mock = mockNpcReply(text);
  if (mock.motivationTriggered) newState = { ...(newState || {}), patience: 5 };

  // save npc message
  const { rows: npcMsgRows } = await query(
    'insert into encounter_messages (encounter_id, author_type, text, model_meta_json) values ($1, $2, $3, $4::jsonb) returning id, author_type, text, created_at',
    [enc.id, 'npc', mock.reply, JSON.stringify({ motivationTriggered: mock.motivationTriggered })],
  );

  // persist new state
  await query('update encounters set state_json = $1::jsonb, updated_at = now() where id = $2', [
    JSON.stringify(newState),
    enc.id,
  ]);

  res.status(201).json({ userMessage: userMsgRows[0], npcMessage: npcMsgRows[0], state: newState });
});

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

// --- Admin ---
app.get('/admin/users', requireAdmin, async (_req, res) => {
  const { rows } = await query(
    'select id, email, display_name, role, created_at, updated_at from users order by id desc limit 200',
  );
  res.json({ users: rows });
});

app.get('/admin/npcs', requireAdmin, async (_req, res) => {
  const { rows } = await query(
    'select id, owner_id, name, current_encounter_id, updated_at from npcs order by updated_at desc limit 200',
  );
  res.json({ npcs: rows });
});

app.get('/admin/encounters', requireAdmin, async (_req, res) => {
  const { rows } = await query('select id, npc_id, slug, updated_at from encounters order by id desc limit 200');
  res.json({ encounters: rows });
});

app.get('/admin/audit', requireAdmin, async (_req, res) => {
  const { rows } = await query(
    'select id, actor_user_id, action, target_type, target_id, created_at from audit_log order by id desc limit 200',
  );
  res.json({ audit: rows });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});


