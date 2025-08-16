import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieSession from 'cookie-session';
import { OAuth2Client } from 'google-auth-library';
import { query } from './db';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

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

app.get('/health', (_req, res) => {
  res.json({ ok: true });
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

app.get('/npcs', requireAuth, async (req, res) => {
  const { rows } = await query(
    'select id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at from npcs where owner_id = $1 order by updated_at desc',
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
  const seedUrl = process.env.SEED_NPC_IMAGE_URL || null;
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
  res.status(201).json({ npc: rows[0] });
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
  res.json({ npc: rows[0] });
});

app.post('/npcs/:id/regen-image', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const { rows: ownerRows } = await query('select owner_id from npcs where id = $1', [id]);
  const own = ownerRows[0];
  if (!own) return res.status(404).json({ error: 'not found' });
  if (own.owner_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const seedUrl = process.env.SEED_NPC_IMAGE_URL || null;
  const { rows } = await query(
    'update npcs set image_url = $1, updated_at = now() where id = $2 returning id, owner_id, name, sections_json, image_url, voice_id, defaults_json, created_at, updated_at',
    [seedUrl, id],
  );
  res.json({ npc: rows[0] });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});


