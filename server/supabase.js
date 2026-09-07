// Acceso a Supabase vía PostgREST con la service key (solo servidor, nunca
// llega al navegador). Sin librería: fetch directo contra el REST endpoint.

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

export const supabaseConfigured = Boolean(URL && KEY);

function headers(extra = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, init) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: headers(init?.headers) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res;
}

// --- Estado de la app (un único blob JSON en la fila id='main') ---

export async function getState() {
  const res = await rest('app_state?id=eq.main&select=data,updated_at', { method: 'GET' });
  const rows = await res.json();
  if (!rows.length) return { data: null, updatedAt: null };
  return { data: rows[0].data, updatedAt: rows[0].updated_at };
}

export async function putState(data) {
  const res = await rest('app_state?id=eq.main', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
  const rows = await res.json();
  return { updatedAt: rows[0]?.updated_at ?? null };
}

// --- Confirmaciones pendientes del bot de Telegram ---

export async function savePending(id, payload) {
  await rest('tg_pending', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id, payload }),
  });
}

export async function getPending(id) {
  const res = await rest(`tg_pending?id=eq.${encodeURIComponent(id)}&select=payload`, { method: 'GET' });
  const rows = await res.json();
  return rows.length ? rows[0].payload : null;
}

export async function deletePending(id) {
  await rest(`tg_pending?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}
