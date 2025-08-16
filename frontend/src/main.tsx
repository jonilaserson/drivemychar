import React from 'react';
import { createRoot } from 'react-dom/client';
import { getMe, authWithGoogle, logout } from './api';

declare global {
  interface Window {
    google?: any;
  }
}

function useScript(src: string, onload?: () => void) {
  React.useEffect(() => {
    const existing = Array.from(document.getElementsByTagName('script')).find(
      (el) => el.getAttribute('src') === src,
    );
    if (existing) {
      if (onload) onload();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    if (onload) s.onload = onload;
    document.head.appendChild(s);
    return () => {
      if (s.parentNode) document.head.removeChild(s);
    };
  }, [src, onload]);
}

function App() {
  const [user, setUser] = React.useState<any>(null);
  const [gisReady, setGisReady] = React.useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useScript('https://accounts.google.com/gsi/client', () => setGisReady(true));

  React.useEffect(() => {
    (async () => {
      const me = await getMe().catch(() => null);
      if (me?.user) setUser(me.user);
    })();
  }, []);

  React.useEffect(() => {
    if (!gisReady || !window.google || !clientId) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: any) => {
        try {
          const { credential } = response;
          if (!credential) return;
          const res = await authWithGoogle(credential);
          setUser(res.user);
        } catch (e) {
          // ignore
        }
      },
      auto_select: false,
      ux_mode: 'popup',
    });
    const btn = document.getElementById('gsi-btn');
    if (btn) window.google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large' });
  }, [clientId, gisReady]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Drive My Char — Frontend</h1>
      {!user ? (
        <div>
          <p>Sign in with Google to continue.</p>
          {!clientId && (
            <p style={{ color: 'crimson' }}>
              Missing VITE_GOOGLE_CLIENT_ID in frontend/.env. Set it and restart the dev server.
            </p>
          )}
          <div id="gsi-btn" />
        </div>
      ) : (
        <AuthedHome user={user} onSignOut={async () => { await logout(); setUser(null); }} />
      )}
    </div>
  );
}

function AuthedHome({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const [npcs, setNpcs] = React.useState<any[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [paragraph, setParagraph] = React.useState('');
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

  async function loadNpcs() {
    const res = await fetch(`${API_BASE}/npcs`, { credentials: 'include' });
    const data = await res.json();
    setNpcs(data.npcs || []);
  }

  React.useEffect(() => {
    loadNpcs();
  }, []);

  async function createNpc() {
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/npcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paragraph }),
      });
      if (res.ok) {
        setParagraph('');
        await loadNpcs();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <p>Signed in as {user.displayName || user.email}</p>
      <button onClick={onSignOut}>Sign out</button>

      <h2 style={{ marginTop: 24 }}>Your NPCs</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {npcs.map((n) => (
          <div key={n.id} style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {n.image_url && (
                <img src={n.image_url} alt={n.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{n.name}</div>
                <div style={{ fontSize: 12, color: '#555' }}>id: {n.id}</div>
              </div>
            </div>
          </div>
        ))}
        {npcs.length === 0 && <div>No NPCs yet.</div>}
      </div>

      <h3 style={{ marginTop: 24 }}>Create NPC</h3>
      <textarea
        placeholder="Paste a short paragraph describing your NPC"
        value={paragraph}
        onChange={(e) => setParagraph(e.target.value)}
        rows={4}
        style={{ width: '100%', maxWidth: 600 }}
      />
      <div>
        <button disabled={creating || paragraph.trim().length < 5} onClick={createNpc}>
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
createRoot(container).render(<App />);


