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
        <div>
          <p>Signed in as {user.displayName || user.email}</p>
          <button
            onClick={async () => {
              await logout();
              setUser(null);
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
createRoot(container).render(<App />);


