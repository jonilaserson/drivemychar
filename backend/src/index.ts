import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieSession from 'cookie-session';
import { OAuth2Client } from 'google-auth-library';

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
    const user: SessionUser = {
      sub: payload.sub,
      email: payload.email || null,
      displayName: payload.name || null,
      role: 'user',
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

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});


