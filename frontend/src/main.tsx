import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { getMe, authWithGoogle, logout } from './api';
import './styles.css';
import { IconPen, IconTrash, IconShare } from './icons';
import { ToastProvider, useToast } from './toast';
import { Tooltip } from './tooltip';

declare global {
  interface Window {
    google?: any;
  }
}

function getShareBaseUrl(): string {
  const explicit = (import.meta.env as any).VITE_PUBLIC_BASE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, '');
  const { protocol, hostname, port } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const lan = (import.meta.env as any).VITE_LAN_HOST as string | undefined; // e.g. 10.100.102.15 or 10-100-...sslip.io
    if (lan) return `${protocol}//${lan}${port ? `:${port}` : ''}`;
  }
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
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

  // Ensure a visible glow layer via inline styles to bypass CSS ordering issues
  React.useEffect(() => {
    const id = 'inline-glow-layer';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      Object.assign(el.style, {
        position: 'fixed',
        inset: '0px',
        pointerEvents: 'none',
        zIndex: '0',
        background:
          'radial-gradient(1000px 700px at 15% -10%, rgba(245, 158, 11, 0.55), transparent 58%), ' +
          'radial-gradient(900px 600px at 110% -12%, rgba(253, 186, 116, 0.30), transparent 58%), ' +
          'radial-gradient(800px 600px at 50% 110%, rgba(255, 255, 255, 0.10), transparent 72%)',
      } as CSSStyleDeclaration);
      document.body.prepend(el);
    }
    return () => {
      // keep layer; do not remove on unmount
    };
  }, []);

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
    <ToastProvider>
      <BrowserRouter>
        <div className="app-shell">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Drive My Char — Frontend</h1>
          <Routes>
          <Route
            path="/"
            element={
              user ? (
                <AuthedHome user={user} onSignOut={async () => { await logout(); setUser(null); }} />
              ) : (
                <Landing clientId={clientId} />
              )
            }
          />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/e/:slug" element={<EncounterRoom />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

function NpcPeekingPanel({ lastMessage, url }: { lastMessage: string; url: string }) {
  const toast = useToast();
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ url, title: 'Encounter link' });
      } else {
        await navigator.clipboard.writeText(url);
        const el = document.activeElement as HTMLElement | null;
        if (el) toast.showNear('Link copied', el); else toast.show('Link copied');
      }
    } catch {
      // ignore
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, fontSize: 12 }} className="line-clamp-2">
        <span className="muted">Last:</span> {lastMessage || '—'}
      </div>
      <button className="btn-primary" onClick={() => window.open(url, '_blank')}>Enter encounter</button>
      <CopyLinkButton link={url} />
      <Tooltip label="Share">
        <button className="btn-secondary btn-icon" onClick={share} aria-label="Share link">
          <img src="/icons/share.svg" alt="share" style={{ width: 16, height: 16 }} />
        </button>
      </Tooltip>
    </div>
  );
}

function Landing({ clientId }: { clientId?: string }) {
  return (
    <div>
      <p>Sign in with Google to continue.</p>
      {!clientId && (
        <p style={{ color: 'crimson' }}>
          Missing VITE_GOOGLE_CLIENT_ID in frontend/.env. Set it and restart the dev server.
        </p>
      )}
      <div id="gsi-btn" />
    </div>
  );
}

function AdminPage() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const [users, setUsers] = React.useState<any[]>([]);
  const [npcs, setNpcs] = React.useState<any[]>([]);
  const [encs, setEncs] = React.useState<any[]>([]);
  const [audit, setAudit] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const [u, n, e, a] = await Promise.all([
          fetch(`${API_BASE}/admin/users`, { credentials: 'include' }),
          fetch(`${API_BASE}/admin/npcs`, { credentials: 'include' }),
          fetch(`${API_BASE}/admin/encounters`, { credentials: 'include' }),
          fetch(`${API_BASE}/admin/audit`, { credentials: 'include' }),
        ]);
        if (!u.ok || !n.ok || !e.ok || !a.ok) throw new Error('forbidden or server error');
        setUsers((await u.json()).users);
        setNpcs((await n.json()).npcs);
        setEncs((await e.json()).encounters);
        setAudit((await a.json()).audit);
      } catch (err: any) {
        setError(err.message || 'failed to load');
      }
    })();
  }, [API_BASE]);

  if (error) return <div style={{ color: 'crimson' }}>Admin error: {error}</div>;
  return (
    <div>
      <h2>Admin</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        <section>
          <h3>Users</h3>
          <div style={{ fontSize: 12, color: '#555' }}>{users.length} users</div>
        </section>
        <section>
          <h3>NPCs</h3>
          <div style={{ fontSize: 12, color: '#555' }}>{npcs.length} npcs</div>
        </section>
        <section>
          <h3>Encounters</h3>
          <div style={{ fontSize: 12, color: '#555' }}>{encs.length} encounters</div>
        </section>
        <section>
          <h3>Audit</h3>
          <div style={{ fontSize: 12, color: '#555' }}>{audit.length} events</div>
        </section>
      </div>
    </div>
  );
}

function AuthedHome({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const navigate = useNavigate();
  const [npcs, setNpcs] = React.useState<any[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [paragraph, setParagraph] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
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
        setShowCreate(false);
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
          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, padding: 0 }}>Your NPCs</h2>
            {!showCreate ? (
              <button className="btn-primary" style={{ transform: 'translateY(-4px)' }} onClick={() => setShowCreate(true)}>+ Create New</button>
            ) : (
              <button onClick={() => setShowCreate(false)}>Back to list</button>
            )}
          </div>
          {!showCreate && (
            <div style={{ display: 'grid', gap: 12 }}>
              {npcs.map((n) => {
                const personality: string = (n.sections_json && (n.sections_json.personality || '')) || '';
                const hasCurrent = Boolean(n.current_encounter_slug);
                const shareUrl = hasCurrent ? `${getShareBaseUrl()}/e/${n.current_encounter_slug}` : '';
                return (
                  <div key={n.id} className="npc-peek-wrapper">
                    <div className="surface npc-card" style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {n.image_url && (
                          <img src={n.image_url} alt={n.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>{n.name}</div>
                          {personality && (
                            <div className="line-clamp-2" style={{ fontSize: 12, marginTop: 4 }}>
                              <span className="muted">Personality:</span> {personality}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Tooltip label="Edit">
                            <button className="btn-primary btn-icon" onClick={() => setSelectedNpcId(n.id)} aria-label="Edit NPC">
                              <IconPen />
                            </button>
                          </Tooltip>
                          <CreateNewEncounterButton onCreated={async () => { await loadNpcs(); }} npcId={n.id} />
                          <DeleteNpcButton npcId={n.id} onDeleted={async () => { await loadNpcs(); }} />
                        </div>
                      </div>
                    </div>
                    {hasCurrent && (
                      <div className="surface npc-peek-panel" style={{ padding: 10, marginLeft: 24, marginRight: 24 }}>
                        <NpcPeekingPanel lastMessage={n.current_encounter_last_message || ''} url={shareUrl} />
                      </div>
                    )}
                  </div>
                );
              })}
              {npcs.length === 0 && <div>No NPCs yet.</div>}
            </div>
          )}

          {showCreate && (
            <>
              <h3 style={{ marginTop: 24 }}>Create NPC</h3>
              <textarea
                placeholder="Paste a short paragraph describing your NPC"
                value={paragraph}
                onChange={(e) => setParagraph(e.target.value)}
                rows={4}
                style={{ width: '100%', maxWidth: 600 }}
              />
              <div>
                <button className="btn-primary" disabled={creating || paragraph.trim().length < 5} onClick={createNpc}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </>
          )}
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
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save changes'}</button>
        <LaunchEncounterButton npcId={npcId} onCreated={(slug) => {
          window.open(`/e/${slug}`, '_blank');
        }} />
        <DeleteNpcButton npcId={npcId} onDeleted={onBack} />
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

function LaunchEncounterButton({ npcId, onCreated }: { npcId: number; onCreated: (slug: string) => void }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const [creating, setCreating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // reuse global helper
  async function copyLinkToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  async function launch() {
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/npcs/${npcId}/encounters`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to create encounter');
      const data = await res.json();
      const slug = data.encounter.slug;
      const link = `${getShareBaseUrl()}/e/${slug}`;
      await copyLinkToClipboard(link);
      onCreated(slug);
    } finally {
      setCreating(false);
    }
  }
  return (
    <span>
      <button className="btn-primary" style={{ marginLeft: 8 }} disabled={creating} onClick={launch}>
        {creating ? 'Entering...' : 'Enter encounter'}
      </button>
      {copied && <span style={{ marginLeft: 8, color: '#0a0' }}>Link copied</span>}
    </span>
  );
}

function CreateNewEncounterButton({ npcId, onCreated }: { npcId: number; onCreated: () => void }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const [creating, setCreating] = React.useState(false);
  async function createNew() {
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/npcs/${npcId}/encounters`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to create encounter');
      await res.json();
      onCreated();
    } finally {
      setCreating(false);
    }
  }
  return (
    <button className="btn-primary" disabled={creating} onClick={createNew}>{creating ? 'Creating...' : 'Create new encounter'}</button>
  );
}

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = React.useState(false);
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      const el = document.activeElement as HTMLElement | null;
      if (el) toast.showNear('Link copied', el); else toast.show('Link copied');
    } catch {
      // ignore
    }
  }
  return (
    <Tooltip label="Copy link">
      <button className="btn-secondary btn-icon" onClick={copy} aria-label="Copy link" style={{ marginLeft: 8 }}>
        <img src="/icons/link-alt.svg" alt="link" style={{ width: 16, height: 16 }} />
      </button>
    </Tooltip>
  );
}

function DeleteNpcButton({ npcId, onDeleted }: { npcId: number; onDeleted: () => void }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const [busy, setBusy] = React.useState(false);
  async function removeNpc() {
    if (!confirm('Delete this NPC and all its encounters? This cannot be undone.')) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/npcs/${npcId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        onDeleted();
        // Simple collapse feedback: show a toast
        try { (window as any).__toast && (window as any).__toast('NPC deleted'); } catch {}
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="btn-danger btn-icon" disabled={busy} onClick={removeNpc} aria-label={busy ? 'Deleting NPC…' : 'Delete NPC'} title={busy ? 'Deleting…' : 'Delete'}>
      <IconTrash />
    </button>
  );
}

function resolveEncounterApiBase(preferredBase: string): string {
  try {
    const u = new URL(preferredBase);
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (isLocal) {
      // Use the viewer's host so phones don't hit localhost
      const { protocol, hostname } = window.location;
      return `${protocol}//${hostname}:4000`;
    }
    return preferredBase;
  } catch {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }
}

function EncounterRoom() {
  const CONFIG_API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const API_BASE = resolveEncounterApiBase(CONFIG_API_BASE);
  const { slug } = useParams();
  const [enc, setEnc] = React.useState<any | null>(null);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [text, setText] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const eUrl = `${API_BASE}/encounters/${slug}`;
        const eRes = await fetch(eUrl);
        if (eRes.ok) {
          const data = await eRes.json();
          setEnc(data.encounter);
        } else {
          setError(`Failed to load encounter (${eRes.status}). URL: ${eUrl}`);
        }
        const mUrl = `${API_BASE}/encounters/${slug}/messages`;
        const mRes = await fetch(mUrl);
        if (mRes.ok) {
          const data = await mRes.json();
          setMessages(data.messages);
        } else {
          setError(`Failed to load messages (${mRes.status}). URL: ${mUrl}`);
        }
      } catch (e: any) {
        setError(`Network error. API_BASE=${API_BASE}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [API_BASE, slug]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText('');
    const res = await fetch(`${API_BASE}/encounters/${slug}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.userMessage, data.npcMessage]);
      setEnc((prev: any) => ({ ...(prev || {}), state_json: data.state }));
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'crimson' }}>Error: {error}</div>;
  if (!enc) return <div>Not found</div>;

  return (
    <div>
      <h2>Encounter</h2>
      <EncounterHeader enc={enc} />
      <div style={{ marginTop: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <b>{m.author_type === 'user' ? 'You' : 'NPC'}:</b> {m.text}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 400 }} />
        <button onClick={send} style={{ marginLeft: 8 }}>Send</button>
      </div>
    </div>
  );
}

function EncounterHeader({ enc }: { enc: any }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      // Build shareable link (LAN/public host if configured)
      const base = getShareBaseUrl();
      const link = `${base}/e/${enc.slug}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {enc.npc_image_url && (
          <img src={enc.npc_image_url} alt={enc.npc_name} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
        )}
        <div>
          <div style={{ fontWeight: 600 }}>{enc.npc_name}</div>
          <div style={{ fontSize: 12, color: '#555' }}>Slug: {enc.slug}</div>
          <div style={{ fontSize: 12, color: '#555' }}>State: patience={enc.state_json?.patience} interest={enc.state_json?.interest}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-secondary" onClick={copy}>Copy link</button>
          {copied && <span style={{ marginLeft: 8, color: '#0a0' }}>Copied</span>}
        </div>
      </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
createRoot(container).render(<App />);


