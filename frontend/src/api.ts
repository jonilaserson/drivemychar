const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export async function getMe() {
  const res = await fetch(`${API_BASE}/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to fetch /me');
  return res.json();
}

export async function authWithGoogle(idToken: string) {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error('Auth failed');
  return res.json();
}

export async function logout() {
  const res = await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error('Logout failed');
}


