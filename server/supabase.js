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

// --- Estado de la app: un blob JSON por billetera (fila id = id de la
// billetera; la primera/histórica es 'main'). Mismo patrón que gastoscorujo. ---

export async function getState(walletId = 'main') {
  const res = await rest(`app_state?id=eq.${encodeURIComponent(walletId)}&select=data,updated_at`, { method: 'GET' });
  const rows = await res.json();
  if (!rows.length) return { data: null, updatedAt: null };
  return { data: rows[0].data, updatedAt: rows[0].updated_at };
}

export async function putState(walletId, data) {
  const res = await rest('app_state?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: walletId, data, updated_at: new Date().toISOString() }),
  });
  const rows = await res.json();
  return { updatedAt: rows[0]?.updated_at ?? null };
}

export async function deleteState(walletId) {
  await rest(`app_state?id=eq.${encodeURIComponent(walletId)}`, { method: 'DELETE' });
}

// --- Lista de billeteras (fila reservada '__wallets__'): [{id, name,
// createdAt}]. La billetera 'main' es la histórica (single-wallet de
// siempre) y siempre existe, aunque esta fila todavía no se haya creado —
// ver server.js para el fallback. ---

export async function getWalletsRow() {
  const res = await rest('app_state?id=eq.__wallets__&select=data', { method: 'GET' });
  const rows = await res.json();
  return rows.length ? rows[0].data : null;
}

export async function putWalletsRow(data) {
  const res = await rest('app_state?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: '__wallets__', data, updated_at: new Date().toISOString() }),
  });
  const rows = await res.json();
  return rows[0]?.data ?? null;
}

// --- Clave de acceso (fila reservada '__access__' en la misma tabla, no
// colisiona con 'main' que es el estado real) — ver server.js checkAccess ---

export async function getAccessCodeRow() {
  const res = await rest('app_state?id=eq.__access__&select=data', { method: 'GET' });
  const rows = await res.json();
  return rows.length ? rows[0].data : null;
}

export async function putAccessCodeRow(data) {
  const res = await rest('app_state?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: '__access__', data, updated_at: new Date().toISOString() }),
  });
  const rows = await res.json();
  return rows[0]?.data ?? null;
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
