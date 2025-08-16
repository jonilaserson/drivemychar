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
  const [selectedNpcId, setSelectedNpcId] = React.useState<number | null>(null);
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

      {selectedNpcId ? (
        <NpcEditor
          npcId={selectedNpcId}
          onBack={async () => {
            setSelectedNpcId(null);
            await loadNpcs();
          }}
        />
      ) : (
        <>
          <h2 style={{ marginTop: 24 }}>Your NPCs</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {npcs.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedNpcId(n.id)}
                style={{ textAlign: 'left', border: '1px solid #ddd', padding: 12, borderRadius: 8, background: '#fff', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {n.image_url && (
                    <img src={n.image_url} alt={n.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>{n.name}</div>
                    <div style={{ fontSize: 12, color: '#555' }}>id: {n.id}</div>
                  </div>
                </div>
              </button>
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
        </>
      )}
    </div>
  );
}

function NpcEditor({ npcId, onBack }: { npcId: number; onBack: () => void }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const [npc, setNpc] = React.useState<any | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/npcs/${npcId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load NPC');
        const data = await res.json();
        setNpc(data.npc);
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [API_BASE, npcId]);

  async function save() {
    if (!npc) return;
    setSaving(true);
    try {
      const body: any = {
        name: npc.name,
        sections_json: npc.sections_json,
        image_url: npc.image_url,
        defaults_json: npc.defaults_json,
      };
      const res = await fetch(`${API_BASE}/npcs/${npcId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setNpc(data.npc);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function regenImage() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/npcs/${npcId}/regen-image`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Regen failed');
      const data = await res.json();
      setNpc((prev: any) => ({ ...(prev || {}), image_url: data.npc?.image_url }));
    } catch (e: any) {
      setError(e.message || 'Regen failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Loading NPC...</div>;
  if (error) return (
    <div>
      <p style={{ color: 'crimson' }}>{error}</p>
      <button onClick={onBack}>Back</button>
    </div>
  );
  if (!npc) return (
    <div>
      <p>Not found</p>
      <button onClick={onBack}>Back</button>
    </div>
  );

  const s = npc.sections_json || {};

  return (
    <div style={{ marginTop: 24 }}>
      <button onClick={onBack}>← Back</button>
      <h2>Edit NPC</h2>
      <div style={{ display: 'flex', gap: 16 }}>
        {npc.image_url && (
          <img src={npc.image_url} alt={npc.name} style={{ width: 128, height: 128, objectFit: 'cover', borderRadius: 8 }} />
        )}
        <div>
          <label>
            Name
            <input
              value={npc.name || ''}
              onChange={(e) => setNpc({ ...npc, name: e.target.value })}
              style={{ display: 'block', width: 320 }}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            <button disabled={saving} onClick={regenImage}>Regenerate portrait</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16, maxWidth: 800 }}>
        <Field label="Visual" value={s.visual || ''} onChange={(v) => setNpc({ ...npc, sections_json: { ...s, visual: v } })} />
        <Field label="Personality" value={s.personality || ''} onChange={(v) => setNpc({ ...npc, sections_json: { ...s, personality: v } })} />
        <Field label="Knowledge" value={s.knowledge || ''} onChange={(v) => setNpc({ ...npc, sections_json: { ...s, knowledge: v } })} />
        <Field label="Motivations" value={s.motivations || ''} onChange={(v) => setNpc({ ...npc, sections_json: { ...s, motivations: v } })} />
        <Field label="Pitfalls" value={s.pitfalls || ''} onChange={(v) => setNpc({ ...npc, sections_json: { ...s, pitfalls: v } })} />
      </div>

      <div style={{ marginTop: 16 }}>
        <button disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save changes'}</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ width: '100%' }} />
    </label>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
createRoot(container).render(<App />);


